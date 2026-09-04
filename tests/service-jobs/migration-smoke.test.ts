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
  if (!address || typeof address === "string")
    throw new Error("Không lấy được cổng PostgreSQL kiểm thử.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

it("applies P11 and completes service execution through exactly-once finance", async () => {
  const port = await reservePort();
  const databaseDir = join(
    tmpdir(),
    `hienxa-p11-migration-${process.pid}-${port}`,
  );
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
      create function app_private.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
      create function app_private.prevent_immutable_delete() returns trigger language plpgsql as $$ begin raise exception 'IMMUTABLE'; end; $$;
      create function app_private.assert_actor_permission(uuid, text) returns void language sql stable as 'select';
      create function app_private.actor_has_permission(uuid, text) returns boolean language sql stable as 'select true';
      create function app_private.is_active_user(uuid) returns boolean language sql stable as 'select true';
      create function app_private.has_permission(text) returns boolean language sql stable as 'select true';
      create function app_private.worker_is_eligible_for_work(uuid, uuid, boolean) returns boolean language sql stable as 'select true';

      create table public.roles (id uuid primary key, code text not null unique);
      create table public.permissions (id uuid primary key default gen_random_uuid(), code text not null unique, description_vi text not null);
      create table public.user_profiles (user_id uuid primary key, display_name text not null, status text not null default 'ACTIVE');
      create table public.user_roles (user_id uuid not null references public.user_profiles(user_id), role_id uuid not null references public.roles(id), primary key (user_id, role_id));
      create table public.role_permissions (role_id uuid not null references public.roles(id), permission_id uuid not null references public.permissions(id), primary key (role_id, permission_id));
      create table public.employee_operational_profiles (user_id uuid primary key references public.user_profiles(user_id), employee_code text not null, is_active boolean not null default true);
      create table public.warehouses (id uuid primary key, code text not null, name_vi text not null, is_active boolean not null default true);
      create table public.customers (id uuid primary key, code text not null, name_vi text not null, is_active boolean not null default true);
      create table public.customer_sites (id uuid primary key, customer_id uuid not null references public.customers(id), name_vi text not null, address text not null, is_active boolean not null default true);
      create table public.evidence (id uuid primary key, entity_type text not null, entity_id uuid not null, owner_user_id uuid not null references public.user_profiles(user_id), storage_path text not null, created_at timestamptz not null default now());

      create sequence public.work_item_number_seq;
      create table public.work_requirements (
        id uuid primary key default gen_random_uuid(), source_type text not null, source_id uuid not null, work_type text not null, required_role text,
        status text not null default 'READY', title text not null, description text, due_at timestamptz,
        created_by uuid not null references public.user_profiles(user_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        unique (source_type, source_id, work_type)
      );
      create table public.work_items (
        id uuid primary key default gen_random_uuid(), work_number text not null, requirement_id uuid references public.work_requirements(id), title text not null,
        description text, work_type text not null, required_role text, assignment_mode text not null, status text not null, priority integer not null default 100,
        assigned_user_id uuid references public.user_profiles(user_id), claimed_by uuid references public.user_profiles(user_id), claimed_at timestamptz,
        claim_expires_at timestamptz, blocked_reason text, due_at timestamptz, started_at timestamptz, completed_at timestamptz,
        heartbeat_due_at timestamptz, verified_at timestamptz, external_effect_started boolean not null default false, updated_at timestamptz not null default now()
      );
      create unique index work_items_requirement_unique on public.work_items(requirement_id) where requirement_id is not null;
      create table public.work_assignments (
        id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.work_items(id), worker_user_id uuid not null references public.user_profiles(user_id),
        assignment_mode text not null, assigned_by uuid not null references public.user_profiles(user_id), status text not null default 'ACTIVE', ended_at timestamptz, reason text
      );
      create table public.work_claims (id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.work_items(id), status text not null default 'ACTIVE', started_at timestamptz);
      create table public.work_heartbeats (id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.work_items(id), recorded_at timestamptz not null default now());
      create table public.work_item_state_events (id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.work_items(id), from_status text, to_status text not null, reason text not null, actor_user_id uuid not null references public.user_profiles(user_id), occurred_at timestamptz not null default now());
      create unique index work_item_initial_once on public.work_item_state_events(work_item_id) where from_status is null;
      create table public.work_notifications (id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.work_items(id), recipient_role text not null, notification_type text not null, title text not null, message text not null, action_path text not null);
      alter table public.work_notifications add constraint work_notifications_notification_type_check check (notification_type in ('CLAIM_EXPIRY_WARNING', 'CLAIM_EXPIRED', 'HEARTBEAT_MISSED', 'UNRESPONSIVE', 'WORK_BLOCKED', 'WORK_DONE', 'SUPERVISOR_DECISION'));
      create table public.deliveries (id uuid primary key, delivery_number text not null, customer_name_snapshot text not null, pickup_address_snapshot text not null, drop_address_snapshot text not null, status text not null);

      create sequence public.receivable_number_seq;
      create table public.receivables (
        id uuid primary key default gen_random_uuid(), receivable_number text not null unique, customer_id uuid not null references public.customers(id),
        sales_order_id uuid not null, delivery_id uuid not null, source_event_id uuid not null, currency text not null,
        original_amount numeric(20,2) not null, outstanding_amount numeric(20,2) not null, due_date date not null,
        recognized_at timestamptz not null, created_by uuid not null references public.user_profiles(user_id)
      );
      create table public.receivable_ledger_entries (id uuid primary key default gen_random_uuid(), receivable_id uuid not null references public.receivables(id), entry_type text not null, signed_amount numeric(20,2) not null, description text not null, actor_user_id uuid not null references public.user_profiles(user_id), occurred_at timestamptz not null);
      create table public.expenses (id uuid primary key, status text not null, currency text not null);
      create table public.expense_allocations (id uuid primary key, expense_id uuid not null references public.expenses(id), allocation_dimension text not null, allocation_reference_id uuid, amount numeric(20,2) not null);

      insert into public.roles(id, code) values
        ('00000000-0000-4000-8000-000000000001', 'OWNER_ADMIN'),
        ('00000000-0000-4000-8000-000000000002', 'SUPERVISOR'),
        ('00000000-0000-4000-8000-000000000003', 'DISPATCHER'),
        ('00000000-0000-4000-8000-000000000004', 'FINANCE'),
        ('00000000-0000-4000-8000-000000000005', 'OPERATOR_WORKER'),
        ('00000000-0000-4000-8000-000000000006', 'AUDITOR_VIEWER');
      insert into public.user_profiles(user_id, display_name) values
        ('10000000-0000-4000-8000-000000000001', 'Owner thử'),
        ('10000000-0000-4000-8000-000000000002', 'Người vận hành thử');
      insert into public.employee_operational_profiles(user_id, employee_code) values ('10000000-0000-4000-8000-000000000002', 'OP-TEST');
      insert into public.user_roles(user_id, role_id) values ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005');
      insert into public.warehouses values ('11000000-0000-4000-8000-000000000001', 'KHO-TEST', 'Kho thử', true);
      insert into public.customers values ('12000000-0000-4000-8000-000000000001', 'KH-TEST', 'Khách thử', true);
      insert into public.customer_sites values ('13000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Công trường thử', 'Địa chỉ thử', true);
    `);

    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) =>
      item.endsWith("_p11_service_jobs.sql"),
    );
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));

    await client.query(`
      select app_private.create_service_type('MAY-XUC', 'Vận hành máy xúc', 'HOUR', 850000, 8, '10000000-0000-4000-8000-000000000001');
      select app_private.create_service_machine('MX-TEST', 'Máy xúc thử', 'Máy xúc', 'SERIAL-TEST', '11000000-0000-4000-8000-000000000001', 100, '10000000-0000-4000-8000-000000000001');
      select app_private.create_service_job(
        '12000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001',
        (select id from public.service_types where code = 'MAY-XUC'), (select id from public.service_machines where code = 'MX-TEST'),
        now() - interval '10 hours', now() - interval '1 hour', 'HOUR', 850000, 'VND', 'Đào móng khu nhà xưởng',
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.assign_service_job((select id from public.service_jobs), '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
      select app_private.record_service_work_log((select id from public.service_jobs), 'START', now() - interval '9 hours', 'Kiểm tra máy đầu ca', null, null, null, '10000000-0000-4000-8000-000000000002');
      select app_private.record_service_work_log((select id from public.service_jobs), 'BREAK_START', now() - interval '6 hours', null, null, null, null, '10000000-0000-4000-8000-000000000002');
      select app_private.record_service_work_log((select id from public.service_jobs), 'BREAK_END', now() - interval '5 hours 30 minutes', null, null, null, null, '10000000-0000-4000-8000-000000000002');
      select app_private.record_service_work_log((select id from public.service_jobs), 'FUEL', now() - interval '4 hours', 'Đổ nhiên liệu giữa ca', 50, 25000, null, '10000000-0000-4000-8000-000000000002');
      select app_private.record_service_work_log((select id from public.service_jobs), 'END', now() - interval '1 hour', 'Bàn giao cuối ca', null, null, null, '10000000-0000-4000-8000-000000000002');
      select app_private.record_service_job_cost((select id from public.service_jobs), 'DIRECT_LABOR', 500000, 'Nhân công trực tiếp ca thử', now() - interval '1 hour', '10000000-0000-4000-8000-000000000001');
      select app_private.approve_service_job_billing((select id from public.service_jobs), 8, 8, 'Duyệt tám giờ theo biên bản nghiệm thu', '10000000-0000-4000-8000-000000000001');
      select app_private.confirm_service_job_customer((select id from public.service_jobs), 'Nguyễn Văn An', 'Khách xác nhận công việc hoàn thành đúng yêu cầu', null, '10000000-0000-4000-8000-000000000001');
      select app_private.confirm_service_job_customer((select id from public.service_jobs), 'Nguyễn Văn An', 'Khách xác nhận công việc hoàn thành đúng yêu cầu', null, '10000000-0000-4000-8000-000000000001');
    `);
    const result = await client.query(`
      select job.status, job.actual_minutes, job.approved_billable_hours::text,
        item.status as work_status, requirement.status as requirement_status,
        (select count(*) from public.service_billing_events) as billing_events,
        (select count(*) from public.receivables where service_job_id = job.id) as receivables,
        (select count(*) from public.receivable_ledger_entries) as ledger_entries,
        view.actual_cost::text, view.recognized_revenue::text, view.contribution_profit::text
      from public.service_jobs job
      join public.service_job_operational_view view on view.id = job.id
      join public.work_requirements requirement on requirement.source_id = job.id and requirement.source_type = 'SERVICE_JOB'
      join public.work_items item on item.requirement_id = requirement.id
    `);
    expect(result.rows[0]).toMatchObject({
      status: "BILLED",
      actual_minutes: 450,
      approved_billable_hours: "8.0000",
      work_status: "DONE",
      requirement_status: "SATISFIED",
      billing_events: "1",
      receivables: "1",
      ledger_entries: "1",
      actual_cost: "1750000.00",
      recognized_revenue: "6800000.00",
      contribution_profit: "5050000.00",
    });
    await expect(
      client.query("update public.service_jobs set notes = 'Sửa tay bị cấm'"),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop();
    else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
