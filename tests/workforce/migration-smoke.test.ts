import { readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { expect, it } from "vitest";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không lấy được cổng PostgreSQL kiểm thử.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

it("applies the complete P10 migration against its predecessor contract", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-p10-migration-${process.pid}-${port}`);
  const database = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "hienxa-test-only",
    authMethod: "scram-sha-256",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  const client = database.getPgClient("postgres", "127.0.0.1");
  let started = false;
  try {
    await database.initialise();
    await database.start();
    started = true;
    await client.connect();
    await client.query(`
      create role anon noinherit;
      create role authenticated noinherit;
      create schema auth;
      create schema app_private;
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      create table public.roles (id uuid primary key, code text not null unique);
      create table public.permissions (id uuid primary key default gen_random_uuid(), code text not null unique, description_vi text not null);
      create table public.user_profiles (
        user_id uuid primary key, display_name text not null, status text not null default 'ACTIVE'
      );
      create table public.user_roles (
        user_id uuid not null references public.user_profiles(user_id),
        role_id uuid not null references public.roles(id), primary key (user_id, role_id)
      );
      create table public.role_permissions (
        role_id uuid not null references public.roles(id),
        permission_id uuid not null references public.permissions(id), primary key (role_id, permission_id)
      );
      create table public.work_items (
        id uuid primary key default gen_random_uuid(), title text not null,
        assigned_user_id uuid references public.user_profiles(user_id), created_at timestamptz not null default now()
      );
      create table public.worker_skill_catalog (id uuid primary key);
      create table public.employee_operational_profiles (
        user_id uuid primary key references public.user_profiles(user_id), employee_code text not null,
        is_active boolean not null default true
      );
      create table public.worker_skills (
        user_id uuid not null references public.user_profiles(user_id),
        skill_id uuid not null references public.worker_skill_catalog(id),
        is_active boolean not null default true, expires_at date, primary key (user_id, skill_id)
      );
      create table public.deliveries (
        id uuid primary key, delivery_number text not null, customer_name_snapshot text not null,
        pickup_address_snapshot text not null, drop_address_snapshot text not null,
        scheduled_date date not null, status text not null, dispatched_at timestamptz,
        confirmed_at timestamptz
      );
      create table public.delivery_assignments (
        id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.deliveries(id),
        driver_user_id uuid not null references public.user_profiles(user_id), status text not null,
        assigned_at timestamptz not null default now()
      );
      create table public.delivery_readiness_events (
        id uuid primary key, delivery_id uuid not null references public.deliveries(id),
        event_type text not null, created_by uuid not null references public.user_profiles(user_id), created_at timestamptz not null default now()
      );
      create function app_private.touch_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = now(); return new; end; $$;
      create function app_private.assert_actor_permission(uuid, text) returns void language sql stable as 'select';
      create function app_private.is_active_user(uuid) returns boolean language sql stable as 'select true';
      create function app_private.has_permission(text) returns boolean language sql stable as 'select true';
      alter table public.work_items enable row level security;
      alter table public.user_profiles enable row level security;
      alter table public.user_roles enable row level security;
      alter table public.employee_operational_profiles enable row level security;
      insert into public.roles(id, code) values
        ('00000000-0000-4000-8000-000000000001', 'OWNER_ADMIN'),
        ('00000000-0000-4000-8000-000000000002', 'DRIVER'),
        ('00000000-0000-4000-8000-000000000003', 'OPERATOR_WORKER'),
        ('00000000-0000-4000-8000-000000000004', 'SUPERVISOR'),
        ('00000000-0000-4000-8000-000000000005', 'DISPATCHER');
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) => item.endsWith("_p10_employee_os_work_pool.sql"));
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));
    const result = await client.query(`
      select
        to_regclass('public.work_claims') is not null as has_claims,
        to_regclass('public.work_item_operational_view') is not null as has_view,
        (select count(*) from public.work_active_limits) as limit_count
    `);
    expect(result.rows[0]).toMatchObject({ has_claims: true, has_view: true, limit_count: "3" });
    await client.query(`
      insert into public.user_profiles(user_id, display_name, status) values
        ('10000000-0000-4000-8000-000000000001', 'Giám sát thử', 'ACTIVE'),
        ('10000000-0000-4000-8000-000000000002', 'Tài xế thử', 'ACTIVE');
      insert into public.employee_operational_profiles(user_id, employee_code)
      values ('10000000-0000-4000-8000-000000000002', 'TX-TEST');
      insert into public.user_roles(user_id, role_id)
      values ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
      insert into public.deliveries(
        id, delivery_number, customer_name_snapshot, pickup_address_snapshot,
        drop_address_snapshot, scheduled_date, status
      ) values (
        '20000000-0000-4000-8000-000000000001', 'DLV-TEST-001', 'Khách thử',
        'Kho thử', 'Công trường thử', current_date, 'ASSIGNED'
      );
      insert into public.delivery_assignments(delivery_id, driver_user_id, status)
      values (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002', 'ASSIGNED'
      );
      insert into public.delivery_readiness_events(id, delivery_id, event_type, created_by)
      values (
        '30000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'DELIVERY_READY',
        '10000000-0000-4000-8000-000000000001'
      );
    `);
    const ready = await client.query(`
      select item.status, item.assignment_mode, item.claimed_by,
        (select count(*) from public.work_item_state_events event where event.work_item_id = item.id) as event_count
      from public.work_items item
      join public.work_requirements requirement on requirement.id = item.requirement_id
      where requirement.source_id = '20000000-0000-4000-8000-000000000001'
    `);
    expect(ready.rows[0]).toMatchObject({
      status: "CLAIMED",
      assignment_mode: "DIRECT",
      claimed_by: "10000000-0000-4000-8000-000000000002",
      event_count: "1",
    });
    await client.query(`
      update public.deliveries set status = 'CONFIRMED', confirmed_at = now()
      where id = '20000000-0000-4000-8000-000000000001';
      insert into public.delivery_readiness_events(id, delivery_id, event_type, created_by)
      values (
        '30000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000001', 'DELIVERY_COMPLETED',
        '10000000-0000-4000-8000-000000000001'
      );
    `);
    const completed = await client.query(`
      select item.status, requirement.status as requirement_status,
        assignment.status as assignment_status,
        (select count(*) from public.work_item_state_events event where event.work_item_id = item.id) as event_count
      from public.work_items item
      join public.work_requirements requirement on requirement.id = item.requirement_id
      join public.work_assignments assignment on assignment.work_item_id = item.id
      where requirement.source_id = '20000000-0000-4000-8000-000000000001'
    `);
    expect(completed.rows[0]).toMatchObject({
      status: "DONE",
      requirement_status: "SATISFIED",
      assignment_status: "COMPLETED",
      event_count: "2",
    });
    await client.query(`
      insert into public.work_requirements(
        id, source_type, source_id, work_type, required_role, title, created_by
      ) values (
        '40000000-0000-4000-8000-000000000001', 'GENERAL',
        '40000000-0000-4000-8000-000000000002', 'GENERAL', 'DRIVER',
        'Nhu cầu kiểm thử bể công việc', '10000000-0000-4000-8000-000000000001'
      );
      insert into public.work_items(
        id, work_number, requirement_id, title, work_type, required_role,
        assignment_mode, status, assigned_user_id, claimed_by, external_effect_started
      ) values
        (
          '50000000-0000-4000-8000-000000000001', 'WRK-TEST-UNRESPONSIVE', null,
          'Việc đã có tác động thực tế', 'GENERAL', 'DRIVER', 'DIRECT', 'UNRESPONSIVE',
          '10000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000002', true
        ),
        (
          '50000000-0000-4000-8000-000000000002', 'WRK-TEST-AVAILABLE',
          '40000000-0000-4000-8000-000000000001', 'Việc sẵn sàng kiểm thử',
          'GENERAL', 'DRIVER', 'POOL_CLAIM', 'AVAILABLE', null, null, false
        );
    `);
    await expect(client.query(`
      select app_private.claim_work_item(
        '50000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002', 'blocked-by-unresponsive'
      )
    `)).rejects.toMatchObject({ code: "42501" });
    await expect(client.query(`
      select app_private.resolve_work_item(
        '50000000-0000-4000-8000-000000000001', 'RECALL', null,
        'Không được thu hồi mù sau tác động', '10000000-0000-4000-8000-000000000001'
      )
    `)).rejects.toMatchObject({ code: "23514" });
    await client.query(`
      update public.work_items set status = 'CANCELLED'
      where id = '50000000-0000-4000-8000-000000000001';
      select app_private.claim_work_item(
        '50000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002', 'claim-first-tap'
      );
      select app_private.claim_work_item(
        '50000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002', 'claim-second-tap'
      );
    `);
    const idempotent = await client.query(`
      select count(*)::text as active_claims
      from public.work_claims
      where work_item_id = '50000000-0000-4000-8000-000000000002' and status = 'ACTIVE'
    `);
    expect(idempotent.rows[0].active_claims).toBe("1");
    await client.query(`
      update public.work_items set claim_expires_at = now() - interval '1 second'
      where id = '50000000-0000-4000-8000-000000000002';
      update public.work_claims set expires_at = now() - interval '1 second'
      where work_item_id = '50000000-0000-4000-8000-000000000002';
      select app_private.sweep_work_item_timeouts(
        '10000000-0000-4000-8000-000000000001', now()
      );
    `);
    const expired = await client.query(`
      select item.status, item.claimed_by,
        (select count(*) from public.work_claims claim
          where claim.work_item_id = item.id and claim.status = 'EXPIRED') as expired_claims
      from public.work_items item
      where item.id = '50000000-0000-4000-8000-000000000002'
    `);
    expect(expired.rows[0]).toMatchObject({ status: "AVAILABLE", claimed_by: null, expired_claims: "1" });
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop();
    else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
