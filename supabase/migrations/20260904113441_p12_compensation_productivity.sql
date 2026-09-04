-- HIỀN XA ERP P12 — Compensation, productivity and payroll entitlement.
-- Earning events record entitlement. Cash movement remains owned by P8 Payments.

create type public.compensation_plan_scope as enum ('COMPANY', 'ROLE', 'EMPLOYEE');
create type public.compensation_rule_type as enum (
  'FIXED_MONTHLY', 'PER_JOB', 'PER_TRIP', 'PER_HOUR', 'PER_SHIFT',
  'PER_DAY', 'PER_TON', 'PER_M3', 'PER_BAG', 'PER_UNIT',
  'PERCENT_GROSS_PROFIT', 'BONUS', 'ADJUSTMENT'
);
create type public.earning_event_source as enum (
  'WORK_VERIFICATION', 'PAYROLL_PERIOD', 'MANUAL_BONUS'
);
create type public.earning_event_status as enum (
  'PENDING_APPROVAL', 'APPROVED', 'REVERSED'
);
create type public.earning_allocation_method as enum ('PERCENT', 'UNITS');
create type public.payroll_period_status as enum ('OPEN', 'CLOSED');

create sequence public.earning_event_number_seq;
revoke all on sequence public.earning_event_number_seq from public, anon, authenticated;

create table public.compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  note text not null check (char_length(trim(note)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (employee_user_id, effective_from)
);
create index compensation_profiles_employee_idx
  on public.compensation_profiles(employee_user_id, effective_from desc);

create table public.compensation_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null check (
    plan_code = upper(trim(plan_code)) and char_length(plan_code) between 2 and 32
  ),
  name text not null check (char_length(trim(name)) between 3 and 160),
  version_number integer not null check (version_number > 0),
  scope_type public.compensation_plan_scope not null,
  role_code text references public.roles(code) on delete restrict,
  employee_user_id uuid references public.user_profiles(user_id) on delete restrict,
  effective_from date not null,
  effective_to date,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  note text not null check (char_length(trim(note)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  constraint compensation_plan_scope_shape check (
    (scope_type = 'COMPANY' and role_code is null and employee_user_id is null)
    or (scope_type = 'ROLE' and role_code is not null and employee_user_id is null)
    or (scope_type = 'EMPLOYEE' and role_code is null and employee_user_id is not null)
  ),
  unique (plan_code, version_number)
);
create index compensation_plans_effective_idx
  on public.compensation_plan_versions(scope_type, effective_from desc, effective_to);
create index compensation_plans_employee_idx
  on public.compensation_plan_versions(employee_user_id, effective_from desc)
  where employee_user_id is not null;
create index compensation_plans_role_idx
  on public.compensation_plan_versions(role_code, effective_from desc)
  where role_code is not null;

create table public.compensation_rules (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.compensation_plan_versions(id) on delete restrict,
  rule_type public.compensation_rule_type not null,
  rate numeric(20, 4) not null check (rate > 0),
  work_type text check (work_type is null or work_type in ('DELIVERY', 'OPERATION', 'GENERAL')),
  source_type text check (source_type is null or source_type in ('DELIVERY', 'SERVICE_JOB', 'GENERAL')),
  description text not null check (char_length(trim(description)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique nulls not distinct (plan_version_id, rule_type, work_type, source_type)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_code text not null unique check (
    period_code = upper(trim(period_code)) and char_length(period_code) between 2 and 32
  ),
  period_start date not null,
  period_end date not null,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status public.payroll_period_status not null default 'OPEN',
  note text not null check (char_length(trim(note)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  closed_by uuid references public.user_profiles(user_id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (
    (status = 'OPEN' and closed_by is null and closed_at is null)
    or (status = 'CLOSED' and closed_by is not null and closed_at is not null)
  )
);

create table public.earning_events (
  id uuid primary key default gen_random_uuid(),
  event_number text not null unique,
  source_type public.earning_event_source not null,
  source_id uuid not null,
  source_worker_user_id uuid references public.user_profiles(user_id) on delete restrict,
  source_number_snapshot text not null check (char_length(trim(source_number_snapshot)) between 2 and 80),
  description_snapshot text not null check (char_length(trim(description_snapshot)) between 3 and 500),
  rule_type public.compensation_rule_type not null,
  status public.earning_event_status not null default 'PENDING_APPROVAL',
  earned_on date not null,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  allocation_method public.earning_allocation_method not null,
  basis_quantity numeric(20, 4) not null check (basis_quantity > 0),
  basis_amount numeric(20, 2),
  basis_label_snapshot text not null check (char_length(trim(basis_label_snapshot)) between 2 and 120),
  total_amount numeric(20, 2) not null check (total_amount >= 0),
  note text not null check (char_length(trim(note)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_by uuid references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz,
  reversed_by uuid references public.user_profiles(user_id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  constraint earning_event_lifecycle check (
    (status = 'PENDING_APPROVAL' and approved_at is null and reversed_at is null)
    or (status = 'APPROVED' and approved_at is not null and reversed_at is null)
    or (status = 'REVERSED' and reversed_at is not null)
  ),
  constraint earning_event_basis check (
    (rule_type = 'PERCENT_GROSS_PROFIT' and basis_amount is not null and basis_amount >= 0)
    or (rule_type <> 'PERCENT_GROSS_PROFIT')
  )
);
create unique index earning_events_verified_work_once
  on public.earning_events(source_id, rule_type)
  where source_type = 'WORK_VERIFICATION' and status <> 'REVERSED';
create unique index earning_events_monthly_worker_once
  on public.earning_events(source_id, source_worker_user_id, rule_type)
  where source_type = 'PAYROLL_PERIOD' and status <> 'REVERSED';
create index earning_events_status_idx on public.earning_events(status, earned_on desc);

create table public.earning_allocations (
  id uuid primary key default gen_random_uuid(),
  earning_event_id uuid not null references public.earning_events(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  compensation_profile_id uuid not null references public.compensation_profiles(id) on delete restrict,
  plan_version_id uuid not null references public.compensation_plan_versions(id) on delete restrict,
  compensation_rule_id uuid not null references public.compensation_rules(id) on delete restrict,
  plan_label_snapshot text not null check (char_length(trim(plan_label_snapshot)) between 3 and 200),
  rule_type_snapshot public.compensation_rule_type not null,
  cost_treatment_snapshot text not null check (cost_treatment_snapshot in ('DIRECT_LABOR', 'OPEX')),
  rate_snapshot numeric(20, 4) not null check (rate_snapshot > 0),
  approved_units_snapshot numeric(20, 4) not null check (approved_units_snapshot > 0),
  share_percent numeric(7, 4) not null check (share_percent > 0 and share_percent <= 100),
  base_amount numeric(20, 2) not null check (base_amount >= 0),
  adjustment_amount numeric(20, 2) not null default 0,
  net_amount numeric(20, 2) generated always as (base_amount + adjustment_amount) stored,
  created_at timestamptz not null default now(),
  unique (earning_event_id, worker_user_id),
  check (base_amount + adjustment_amount >= 0)
);
create index earning_allocations_worker_idx
  on public.earning_allocations(worker_user_id, created_at desc);

create table public.earning_adjustments (
  id uuid primary key default gen_random_uuid(),
  earning_allocation_id uuid not null references public.earning_allocations(id) on delete restrict,
  amount numeric(20, 2) not null check (amount <> 0),
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.compensation_direct_labor_entries (
  id uuid primary key default gen_random_uuid(),
  earning_allocation_id uuid not null unique references public.earning_allocations(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  service_job_id uuid references public.service_jobs(id) on delete restrict,
  amount numeric(20, 2) not null check (amount >= 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((sales_order_id is not null)::integer + (service_job_id is not null)::integer = 1)
);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  employee_name_snapshot text not null check (char_length(trim(employee_name_snapshot)) between 2 and 160),
  employee_code_snapshot text not null check (char_length(trim(employee_code_snapshot)) between 2 and 40),
  base_amount numeric(20, 2) not null check (base_amount >= 0),
  adjustment_amount numeric(20, 2) not null,
  net_amount numeric(20, 2) not null check (net_amount >= 0),
  created_at timestamptz not null default now(),
  unique (payroll_period_id, employee_user_id),
  check (net_amount = base_amount + adjustment_amount)
);

create table public.payroll_line_earnings (
  payroll_line_id uuid not null references public.payroll_lines(id) on delete restrict,
  earning_allocation_id uuid not null unique references public.earning_allocations(id) on delete restrict,
  base_amount_snapshot numeric(20, 2) not null check (base_amount_snapshot >= 0),
  adjustment_amount_snapshot numeric(20, 2) not null,
  net_amount_snapshot numeric(20, 2) not null check (net_amount_snapshot >= 0),
  primary key (payroll_line_id, earning_allocation_id),
  check (net_amount_snapshot = base_amount_snapshot + adjustment_amount_snapshot)
);

create table public.payroll_payment_links (
  id uuid primary key default gen_random_uuid(),
  payroll_line_id uuid not null references public.payroll_lines(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  note text not null check (char_length(trim(note)) between 10 and 500),
  linked_by uuid not null references public.user_profiles(user_id) on delete restrict,
  linked_at timestamptz not null default now(),
  unique (payroll_line_id, payment_id)
);
create index payroll_payment_links_line_idx on public.payroll_payment_links(payroll_line_id);

create or replace function app_private.prevent_compensation_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'COMPENSATION_HISTORY_IMMUTABLE' using errcode = '22000';
end;
$$;

create or replace function app_private.require_compensation_internal_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('app.compensation_internal_write', true) <> 'on' then
    raise exception 'COMPENSATION_COMMAND_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger compensation_profiles_delete_guard before delete on public.compensation_profiles
for each row execute function app_private.prevent_compensation_history_mutation();
create trigger compensation_profiles_update_guard before update on public.compensation_profiles
for each row execute function app_private.require_compensation_internal_write();
create trigger compensation_plans_immutable before update or delete on public.compensation_plan_versions
for each row execute function app_private.prevent_compensation_history_mutation();
create trigger compensation_rules_immutable before update or delete on public.compensation_rules
for each row execute function app_private.prevent_compensation_history_mutation();
create trigger earning_events_update_guard before update or delete on public.earning_events
for each row execute function app_private.require_compensation_internal_write();
create trigger earning_allocations_update_guard before update or delete on public.earning_allocations
for each row execute function app_private.require_compensation_internal_write();
create trigger earning_adjustments_immutable before update or delete on public.earning_adjustments
for each row execute function app_private.prevent_compensation_history_mutation();
create trigger direct_labor_update_guard before update or delete on public.compensation_direct_labor_entries
for each row execute function app_private.require_compensation_internal_write();
create trigger payroll_periods_update_guard before update or delete on public.payroll_periods
for each row execute function app_private.require_compensation_internal_write();
create trigger payroll_lines_immutable before update or delete on public.payroll_lines
for each row execute function app_private.prevent_compensation_history_mutation();
create trigger payroll_line_earnings_immutable before update or delete on public.payroll_line_earnings
for each row execute function app_private.prevent_compensation_history_mutation();
create trigger payroll_payments_immutable before update or delete on public.payroll_payment_links
for each row execute function app_private.prevent_compensation_history_mutation();

create or replace function app_private.create_compensation_profile(
  p_employee_user_id uuid,
  p_effective_from date,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  previous_profile public.compensation_profiles%rowtype;
  created_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'compensation.manage');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'COMPENSATION_PROFILE_NOTE_REQUIRED' using errcode = '22000';
  end if;
  if not exists (
    select 1 from public.user_profiles profile
    where profile.user_id = p_employee_user_id and profile.status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE_EMPLOYEE_REQUIRED' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('compensation-profile:' || p_employee_user_id::text, 0)
  );
  select * into previous_profile
  from public.compensation_profiles profile
  where profile.employee_user_id = p_employee_user_id
    and profile.is_active
  order by profile.effective_from desc, profile.created_at desc
  limit 1 for update;
  if found then
    if previous_profile.effective_from >= p_effective_from then
      raise exception 'PROFILE_EFFECTIVE_DATE_MUST_ADVANCE' using errcode = '23514';
    end if;
    perform set_config('app.compensation_internal_write', 'on', true);
    update public.compensation_profiles
    set is_active = false, effective_to = p_effective_from - 1
    where id = previous_profile.id;
  end if;

  insert into public.compensation_profiles (
    employee_user_id, effective_from, note, created_by
  ) values (
    p_employee_user_id, p_effective_from, trim(p_note), p_actor_id
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function app_private.create_compensation_plan_version(
  p_plan_code text,
  p_name text,
  p_version_number integer,
  p_scope_type public.compensation_plan_scope,
  p_role_code text,
  p_employee_user_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_currency text,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare created_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'compensation.manage');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'COMPENSATION_PLAN_NOTE_REQUIRED' using errcode = '22000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'compensation-plan:' || upper(trim(p_plan_code)) || ':' ||
      p_scope_type::text || ':' || coalesce(p_role_code, '') || ':' ||
      coalesce(p_employee_user_id::text, ''), 0
    )
  );
  if exists (
    select 1 from public.compensation_plan_versions plan
    where plan.scope_type = p_scope_type
      and plan.role_code is not distinct from p_role_code
      and plan.employee_user_id is not distinct from p_employee_user_id
      and daterange(plan.effective_from, coalesce(plan.effective_to, 'infinity'::date), '[]')
        && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'COMPENSATION_PLAN_DATES_OVERLAP' using errcode = '23505';
  end if;
  insert into public.compensation_plan_versions (
    plan_code, name, version_number, scope_type, role_code, employee_user_id,
    effective_from, effective_to, currency, note, created_by
  ) values (
    upper(trim(p_plan_code)), trim(p_name), p_version_number, p_scope_type,
    p_role_code, p_employee_user_id, p_effective_from, p_effective_to,
    upper(trim(p_currency)), trim(p_note), p_actor_id
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function app_private.create_compensation_rule(
  p_plan_version_id uuid,
  p_rule_type public.compensation_rule_type,
  p_rate numeric,
  p_work_type text,
  p_source_type text,
  p_description text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare created_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'compensation.manage');
  if char_length(trim(coalesce(p_description, ''))) < 10 then
    raise exception 'COMPENSATION_RULE_DESCRIPTION_REQUIRED' using errcode = '22000';
  end if;
  insert into public.compensation_rules (
    plan_version_id, rule_type, rate, work_type, source_type, description, created_by
  ) values (
    p_plan_version_id, p_rule_type, p_rate, nullif(trim(p_work_type), ''),
    nullif(trim(p_source_type), ''), trim(p_description), p_actor_id
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function app_private.resolve_compensation_rule(
  p_employee_user_id uuid,
  p_rule_type public.compensation_rule_type,
  p_work_type text,
  p_source_type text,
  p_earned_on date
) returns table (
  compensation_profile_id uuid,
  plan_version_id uuid,
  compensation_rule_id uuid,
  plan_label text,
  rate numeric,
  currency text
)
language sql stable security definer set search_path = '' as $$
  select profile.id,
    plan.id,
    rule.id,
    plan.name || ' · v' || plan.version_number::text,
    rule.rate,
    plan.currency
  from public.compensation_profiles profile
  join public.compensation_plan_versions plan on (
    plan.scope_type = 'COMPANY'
    or (plan.scope_type = 'EMPLOYEE' and plan.employee_user_id = p_employee_user_id)
    or (
      plan.scope_type = 'ROLE'
      and exists (
        select 1 from public.user_roles user_role
        join public.roles role_item on role_item.id = user_role.role_id
        where user_role.user_id = p_employee_user_id
          and role_item.code = plan.role_code
      )
    )
  )
  join public.compensation_rules rule on rule.plan_version_id = plan.id
  where profile.employee_user_id = p_employee_user_id
    and profile.effective_from <= p_earned_on
    and (profile.effective_to is null or profile.effective_to >= p_earned_on)
    and plan.effective_from <= p_earned_on
    and (plan.effective_to is null or plan.effective_to >= p_earned_on)
    and rule.rule_type = p_rule_type
    and (rule.work_type is null or rule.work_type = p_work_type)
    and (rule.source_type is null or rule.source_type = p_source_type)
  order by
    case plan.scope_type when 'EMPLOYEE' then 0 when 'ROLE' then 1 else 2 end,
    (rule.work_type is not null)::integer desc,
    (rule.source_type is not null)::integer desc,
    plan.effective_from desc,
    plan.version_number desc,
    plan.id
  limit 1;
$$;

create or replace function app_private.create_verified_work_earning(
  p_work_item_id uuid,
  p_rule_type public.compensation_rule_type,
  p_allocations jsonb,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item public.work_items%rowtype;
  requirement public.work_requirements%rowtype;
  first_rule record;
  resolved_rule record;
  allocation jsonb;
  allocation_count integer;
  percent_count integer;
  unit_count integer;
  worker_id uuid;
  share_value numeric;
  unit_value numeric;
  basis_quantity_value numeric(20, 4) := 1;
  basis_amount_value numeric(20, 2);
  basis_label_value text := '1 công việc đã xác minh';
  event_currency text;
  event_id uuid;
  allocation_base numeric(20, 2);
  allocation_total numeric(20, 2) := 0;
  allocation_method_value public.earning_allocation_method;
  source_number_value text;
  earned_on_value date;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'compensation.manage');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'EARNING_NOTE_REQUIRED' using errcode = '22000';
  end if;
  if p_rule_type in ('FIXED_MONTHLY', 'BONUS', 'ADJUSTMENT') then
    raise exception 'VARIABLE_WORK_RULE_REQUIRED' using errcode = '23514';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'EARNING_ALLOCATIONS_REQUIRED' using errcode = '22000';
  end if;
  allocation_count := jsonb_array_length(p_allocations);
  if allocation_count < 1 or allocation_count > 3 then
    raise exception 'EARNING_ALLOCATION_COUNT_INVALID' using errcode = '23514';
  end if;

  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.status <> 'VERIFIED' or item.verified_at is null then
    raise exception 'VERIFIED_WORK_REQUIRED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.work_verifications verification
    where verification.work_item_id = item.id
  ) then
    raise exception 'WORK_VERIFICATION_REQUIRED' using errcode = '23514';
  end if;
  select * into requirement from public.work_requirements where id = item.requirement_id;
  if not found then raise exception 'WORK_REQUIREMENT_REQUIRED' using errcode = '23514'; end if;
  source_number_value := item.work_number;
  earned_on_value := item.verified_at::date;

  if requirement.source_type = 'SERVICE_JOB' then
    select
      case
        when p_rule_type = 'PER_HOUR' then greatest(job.actual_hours, 0.0001)
        when p_rule_type in ('PER_TON', 'PER_M3', 'PER_BAG', 'PER_UNIT')
          then greatest(coalesce(job.approved_billable_quantity, 1), 0.0001)
        else 1
      end,
      case when p_rule_type = 'PERCENT_GROSS_PROFIT' then greatest(
        coalesce((select billing.amount from public.service_billing_events billing
          where billing.service_job_id = job.id and billing.status = 'CONSUMED'), 0)
        - coalesce((select sum(cost.amount) from public.service_job_cost_entries cost
          where cost.service_job_id = job.id and cost.currency = job.currency), 0), 0
      ) else null end,
      case
        when p_rule_type = 'PER_HOUR' then 'Giờ thực tế đã xác minh'
        when p_rule_type in ('PER_TON', 'PER_M3', 'PER_BAG', 'PER_UNIT') then 'Sản lượng đã duyệt'
        when p_rule_type = 'PERCENT_GROSS_PROFIT' then 'Lợi nhuận gộp của công việc dịch vụ'
        else '1 công việc dịch vụ đã xác minh'
      end
    into basis_quantity_value, basis_amount_value, basis_label_value
    from public.service_jobs job where job.id = requirement.source_id;
  elsif requirement.source_type = 'DELIVERY' then
    select
      case
        when p_rule_type = 'PER_HOUR' then greatest(
          extract(epoch from (coalesce(delivery.confirmed_at, delivery.delivered_at) - delivery.dispatched_at)) / 3600, 0.0001
        )
        when p_rule_type in ('PER_TON', 'PER_M3', 'PER_BAG', 'PER_UNIT') then greatest(
          coalesce((select sum(actual.accepted_quantity) from public.delivery_actuals actual
            where actual.delivery_id = delivery.id), 0), 0.0001
        )
        else 1
      end,
      case when p_rule_type = 'PERCENT_GROSS_PROFIT' then greatest(
        coalesce(profit.actual_revenue - profit.actual_direct_cost, 0), 0
      ) else null end,
      case
        when p_rule_type = 'PER_HOUR' then 'Giờ thực hiện chuyến đã xác minh'
        when p_rule_type in ('PER_TON', 'PER_M3', 'PER_BAG', 'PER_UNIT') then 'Sản lượng khách đã nhận'
        when p_rule_type = 'PERCENT_GROSS_PROFIT' then 'Lợi nhuận gộp của đơn hàng'
        else '1 chuyến đã xác minh'
      end
    into basis_quantity_value, basis_amount_value, basis_label_value
    from public.deliveries delivery
    left join public.order_profitability profit on profit.sales_order_id = delivery.sales_order_id
    where delivery.id = requirement.source_id;
  end if;
  if basis_quantity_value is null or basis_quantity_value <= 0 then
    raise exception 'POSITIVE_VERIFIED_BASIS_REQUIRED' using errcode = '23514';
  end if;

  select count(*) filter (where element ? 'sharePercent' and nullif(element ->> 'sharePercent', '') is not null),
    count(*) filter (where element ? 'approvedUnits' and nullif(element ->> 'approvedUnits', '') is not null)
  into percent_count, unit_count
  from jsonb_array_elements(p_allocations) element;
  if percent_count = allocation_count and unit_count = 0 then
    allocation_method_value := 'PERCENT';
    if abs((select sum((element ->> 'sharePercent')::numeric)
      from jsonb_array_elements(p_allocations) element) - 100) > 0.0001 then
      raise exception 'ALLOCATION_PERCENT_MUST_EQUAL_100' using errcode = '23514';
    end if;
  elsif unit_count = allocation_count and percent_count = 0 then
    allocation_method_value := 'UNITS';
    if abs((select sum((element ->> 'approvedUnits')::numeric)
      from jsonb_array_elements(p_allocations) element) - basis_quantity_value) > 0.0001 then
      raise exception 'ALLOCATION_UNITS_MUST_MATCH_BASIS' using errcode = '23514';
    end if;
  else
    raise exception 'ONE_ALLOCATION_METHOD_REQUIRED' using errcode = '23514';
  end if;
  if (select count(distinct element ->> 'workerUserId')
      from jsonb_array_elements(p_allocations) element) <> allocation_count then
    raise exception 'DUPLICATE_EARNING_WORKER' using errcode = '23505';
  end if;

  worker_id := (p_allocations -> 0 ->> 'workerUserId')::uuid;
  select * into first_rule from app_private.resolve_compensation_rule(
    worker_id, p_rule_type, item.work_type, requirement.source_type, earned_on_value
  );
  if not found then raise exception 'COMPENSATION_RULE_NOT_RESOLVED' using errcode = 'P0002'; end if;
  event_currency := first_rule.currency;

  insert into public.earning_events (
    event_number, source_type, source_id, source_number_snapshot,
    description_snapshot, rule_type, earned_on, currency, allocation_method,
    basis_quantity, basis_amount, basis_label_snapshot, total_amount, note, created_by
  ) values (
    'ERN-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.earning_event_number_seq')::text, 6, '0'),
    'WORK_VERIFICATION', item.id, source_number_value, item.title, p_rule_type,
    earned_on_value, event_currency, allocation_method_value, basis_quantity_value,
    basis_amount_value, basis_label_value, 0, trim(p_note), p_actor_id
  ) returning id into event_id;

  for allocation in select value from jsonb_array_elements(p_allocations)
  loop
    worker_id := (allocation ->> 'workerUserId')::uuid;
    share_value := case when allocation_method_value = 'PERCENT'
      then (allocation ->> 'sharePercent')::numeric
      else round((allocation ->> 'approvedUnits')::numeric / basis_quantity_value * 100, 4)
    end;
    unit_value := case when allocation_method_value = 'UNITS'
      then (allocation ->> 'approvedUnits')::numeric
      else round(basis_quantity_value * share_value / 100, 4)
    end;
    if share_value <= 0 or unit_value <= 0 then
      raise exception 'POSITIVE_EARNING_ALLOCATION_REQUIRED' using errcode = '23514';
    end if;
    select * into resolved_rule from app_private.resolve_compensation_rule(
      worker_id, p_rule_type, item.work_type, requirement.source_type, earned_on_value
    );
    if not found then raise exception 'COMPENSATION_RULE_NOT_RESOLVED' using errcode = 'P0002'; end if;
    if resolved_rule.currency <> event_currency then
      raise exception 'EARNING_CURRENCY_MISMATCH' using errcode = '23514';
    end if;
    allocation_base := case when p_rule_type = 'PERCENT_GROSS_PROFIT'
      then round(coalesce(basis_amount_value, 0) * resolved_rule.rate * share_value / 10000, 2)
      else round(resolved_rule.rate * unit_value, 2)
    end;
    insert into public.earning_allocations (
      earning_event_id, worker_user_id, compensation_profile_id, plan_version_id,
      compensation_rule_id, plan_label_snapshot, rule_type_snapshot, rate_snapshot,
      cost_treatment_snapshot, approved_units_snapshot, share_percent, base_amount
    ) values (
      event_id, worker_id, resolved_rule.compensation_profile_id,
      resolved_rule.plan_version_id, resolved_rule.compensation_rule_id,
      resolved_rule.plan_label, p_rule_type, resolved_rule.rate, 'DIRECT_LABOR', unit_value,
      share_value, allocation_base
    );
    allocation_total := allocation_total + allocation_base;
  end loop;

  perform set_config('app.compensation_internal_write', 'on', true);
  update public.earning_events set total_amount = allocation_total where id = event_id;
  return event_id;
end;
$$;

create or replace function app_private.create_bonus_earning(
  p_employee_user_id uuid,
  p_earned_on date,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare resolved_rule record; event_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'compensation.manage');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'BONUS_NOTE_REQUIRED' using errcode = '22000';
  end if;
  select * into resolved_rule from app_private.resolve_compensation_rule(
    p_employee_user_id, 'BONUS', 'GENERAL', 'GENERAL', p_earned_on
  );
  if not found then raise exception 'BONUS_RULE_NOT_RESOLVED' using errcode = 'P0002'; end if;
  insert into public.earning_events (
    event_number, source_type, source_id, source_worker_user_id,
    source_number_snapshot, description_snapshot, rule_type, earned_on, currency,
    allocation_method, basis_quantity, basis_label_snapshot, total_amount, note, created_by
  ) values (
    'ERN-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.earning_event_number_seq')::text, 6, '0'),
    'MANUAL_BONUS', gen_random_uuid(), p_employee_user_id,
    'Thưởng ' || to_char(p_earned_on, 'DD/MM/YYYY'), trim(p_note), 'BONUS',
    p_earned_on, resolved_rule.currency, 'PERCENT', 1, '1 khoản thưởng được đề xuất',
    round(resolved_rule.rate, 2), trim(p_note), p_actor_id
  ) returning id into event_id;
  insert into public.earning_allocations (
    earning_event_id, worker_user_id, compensation_profile_id, plan_version_id,
    compensation_rule_id, plan_label_snapshot, rule_type_snapshot, rate_snapshot,
    cost_treatment_snapshot, approved_units_snapshot, share_percent, base_amount
  ) values (
    event_id, p_employee_user_id, resolved_rule.compensation_profile_id,
    resolved_rule.plan_version_id, resolved_rule.compensation_rule_id,
    resolved_rule.plan_label, 'BONUS', resolved_rule.rate, 'OPEX', 1, 100,
    round(resolved_rule.rate, 2)
  );
  return event_id;
end;
$$;

create or replace function app_private.approve_earning_event(
  p_earning_event_id uuid,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare event_record public.earning_events%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'earning.approve');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'EARNING_APPROVAL_NOTE_REQUIRED' using errcode = '22000';
  end if;
  select * into event_record from public.earning_events
  where id = p_earning_event_id for update;
  if not found then raise exception 'EARNING_EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if event_record.status = 'APPROVED' then return event_record.id; end if;
  if event_record.status <> 'PENDING_APPROVAL' then
    raise exception 'EARNING_APPROVAL_NOT_ALLOWED' using errcode = '23514';
  end if;
  if event_record.source_type = 'WORK_VERIFICATION' and not exists (
    select 1 from public.work_items item
    where item.id = event_record.source_id and item.status = 'VERIFIED'
  ) then
    raise exception 'VERIFIED_WORK_SOURCE_REQUIRED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.earning_allocations allocation
    where allocation.earning_event_id = event_record.id
  ) then
    raise exception 'EARNING_ALLOCATION_REQUIRED' using errcode = '23514';
  end if;

  perform set_config('app.compensation_internal_write', 'on', true);
  update public.earning_events set
    status = 'APPROVED', approved_by = p_actor_id, approved_at = now(),
    note = trim(p_note),
    total_amount = (
      select coalesce(sum(allocation.net_amount), 0)
      from public.earning_allocations allocation
      where allocation.earning_event_id = event_record.id
    )
  where id = event_record.id;

  if event_record.rule_type not in ('FIXED_MONTHLY', 'BONUS', 'ADJUSTMENT')
    and event_record.source_type = 'WORK_VERIFICATION' then
    insert into public.compensation_direct_labor_entries (
      earning_allocation_id, sales_order_id, service_job_id, amount, currency
    )
    select allocation.id,
      case when requirement.source_type = 'DELIVERY' then delivery.sales_order_id else null end,
      case when requirement.source_type = 'SERVICE_JOB' then requirement.source_id else null end,
      allocation.net_amount,
      event_record.currency
    from public.earning_allocations allocation
    join public.work_items item on item.id = event_record.source_id
    join public.work_requirements requirement on requirement.id = item.requirement_id
    left join public.deliveries delivery
      on delivery.id = requirement.source_id and requirement.source_type = 'DELIVERY'
    where allocation.earning_event_id = event_record.id
      and requirement.source_type in ('DELIVERY', 'SERVICE_JOB')
    on conflict (earning_allocation_id) do nothing;
  end if;

  if event_record.source_type = 'WORK_VERIFICATION' then
    perform app_private.refresh_order_profitability(delivery.sales_order_id)
    from public.work_items item
    join public.work_requirements requirement on requirement.id = item.requirement_id
    join public.deliveries delivery
      on delivery.id = requirement.source_id and requirement.source_type = 'DELIVERY'
    where item.id = event_record.source_id;
  end if;
  return event_record.id;
end;
$$;

create or replace function app_private.adjust_earning_allocation(
  p_earning_allocation_id uuid,
  p_amount numeric,
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare allocation_record public.earning_allocations%rowtype;
  event_record public.earning_events%rowtype;
  adjustment_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'earning.adjust');
  if p_amount = 0 then raise exception 'NON_ZERO_ADJUSTMENT_REQUIRED' using errcode = '22000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'EARNING_ADJUSTMENT_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into allocation_record from public.earning_allocations
  where id = p_earning_allocation_id for update;
  if not found then raise exception 'EARNING_ALLOCATION_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into event_record from public.earning_events
  where id = allocation_record.earning_event_id for update;
  if event_record.status <> 'PENDING_APPROVAL' then
    raise exception 'ONLY_PENDING_EARNING_CAN_BE_ADJUSTED' using errcode = '23514';
  end if;
  if allocation_record.net_amount + p_amount < 0 then
    raise exception 'NEGATIVE_NET_EARNING_NOT_ALLOWED' using errcode = '23514';
  end if;
  insert into public.earning_adjustments (
    earning_allocation_id, amount, reason, created_by
  ) values (
    allocation_record.id, round(p_amount, 2), trim(p_reason), p_actor_id
  ) returning id into adjustment_id;
  perform set_config('app.compensation_internal_write', 'on', true);
  update public.earning_allocations
  set adjustment_amount = adjustment_amount + round(p_amount, 2)
  where id = allocation_record.id;
  update public.earning_events
  set total_amount = (
    select coalesce(sum(allocation.net_amount), 0)
    from public.earning_allocations allocation
    where allocation.earning_event_id = event_record.id
  )
  where id = event_record.id;
  return adjustment_id;
end;
$$;

create or replace function app_private.reverse_earning_event(
  p_earning_event_id uuid,
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare event_record public.earning_events%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'earning.adjust');
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'EARNING_REVERSAL_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into event_record from public.earning_events
  where id = p_earning_event_id for update;
  if not found then raise exception 'EARNING_EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if event_record.status = 'REVERSED' then return event_record.id; end if;
  perform set_config('app.compensation_internal_write', 'on', true);
  update public.earning_events set
    status = 'REVERSED', reversed_by = p_actor_id, reversed_at = now(),
    reversal_reason = trim(p_reason)
  where id = event_record.id;
  update public.compensation_direct_labor_entries labor set reversed_at = now()
  from public.earning_allocations allocation
  where labor.earning_allocation_id = allocation.id
    and allocation.earning_event_id = event_record.id
    and labor.reversed_at is null;
  if event_record.source_type = 'WORK_VERIFICATION' then
    perform app_private.refresh_order_profitability(delivery.sales_order_id)
    from public.work_items item
    join public.work_requirements requirement on requirement.id = item.requirement_id
    join public.deliveries delivery
      on delivery.id = requirement.source_id and requirement.source_type = 'DELIVERY'
    where item.id = event_record.source_id;
  end if;
  return event_record.id;
end;
$$;

create or replace function app_private.create_payroll_period(
  p_period_code text,
  p_period_start date,
  p_period_end date,
  p_currency text,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare created_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payroll.close');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'PAYROLL_PERIOD_NOTE_REQUIRED' using errcode = '22000';
  end if;
  if p_period_end < p_period_start then
    raise exception 'PAYROLL_PERIOD_DATES_INVALID' using errcode = '22000';
  end if;
  if exists (
    select 1 from public.payroll_periods period
    where period.currency = upper(trim(p_currency))
      and daterange(period.period_start, period.period_end, '[]')
        && daterange(p_period_start, p_period_end, '[]')
  ) then
    raise exception 'PAYROLL_PERIOD_OVERLAP' using errcode = '23505';
  end if;
  insert into public.payroll_periods (
    period_code, period_start, period_end, currency, note, created_by
  ) values (
    upper(trim(p_period_code)), p_period_start, p_period_end,
    upper(trim(p_currency)), trim(p_note), p_actor_id
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function app_private.generate_monthly_earnings(
  p_payroll_period_id uuid,
  p_actor_id uuid
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare period_record public.payroll_periods%rowtype;
  worker record;
  resolved_rule record;
  event_id uuid;
  created_count integer := 0;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'compensation.manage');
  select * into period_record from public.payroll_periods
  where id = p_payroll_period_id for update;
  if not found then raise exception 'PAYROLL_PERIOD_NOT_FOUND' using errcode = 'P0002'; end if;
  if period_record.status <> 'OPEN' then
    raise exception 'OPEN_PAYROLL_PERIOD_REQUIRED' using errcode = '23514';
  end if;
  for worker in
    select profile.employee_user_id, user_profile.display_name
    from public.compensation_profiles profile
    join public.user_profiles user_profile on user_profile.user_id = profile.employee_user_id
    where profile.effective_from <= period_record.period_end
      and (profile.effective_to is null or profile.effective_to >= period_record.period_end)
      and user_profile.status = 'ACTIVE'
  loop
    select * into resolved_rule from app_private.resolve_compensation_rule(
      worker.employee_user_id, 'FIXED_MONTHLY', 'GENERAL', 'GENERAL', period_record.period_end
    );
    if found and resolved_rule.currency = period_record.currency and not exists (
      select 1 from public.earning_events event_record
      where event_record.source_type = 'PAYROLL_PERIOD'
        and event_record.source_id = period_record.id
        and event_record.source_worker_user_id = worker.employee_user_id
        and event_record.rule_type = 'FIXED_MONTHLY'
        and event_record.status <> 'REVERSED'
    ) then
      insert into public.earning_events (
        event_number, source_type, source_id, source_worker_user_id,
        source_number_snapshot, description_snapshot, rule_type, earned_on,
        currency, allocation_method, basis_quantity, basis_label_snapshot,
        total_amount, note, created_by
      ) values (
        'ERN-' || to_char(now(), 'YYYY') || '-' ||
          lpad(nextval('public.earning_event_number_seq')::text, 6, '0'),
        'PAYROLL_PERIOD', period_record.id, worker.employee_user_id,
        period_record.period_code, 'Thu nhập cố định · ' || worker.display_name,
        'FIXED_MONTHLY', period_record.period_end, period_record.currency,
        'PERCENT', 1, '1 tháng theo kế hoạch có hiệu lực',
        round(resolved_rule.rate, 2), 'Sinh từ kỳ ' || period_record.period_code ||
          ' theo kế hoạch có hiệu lực', p_actor_id
      ) returning id into event_id;
      insert into public.earning_allocations (
        earning_event_id, worker_user_id, compensation_profile_id, plan_version_id,
        compensation_rule_id, plan_label_snapshot, rule_type_snapshot, rate_snapshot,
        cost_treatment_snapshot, approved_units_snapshot, share_percent, base_amount
      ) values (
        event_id, worker.employee_user_id, resolved_rule.compensation_profile_id,
        resolved_rule.plan_version_id, resolved_rule.compensation_rule_id,
        resolved_rule.plan_label, 'FIXED_MONTHLY', resolved_rule.rate, 'OPEX', 1, 100,
        round(resolved_rule.rate, 2)
      );
      created_count := created_count + 1;
    end if;
  end loop;
  return created_count;
end;
$$;

create or replace function app_private.close_payroll_period(
  p_payroll_period_id uuid,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare period_record public.payroll_periods%rowtype;
  worker record;
  line_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payroll.close');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'PAYROLL_CLOSE_NOTE_REQUIRED' using errcode = '22000';
  end if;
  select * into period_record from public.payroll_periods
  where id = p_payroll_period_id for update;
  if not found then raise exception 'PAYROLL_PERIOD_NOT_FOUND' using errcode = 'P0002'; end if;
  if period_record.status = 'CLOSED' then return period_record.id; end if;
  if exists (
    select 1 from public.earning_events event_record
    where event_record.earned_on between period_record.period_start and period_record.period_end
      and event_record.currency = period_record.currency
      and event_record.status = 'PENDING_APPROVAL'
  ) then
    raise exception 'PENDING_EARNINGS_MUST_BE_RESOLVED' using errcode = '23514';
  end if;

  for worker in
    select allocation.worker_user_id,
      profile.display_name,
      coalesce(operational.employee_code, left(allocation.worker_user_id::text, 8)) as employee_code,
      sum(allocation.base_amount)::numeric(20, 2) as base_amount,
      sum(allocation.adjustment_amount)::numeric(20, 2) as adjustment_amount,
      sum(allocation.net_amount)::numeric(20, 2) as net_amount
    from public.earning_allocations allocation
    join public.earning_events event_record on event_record.id = allocation.earning_event_id
    join public.user_profiles profile on profile.user_id = allocation.worker_user_id
    left join public.employee_operational_profiles operational
      on operational.user_id = allocation.worker_user_id
    left join public.payroll_line_earnings consumed
      on consumed.earning_allocation_id = allocation.id
    where event_record.status = 'APPROVED'
      and event_record.earned_on between period_record.period_start and period_record.period_end
      and event_record.currency = period_record.currency
      and consumed.earning_allocation_id is null
    group by allocation.worker_user_id, profile.display_name, operational.employee_code
    having sum(allocation.net_amount) >= 0
  loop
    insert into public.payroll_lines (
      payroll_period_id, employee_user_id, employee_name_snapshot,
      employee_code_snapshot, base_amount, adjustment_amount, net_amount
    ) values (
      period_record.id, worker.worker_user_id, worker.display_name,
      worker.employee_code, worker.base_amount, worker.adjustment_amount, worker.net_amount
    ) returning id into line_id;
    insert into public.payroll_line_earnings (
      payroll_line_id, earning_allocation_id, base_amount_snapshot,
      adjustment_amount_snapshot, net_amount_snapshot
    )
    select line_id, allocation.id, allocation.base_amount,
      allocation.adjustment_amount, allocation.net_amount
    from public.earning_allocations allocation
    join public.earning_events event_record on event_record.id = allocation.earning_event_id
    left join public.payroll_line_earnings consumed
      on consumed.earning_allocation_id = allocation.id
    where allocation.worker_user_id = worker.worker_user_id
      and event_record.status = 'APPROVED'
      and event_record.earned_on between period_record.period_start and period_record.period_end
      and event_record.currency = period_record.currency
      and consumed.earning_allocation_id is null;
  end loop;

  perform set_config('app.compensation_internal_write', 'on', true);
  update public.payroll_periods set
    status = 'CLOSED', closed_by = p_actor_id, closed_at = now(), note = trim(p_note)
  where id = period_record.id;
  return period_record.id;
end;
$$;

create or replace function app_private.link_payroll_payment(
  p_payroll_line_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare line_record public.payroll_lines%rowtype;
  period_record public.payroll_periods%rowtype;
  payment_record public.payments%rowtype;
  line_paid numeric(20, 2);
  payment_linked numeric(20, 2);
  created_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payroll.close');
  if p_amount <= 0 then raise exception 'POSITIVE_PAYMENT_LINK_REQUIRED' using errcode = '22000'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'PAYROLL_PAYMENT_NOTE_REQUIRED' using errcode = '22000';
  end if;
  select * into line_record from public.payroll_lines
  where id = p_payroll_line_id for update;
  if not found then raise exception 'PAYROLL_LINE_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into period_record from public.payroll_periods where id = line_record.payroll_period_id;
  if period_record.status <> 'CLOSED' then
    raise exception 'CLOSED_PAYROLL_PERIOD_REQUIRED' using errcode = '23514';
  end if;
  select * into payment_record from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment_record.direction <> 'DISBURSEMENT'
    or payment_record.status not in ('POSTED', 'RECONCILED') then
    raise exception 'POSTED_DISBURSEMENT_REQUIRED' using errcode = '23514';
  end if;
  if payment_record.currency <> period_record.currency then
    raise exception 'PAYROLL_PAYMENT_CURRENCY_MISMATCH' using errcode = '23514';
  end if;
  select coalesce(sum(link.amount), 0) into line_paid
  from public.payroll_payment_links link where link.payroll_line_id = line_record.id;
  select coalesce(sum(link.amount), 0) into payment_linked
  from public.payroll_payment_links link where link.payment_id = payment_record.id;
  if line_paid + p_amount > line_record.net_amount then
    raise exception 'PAYROLL_LINE_OVERPAID' using errcode = '23514';
  end if;
  if payment_linked + p_amount > payment_record.amount then
    raise exception 'PAYMENT_LINK_EXCEEDS_CASH_MOVEMENT' using errcode = '23514';
  end if;
  insert into public.payroll_payment_links (
    payroll_line_id, payment_id, amount, note, linked_by
  ) values (
    line_record.id, payment_record.id, round(p_amount, 2), trim(p_note), p_actor_id
  ) returning id into created_id;
  return created_id;
end;
$$;

-- If a verified WorkItem is explicitly cancelled by a future source workflow,
-- its entitlement is reversed automatically. The immutable allocation stays for audit.
create or replace function app_private.reverse_earning_when_work_cancelled()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status = 'VERIFIED' and new.status = 'CANCELLED' then
    perform set_config('app.compensation_internal_write', 'on', true);
    update public.earning_events event_record set
      status = 'REVERSED', reversed_at = now(),
      reversal_reason = 'Nguồn công việc đã bị hủy'
    where event_record.source_type = 'WORK_VERIFICATION'
      and event_record.source_id = new.id
      and event_record.status <> 'REVERSED';
    update public.compensation_direct_labor_entries labor set reversed_at = now()
    from public.earning_allocations allocation
    join public.earning_events event_record on event_record.id = allocation.earning_event_id
    where labor.earning_allocation_id = allocation.id
      and event_record.source_type = 'WORK_VERIFICATION'
      and event_record.source_id = new.id
      and labor.reversed_at is null;
  end if;
  return new;
end;
$$;
create trigger work_item_earning_reversal
after update of status on public.work_items
for each row execute function app_private.reverse_earning_when_work_cancelled();

-- Variable earnings attributable to a delivery are direct labor. Fixed monthly
-- salary, bonuses and manual adjustments remain operating expense and are excluded.
create or replace function app_private.refresh_order_profitability(
  p_sales_order_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.order_profitability%rowtype;
  actual_revenue_amount numeric(20, 2);
  quoted_cost_amount numeric(20, 2);
  committed_cost_amount numeric(20, 2);
  actual_cost_amount numeric(20, 2);
begin
  select * into target from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if not found then
    raise exception 'ORDER_PROFITABILITY_NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(sum(original_amount), 0) into actual_revenue_amount
    from public.receivables
    where sales_order_id = p_sales_order_id and status <> 'REVERSED';
  select
    coalesce(sum(amount) filter (where basis = 'QUOTED'), 0),
    coalesce(sum(amount) filter (where basis = 'COMMITTED'), 0),
    coalesce(sum(amount) filter (where basis = 'ACTUAL'), 0)
    into quoted_cost_amount, committed_cost_amount, actual_cost_amount
    from public.profitability_cost_entries where sales_order_id = p_sales_order_id;
  select actual_cost_amount + coalesce(sum(labor.amount), 0)
    into actual_cost_amount
  from public.compensation_direct_labor_entries labor
  where labor.sales_order_id = p_sales_order_id and labor.reversed_at is null;
  if target.lifecycle = 'FINALIZED' and (
    actual_revenue_amount is distinct from target.actual_revenue
    or quoted_cost_amount is distinct from target.quoted_direct_cost
    or committed_cost_amount is distinct from target.committed_direct_cost
    or actual_cost_amount is distinct from target.actual_direct_cost
  ) then
    raise exception 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN' using errcode = '23514';
  end if;
  perform set_config('app.profitability_internal_write', 'on', true);
  update public.order_profitability set
    actual_revenue = actual_revenue_amount,
    quoted_direct_cost = quoted_cost_amount,
    committed_direct_cost = committed_cost_amount,
    actual_direct_cost = actual_cost_amount,
    lifecycle = case
      when lifecycle = 'FINALIZED' then lifecycle
      when actual_revenue_amount > 0 or actual_cost_amount > 0 then 'ACTUAL_OPEN'::public.profitability_lifecycle
      else 'ESTIMATED'::public.profitability_lifecycle end,
    version = version + 1,
    updated_at = now()
  where id = target.id;
  return target.id;
end;
$$;

create or replace view public.service_job_operational_view
with (security_invoker = true) as
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
  coalesce(cost.total_cost, 0) + coalesce(expense.total_expense, 0)
    + coalesce(labor.total_labor, 0) as actual_cost,
  coalesce(revenue.amount, 0) as recognized_revenue,
  coalesce(revenue.amount, 0) - (
    coalesce(cost.total_cost, 0) + coalesce(expense.total_expense, 0)
    + coalesce(labor.total_labor, 0)
  ) as contribution_profit,
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
  select sum(entry.amount) as total_labor
  from public.compensation_direct_labor_entries entry
  where entry.service_job_id = job.id and entry.currency = job.currency
    and entry.reversed_at is null
) labor on true
left join lateral (
  select billing.amount
  from public.service_billing_events billing
  where billing.service_job_id = job.id and billing.status = 'CONSUMED'
) revenue on true;

create view public.compensation_profile_view with (security_invoker = true) as
select profile.id, profile.employee_user_id, user_profile.display_name,
  coalesce(operational.employee_code, left(profile.employee_user_id::text, 8)) as employee_code,
  profile.effective_from, profile.effective_to, profile.is_active, profile.note,
  profile.created_at
from public.compensation_profiles profile
join public.user_profiles user_profile on user_profile.user_id = profile.employee_user_id
left join public.employee_operational_profiles operational
  on operational.user_id = profile.employee_user_id;

create view public.compensation_plan_rule_view with (security_invoker = true) as
select plan.id, plan.plan_code, plan.name, plan.version_number, plan.scope_type,
  plan.role_code, plan.employee_user_id, employee.display_name as employee_name,
  plan.effective_from, plan.effective_to, plan.currency,
  rule.id as rule_id, rule.rule_type, rule.rate, rule.work_type, rule.source_type,
  rule.description, count(rule.id) over (partition by plan.id)::integer as rule_count
from public.compensation_plan_versions plan
left join public.user_profiles employee on employee.user_id = plan.employee_user_id
left join public.compensation_rules rule on rule.plan_version_id = plan.id;

create view public.earning_event_summary_view with (security_invoker = true) as
select event_record.id, event_record.event_number, event_record.source_type,
  event_record.source_id, event_record.source_worker_user_id,
  event_record.source_number_snapshot, event_record.description_snapshot,
  event_record.rule_type, event_record.status, event_record.earned_on,
  event_record.currency, event_record.allocation_method,
  event_record.basis_quantity, event_record.basis_amount,
  event_record.basis_label_snapshot, event_record.total_amount,
  event_record.approved_at, event_record.reversed_at, event_record.reversal_reason,
  event_record.created_at
from public.earning_events event_record;

create view public.earning_allocation_view with (security_invoker = true) as
select allocation.id, allocation.earning_event_id, allocation.worker_user_id,
  employee.display_name as worker_name,
  coalesce(operational.employee_code, left(allocation.worker_user_id::text, 8)) as employee_code,
  allocation.plan_label_snapshot, allocation.rule_type_snapshot,
  allocation.rate_snapshot, allocation.cost_treatment_snapshot,
  allocation.approved_units_snapshot,
  allocation.share_percent, allocation.base_amount,
  allocation.adjustment_amount, allocation.net_amount, allocation.created_at
from public.earning_allocations allocation
join public.user_profiles employee on employee.user_id = allocation.worker_user_id
left join public.employee_operational_profiles operational
  on operational.user_id = allocation.worker_user_id;

create view public.verified_work_compensation_view with (security_invoker = true) as
select item.id, item.work_number, item.title, item.work_type,
  requirement.source_type, requirement.source_id, item.claimed_by as worker_user_id,
  employee.display_name as worker_name, item.verified_at,
  exists (
    select 1 from public.earning_events event_record
    where event_record.source_type = 'WORK_VERIFICATION'
      and event_record.source_id = item.id
      and event_record.status <> 'REVERSED'
  ) as has_earning
from public.work_items item
join public.work_requirements requirement on requirement.id = item.requirement_id
join public.user_profiles employee on employee.user_id = item.claimed_by
where item.status = 'VERIFIED';

create view public.payroll_period_summary_view with (security_invoker = true) as
select period.id, period.period_code, period.period_start, period.period_end,
  period.currency, period.status, period.closed_at,
  coalesce(sum(line.net_amount), 0)::numeric(20, 2) as total_entitlement,
  coalesce(sum(payment.paid_amount), 0)::numeric(20, 2) as total_paid,
  count(line.id)::integer as line_count
from public.payroll_periods period
left join public.payroll_lines line on line.payroll_period_id = period.id
left join lateral (
  select coalesce(sum(link.amount), 0) as paid_amount
  from public.payroll_payment_links link where link.payroll_line_id = line.id
) payment on true
group by period.id;

create view public.payroll_line_summary_view with (security_invoker = true) as
select line.id, line.payroll_period_id, line.employee_user_id,
  line.employee_name_snapshot, line.employee_code_snapshot,
  line.base_amount, line.adjustment_amount, line.net_amount,
  coalesce(payment.paid_amount, 0)::numeric(20, 2) as paid_amount,
  case
    when coalesce(payment.paid_amount, 0) = 0 then 'UNPAID'
    when payment.paid_amount < line.net_amount then 'PARTIALLY_PAID'
    else 'PAID'
  end as payment_status,
  line.created_at
from public.payroll_lines line
left join lateral (
  select coalesce(sum(link.amount), 0) as paid_amount
  from public.payroll_payment_links link where link.payroll_line_id = line.id
) payment on true;

create view public.compensation_payment_option_view with (security_invoker = true) as
select payment.id, payment.payment_number, payment.amount, payment.currency,
  payment.payment_date,
  greatest(payment.amount - coalesce(linked.amount, 0), 0)::numeric(20, 2) as available_amount
from public.payments payment
left join lateral (
  select sum(link.amount) as amount from public.payroll_payment_links link
  where link.payment_id = payment.id
) linked on true
where payment.direction = 'DISBURSEMENT'
  and payment.status in ('POSTED', 'RECONCILED');

create view public.my_earning_view with (security_invoker = true) as
select allocation.id as allocation_id, allocation.worker_user_id,
  event_record.event_number, event_record.source_number_snapshot,
  event_record.description_snapshot, event_record.status, event_record.earned_on,
  allocation.rule_type_snapshot, allocation.rate_snapshot,
  allocation.approved_units_snapshot, event_record.currency,
  allocation.base_amount, allocation.adjustment_amount, allocation.net_amount,
  coalesce(
    least(
      allocation.net_amount,
      round(payment.paid_amount * line_earning.net_amount_snapshot /
        nullif(payroll_line.net_amount, 0), 2)
    ), 0
  )::numeric(20, 2) as paid_amount
from public.earning_allocations allocation
join public.earning_events event_record on event_record.id = allocation.earning_event_id
left join public.payroll_line_earnings line_earning
  on line_earning.earning_allocation_id = allocation.id
left join public.payroll_lines payroll_line on payroll_line.id = line_earning.payroll_line_id
left join lateral (
  select coalesce(sum(link.amount), 0) as paid_amount
  from public.payroll_payment_links link where link.payroll_line_id = payroll_line.id
) payment on true;

create view public.worker_productivity_view with (security_invoker = true) as
select allocation.worker_user_id,
  count(distinct event_record.id) filter (
    where event_record.source_type = 'WORK_VERIFICATION'
      and event_record.status in ('APPROVED', 'PENDING_APPROVAL')
  )::integer as verified_jobs,
  coalesce(sum(allocation.net_amount) filter (
    where event_record.status = 'APPROVED'
  ), 0)::numeric(20, 2) as approved_amount,
  coalesce(sum(allocation.net_amount) filter (
    where event_record.status = 'PENDING_APPROVAL'
  ), 0)::numeric(20, 2) as pending_amount,
  coalesce(sum(my_earning.paid_amount), 0)::numeric(20, 2) as paid_amount,
  coalesce(max(event_record.currency), 'VND') as currency
from public.earning_allocations allocation
join public.earning_events event_record on event_record.id = allocation.earning_event_id
left join public.my_earning_view my_earning on my_earning.allocation_id = allocation.id
group by allocation.worker_user_id;

alter table public.compensation_profiles enable row level security;
alter table public.compensation_plan_versions enable row level security;
alter table public.compensation_rules enable row level security;
alter table public.earning_events enable row level security;
alter table public.earning_allocations enable row level security;
alter table public.earning_adjustments enable row level security;
alter table public.compensation_direct_labor_entries enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payroll_line_earnings enable row level security;
alter table public.payroll_payment_links enable row level security;

revoke all on public.compensation_profiles, public.compensation_plan_versions,
  public.compensation_rules, public.earning_events, public.earning_allocations,
  public.earning_adjustments, public.compensation_direct_labor_entries,
  public.payroll_periods, public.payroll_lines, public.payroll_line_earnings,
  public.payroll_payment_links, public.compensation_profile_view,
  public.compensation_plan_rule_view, public.earning_event_summary_view,
  public.earning_allocation_view, public.verified_work_compensation_view,
  public.payroll_period_summary_view, public.payroll_line_summary_view,
  public.compensation_payment_option_view, public.my_earning_view,
  public.worker_productivity_view from anon, authenticated;
grant select on public.compensation_profiles, public.compensation_plan_versions,
  public.compensation_rules, public.earning_events, public.earning_allocations,
  public.earning_adjustments, public.compensation_direct_labor_entries,
  public.payroll_periods, public.payroll_lines, public.payroll_line_earnings,
  public.payroll_payment_links, public.compensation_profile_view,
  public.compensation_plan_rule_view, public.earning_event_summary_view,
  public.earning_allocation_view, public.verified_work_compensation_view,
  public.payroll_period_summary_view, public.payroll_line_summary_view,
  public.compensation_payment_option_view, public.my_earning_view,
  public.worker_productivity_view to authenticated;

create policy compensation_profiles_manager_read on public.compensation_profiles
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);
create policy compensation_profiles_self_read on public.compensation_profiles
for select to authenticated using (
  employee_user_id = (select auth.uid())
  and (select app_private.has_permission('earning.read_self'))
);
create policy compensation_plans_manager_read on public.compensation_plan_versions
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);
create policy compensation_rules_manager_read on public.compensation_rules
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);
create policy earning_events_authorized_read on public.earning_events
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    (select app_private.has_permission('earning.read_self'))
    and exists (
      select 1 from public.earning_allocations allocation
      where allocation.earning_event_id = earning_events.id
        and allocation.worker_user_id = (select auth.uid())
    )
  )
);
create policy earning_allocations_authorized_read on public.earning_allocations
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    worker_user_id = (select auth.uid())
    and (select app_private.has_permission('earning.read_self'))
  )
);
create policy earning_adjustments_authorized_read on public.earning_adjustments
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    (select app_private.has_permission('earning.read_self'))
    and exists (
      select 1 from public.earning_allocations allocation
      where allocation.id = earning_allocation_id
        and allocation.worker_user_id = (select auth.uid())
    )
  )
);
create policy direct_labor_authorized_read on public.compensation_direct_labor_entries
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (select app_private.has_permission('margin.read'))
);
create policy payroll_periods_authorized_read on public.payroll_periods
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    (select app_private.has_permission('earning.read_self'))
    and exists (
      select 1 from public.payroll_lines line
      where line.payroll_period_id = payroll_periods.id
        and line.employee_user_id = (select auth.uid())
    )
  )
);
create policy payroll_lines_authorized_read on public.payroll_lines
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    employee_user_id = (select auth.uid())
    and (select app_private.has_permission('earning.read_self'))
  )
);
create policy payroll_line_earnings_authorized_read on public.payroll_line_earnings
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    (select app_private.has_permission('earning.read_self'))
    and exists (
      select 1 from public.payroll_lines line
      where line.id = payroll_line_id
        and line.employee_user_id = (select auth.uid())
    )
  )
);
create policy payroll_payment_links_authorized_read on public.payroll_payment_links
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
  or (
    (select app_private.has_permission('earning.read_self'))
    and exists (
      select 1 from public.payroll_lines line
      where line.id = payroll_line_id
        and line.employee_user_id = (select auth.uid())
    )
  )
);

-- Existing reference tables remain protected; compensation managers receive only
-- the additional selector rows required by the Office command centre.
create policy user_profiles_compensation_read on public.user_profiles
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);
create policy employee_profiles_compensation_read on public.employee_operational_profiles
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);
create policy work_items_compensation_read on public.work_items
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);
create policy work_requirements_compensation_read on public.work_requirements
for select to authenticated using (
  (select app_private.has_permission('compensation.read'))
);

insert into public.permissions (code, description_vi) values
  ('compensation.read', 'Xem kế hoạch và quyền lợi thu nhập'),
  ('compensation.manage', 'Quản lý hồ sơ, kế hoạch và đề xuất quyền lợi'),
  ('earning.read_self', 'Xem thu nhập của chính mình'),
  ('earning.approve', 'Duyệt quyền lợi trước khi chốt kỳ'),
  ('earning.adjust', 'Điều chỉnh hoặc đảo quyền lợi có lý do'),
  ('payroll.close', 'Tạo, chốt kỳ thu nhập và liên kết khoản chi')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
cross join public.permissions permission
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'compensation.read', 'compensation.manage', 'earning.approve',
  'earning.adjust', 'payroll.close'
)
where role.code = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'compensation.read', 'compensation.manage', 'earning.approve'
)
where role.code = 'SUPERVISOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'earning.read_self'
where role.code in ('DRIVER', 'OPERATOR_WORKER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'compensation.read'
where role.code = 'AUDITOR_VIEWER'
on conflict do nothing;

revoke all on function app_private.prevent_compensation_history_mutation()
  from public, anon, authenticated;
revoke all on function app_private.require_compensation_internal_write()
  from public, anon, authenticated;
revoke all on function app_private.resolve_compensation_rule(uuid, public.compensation_rule_type, text, text, date)
  from public, anon, authenticated;
revoke all on function app_private.create_compensation_profile(uuid, date, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_compensation_plan_version(text, text, integer, public.compensation_plan_scope, text, uuid, date, date, text, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_compensation_rule(uuid, public.compensation_rule_type, numeric, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_verified_work_earning(uuid, public.compensation_rule_type, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_bonus_earning(uuid, date, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.approve_earning_event(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.adjust_earning_allocation(uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.reverse_earning_event(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_payroll_period(text, date, date, text, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.generate_monthly_earnings(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.close_payroll_period(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.link_payroll_payment(uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.reverse_earning_when_work_cancelled()
  from public, anon, authenticated;
