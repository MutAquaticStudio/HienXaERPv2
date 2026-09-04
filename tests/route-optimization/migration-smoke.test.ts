import { readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { expect, it } from "vitest";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không lấy được cổng PostgreSQL kiểm thử.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

it("applies RO1 as a recommendation and delegates a safe apply to the P7 assignment command", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-ro1-migration-${process.pid}-${port}`);
  const database = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "hienxa-test-only", authMethod: "scram-sha-256", persistent: false, onLog: () => undefined, onError: () => undefined });
  const client = database.getPgClient("postgres", "127.0.0.1");
  let started = false;
  try {
    await database.initialise(); await database.start(); started = true; await client.connect();
    await client.query(`
      create extension if not exists pgcrypto;
      create role anon noinherit; create role authenticated noinherit;
      create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      create table public.roles (id uuid primary key, code text not null unique);
      create table public.permissions (id uuid primary key default gen_random_uuid(), code text not null unique, description_vi text not null);
      create table public.user_profiles (user_id uuid primary key, display_name text not null, status text not null default 'ACTIVE');
      create table public.user_roles (user_id uuid references public.user_profiles(user_id), role_id uuid references public.roles(id), primary key(user_id, role_id));
      create table public.role_permissions (role_id uuid references public.roles(id), permission_id uuid references public.permissions(id), primary key(role_id, permission_id));
      create table public.vehicles (id uuid primary key, code text not null, plate_number text not null, vehicle_type text not null, is_active boolean not null default true);
      create table public.employee_operational_profiles (user_id uuid primary key references public.user_profiles(user_id), employee_code text not null, is_active boolean not null default true);
      create table public.deliveries (id uuid primary key, delivery_number text not null, customer_name_snapshot text not null, pickup_address_snapshot text not null, drop_address_snapshot text not null, scheduled_date date not null, status text not null);
      create table public.delivery_assignments (id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.deliveries(id), vehicle_id uuid not null references public.vehicles(id), driver_user_id uuid not null references public.user_profiles(user_id), status text not null default 'ASSIGNED');
      create table public.work_requirements (id uuid primary key, source_type text not null, source_id uuid not null);
      create table public.work_items (id uuid primary key, requirement_id uuid references public.work_requirements(id), assignment_mode text not null, status text not null, priority smallint not null default 3, created_at timestamptz not null default now());
      create function app_private.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
      create function app_private.assert_actor_permission(uuid, text) returns void language sql stable as 'select';
      create function app_private.actor_has_permission(uuid, text) returns boolean language sql stable as 'select true';
      create function app_private.has_permission(text) returns boolean language sql stable as 'select true';
      create function app_private.assign_delivery(uuid, uuid, uuid, uuid) returns uuid language plpgsql as $$
      declare assignment_id uuid;
      begin
        update public.deliveries set status = 'ASSIGNED' where id = $1 and status = 'PLANNED';
        if not found then raise exception 'DELIVERY_NOT_PLANNED' using errcode = '23514'; end if;
        insert into public.delivery_assignments(delivery_id, vehicle_id, driver_user_id) values ($1, $2, $3) returning id into assignment_id;
        return assignment_id;
      end; $$;
      insert into public.roles(id, code) values
        ('00000000-0000-4000-8000-000000000001', 'OWNER_ADMIN'),
        ('00000000-0000-4000-8000-000000000002', 'DISPATCHER'),
        ('00000000-0000-4000-8000-000000000003', 'DRIVER'),
        ('00000000-0000-4000-8000-000000000004', 'SUPERVISOR');
      insert into public.user_profiles(user_id, display_name) values
        ('10000000-0000-4000-8000-000000000001', 'Điều phối thử'),
        ('10000000-0000-4000-8000-000000000002', 'Tài xế thử');
      insert into public.employee_operational_profiles(user_id, employee_code) values ('10000000-0000-4000-8000-000000000002', 'TX-TEST');
      insert into public.vehicles(id, code, plate_number, vehicle_type) values ('30000000-0000-4000-8000-000000000001', 'XE-TEST', '99C-000.01', 'Xe ben');
      insert into public.deliveries(id, delivery_number, customer_name_snapshot, pickup_address_snapshot, drop_address_snapshot, scheduled_date, status) values
        ('40000000-0000-4000-8000-000000000001', 'DLV-TEST-001', 'Khách A', 'Kho A', 'Điểm A', current_date, 'PLANNED'),
        ('40000000-0000-4000-8000-000000000002', 'DLV-TEST-002', 'Khách B', 'Kho A', 'Điểm B', current_date, 'PLANNED'),
        ('40000000-0000-4000-8000-000000000003', 'DLV-TEST-003', 'Khách C', 'Kho A', 'Điểm C', current_date, 'PLANNED');
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) => item.endsWith("_ro1_route_optimization.sql"));
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));
    const safe = await client.query(`select app_private.create_route_plan(
      current_date, '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
      array['40000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000002'::uuid],
      '[]'::jsonb, 'MANUAL_FALLBACK', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    const planId = safe.rows[0].id as string;
    await client.query(`select app_private.approve_route_plan('${planId}', 'Đã rà soát xe, tải và tài xế.', '10000000-0000-4000-8000-000000000001')`);
    await client.query(`select app_private.apply_route_plan('${planId}', 'Đã xác nhận điều phối áp dụng P7.', '10000000-0000-4000-8000-000000000001')`);
    const applied = await client.query(`select
      (select status::text from public.route_plans where id = '${planId}') as plan_status,
      (select count(*)::text from public.delivery_assignments) as assignment_count,
      (select count(*)::text from public.deliveries where status = 'ASSIGNED') as assigned_deliveries,
      (select count(*)::text from public.route_plan_events where route_plan_id = '${planId}') as event_count`);
    expect(applied.rows[0]).toMatchObject({ plan_status: "APPLIED", assignment_count: "2", assigned_deliveries: "2", event_count: "3" });

    await client.query(`
      insert into public.work_requirements(id, source_type, source_id) values ('50000000-0000-4000-8000-000000000001', 'DELIVERY', '40000000-0000-4000-8000-000000000003');
      insert into public.work_items(id, requirement_id, assignment_mode, status) values ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'POOL_CLAIM', 'AVAILABLE');
    `);
    const blocked = await client.query(`select app_private.create_route_plan(
      current_date, '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
      array['40000000-0000-4000-8000-000000000003'::uuid], '[]'::jsonb, 'MANUAL_FALLBACK',
      '10000000-0000-4000-8000-000000000001'
    ) as id`);
    const blockedPlanId = blocked.rows[0].id as string;
    await client.query(`select app_private.approve_route_plan('${blockedPlanId}', 'Đã rà soát nhưng việc vẫn ở bể.', '10000000-0000-4000-8000-000000000001')`);
    await expect(client.query(`select app_private.apply_route_plan('${blockedPlanId}', 'Không được nhận việc bể công việc hộ.', '10000000-0000-4000-8000-000000000001')`)).rejects.toMatchObject({ code: "23514" });
    const protectedDelivery = await client.query("select status, (select count(*)::text from public.delivery_assignments where delivery_id = '40000000-0000-4000-8000-000000000003') as assignment_count from public.deliveries where id = '40000000-0000-4000-8000-000000000003'");
    expect(protectedDelivery.rows[0]).toMatchObject({ status: "PLANNED", assignment_count: "0" });
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop(); else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
