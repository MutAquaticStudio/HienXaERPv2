-- HIỀN XA ERP P11 — Service Jobs, operational logs, billing and profitability.
-- Service execution is event-backed. Actual elapsed time and approved billable
-- time are deliberately separate values.

create type public.service_rate_type as enum (
  'HOUR', 'SHIFT', 'TRIP', 'DAY', 'FIXED_JOB'
);
create type public.service_job_status as enum (
  'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED',
  'APPROVED', 'CUSTOMER_CONFIRMED', 'BILLED', 'CANCELLED'
);
create type public.service_machine_status as enum (
  'AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'INACTIVE'
);
create type public.service_assignment_status as enum (
  'ACTIVE', 'COMPLETED', 'RELEASED', 'CANCELLED'
);
create type public.service_work_log_type as enum (
  'START', 'BREAK_START', 'BREAK_END', 'FUEL', 'EVIDENCE', 'INCIDENT', 'END'
);
create type public.service_billing_status as enum ('READY', 'CONSUMED');
create type public.service_cost_category as enum (
  'FUEL', 'MACHINE', 'DIRECT_LABOR', 'OTHER'
);

create sequence public.service_job_number_seq;
create sequence public.service_billing_event_number_seq;
revoke all on sequence public.service_job_number_seq from public, anon, authenticated;
revoke all on sequence public.service_billing_event_number_seq from public, anon, authenticated;

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 160),
  default_rate_type public.service_rate_type not null,
  default_unit_rate numeric(20, 2) check (default_unit_rate is null or default_unit_rate > 0),
  standard_shift_hours numeric(8, 2) not null default 8
    check (standard_shift_hours > 0 and standard_shift_hours <= 24),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_types_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create table public.service_machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 160),
  machine_type text not null check (char_length(trim(machine_type)) between 2 and 100),
  serial_number text unique,
  home_warehouse_id uuid references public.warehouses(id) on delete restrict,
  status public.service_machine_status not null default 'AVAILABLE',
  meter_hours numeric(20, 2) not null default 0 check (meter_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_machines_status_idx on public.service_machines(status, machine_type);

create table public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_site_id uuid not null references public.customer_sites(id) on delete restrict,
  service_type_id uuid not null references public.service_types(id) on delete restrict,
  machine_id uuid not null references public.service_machines(id) on delete restrict,
  customer_name_snapshot text not null,
  site_name_snapshot text not null,
  site_address_snapshot text not null,
  service_type_name_snapshot text not null,
  machine_name_snapshot text not null,
  status public.service_job_status not null default 'SCHEDULED',
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  actual_hours numeric(20, 4)
    generated always as (round(actual_minutes::numeric / 60, 4)) stored,
  approved_billable_hours numeric(20, 4)
    check (approved_billable_hours is null or approved_billable_hours > 0),
  approved_billable_quantity numeric(20, 4)
    check (approved_billable_quantity is null or approved_billable_quantity > 0),
  rate_type public.service_rate_type not null,
  unit_rate numeric(20, 2) not null check (unit_rate > 0),
  currency text not null default 'VND'
    check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  approval_note text check (
    approval_note is null or char_length(trim(approval_note)) between 10 and 500
  ),
  approved_by uuid references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz,
  notes text check (notes is null or char_length(trim(notes)) between 2 and 1000),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_jobs_schedule check (scheduled_end_at > scheduled_start_at),
  constraint service_jobs_elapsed check (
    actual_minutes = 0 or (started_at is not null and ended_at is not null and ended_at >= started_at)
  ),
  constraint service_jobs_approval_shape check (
    (approved_at is null and approved_by is null and approval_note is null
      and approved_billable_hours is null and approved_billable_quantity is null)
    or (approved_at is not null and approved_by is not null and approval_note is not null
      and approved_billable_hours is not null and approved_billable_quantity is not null)
  )
);
create index service_jobs_status_idx on public.service_jobs(status, scheduled_start_at);
create index service_jobs_customer_idx on public.service_jobs(customer_id, scheduled_start_at desc);
create index service_jobs_machine_idx on public.service_jobs(machine_id, scheduled_start_at desc);

create table public.service_job_assignments (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete restrict,
  operator_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  assigned_by uuid not null references public.user_profiles(user_id) on delete restrict,
  status public.service_assignment_status not null default 'ACTIVE',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text check (reason is null or char_length(trim(reason)) between 5 and 500),
  constraint service_assignments_lifecycle check (
    (status = 'ACTIVE' and ended_at is null)
    or (status <> 'ACTIVE' and ended_at is not null)
  )
);
create unique index service_assignments_one_active_job
  on public.service_job_assignments(service_job_id) where status = 'ACTIVE';
create index service_assignments_operator_idx
  on public.service_job_assignments(operator_user_id, status, assigned_at desc);

create table public.service_work_logs (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete restrict,
  operator_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  log_type public.service_work_log_type not null,
  occurred_at timestamptz not null,
  note text check (note is null or char_length(trim(note)) between 2 and 1000),
  fuel_liters numeric(14, 3) check (fuel_liters is null or fuel_liters > 0),
  fuel_unit_cost numeric(20, 2) check (fuel_unit_cost is null or fuel_unit_cost > 0),
  evidence_id uuid references public.evidence(id) on delete restrict,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_work_logs_payload check (
    (log_type = 'FUEL' and fuel_liters is not null and fuel_unit_cost is not null and evidence_id is null)
    or (log_type = 'EVIDENCE' and evidence_id is not null and fuel_liters is null and fuel_unit_cost is null)
    or (log_type not in ('FUEL', 'EVIDENCE') and fuel_liters is null
      and fuel_unit_cost is null and evidence_id is null)
  )
);
create index service_work_logs_job_idx
  on public.service_work_logs(service_job_id, occurred_at, created_at);

create table public.service_customer_confirmations (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null unique references public.service_jobs(id) on delete restrict,
  customer_representative text not null
    check (char_length(trim(customer_representative)) between 2 and 160),
  confirmation_note text not null
    check (char_length(trim(confirmation_note)) between 10 and 500),
  signature_evidence_id uuid references public.evidence(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.service_billing_events (
  id uuid primary key default gen_random_uuid(),
  billing_event_number text not null unique,
  service_job_id uuid not null unique references public.service_jobs(id) on delete restrict,
  customer_confirmation_id uuid not null unique
    references public.service_customer_confirmations(id) on delete restrict,
  rate_type public.service_rate_type not null,
  billable_hours numeric(20, 4) not null check (billable_hours > 0),
  billable_quantity numeric(20, 4) not null check (billable_quantity > 0),
  unit_rate numeric(20, 2) not null check (unit_rate > 0),
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status public.service_billing_status not null default 'READY',
  receivable_id uuid,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint service_billing_lifecycle check (
    (status = 'READY' and receivable_id is null and consumed_at is null)
    or (status = 'CONSUMED' and receivable_id is not null and consumed_at is not null)
  )
);

create table public.service_job_cost_entries (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete restrict,
  category public.service_cost_category not null,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  source_type text not null check (source_type in ('FUEL_LOG', 'MANUAL')),
  source_id uuid not null,
  note text not null check (char_length(trim(note)) between 5 and 500),
  occurred_at timestamptz not null,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index service_job_cost_entries_job_idx
  on public.service_job_cost_entries(service_job_id, occurred_at);

create table public.service_job_state_events (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete restrict,
  from_status public.service_job_status,
  to_status public.service_job_status not null,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now(),
  check (from_status is null or from_status <> to_status)
);
create index service_job_state_events_job_idx
  on public.service_job_state_events(service_job_id, occurred_at);
create unique index service_job_state_events_initial_once
  on public.service_job_state_events(service_job_id) where from_status is null;

-- P8 receivables become source-polymorphic while retaining every delivery invariant.
alter table public.receivables
  alter column sales_order_id drop not null,
  alter column delivery_id drop not null,
  alter column source_event_id drop not null,
  add column service_job_id uuid references public.service_jobs(id) on delete restrict,
  add column service_billing_event_id uuid references public.service_billing_events(id) on delete restrict;
create unique index receivables_service_job_unique
  on public.receivables(service_job_id) where service_job_id is not null;
create unique index receivables_service_billing_event_unique
  on public.receivables(service_billing_event_id) where service_billing_event_id is not null;
alter table public.receivables add constraint receivables_source_shape check (
  (
    sales_order_id is not null and delivery_id is not null and source_event_id is not null
    and service_job_id is null and service_billing_event_id is null
  )
  or (
    sales_order_id is null and delivery_id is null and source_event_id is null
    and service_job_id is not null and service_billing_event_id is not null
  )
);
alter table public.service_billing_events
  add constraint service_billing_receivable_fk
  foreign key (receivable_id) references public.receivables(id) on delete restrict;

create trigger service_types_updated_at before update on public.service_types
for each row execute function app_private.touch_updated_at();
create trigger service_machines_updated_at before update on public.service_machines
for each row execute function app_private.touch_updated_at();
create trigger service_jobs_updated_at before update on public.service_jobs
for each row execute function app_private.touch_updated_at();

create or replace function app_private.require_service_internal_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('app.service_internal_write', true) is distinct from 'on' then
    raise exception 'SERVICE_JOB_WRITE_REQUIRES_COMMAND' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger service_jobs_command_update before update or delete on public.service_jobs
for each row execute function app_private.require_service_internal_write();
create trigger service_assignments_command_update before update or delete on public.service_job_assignments
for each row execute function app_private.require_service_internal_write();
create trigger service_billing_command_update before update or delete on public.service_billing_events
for each row execute function app_private.require_service_internal_write();
create trigger service_work_logs_immutable before update or delete on public.service_work_logs
for each row execute function app_private.prevent_immutable_delete();
create trigger service_confirmations_immutable before update or delete on public.service_customer_confirmations
for each row execute function app_private.prevent_immutable_delete();
create trigger service_cost_entries_immutable before update or delete on public.service_job_cost_entries
for each row execute function app_private.prevent_immutable_delete();
create trigger service_state_events_immutable before update or delete on public.service_job_state_events
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.create_service_type(
  p_code text,
  p_name_vi text,
  p_rate_type public.service_rate_type,
  p_default_unit_rate numeric,
  p_standard_shift_hours numeric,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare type_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.manage');
  if char_length(trim(p_code)) not between 2 and 32
    or char_length(trim(p_name_vi)) not between 2 and 160
    or p_default_unit_rate <= 0
    or p_standard_shift_hours <= 0 or p_standard_shift_hours > 24 then
    raise exception 'VALID_SERVICE_TYPE_REQUIRED' using errcode = '22000';
  end if;
  insert into public.service_types (
    code, name_vi, default_rate_type, default_unit_rate, standard_shift_hours
  ) values (
    upper(trim(p_code)), trim(p_name_vi), p_rate_type,
    round(p_default_unit_rate, 2), round(p_standard_shift_hours, 2)
  ) returning id into type_id;
  return type_id;
end;
$$;

create or replace function app_private.create_service_machine(
  p_code text,
  p_name_vi text,
  p_machine_type text,
  p_serial_number text,
  p_home_warehouse_id uuid,
  p_meter_hours numeric,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare machine_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.manage');
  if char_length(trim(p_code)) not between 2 and 32
    or char_length(trim(p_name_vi)) not between 2 and 160
    or char_length(trim(p_machine_type)) not between 2 and 100
    or coalesce(p_meter_hours, 0) < 0 then
    raise exception 'VALID_SERVICE_MACHINE_REQUIRED' using errcode = '22000';
  end if;
  if p_home_warehouse_id is not null and not exists (
    select 1 from public.warehouses warehouse
    where warehouse.id = p_home_warehouse_id and warehouse.is_active
  ) then
    raise exception 'ACTIVE_WAREHOUSE_REQUIRED' using errcode = 'P0002';
  end if;
  insert into public.service_machines (
    code, name_vi, machine_type, serial_number, home_warehouse_id, meter_hours
  ) values (
    upper(trim(p_code)), trim(p_name_vi), trim(p_machine_type),
    nullif(trim(p_serial_number), ''), p_home_warehouse_id, coalesce(p_meter_hours, 0)
  ) returning id into machine_id;
  return machine_id;
end;
$$;

create or replace function app_private.create_service_job(
  p_customer_id uuid,
  p_customer_site_id uuid,
  p_service_type_id uuid,
  p_machine_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_rate_type public.service_rate_type,
  p_unit_rate numeric,
  p_currency text,
  p_notes text,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  customer_record public.customers%rowtype;
  site_record public.customer_sites%rowtype;
  type_record public.service_types%rowtype;
  machine_record public.service_machines%rowtype;
  job_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.manage');
  if p_scheduled_end_at <= p_scheduled_start_at
    or p_unit_rate <= 0
    or upper(trim(p_currency)) !~ '^[A-Z]{3}$'
    or (p_notes is not null and char_length(trim(p_notes)) not between 2 and 1000) then
    raise exception 'VALID_SERVICE_JOB_REQUIRED' using errcode = '22000';
  end if;

  select * into customer_record from public.customers
    where id = p_customer_id and is_active;
  if not found then raise exception 'ACTIVE_CUSTOMER_REQUIRED' using errcode = 'P0002'; end if;
  select * into site_record from public.customer_sites
    where id = p_customer_site_id and customer_id = p_customer_id and is_active;
  if not found then raise exception 'ACTIVE_CUSTOMER_SITE_REQUIRED' using errcode = 'P0002'; end if;
  select * into type_record from public.service_types
    where id = p_service_type_id and is_active;
  if not found then raise exception 'ACTIVE_SERVICE_TYPE_REQUIRED' using errcode = 'P0002'; end if;
  select * into machine_record from public.service_machines
    where id = p_machine_id and status in ('AVAILABLE', 'ASSIGNED') for update;
  if not found then raise exception 'AVAILABLE_SERVICE_MACHINE_REQUIRED' using errcode = 'P0002'; end if;

  if exists (
    select 1 from public.service_jobs existing_job
    where existing_job.machine_id = p_machine_id
      and existing_job.status not in ('COMPLETED', 'APPROVED', 'CUSTOMER_CONFIRMED', 'BILLED', 'CANCELLED')
      and tstzrange(existing_job.scheduled_start_at, existing_job.scheduled_end_at, '[)')
        && tstzrange(p_scheduled_start_at, p_scheduled_end_at, '[)')
  ) then
    raise exception 'SERVICE_MACHINE_SCHEDULE_CONFLICT' using errcode = '23P01';
  end if;

  insert into public.service_jobs (
    job_number, customer_id, customer_site_id, service_type_id, machine_id,
    customer_name_snapshot, site_name_snapshot, site_address_snapshot,
    service_type_name_snapshot, machine_name_snapshot, scheduled_start_at,
    scheduled_end_at, rate_type, unit_rate, currency, notes, created_by
  ) values (
    'SVC-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.service_job_number_seq')::text, 6, '0'),
    customer_record.id, site_record.id, type_record.id, machine_record.id,
    customer_record.name_vi, site_record.name_vi, site_record.address,
    type_record.name_vi, machine_record.name_vi, p_scheduled_start_at,
    p_scheduled_end_at, p_rate_type, round(p_unit_rate, 2),
    upper(trim(p_currency)), nullif(trim(p_notes), ''), p_actor_id
  ) returning id into job_id;
  insert into public.service_job_state_events (
    service_job_id, from_status, to_status, reason, actor_user_id
  ) values (job_id, null, 'SCHEDULED', 'Tạo công việc dịch vụ', p_actor_id);
  return job_id;
end;
$$;

create or replace function app_private.assign_service_job(
  p_service_job_id uuid,
  p_operator_user_id uuid,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  job_record public.service_jobs%rowtype;
  assignment_id uuid;
  target_requirement_id uuid;
  item_id uuid;
  previous_status public.service_job_status;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.assign');
  select * into job_record from public.service_jobs
    where id = p_service_job_id for update;
  if not found then raise exception 'SERVICE_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if job_record.status not in ('SCHEDULED', 'ASSIGNED') then
    raise exception 'SERVICE_JOB_NOT_ASSIGNABLE' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.user_profiles profile
    join public.employee_operational_profiles operational on operational.user_id = profile.user_id
    join public.user_roles user_role on user_role.user_id = profile.user_id
    join public.roles role on role.id = user_role.role_id
    where profile.user_id = p_operator_user_id and profile.status = 'ACTIVE'
      and operational.is_active and role.code = 'OPERATOR_WORKER'
  ) then
    raise exception 'ACTIVE_SERVICE_OPERATOR_REQUIRED' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.work_items active_item
    where active_item.claimed_by = p_operator_user_id
      and active_item.status = 'IN_PROGRESS'
      and active_item.required_role = 'OPERATOR_WORKER'
      and not exists (
        select 1 from public.work_requirements own_requirement
        where own_requirement.id = active_item.requirement_id
          and own_requirement.source_type = 'SERVICE_JOB'
          and own_requirement.source_id = job_record.id
      )
  ) then
    raise exception 'SERVICE_OPERATOR_ACTIVE_LIMIT_REACHED' using errcode = '23514';
  end if;

  perform set_config('app.service_internal_write', 'on', true);
  update public.service_job_assignments set
    status = 'RELEASED', ended_at = now(), reason = 'Thay đổi người vận hành trước khi bắt đầu'
  where service_job_id = job_record.id and status = 'ACTIVE'
    and operator_user_id <> p_operator_user_id;
  select id into assignment_id from public.service_job_assignments
    where service_job_id = job_record.id and operator_user_id = p_operator_user_id
      and status = 'ACTIVE';
  if assignment_id is null then
    insert into public.service_job_assignments (
      service_job_id, operator_user_id, assigned_by
    ) values (job_record.id, p_operator_user_id, p_actor_id)
    returning id into assignment_id;
  end if;

  previous_status := job_record.status;
  update public.service_jobs set status = 'ASSIGNED' where id = job_record.id;
  update public.service_machines set status = 'ASSIGNED' where id = job_record.machine_id;
  if previous_status <> 'ASSIGNED' then
    insert into public.service_job_state_events (
      service_job_id, from_status, to_status, reason, actor_user_id
    ) values (
      job_record.id, previous_status, 'ASSIGNED', 'Phân công người vận hành', p_actor_id
    );
  end if;

  insert into public.work_requirements (
    source_type, source_id, work_type, required_role, status,
    title, description, due_at, created_by
  ) values (
    'SERVICE_JOB', job_record.id, 'OPERATION', 'OPERATOR_WORKER', 'READY',
    'Thực hiện ' || job_record.job_number,
    job_record.service_type_name_snapshot || ' · ' || job_record.site_name_snapshot,
    job_record.scheduled_start_at, p_actor_id
  ) on conflict (source_type, source_id, work_type) do update set
    status = 'READY', due_at = excluded.due_at, updated_at = now()
  returning id into target_requirement_id;

  insert into public.work_items (
    work_number, requirement_id, title, description, work_type, required_role,
    assignment_mode, status, assigned_user_id, claimed_by, claimed_at, due_at
  ) values (
    'WRK-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.work_item_number_seq')::text, 6, '0'),
    target_requirement_id, 'Thực hiện ' || job_record.job_number,
    job_record.machine_name_snapshot || ' tại ' || job_record.site_address_snapshot,
    'OPERATION', 'OPERATOR_WORKER', 'DIRECT', 'CLAIMED',
    p_operator_user_id, p_operator_user_id, now(), job_record.scheduled_start_at
  ) on conflict (requirement_id) where (requirement_id is not null) do update set
    assignment_mode = 'DIRECT', status = 'CLAIMED',
    assigned_user_id = excluded.assigned_user_id, claimed_by = excluded.claimed_by,
    claimed_at = now(), claim_expires_at = null, blocked_reason = null,
    due_at = excluded.due_at, updated_at = now()
  returning id into item_id;

  update public.work_assignments set status = 'RELEASED', ended_at = now(),
    reason = 'Phân công dịch vụ thay đổi'
  where work_item_id = item_id and status = 'ACTIVE'
    and worker_user_id <> p_operator_user_id;
  if not exists (
    select 1 from public.work_assignments work_assignment
    where work_assignment.work_item_id = item_id and work_assignment.status = 'ACTIVE'
  ) then
    insert into public.work_assignments (
      work_item_id, worker_user_id, assignment_mode, assigned_by
    ) values (item_id, p_operator_user_id, 'DIRECT', p_actor_id);
  end if;
  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) values (
    item_id, null, 'CLAIMED', 'Tạo từ phân công công việc dịch vụ', p_actor_id
  ) on conflict (work_item_id) where from_status is null do nothing;
  return assignment_id;
end;
$$;

create or replace function app_private.record_service_work_log(
  p_service_job_id uuid,
  p_log_type public.service_work_log_type,
  p_occurred_at timestamptz,
  p_note text,
  p_fuel_liters numeric,
  p_fuel_unit_cost numeric,
  p_evidence_id uuid,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  job_record public.service_jobs%rowtype;
  assignment_record public.service_job_assignments%rowtype;
  log_id uuid;
  previous_log_at timestamptz;
  open_break_at timestamptz;
  added_break_minutes integer;
  calculated_actual_minutes integer;
  next_status public.service_job_status;
  target_work_item_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.update_assigned');
  select * into job_record from public.service_jobs
    where id = p_service_job_id for update;
  if not found then raise exception 'SERVICE_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into assignment_record from public.service_job_assignments
    where service_job_id = job_record.id and status = 'ACTIVE' for update;
  if not found or (
    assignment_record.operator_user_id <> p_actor_id
    and not app_private.actor_has_permission(p_actor_id, 'service_job.manage')
  ) then
    raise exception 'SERVICE_JOB_NOT_ASSIGNED_TO_ACTOR' using errcode = '42501';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then
    raise exception 'SERVICE_LOG_FUTURE_TIME_FORBIDDEN' using errcode = '22007';
  end if;
  select max(log_entry.occurred_at) into previous_log_at
  from public.service_work_logs log_entry where log_entry.service_job_id = job_record.id;
  if previous_log_at is not null and p_occurred_at < previous_log_at then
    raise exception 'SERVICE_LOG_TIME_MUST_BE_MONOTONIC' using errcode = '22007';
  end if;
  if p_note is not null and char_length(trim(p_note)) not between 2 and 1000 then
    raise exception 'VALID_SERVICE_LOG_NOTE_REQUIRED' using errcode = '22000';
  end if;

  next_status := job_record.status;
  case p_log_type
    when 'START' then
      if job_record.status <> 'ASSIGNED' or job_record.started_at is not null then
        raise exception 'ASSIGNED_SERVICE_JOB_REQUIRED' using errcode = '23514';
      end if;
      next_status := 'IN_PROGRESS';
    when 'BREAK_START' then
      if job_record.status <> 'IN_PROGRESS' then
        raise exception 'IN_PROGRESS_SERVICE_JOB_REQUIRED' using errcode = '23514';
      end if;
      next_status := 'PAUSED';
    when 'BREAK_END' then
      if job_record.status <> 'PAUSED' then
        raise exception 'PAUSED_SERVICE_JOB_REQUIRED' using errcode = '23514';
      end if;
      select started.occurred_at into open_break_at
      from public.service_work_logs started
      where started.service_job_id = job_record.id and started.log_type = 'BREAK_START'
        and not exists (
          select 1 from public.service_work_logs finished
          where finished.service_job_id = started.service_job_id
            and finished.log_type = 'BREAK_END'
            and finished.occurred_at >= started.occurred_at
        )
      order by started.occurred_at desc limit 1;
      if open_break_at is null or p_occurred_at <= open_break_at then
        raise exception 'OPEN_SERVICE_BREAK_REQUIRED' using errcode = '23514';
      end if;
      added_break_minutes := greatest(
        1, floor(extract(epoch from (p_occurred_at - open_break_at)) / 60)::integer
      );
      next_status := 'IN_PROGRESS';
    when 'FUEL' then
      if job_record.status not in ('IN_PROGRESS', 'PAUSED')
        or p_fuel_liters <= 0 or p_fuel_unit_cost <= 0 then
        raise exception 'VALID_SERVICE_FUEL_LOG_REQUIRED' using errcode = '23514';
      end if;
    when 'EVIDENCE' then
      if job_record.status not in ('IN_PROGRESS', 'PAUSED') or p_evidence_id is null
        or not exists (
          select 1 from public.evidence evidence
          where evidence.id = p_evidence_id
            and evidence.entity_type = 'SERVICE_JOB'
            and evidence.entity_id = job_record.id
            and evidence.owner_user_id = p_actor_id
        ) then
        raise exception 'OWN_SERVICE_EVIDENCE_REQUIRED' using errcode = '23514';
      end if;
    when 'INCIDENT' then
      if job_record.status not in ('IN_PROGRESS', 'PAUSED')
        or p_note is null or char_length(trim(p_note)) < 10 then
        raise exception 'SERVICE_INCIDENT_NOTE_REQUIRED' using errcode = '22000';
      end if;
    when 'END' then
      if job_record.status <> 'IN_PROGRESS' or job_record.started_at is null
        or p_occurred_at <= job_record.started_at then
        raise exception 'RUNNING_SERVICE_JOB_REQUIRED' using errcode = '23514';
      end if;
      calculated_actual_minutes :=
        floor(extract(epoch from (p_occurred_at - job_record.started_at)) / 60)::integer
        - job_record.break_minutes;
      if calculated_actual_minutes <= 0 then
        raise exception 'POSITIVE_SERVICE_DURATION_REQUIRED' using errcode = '23514';
      end if;
      next_status := 'COMPLETED';
    else
      raise exception 'UNSUPPORTED_SERVICE_LOG_TYPE' using errcode = '22000';
  end case;

  insert into public.service_work_logs (
    service_job_id, operator_user_id, log_type, occurred_at, note,
    fuel_liters, fuel_unit_cost, evidence_id, created_by
  ) values (
    job_record.id, assignment_record.operator_user_id, p_log_type, p_occurred_at,
    nullif(trim(p_note), ''), p_fuel_liters, p_fuel_unit_cost, p_evidence_id, p_actor_id
  ) returning id into log_id;

  perform set_config('app.service_internal_write', 'on', true);
  if p_log_type = 'START' then
    update public.service_jobs set status = 'IN_PROGRESS', started_at = p_occurred_at
      where id = job_record.id;
  elsif p_log_type = 'BREAK_START' then
    update public.service_jobs set status = 'PAUSED' where id = job_record.id;
  elsif p_log_type = 'BREAK_END' then
    update public.service_jobs set status = 'IN_PROGRESS',
      break_minutes = break_minutes + added_break_minutes where id = job_record.id;
  elsif p_log_type = 'END' then
    update public.service_jobs set status = 'COMPLETED', ended_at = p_occurred_at,
      actual_minutes = calculated_actual_minutes where id = job_record.id;
    update public.service_job_assignments set status = 'COMPLETED', ended_at = p_occurred_at,
      reason = 'Người vận hành đã kết thúc công việc'
      where id = assignment_record.id;
    update public.service_machines machine set status = case
      when exists (
        select 1 from public.service_jobs other_job
        where other_job.machine_id = machine.id
          and other_job.id <> job_record.id
          and other_job.status in ('ASSIGNED', 'IN_PROGRESS', 'PAUSED')
      ) then 'ASSIGNED'::public.service_machine_status
      else 'AVAILABLE'::public.service_machine_status end
      where machine.id = job_record.machine_id;
  end if;

  if next_status <> job_record.status then
    insert into public.service_job_state_events (
      service_job_id, from_status, to_status, reason, actor_user_id, occurred_at
    ) values (
      job_record.id, job_record.status, next_status,
      case p_log_type
        when 'START' then 'Người vận hành bắt đầu công việc'
        when 'BREAK_START' then 'Người vận hành bắt đầu nghỉ'
        when 'BREAK_END' then 'Người vận hành tiếp tục công việc'
        else 'Người vận hành kết thúc công việc'
      end,
      p_actor_id, p_occurred_at
    );
  end if;

  if p_log_type = 'FUEL' then
    insert into public.service_job_cost_entries (
      service_job_id, category, amount, currency, source_type, source_id,
      note, occurred_at, created_by
    ) values (
      job_record.id, 'FUEL', round(p_fuel_liters * p_fuel_unit_cost, 2),
      job_record.currency, 'FUEL_LOG', log_id,
      'Nhiên liệu thực tế cho ' || job_record.job_number,
      p_occurred_at, p_actor_id
    );
  end if;

  select item.id into target_work_item_id
  from public.work_items item
  join public.work_requirements requirement on requirement.id = item.requirement_id
  where requirement.source_type = 'SERVICE_JOB' and requirement.source_id = job_record.id;
  if target_work_item_id is not null and p_log_type = 'START' then
    update public.work_items set status = 'IN_PROGRESS', started_at = p_occurred_at,
      heartbeat_due_at = p_occurred_at + interval '15 minutes',
      external_effect_started = true, updated_at = now()
      where id = target_work_item_id;
    update public.work_claims claim set status = 'STARTED', started_at = p_occurred_at
      where claim.work_item_id = target_work_item_id and claim.status = 'ACTIVE';
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
    ) values (
      target_work_item_id, 'CLAIMED', 'IN_PROGRESS',
      'ServiceJob là nguồn nghiệp vụ: đã bắt đầu', p_actor_id, p_occurred_at
    );
  elsif target_work_item_id is not null and p_log_type = 'END' then
    update public.work_requirements set status = 'SATISFIED'
      where source_type = 'SERVICE_JOB' and source_id = job_record.id;
    update public.work_items set status = 'DONE', completed_at = p_occurred_at,
      heartbeat_due_at = null, external_effect_started = true, updated_at = now()
      where id = target_work_item_id;
    update public.work_claims claim set status = 'COMPLETED'
      where claim.work_item_id = target_work_item_id and claim.status in ('ACTIVE', 'STARTED');
    update public.work_assignments assignment set status = 'COMPLETED', ended_at = p_occurred_at,
      reason = 'ServiceJob đã kết thúc'
      where assignment.work_item_id = target_work_item_id and assignment.status = 'ACTIVE';
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
    ) values (
      target_work_item_id, 'IN_PROGRESS', 'DONE',
      'WorkItem reflects the ServiceJob result: công việc dịch vụ đã kết thúc',
      p_actor_id, p_occurred_at
    );
    insert into public.work_notifications (
      work_item_id, recipient_role, notification_type, title, message, action_path
    ) values (
      target_work_item_id, 'SUPERVISOR', 'SERVICE_READY_FOR_APPROVAL',
      'Công việc dịch vụ chờ duyệt', job_record.job_number || ' đã có giờ thực tế.',
      '/app/service'
    );
  end if;

  if p_log_type = 'INCIDENT' and target_work_item_id is not null then
    insert into public.work_notifications (
      work_item_id, recipient_role, notification_type, title, message, action_path
    ) values (
      target_work_item_id, 'SUPERVISOR', 'SERVICE_INCIDENT',
      'Sự cố công việc dịch vụ', trim(p_note), '/app/service'
    );
  end if;
  return log_id;
end;
$$;

create or replace function app_private.approve_service_job_billing(
  p_service_job_id uuid,
  p_approved_billable_hours numeric,
  p_approved_billable_quantity numeric,
  p_note text,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare job_record public.service_jobs%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.approve');
  if p_approved_billable_hours <= 0 or p_approved_billable_quantity <= 0
    or char_length(trim(p_note)) < 10 then
    raise exception 'VALID_SERVICE_BILLING_APPROVAL_REQUIRED' using errcode = '22000';
  end if;
  select * into job_record from public.service_jobs
    where id = p_service_job_id for update;
  if not found or job_record.status <> 'COMPLETED' then
    raise exception 'COMPLETED_SERVICE_JOB_REQUIRED' using errcode = '23514';
  end if;
  if job_record.rate_type = 'HOUR'
    and abs(p_approved_billable_hours - p_approved_billable_quantity) > 0.0001 then
    raise exception 'HOURLY_BILLING_QUANTITY_MUST_EQUAL_HOURS' using errcode = '23514';
  end if;
  if job_record.rate_type = 'FIXED_JOB'
    and abs(p_approved_billable_quantity - 1) > 0.0001 then
    raise exception 'FIXED_JOB_BILLING_QUANTITY_MUST_BE_ONE' using errcode = '23514';
  end if;
  perform set_config('app.service_internal_write', 'on', true);
  update public.service_jobs set
    status = 'APPROVED',
    approved_billable_hours = round(p_approved_billable_hours, 4),
    approved_billable_quantity = round(p_approved_billable_quantity, 4),
    approval_note = trim(p_note), approved_by = p_actor_id, approved_at = now()
  where id = job_record.id;
  insert into public.service_job_state_events (
    service_job_id, from_status, to_status, reason, actor_user_id
  ) values (
    job_record.id, job_record.status, 'APPROVED', trim(p_note), p_actor_id
  );
  return job_record.id;
end;
$$;

create or replace function app_private.record_service_job_cost(
  p_service_job_id uuid,
  p_category public.service_cost_category,
  p_amount numeric,
  p_note text,
  p_occurred_at timestamptz,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare job_record public.service_jobs%rowtype; entry_id uuid := gen_random_uuid();
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.cost.manage');
  if p_amount <= 0 or char_length(trim(p_note)) < 5
    or p_occurred_at > now() + interval '5 minutes' then
    raise exception 'VALID_SERVICE_JOB_COST_REQUIRED' using errcode = '22000';
  end if;
  select * into job_record from public.service_jobs where id = p_service_job_id;
  if not found or job_record.status = 'CANCELLED' then
    raise exception 'ACTIVE_SERVICE_JOB_REQUIRED' using errcode = '23514';
  end if;
  insert into public.service_job_cost_entries (
    id, service_job_id, category, amount, currency, source_type, source_id,
    note, occurred_at, created_by
  ) values (
    entry_id, job_record.id, p_category, round(p_amount, 2), job_record.currency,
    'MANUAL', entry_id, trim(p_note), p_occurred_at, p_actor_id
  );
  return entry_id;
end;
$$;

create or replace function app_private.confirm_service_job_customer(
  p_service_job_id uuid,
  p_customer_representative text,
  p_confirmation_note text,
  p_signature_evidence_id uuid,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  job_record public.service_jobs%rowtype;
  confirmation_id uuid;
  target_billing_event_id uuid;
  target_receivable_id uuid;
  billing_amount numeric(20, 2);
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.confirm');
  if char_length(trim(p_customer_representative)) not between 2 and 160
    or char_length(trim(p_confirmation_note)) not between 10 and 500 then
    raise exception 'VALID_CUSTOMER_CONFIRMATION_REQUIRED' using errcode = '22000';
  end if;
  select * into job_record from public.service_jobs
    where id = p_service_job_id for update;
  if not found then raise exception 'SERVICE_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if job_record.status = 'BILLED' then
    return (select id from public.service_customer_confirmations
      where service_job_id = job_record.id);
  end if;
  if job_record.status <> 'APPROVED' or job_record.approved_billable_quantity is null then
    raise exception 'APPROVED_SERVICE_JOB_REQUIRED' using errcode = '23514';
  end if;
  if p_signature_evidence_id is not null and not exists (
    select 1 from public.evidence evidence
    where evidence.id = p_signature_evidence_id
      and evidence.entity_type = 'SERVICE_JOB'
      and evidence.entity_id = job_record.id
  ) then
    raise exception 'SERVICE_SIGNATURE_EVIDENCE_REQUIRED' using errcode = '23514';
  end if;

  insert into public.service_customer_confirmations (
    service_job_id, customer_representative, confirmation_note,
    signature_evidence_id, created_by
  ) values (
    job_record.id, trim(p_customer_representative), trim(p_confirmation_note),
    p_signature_evidence_id, p_actor_id
  ) returning id into confirmation_id;

  perform set_config('app.service_internal_write', 'on', true);
  update public.service_jobs set status = 'CUSTOMER_CONFIRMED' where id = job_record.id;
  insert into public.service_job_state_events (
    service_job_id, from_status, to_status, reason, actor_user_id
  ) values (
    job_record.id, job_record.status, 'CUSTOMER_CONFIRMED',
    'Khách hàng xác nhận kết quả: ' || trim(p_confirmation_note), p_actor_id
  );

  billing_amount := round(job_record.approved_billable_quantity * job_record.unit_rate, 2);
  if billing_amount <= 0 then
    raise exception 'POSITIVE_SERVICE_BILLING_AMOUNT_REQUIRED' using errcode = '23514';
  end if;
  insert into public.service_billing_events (
    billing_event_number, service_job_id, customer_confirmation_id,
    rate_type, billable_hours, billable_quantity, unit_rate, amount,
    currency, created_by
  ) values (
    'SBE-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.service_billing_event_number_seq')::text, 6, '0'),
    job_record.id, confirmation_id, job_record.rate_type,
    job_record.approved_billable_hours, job_record.approved_billable_quantity,
    job_record.unit_rate, billing_amount, job_record.currency, p_actor_id
  ) returning id into target_billing_event_id;

  insert into public.receivables (
    receivable_number, customer_id, sales_order_id, delivery_id, source_event_id,
    service_job_id, service_billing_event_id, currency, original_amount,
    outstanding_amount, due_date, recognized_at, created_by
  ) values (
    'AR-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.receivable_number_seq')::text, 6, '0'),
    job_record.customer_id, null, null, null, job_record.id, target_billing_event_id,
    job_record.currency, billing_amount, billing_amount, current_date + 30,
    now(), p_actor_id
  ) returning id into target_receivable_id;
  insert into public.receivable_ledger_entries (
    receivable_id, entry_type, signed_amount, description, actor_user_id, occurred_at
  ) values (
    target_receivable_id, 'RECOGNITION', billing_amount,
    'Ghi nhận phải thu từ công việc dịch vụ ' || job_record.job_number,
    p_actor_id, now()
  );
  update public.service_billing_events set
    status = 'CONSUMED', receivable_id = target_receivable_id, consumed_at = now()
  where id = target_billing_event_id;
  update public.service_jobs set status = 'BILLED' where id = job_record.id;
  insert into public.service_job_state_events (
    service_job_id, from_status, to_status, reason, actor_user_id
  ) values (
    job_record.id, 'CUSTOMER_CONFIRMED', 'BILLED',
    'Billing event đã tạo phải thu đúng một lần', p_actor_id
  );
  insert into public.work_notifications (
    work_item_id, recipient_role, notification_type, title, message, action_path
  )
  select item.id, 'FINANCE', 'SERVICE_CUSTOMER_CONFIRMATION',
    'Dịch vụ đã tạo phải thu',
    job_record.job_number || ' đã được khách xác nhận và ghi nhận phải thu.',
    '/app/finance'
  from public.work_items item
  join public.work_requirements requirement on requirement.id = item.requirement_id
  where requirement.source_type = 'SERVICE_JOB'
    and requirement.source_id = job_record.id;
  return confirmation_id;
end;
$$;

create or replace function app_private.cancel_service_job(
  p_service_job_id uuid,
  p_reason text,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  job_record public.service_jobs%rowtype;
  target_work_item_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'service_job.manage');
  if char_length(trim(p_reason)) < 10 then
    raise exception 'SERVICE_CANCELLATION_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into job_record from public.service_jobs
    where id = p_service_job_id for update;
  if not found then raise exception 'SERVICE_JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if job_record.status not in ('SCHEDULED', 'ASSIGNED') then
    raise exception 'STARTED_SERVICE_JOB_CANNOT_BE_CANCELLED_BLINDLY' using errcode = '23514';
  end if;
  perform set_config('app.service_internal_write', 'on', true);
  update public.service_jobs set status = 'CANCELLED' where id = job_record.id;
  update public.service_job_assignments set status = 'CANCELLED', ended_at = now(),
    reason = trim(p_reason)
    where service_job_id = job_record.id and status = 'ACTIVE';
  update public.service_machines machine set status = case
    when exists (
      select 1 from public.service_jobs other_job
      where other_job.machine_id = machine.id
        and other_job.id <> job_record.id
        and other_job.status in ('ASSIGNED', 'IN_PROGRESS', 'PAUSED')
    ) then 'ASSIGNED'::public.service_machine_status
    else 'AVAILABLE'::public.service_machine_status end
    where machine.id = job_record.machine_id;
  insert into public.service_job_state_events (
    service_job_id, from_status, to_status, reason, actor_user_id
  ) values (job_record.id, job_record.status, 'CANCELLED', trim(p_reason), p_actor_id);

  select item.id into target_work_item_id
  from public.work_items item
  join public.work_requirements requirement on requirement.id = item.requirement_id
  where requirement.source_type = 'SERVICE_JOB' and requirement.source_id = job_record.id;
  if target_work_item_id is not null then
    update public.work_requirements set status = 'CANCELLED'
      where source_type = 'SERVICE_JOB' and source_id = job_record.id;
    update public.work_items set status = 'CANCELLED', heartbeat_due_at = null,
      blocked_reason = trim(p_reason), updated_at = now() where id = target_work_item_id;
    update public.work_assignments assignment set status = 'CANCELLED', ended_at = now(),
      reason = trim(p_reason)
      where assignment.work_item_id = target_work_item_id and assignment.status = 'ACTIVE';
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id
    ) values (
      target_work_item_id, 'CLAIMED', 'CANCELLED',
      'WorkItem reflects the ServiceJob result: đã hủy', p_actor_id
    );
  end if;
  return job_record.id;
end;
$$;

-- Add P11 notifications without weakening the earlier P10 allow-list.
alter table public.work_notifications
  drop constraint work_notifications_notification_type_check;
alter table public.work_notifications add constraint work_notifications_notification_type_check
check (notification_type in (
  'CLAIM_EXPIRY_WARNING', 'CLAIM_EXPIRED', 'HEARTBEAT_MISSED',
  'UNRESPONSIVE', 'WORK_BLOCKED', 'WORK_DONE', 'SUPERVISOR_DECISION',
  'SERVICE_INCIDENT', 'SERVICE_READY_FOR_APPROVAL', 'SERVICE_CUSTOMER_CONFIRMATION'
));

-- P10 remains a coordination projection, now with ServiceJob context.
create or replace view public.work_item_operational_view
with (security_invoker = true) as
select item.id, item.work_number, item.title, item.description, item.work_type,
  item.required_role, item.assignment_mode, item.status, item.priority,
  item.assigned_user_id, item.claimed_by, profile.display_name as worker_name,
  item.claimed_at, item.claim_expires_at, item.started_at, item.heartbeat_due_at,
  item.completed_at, item.verified_at, item.blocked_reason,
  item.external_effect_started, item.due_at,
  requirement.source_type, requirement.source_id,
  coalesce(delivery.delivery_number, service_job.job_number) as delivery_number,
  coalesce(delivery.customer_name_snapshot, service_job.customer_name_snapshot) as customer_name,
  coalesce(delivery.pickup_address_snapshot, service_job.machine_name_snapshot) as pickup_address,
  coalesce(delivery.drop_address_snapshot, service_job.site_address_snapshot) as drop_address,
  coalesce(delivery.status::text, service_job.status::text) as source_status,
  coalesce(
    (select max(heartbeat.recorded_at) from public.work_heartbeats heartbeat
      where heartbeat.work_item_id = item.id),
    item.started_at
  ) as last_heartbeat_at,
  case
    when (select app_private.has_permission('work_item.verify')) then true
    else app_private.worker_is_eligible_for_work((select auth.uid()), item.id, true)
  end as is_eligible
from public.work_items item
left join public.work_requirements requirement on requirement.id = item.requirement_id
left join public.deliveries delivery
  on delivery.id = requirement.source_id and requirement.source_type = 'DELIVERY'
left join public.service_jobs service_job
  on service_job.id = requirement.source_id and requirement.source_type = 'SERVICE_JOB'
left join public.user_profiles profile on profile.user_id = item.claimed_by;

create view public.service_job_operational_view with (security_invoker = true) as
select
  job.id,
  job.job_number,
  job.customer_id,
  job.customer_site_id,
  job.service_type_id,
  job.machine_id,
  job.customer_name_snapshot,
  job.site_name_snapshot,
  job.site_address_snapshot,
  job.service_type_name_snapshot,
  job.machine_name_snapshot,
  job.status,
  job.scheduled_start_at,
  job.scheduled_end_at,
  job.started_at,
  job.ended_at,
  job.break_minutes,
  job.actual_minutes,
  job.actual_hours,
  job.approved_billable_hours,
  job.approved_billable_quantity,
  job.rate_type,
  job.unit_rate,
  job.currency,
  job.approval_note,
  job.notes,
  assignment.operator_user_id,
  operator.display_name as operator_name,
  coalesce(cost.total_cost, 0) + coalesce(expense.total_expense, 0) as actual_cost,
  coalesce(revenue.amount, 0) as recognized_revenue,
  coalesce(revenue.amount, 0) -
    (coalesce(cost.total_cost, 0) + coalesce(expense.total_expense, 0)) as contribution_profit,
  (assignment.operator_user_id = (select auth.uid())) as is_assigned_operator,
  job.created_at,
  job.updated_at
from public.service_jobs job
left join lateral (
  select service_assignment.operator_user_id
  from public.service_job_assignments service_assignment
  where service_assignment.service_job_id = job.id
  order by (service_assignment.status = 'ACTIVE') desc, service_assignment.assigned_at desc
  limit 1
) assignment on true
left join public.user_profiles operator on operator.user_id = assignment.operator_user_id
left join lateral (
  select sum(entry.amount) as total_cost
  from public.service_job_cost_entries entry
  where entry.service_job_id = job.id and entry.currency = job.currency
) cost on true
left join lateral (
  select sum(allocation.amount) as total_expense
  from public.expense_allocations allocation
  join public.expenses expense on expense.id = allocation.expense_id
  where allocation.allocation_dimension = 'SERVICE_JOB'
    and allocation.allocation_reference_id = job.id
    and expense.status = 'POSTED' and expense.currency = job.currency
) expense on true
left join lateral (
  select billing.amount
  from public.service_billing_events billing
  where billing.service_job_id = job.id and billing.status = 'CONSUMED'
) revenue on true;

create view public.service_job_log_view with (security_invoker = true) as
select
  log_entry.id,
  log_entry.service_job_id,
  log_entry.operator_user_id,
  log_entry.log_type,
  log_entry.occurred_at,
  log_entry.note,
  log_entry.fuel_liters,
  log_entry.fuel_unit_cost,
  log_entry.evidence_id,
  log_entry.created_at
from public.service_work_logs log_entry;

create view public.service_job_worker_view with (security_invoker = true) as
select
  job.id,
  job.job_number,
  job.customer_name_snapshot,
  job.site_name_snapshot,
  job.site_address_snapshot,
  job.service_type_name_snapshot,
  job.machine_name_snapshot,
  job.status,
  job.scheduled_start_at,
  job.scheduled_end_at,
  job.started_at,
  job.ended_at,
  job.break_minutes,
  job.actual_minutes,
  job.actual_hours,
  job.rate_type,
  job.notes,
  assignment.operator_user_id,
  (assignment.operator_user_id = (select auth.uid())) as is_assigned_operator
from public.service_jobs job
join public.service_job_assignments assignment
  on assignment.service_job_id = job.id
where assignment.status = 'ACTIVE'
  or (
    assignment.operator_user_id = (select auth.uid())
    and assignment.status = 'COMPLETED'
  );

create or replace function app_private.can_access_service_job(p_service_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_active_user((select auth.uid())) and (
    app_private.has_permission('service_job.read')
    or exists (
      select 1 from public.service_job_assignments assignment
      where assignment.service_job_id = p_service_job_id
        and assignment.operator_user_id = (select auth.uid())
    )
  );
$$;
revoke all on function app_private.can_access_service_job(uuid) from public, anon, authenticated;
grant execute on function app_private.can_access_service_job(uuid) to authenticated;

alter table public.service_types enable row level security;
alter table public.service_machines enable row level security;
alter table public.service_jobs enable row level security;
alter table public.service_job_assignments enable row level security;
alter table public.service_work_logs enable row level security;
alter table public.service_customer_confirmations enable row level security;
alter table public.service_billing_events enable row level security;
alter table public.service_job_cost_entries enable row level security;
alter table public.service_job_state_events enable row level security;

revoke all on public.service_types, public.service_machines, public.service_jobs,
  public.service_job_assignments, public.service_work_logs,
  public.service_customer_confirmations, public.service_billing_events,
  public.service_job_cost_entries, public.service_job_state_events,
  public.service_job_operational_view, public.service_job_log_view,
  public.service_job_worker_view from anon, authenticated;
grant select on public.service_types, public.service_machines, public.service_jobs,
  public.service_job_assignments, public.service_work_logs,
  public.service_customer_confirmations, public.service_billing_events,
  public.service_job_cost_entries, public.service_job_state_events,
  public.service_job_operational_view, public.service_job_log_view,
  public.service_job_worker_view to authenticated;

create policy service_types_read_authorized on public.service_types
for select to authenticated using (
  (select app_private.has_permission('service_job.read'))
);
create policy service_machines_read_authorized on public.service_machines
for select to authenticated using (
  (select app_private.has_permission('service_job.read'))
);
create policy service_jobs_read_authorized on public.service_jobs
for select to authenticated using (
  (select app_private.can_access_service_job(id))
);
create policy service_assignments_read_authorized on public.service_job_assignments
for select to authenticated using (
  operator_user_id = (select auth.uid())
  or (select app_private.has_permission('service_job.read'))
);
create policy service_work_logs_read_authorized on public.service_work_logs
for select to authenticated using (
  (select app_private.can_access_service_job(service_job_id))
);
create policy service_confirmations_read_authorized on public.service_customer_confirmations
for select to authenticated using (
  (select app_private.can_access_service_job(service_job_id))
);
create policy service_billing_read_authorized on public.service_billing_events
for select to authenticated using (
  (select app_private.has_permission('service_job.read'))
);
create policy service_costs_read_authorized on public.service_job_cost_entries
for select to authenticated using (
  (select app_private.has_permission('service_job.read'))
);
create policy service_state_events_read_authorized on public.service_job_state_events
for select to authenticated using (
  (select app_private.can_access_service_job(service_job_id))
);

-- A service scheduler needs the existing customer/site/warehouse selectors
-- even when that role does not administer the full master-data module.
create policy customers_service_scheduler_read on public.customers
for select to authenticated using (
  (select app_private.has_permission('service_job.manage'))
);
create policy customer_sites_service_scheduler_read on public.customer_sites
for select to authenticated using (
  (select app_private.has_permission('service_job.manage'))
);
create policy warehouses_service_scheduler_read on public.warehouses
for select to authenticated using (
  (select app_private.has_permission('service_job.manage'))
);

insert into public.permissions (code, description_vi) values
  ('service_job.read', 'Xem công việc dịch vụ và lợi nhuận'),
  ('service_job.manage', 'Tạo và hủy công việc dịch vụ'),
  ('service_job.assign', 'Phân công người vận hành công việc dịch vụ'),
  ('service_job.update_assigned', 'Ghi nhật ký công việc dịch vụ được giao'),
  ('service_job.approve', 'Duyệt giờ và sản lượng tính tiền dịch vụ'),
  ('service_job.confirm', 'Ghi nhận xác nhận kết quả của khách hàng'),
  ('service_job.cost.manage', 'Ghi nhận chi phí trực tiếp công việc dịch vụ')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
cross join public.permissions permission
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'service_job.read', 'service_job.manage', 'service_job.assign',
  'service_job.approve', 'service_job.confirm', 'service_job.cost.manage'
)
where role.code = 'SUPERVISOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'service_job.read', 'service_job.manage', 'service_job.assign'
)
where role.code = 'DISPATCHER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'service_job.read', 'service_job.approve', 'service_job.cost.manage'
)
where role.code = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'service_job.update_assigned'
where role.code = 'OPERATOR_WORKER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'service_job.read'
where role.code = 'AUDITOR_VIEWER'
on conflict do nothing;

revoke all on function app_private.create_service_type(text, text, public.service_rate_type, numeric, numeric, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_service_machine(text, text, text, text, uuid, numeric, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_service_job(uuid, uuid, uuid, uuid, timestamptz, timestamptz, public.service_rate_type, numeric, text, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.assign_service_job(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.record_service_work_log(uuid, public.service_work_log_type, timestamptz, text, numeric, numeric, uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.approve_service_job_billing(uuid, numeric, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.record_service_job_cost(uuid, public.service_cost_category, numeric, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function app_private.confirm_service_job_customer(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.cancel_service_job(uuid, text, uuid)
  from public, anon, authenticated;
