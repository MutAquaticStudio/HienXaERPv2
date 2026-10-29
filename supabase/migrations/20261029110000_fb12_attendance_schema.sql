-- FB12 (D34a): "Chấm công" like KiotViet, for shop staff and field workers. Ca làm việc (work_shifts), xếp lịch
-- (shift_assignments: one row per person × shift × day, cancelled instead of deleted), bản ghi chấm công (attendance_records:
-- giờ vào / ra with the phone's position, đi muộn / về sớm / làm thêm in minutes, or a leave day), chốt kỳ (attendance_periods:
-- a closed period locks its days until reopened with a reason), and the branch's settings (defaults approved by the Owner on
-- 29/10: 26 standard days a month, 10 minutes late allowed, clock-in up to 60 minutes early, position recorded not required).
begin;

insert into public.permissions(code, name) values
  ('attendance.read', 'Xem chấm công'),
  ('attendance.manage', 'Quản lý ca, xếp lịch, chấm công hộ và chốt chấm công')
on conflict (code) do update set name = excluded.name;
-- Whoever manages pay manages attendance; whoever reads pay reads it.
insert into public.role_permissions(role_id, permission_code)
  select distinct rp.role_id, x.code from public.role_permissions rp
  cross join (values ('compensation.manage','attendance.manage'),('compensation.manage','attendance.read'),('compensation.read','attendance.read')) x(source,code)
  where rp.permission_code = x.source
on conflict do nothing;

create table public.attendance_settings (
  branch_id uuid primary key references public.branches(id) on delete restrict,
  late_grace_minutes integer not null default 10 check (late_grace_minutes between 0 and 120),
  early_clock_in_minutes integer not null default 60 check (early_clock_in_minutes between 0 and 240),
  standard_work_days numeric(4,1) not null default 26 check (standard_work_days > 0 and standard_work_days <= 31),
  require_location boolean not null default false,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{1,24}$'),
  name text not null check (char_length(name) between 1 and 80),
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  shift_id uuid not null references public.work_shifts(id) on delete restrict,
  work_date date not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict
);
create unique index shift_assignments_live on public.shift_assignments(employee_id, shift_id, work_date) where cancelled_at is null;
create index shift_assignments_day on public.shift_assignments(branch_id, work_date) where cancelled_at is null;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  shift_id uuid references public.work_shifts(id) on delete restrict,
  work_date date not null,
  status text not null default 'WORKED' check (status in ('WORKED','LEAVE_PAID','LEAVE_UNPAID','ABSENT')),
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  clock_in_lat numeric(9,6), clock_in_lng numeric(9,6),
  clock_out_lat numeric(9,6), clock_out_lng numeric(9,6),
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  early_minutes integer not null default 0 check (early_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  source text not null check (source in ('WORKER','OFFICE')),
  note text check (char_length(note) <= 300),
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (clock_out_at is null or clock_in_at is not null and clock_out_at >= clock_in_at),
  check (status = 'WORKED' or (clock_in_at is null and clock_out_at is null))
);
create unique index attendance_records_one on public.attendance_records(employee_id, work_date, coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index attendance_records_branch_day on public.attendance_records(branch_id, work_date);

create table public.attendance_periods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  closed_by uuid not null references auth.users(id) on delete restrict,
  closed_at timestamptz not null default now(),
  reopened_by uuid references auth.users(id) on delete restrict,
  reopened_at timestamptz,
  reopen_reason text check (char_length(reopen_reason) <= 300)
);
create index attendance_periods_branch on public.attendance_periods(branch_id, period_start) where reopened_at is null;

alter table public.attendance_settings enable row level security;
alter table public.work_shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_periods enable row level security;
create policy attendance_settings_read on public.attendance_settings for select to authenticated using (private.has_branch_access(branch_id));
create policy work_shifts_read on public.work_shifts for select to authenticated using (private.has_branch_access(branch_id));
create policy shift_assignments_read on public.shift_assignments for select to authenticated
  using (private.has_permission(branch_id, 'attendance.read') or employee_id = private.current_employee_id());
create policy attendance_records_read on public.attendance_records for select to authenticated
  using (private.has_permission(branch_id, 'attendance.read') or employee_id = private.current_employee_id());
create policy attendance_periods_read on public.attendance_periods for select to authenticated using (private.has_branch_access(branch_id));
revoke all on public.attendance_settings, public.work_shifts, public.shift_assignments, public.attendance_records, public.attendance_periods from anon, public;
grant select on public.attendance_settings, public.work_shifts, public.shift_assignments, public.attendance_records, public.attendance_periods to authenticated;

-- The branch's settings, defaults when none were saved.
create or replace function private.attendance_settings_of(target_branch_id uuid) returns public.attendance_settings
language sql stable security definer set search_path='' as $function$
  select coalesce((select s from public.attendance_settings s where s.branch_id = target_branch_id),
    row(target_branch_id, 10, 60, 26, false, 0, null, now())::public.attendance_settings)
$function$;
revoke all on function private.attendance_settings_of(uuid) from public, anon, authenticated, service_role;

-- Start and end of a shift on a day, in Vietnam time; a shift ending at or before its start ends the next day.
create or replace function private.shift_bounds(target_shift public.work_shifts, day date, out starts_at timestamptz, out ends_at timestamptz)
language sql immutable set search_path='' as $function$
  select (day + target_shift.start_time) at time zone 'Asia/Ho_Chi_Minh',
    (day + target_shift.end_time + case when target_shift.end_time <= target_shift.start_time then interval '1 day' else interval '0' end) at time zone 'Asia/Ho_Chi_Minh'
$function$;

-- Worked, late, early and overtime minutes of a record (late counts from the shift start once past the grace minutes).
create or replace function private.attendance_minutes(rec public.attendance_records, target_shift public.work_shifts, grace integer,
  out worked integer, out late integer, out early integer, out overtime integer)
language plpgsql stable set search_path='' as $function$
declare b record;
begin
  worked := 0; late := 0; early := 0; overtime := 0;
  if rec.status <> 'WORKED' or rec.clock_in_at is null then return; end if;
  if rec.clock_out_at is not null then
    worked := greatest(0, floor(extract(epoch from rec.clock_out_at - rec.clock_in_at) / 60)::integer - coalesce(target_shift.break_minutes, 0));
  end if;
  if target_shift.id is null then return; end if;
  select * into b from private.shift_bounds(target_shift, rec.work_date);
  if rec.clock_in_at > b.starts_at + make_interval(mins => grace) then
    late := floor(extract(epoch from rec.clock_in_at - b.starts_at) / 60)::integer;
  end if;
  if rec.clock_out_at is not null then
    early := greatest(0, floor(extract(epoch from b.ends_at - rec.clock_out_at) / 60)::integer);
    overtime := greatest(0, floor(extract(epoch from rec.clock_out_at - b.ends_at) / 60)::integer);
  end if;
end $function$;

revoke all on function private.shift_bounds(public.work_shifts, date), private.attendance_minutes(public.attendance_records, public.work_shifts, integer) from public, anon, authenticated, service_role;

-- A day inside a closed period cannot change until the period is reopened.
create or replace function private.attendance_day_locked(target_branch_id uuid, day date) returns boolean
language sql stable security definer set search_path='' as $function$
  select exists (select 1 from public.attendance_periods p where p.branch_id = target_branch_id and p.reopened_at is null
    and day between p.period_start and p.period_end)
$function$;
revoke all on function private.attendance_day_locked(uuid, date) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
