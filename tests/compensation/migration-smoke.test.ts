import { readFileSync } from "node:fs";
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

it("applies P12 and preserves verified, allocated, approved and paid boundaries", async () => {
  const port = await reservePort();
  const databaseDir = join(
    tmpdir(),
    `hienxa-p12-migration-${process.pid}-${port}`,
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
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create function app_private.assert_actor_permission(uuid, text) returns void language sql stable as 'select';
      create function app_private.has_permission(text) returns boolean language sql stable as
        'select $1 = ''earning.read_self''';
      grant usage on schema auth, app_private to authenticated;

      create table public.roles (id uuid primary key, code text not null unique);
      create table public.permissions (id uuid primary key default gen_random_uuid(), code text not null unique, description_vi text not null);
      create table public.user_profiles (user_id uuid primary key, display_name text not null, status text not null default 'ACTIVE');
      create table public.user_roles (user_id uuid not null references public.user_profiles(user_id), role_id uuid not null references public.roles(id), primary key (user_id, role_id));
      create table public.role_permissions (role_id uuid not null references public.roles(id), permission_id uuid not null references public.permissions(id), primary key (role_id, permission_id));
      create table public.employee_operational_profiles (user_id uuid primary key references public.user_profiles(user_id), employee_code text not null, is_active boolean not null default true);

      create type public.profitability_lifecycle as enum ('ESTIMATED', 'ACTUAL_OPEN', 'FINALIZED');
      create table public.sales_orders (id uuid primary key);
      create table public.receivables (id uuid primary key, sales_order_id uuid, original_amount numeric(20,2), status text);
      create table public.profitability_cost_entries (id uuid primary key default gen_random_uuid(), sales_order_id uuid, basis text, amount numeric(20,2));
      create table public.order_profitability (
        id uuid primary key default gen_random_uuid(), sales_order_id uuid not null unique,
        lifecycle public.profitability_lifecycle not null default 'ESTIMATED',
        actual_revenue numeric(20,2) not null default 0,
        quoted_direct_cost numeric(20,2) not null default 0,
        committed_direct_cost numeric(20,2) not null default 0,
        actual_direct_cost numeric(20,2) not null default 0,
        version integer not null default 1, updated_at timestamptz not null default now()
      );
      create table public.deliveries (
        id uuid primary key, delivery_number text not null, sales_order_id uuid not null references public.sales_orders(id),
        status text not null, dispatched_at timestamptz, delivered_at timestamptz, confirmed_at timestamptz,
        customer_name_snapshot text not null default 'Khách', pickup_address_snapshot text not null default 'Điểm lấy',
        drop_address_snapshot text not null default 'Điểm giao'
      );
      create table public.delivery_actuals (id uuid primary key, delivery_id uuid not null references public.deliveries(id), accepted_quantity numeric(20,6) not null);

      create table public.work_requirements (
        id uuid primary key, source_type text not null, source_id uuid not null,
        work_type text not null, title text not null
      );
      create table public.work_items (
        id uuid primary key, work_number text not null, requirement_id uuid references public.work_requirements(id),
        title text not null, work_type text not null, status text not null,
        claimed_by uuid references public.user_profiles(user_id), verified_at timestamptz
      );
      create table public.work_verifications (
        id uuid primary key default gen_random_uuid(), work_item_id uuid not null unique references public.work_items(id),
        verified_by uuid not null references public.user_profiles(user_id)
      );

      create table public.service_jobs (
        id uuid primary key, job_number text not null, customer_id uuid, customer_site_id uuid,
        service_type_id uuid, machine_id uuid, customer_name_snapshot text not null,
        site_name_snapshot text not null, site_address_snapshot text not null,
        service_type_name_snapshot text not null, machine_name_snapshot text not null,
        status text not null, scheduled_start_at timestamptz not null, scheduled_end_at timestamptz not null,
        started_at timestamptz, ended_at timestamptz, break_minutes integer not null default 0,
        actual_minutes integer not null default 0, actual_hours numeric(20,4) not null default 0,
        approved_billable_hours numeric(20,4), approved_billable_quantity numeric(20,4),
        rate_type text not null, unit_rate numeric(20,2) not null, currency text not null,
        approval_note text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table public.service_job_assignments (
        id uuid primary key, service_job_id uuid not null references public.service_jobs(id),
        operator_user_id uuid not null references public.user_profiles(user_id), status text not null,
        assigned_at timestamptz not null default now()
      );
      create table public.service_job_cost_entries (
        id uuid primary key, service_job_id uuid not null references public.service_jobs(id), amount numeric(20,2) not null, currency text not null
      );
      create table public.service_billing_events (
        id uuid primary key, service_job_id uuid not null references public.service_jobs(id), amount numeric(20,2) not null, status text not null
      );
      create table public.expenses (id uuid primary key, status text not null, currency text not null);
      create table public.expense_allocations (id uuid primary key, expense_id uuid not null references public.expenses(id), allocation_dimension text not null, allocation_reference_id uuid, amount numeric(20,2) not null);
      create table public.payments (
        id uuid primary key, payment_number text not null, direction text not null, currency text not null,
        amount numeric(20,2) not null, status text not null, payment_date date not null
      );

      insert into public.roles(id, code) values
        ('00000000-0000-4000-8000-000000000001', 'OWNER_ADMIN'),
        ('00000000-0000-4000-8000-000000000002', 'FINANCE'),
        ('00000000-0000-4000-8000-000000000003', 'SUPERVISOR'),
        ('00000000-0000-4000-8000-000000000004', 'DRIVER'),
        ('00000000-0000-4000-8000-000000000005', 'OPERATOR_WORKER'),
        ('00000000-0000-4000-8000-000000000006', 'AUDITOR_VIEWER');
      insert into public.user_profiles(user_id, display_name) values
        ('10000000-0000-4000-8000-000000000001', 'Owner thử'),
        ('10000000-0000-4000-8000-000000000002', 'Người vận hành thử'),
        ('10000000-0000-4000-8000-000000000003', 'Người hỗ trợ thử');
      insert into public.employee_operational_profiles(user_id, employee_code) values
        ('10000000-0000-4000-8000-000000000002', 'NV-002'),
        ('10000000-0000-4000-8000-000000000003', 'NV-003');
      insert into public.user_roles(user_id, role_id) values
        ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005'),
        ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005');
    `);

    await client.query(
      readFileSync(
        join(
          process.cwd(),
          "supabase/migrations/20260904113441_p12_compensation_productivity.sql",
        ),
        "utf8",
      ),
    );
    await client.query(`
      insert into public.service_jobs (
        id, job_number, customer_name_snapshot, site_name_snapshot, site_address_snapshot,
        service_type_name_snapshot, machine_name_snapshot, status, scheduled_start_at,
        scheduled_end_at, started_at, ended_at, actual_minutes, actual_hours,
        approved_billable_hours, approved_billable_quantity, rate_type, unit_rate, currency
      ) values (
        '20000000-0000-4000-8000-000000000001', 'SVC-TEST-001', 'Khách thử',
        'Công trường thử', 'Hà Nội', 'Vận hành máy', 'Máy thử', 'COMPLETED',
        now() - interval '9 hours', now() - interval '1 hour', now() - interval '9 hours',
        now() - interval '1 hour', 480, 8, 8, 8, 'HOUR', 800000, 'VND'
      );
      insert into public.service_job_assignments (
        id, service_job_id, operator_user_id, status
      ) values (
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002', 'COMPLETED'
      );
      insert into public.work_requirements (id, source_type, source_id, work_type, title)
      values (
        '20000000-0000-4000-8000-000000000003', 'SERVICE_JOB',
        '20000000-0000-4000-8000-000000000001', 'OPERATION', 'Vận hành máy thử'
      );
      insert into public.work_items (
        id, work_number, requirement_id, title, work_type, status, claimed_by, verified_at
      ) values (
        '20000000-0000-4000-8000-000000000004', 'WRK-TEST-001',
        '20000000-0000-4000-8000-000000000003', 'Vận hành máy thử',
        'OPERATION', 'VERIFIED', '10000000-0000-4000-8000-000000000002', now()
      );
      insert into public.work_verifications (work_item_id, verified_by)
      values ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001');

      select app_private.create_compensation_profile(
        '10000000-0000-4000-8000-000000000002', '2026-01-01',
        'Hồ sơ người vận hành thử đã được duyệt', '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_profile(
        '10000000-0000-4000-8000-000000000003', '2026-01-01',
        'Hồ sơ người hỗ trợ thử đã được duyệt', '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_plan_version(
        'CTY-DEFAULT', 'Kế hoạch mặc định công ty', 1, 'COMPANY', null, null,
        '2026-01-01', null, 'VND', 'Phiên bản mặc định đã được phê duyệt',
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_plan_version(
        'VH-ROLE', 'Kế hoạch người vận hành', 1, 'ROLE', 'OPERATOR_WORKER', null,
        '2026-01-01', null, 'VND', 'Phiên bản theo vai trò đã được phê duyệt',
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_plan_version(
        'VH-RIENG', 'Kế hoạch riêng người vận hành', 1, 'EMPLOYEE', null,
        '10000000-0000-4000-8000-000000000002', '2026-01-01', null, 'VND',
        'Phiên bản riêng nhân viên đã được phê duyệt',
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_rule(
        (select id from public.compensation_plan_versions where plan_code = 'CTY-DEFAULT'),
        'PER_HOUR', 100000, 'OPERATION', 'SERVICE_JOB',
        'Mức giờ mặc định cho công việc dịch vụ', '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_rule(
        (select id from public.compensation_plan_versions where plan_code = 'VH-ROLE'),
        'PER_HOUR', 120000, 'OPERATION', 'SERVICE_JOB',
        'Mức giờ theo vai trò vận hành dịch vụ', '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_rule(
        (select id from public.compensation_plan_versions where plan_code = 'VH-RIENG'),
        'PER_HOUR', 150000, 'OPERATION', 'SERVICE_JOB',
        'Mức giờ riêng cho người vận hành thử', '10000000-0000-4000-8000-000000000001'
      );
      select app_private.create_compensation_rule(
        (select id from public.compensation_plan_versions where plan_code = 'CTY-DEFAULT'),
        'FIXED_MONTHLY', 8000000, null, null,
        'Mức cố định tháng cho người lao động', '10000000-0000-4000-8000-000000000001'
      );

      select app_private.create_verified_work_earning(
        '20000000-0000-4000-8000-000000000004', 'PER_HOUR',
        '[{"workerUserId":"10000000-0000-4000-8000-000000000002","sharePercent":"60"},{"workerUserId":"10000000-0000-4000-8000-000000000003","sharePercent":"40"}]'::jsonb,
        'Chia theo biên bản hai người cùng thực hiện',
        '10000000-0000-4000-8000-000000000001'
      );
    `);

    const pending = await client.query(`
      select event_record.total_amount::text,
        (select array_agg(allocation.rate_snapshot order by allocation.worker_user_id)
          from public.earning_allocations allocation
          where allocation.earning_event_id = event_record.id) as rates
      from public.earning_events event_record
      where event_record.source_type = 'WORK_VERIFICATION'
    `);
    expect(pending.rows[0]).toMatchObject({
      total_amount: "1104000.00",
      rates: [150000, 120000],
    });

    await client.query(`
      select app_private.adjust_earning_allocation(
        (select id from public.earning_allocations order by worker_user_id limit 1),
        -4000, 'Điều chỉnh giảm theo biên bản đối soát',
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.approve_earning_event(
        (select id from public.earning_events where source_type = 'WORK_VERIFICATION'),
        'Duyệt theo xác minh và sản lượng thực tế',
        '10000000-0000-4000-8000-000000000001'
      );
    `);
    const approved = await client.query(`
      select event_record.status, event_record.total_amount::text,
        (select sum(labor.amount)::text from public.compensation_direct_labor_entries labor) as labor,
        service.actual_cost::text as service_cost
      from public.earning_events event_record
      cross join public.service_job_operational_view service
      where event_record.source_type = 'WORK_VERIFICATION'
    `);
    expect(approved.rows[0]).toMatchObject({
      status: "APPROVED",
      total_amount: "1100000.00",
      labor: "1100000.00",
      service_cost: "1100000.00",
    });

    await expect(
      client.query(`
      update public.compensation_plan_versions set name = 'Ghi đè lịch sử'
    `),
    ).rejects.toMatchObject({ code: "22000" });

    await client.query(`
      select app_private.create_payroll_period(
        '2026-09', '2026-09-01', '2026-09-30', 'VND',
        'Kỳ thu nhập tháng chín đã mở để đối soát',
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.generate_monthly_earnings(
        (select id from public.payroll_periods where period_code = '2026-09'),
        '10000000-0000-4000-8000-000000000001'
      );
      select app_private.approve_earning_event(
        event_record.id, 'Duyệt khoản cố định theo kế hoạch hiệu lực',
        '10000000-0000-4000-8000-000000000001'
      )
      from public.earning_events event_record
      where event_record.source_type = 'PAYROLL_PERIOD';
      select app_private.close_payroll_period(
        (select id from public.payroll_periods where period_code = '2026-09'),
        'Đã đối soát đầy đủ quyền lợi trong kỳ',
        '10000000-0000-4000-8000-000000000001'
      );
      insert into public.payments values (
        '20000000-0000-4000-8000-000000000010', 'PAY-TEST-001',
        'DISBURSEMENT', 'VND', 500000, 'POSTED', '2026-09-30'
      );
      select app_private.link_payroll_payment(
        (select id from public.payroll_lines order by employee_user_id limit 1),
        '20000000-0000-4000-8000-000000000010', 500000,
        'Liên kết đợt chi thử với dòng thu nhập',
        '10000000-0000-4000-8000-000000000001'
      );
    `);
    const payroll = await client.query(`
      select (select count(*)::int from public.payroll_lines) as lines,
        (select count(*)::int from public.earning_events where source_type = 'PAYROLL_PERIOD') as monthly_events,
        (select sum(amount)::text from public.compensation_direct_labor_entries) as labor,
        (select count(*)::int from public.earning_allocations where cost_treatment_snapshot = 'DIRECT_LABOR') as direct_allocations,
        (select count(*)::int from public.earning_allocations where cost_treatment_snapshot = 'OPEX') as opex_allocations,
        (select total_paid::text from public.payroll_period_summary_view where period_code = '2026-09') as paid
    `);
    expect(payroll.rows[0]).toMatchObject({
      lines: 2,
      monthly_events: 2,
      labor: "1100000.00",
      direct_allocations: 2,
      opex_allocations: 2,
      paid: "500000.00",
    });

    await client.query(`
      set role authenticated;
      set "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
    `);
    const selfOnly = await client.query(`
      select count(*)::int as count,
        bool_and(worker_user_id = auth.uid()) as only_self
      from public.my_earning_view
    `);
    expect(selfOnly.rows[0]).toMatchObject({ count: 2, only_self: true });
    await client.query("reset role");

    await client.query(`
      update public.work_items set status = 'CANCELLED'
      where id = '20000000-0000-4000-8000-000000000004'
    `);
    const reversed = await client.query(`
      select event_record.status,
        count(labor.id) filter (where labor.reversed_at is null)::int as active_labor
      from public.earning_events event_record
      join public.earning_allocations allocation on allocation.earning_event_id = event_record.id
      left join public.compensation_direct_labor_entries labor
        on labor.earning_allocation_id = allocation.id
      where event_record.source_type = 'WORK_VERIFICATION'
      group by event_record.status
    `);
    expect(reversed.rows[0]).toMatchObject({
      status: "REVERSED",
      active_labor: 0,
    });

    await client.query(`
      insert into public.work_requirements (id, source_type, source_id, work_type, title)
      values ('20000000-0000-4000-8000-000000000020', 'GENERAL', gen_random_uuid(), 'GENERAL', 'Việc chưa xác minh');
      insert into public.work_items (id, work_number, requirement_id, title, work_type, status, claimed_by)
      values (
        '20000000-0000-4000-8000-000000000021', 'WRK-TEST-002',
        '20000000-0000-4000-8000-000000000020', 'Việc chưa xác minh', 'GENERAL', 'DONE',
        '10000000-0000-4000-8000-000000000002'
      );
    `);
    await expect(
      client.query(`
      select app_private.create_verified_work_earning(
        '20000000-0000-4000-8000-000000000021', 'PER_JOB',
        '[{"workerUserId":"10000000-0000-4000-8000-000000000002","sharePercent":"100"}]'::jsonb,
        'Không được tạo vì mới chỉ báo hoàn thành',
        '10000000-0000-4000-8000-000000000001'
      )
    `),
    ).rejects.toMatchObject({ code: "23514" });
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop();
    else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
