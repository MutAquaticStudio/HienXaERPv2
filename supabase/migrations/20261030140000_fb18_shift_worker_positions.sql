-- FB18 (D40): the office sees where workers are during their shift. While a worker is clocked in (Vào ca → Ra ca) and has
-- the worker portal open, the phone sends its position about every 15 s; outside a shift nothing is accepted. Positions are
-- telemetry only (SPEC-GPS-001): they never change a delivery, attendance or payroll.
begin;

create table public.worker_positions (
  id bigint generated always as identity primary key,
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  attendance_record_id uuid not null references public.attendance_records(id) on delete restrict,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8,1) check (accuracy_meters is null or accuracy_meters between 0 and 100000),
  captured_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index worker_positions_employee_time on public.worker_positions(employee_id, received_at desc);
create index worker_positions_record on public.worker_positions(attendance_record_id, captured_at);
alter table public.worker_positions enable row level security;
revoke all on public.worker_positions from public, anon, authenticated;

-- The worker's open attendance record (clocked in, not out, within 20 h — the same rule as clock_attendance).
create or replace function private.open_attendance_record(target_employee_id uuid)
returns public.attendance_records language sql stable security definer set search_path = '' as $$
  select x.* from public.attendance_records x
  where x.employee_id = target_employee_id and x.clock_in_at is not null and x.clock_out_at is null and x.clock_in_at > now() - interval '20 hours'
  order by x.clock_in_at desc limit 1
$$;
revoke all on function private.open_attendance_record(uuid) from public, anon, authenticated;

-- Worker phone → one position. Returns false when the point is skipped (too soon after the last one, or too old).
create or replace function public.record_worker_position(lat numeric, lng numeric, accuracy numeric, captured timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.current_employee_id();
  rec public.attendance_records%rowtype;
  at timestamptz := least(coalesce(captured, now()), now());
begin
  if me is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180
    or (accuracy is not null and accuracy not between 0 and 100000) then
    raise exception 'invalid_position' using errcode = '22023';
  end if;
  rec := private.open_attendance_record(me);
  if rec.id is null or not exists (select 1 from public.employee_branch_access a where a.employee_id = me and a.branch_id = rec.branch_id and a.active) then
    raise exception 'worker_not_on_shift' using errcode = '55000';
  end if;
  if at < now() - interval '2 minutes' or at < rec.clock_in_at then return false; end if;
  if exists (select 1 from public.worker_positions p where p.employee_id = me and p.received_at > now() - interval '10 seconds') then return false; end if;
  insert into public.worker_positions(branch_id, employee_id, attendance_record_id, latitude, longitude, accuracy_meters, captured_at)
  values (rec.branch_id, me, rec.id, round(lat, 6), round(lng, 6), round(accuracy, 1), at);
  return true;
end $$;

-- Office map: the latest position of every worker on shift in the branch, with the delivery they are on (if any).
create or replace function public.worker_positions_snapshot(target_branch_id uuid)
returns table(employee_id uuid, employee_name text, latitude numeric, longitude numeric, accuracy_meters numeric,
  captured_at timestamptz, received_at timestamptz, is_stale boolean, clock_in_at timestamptz, delivery_number text, plate_number text)
language plpgsql stable security definer set search_path = '' as $$
declare stale_seconds integer;
begin
  if not private.has_permission(target_branch_id, 'delivery.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.gps_stale_after_seconds into stale_seconds from public.routing_settings s where s.branch_id = target_branch_id;
  stale_seconds := coalesce(stale_seconds, 300);
  return query
  select e.id, e.display_name, p.latitude, p.longitude, p.accuracy_meters, p.captured_at, p.received_at,
    p.received_at < now() - make_interval(secs => stale_seconds), r.clock_in_at, job.delivery_number, job.plate_number
  from public.attendance_records r
  join public.employees e on e.id = r.employee_id
  join lateral (select wp.latitude, wp.longitude, wp.accuracy_meters, wp.captured_at, wp.received_at from public.worker_positions wp
    where wp.attendance_record_id = r.id order by wp.received_at desc limit 1) p on true
  left join lateral (select d.delivery_number, v.plate_number from public.delivery_assignments a
    join public.deliveries d on d.id = a.delivery_id and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED')
    left join public.vehicles v on v.id = a.vehicle_id
    where a.employee_id = r.employee_id and a.superseded_at is null order by d.scheduled_at nulls last limit 1) job on true
  where r.branch_id = target_branch_id and r.clock_in_at is not null and r.clock_out_at is null and r.clock_in_at > now() - interval '20 hours'
  order by e.display_name;
end $$;

-- Office map: the path of one worker during the current shift (newest 300 points, oldest first).
create or replace function public.worker_position_trail(target_branch_id uuid, target_employee_id uuid)
returns table(latitude numeric, longitude numeric, captured_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare rec public.attendance_records%rowtype;
begin
  if not private.has_permission(target_branch_id, 'delivery.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  rec := private.open_attendance_record(target_employee_id);
  if rec.id is null or rec.branch_id <> target_branch_id then return; end if;
  return query
  select t.latitude, t.longitude, t.captured_at from (
    select wp.latitude, wp.longitude, wp.captured_at from public.worker_positions wp
    where wp.attendance_record_id = rec.id order by wp.captured_at desc limit 300) t
  order by t.captured_at;
end $$;

revoke all on function public.record_worker_position(numeric, numeric, numeric, timestamptz), public.worker_positions_snapshot(uuid),
  public.worker_position_trail(uuid, uuid) from public, anon;
grant execute on function public.record_worker_position(numeric, numeric, numeric, timestamptz), public.worker_positions_snapshot(uuid),
  public.worker_position_trail(uuid, uuid) to authenticated;

commit;
