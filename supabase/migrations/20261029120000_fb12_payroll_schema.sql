-- FB12 (D34b): "Bảng lương" like KiotViet, built on the closed attendance. Thiết lập lương per person (salary_profiles: theo
-- ngày công chuẩn / theo ca / theo giờ / cố định, làm thêm giờ 150% ngày thường · 200% ngày nghỉ tuần · 300% ngày lễ — the
-- defaults approved by the Owner on 29/10), "thu nhập khác" rules the shop sets itself (payroll_components: phụ cấp, thưởng
-- theo doanh thu bậc, giảm trừ đi muộn / nghỉ không phép…), ngày lễ (payroll_holidays), and the payroll of a period
-- (payroll_periods + payroll_lines: Tạm tính → Đã chốt). Closing posts each person's net pay as an approved earning with its
-- payable, so "Chi trả" and the cashbook work as for every other earning. Trip / job earnings and commissions are already
-- payables of their own: the payslip shows them but never pays them twice.
begin;

create table public.salary_profiles (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  pay_basis text not null check (pay_basis in ('MONTHLY_WORKDAYS','PER_SHIFT','PER_HOUR','FIXED')),
  base_rate_vnd bigint not null check (base_rate_vnd > 0),
  overtime_enabled boolean not null default true,
  overtime_hourly_vnd bigint check (overtime_hourly_vnd > 0),
  overtime_weekday_pct integer not null default 150 check (overtime_weekday_pct between 100 and 1000),
  overtime_restday_pct integer not null default 200 check (overtime_restday_pct between 100 and 1000),
  overtime_holiday_pct integer not null default 300 check (overtime_holiday_pct between 100 and 1000),
  rest_weekday integer not null default 7 check (rest_weekday between 1 and 7),
  active boolean not null default true,
  version integer not null default 1,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (branch_id, employee_id)
);

create table public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{1,24}$'),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('ALLOWANCE','BONUS','DEDUCTION')),
  method text not null check (method in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS')),
  amount_vnd bigint check (amount_vnd > 0),
  -- SALES_TIERS: [{"from_vnd": "0", "rate_bps": 100}, {"from_vnd": "100000000", "rate_bps": 200}] — the highest tier reached
  -- applies to the whole revenue of the period.
  tiers jsonb,
  employee_id uuid references public.employees(id) on delete restrict,
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (branch_id, code),
  check ((method = 'SALES_TIERS') = (tiers is not null and amount_vnd is null)),
  check (method = 'SALES_TIERS' or amount_vnd is not null),
  check (tiers is null or (jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) between 1 and 10))
);

create table public.payroll_holidays (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  holiday_date date not null,
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  unique (branch_id, holiday_date)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null check (char_length(name) between 1 and 80),
  period_start date not null,
  period_end date not null,
  state text not null default 'DRAFT' check (state in ('DRAFT','CLOSED','CANCELLED')),
  version integer not null default 1,
  calculated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete restrict,
  closed_at timestamptz,
  unique (branch_id, code),
  check (period_end >= period_start and period_end - period_start <= 62),
  check ((state = 'CLOSED') = (closed_at is not null))
);
create index payroll_periods_branch on public.payroll_periods(branch_id, period_start desc);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  included boolean not null default true,
  pay_basis text not null,
  base_rate_vnd bigint not null,
  standard_work_days numeric(4,1) not null,
  work_days numeric(6,1) not null default 0,
  worked_shifts integer not null default 0,
  paid_leave_days integer not null default 0,
  unpaid_days integer not null default 0,
  worked_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  late_count integer not null default 0,
  late_early_minutes integer not null default 0,
  sales_revenue_vnd bigint not null default 0,
  base_amount_vnd bigint not null default 0,
  overtime_amount_vnd bigint not null default 0,
  allowance_vnd bigint not null default 0,
  bonus_vnd bigint not null default 0,
  deduction_vnd bigint not null default 0,
  manual_bonus_vnd bigint not null default 0 check (manual_bonus_vnd >= 0),
  manual_deduction_vnd bigint not null default 0 check (manual_deduction_vnd >= 0),
  manual_note text check (char_length(manual_note) <= 300),
  net_pay_vnd bigint not null default 0,
  other_earnings_vnd bigint not null default 0,
  details jsonb not null default '[]'::jsonb,
  earning_event_id uuid unique references public.earning_events(id) on delete restrict,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);
create index payroll_lines_employee on public.payroll_lines(employee_id);

alter table public.salary_profiles enable row level security;
alter table public.payroll_components enable row level security;
alter table public.payroll_holidays enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_lines enable row level security;
create policy salary_profiles_read on public.salary_profiles for select to authenticated
  using (private.has_permission(branch_id, 'compensation.read') or employee_id = private.current_employee_id());
create policy payroll_components_read on public.payroll_components for select to authenticated using (private.has_permission(branch_id, 'compensation.read'));
create policy payroll_holidays_read on public.payroll_holidays for select to authenticated using (private.has_branch_access(branch_id));
-- A person sees their own payslip once the payroll is closed (checked without RLS so the two policies do not loop).
create or replace function private.my_closed_payslip(target_period_id uuid) returns boolean
language sql stable security definer set search_path='' as $function$
  select exists (select 1 from public.payroll_lines l join public.payroll_periods p on p.id = l.payroll_period_id
    where l.payroll_period_id = target_period_id and l.employee_id = private.current_employee_id() and l.included and p.state = 'CLOSED')
$function$;
revoke all on function private.my_closed_payslip(uuid) from public, anon, service_role;
grant execute on function private.my_closed_payslip(uuid) to authenticated;
create policy payroll_periods_read on public.payroll_periods for select to authenticated
  using (private.has_permission(branch_id, 'compensation.read') or private.my_closed_payslip(id));
create policy payroll_lines_read on public.payroll_lines for select to authenticated
  using (private.has_permission(branch_id, 'compensation.read')
    or (employee_id = private.current_employee_id() and private.my_closed_payslip(payroll_period_id)));
revoke all on public.salary_profiles, public.payroll_components, public.payroll_holidays, public.payroll_periods, public.payroll_lines from anon, public;
grant select on public.salary_profiles, public.payroll_components, public.payroll_holidays, public.payroll_periods, public.payroll_lines to authenticated;

notify pgrst, 'reload schema';
commit;
