-- FB12 (D34a): chấm công commands. Workers clock in / out on the worker portal (their own shift of today, or an unscheduled
-- day when nothing is scheduled); the office keeps shifts and schedules, records or corrects a day ("chấm hộ", leave), and
-- closes a period, which locks its days for payroll. Every command is idempotent on its operation id.
begin;

create or replace function private.attendance_receipt(op uuid, command text, payload jsonb, out replay uuid, out hash text)
language plpgsql security definer set search_path='' as $function$
declare receipt public.command_receipts%rowtype;
begin
  if op is null or auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  hash := private.command_payload_hash(payload);
  perform pg_advisory_xact_lock(hashtextextended(command || ':' || op::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = op;
  if found then
    if receipt.command_name <> command or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode='23505'; end if;
    replay := receipt.result_entity_id;
  end if;
end $function$;
revoke all on function private.attendance_receipt(uuid, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.save_attendance_settings(target_branch_id uuid, settings jsonb, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record;
begin
  if not private.has_permission(target_branch_id, 'attendance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_attendance_settings.operation_id, 'save_attendance_settings', jsonb_build_array(target_branch_id, settings));
  if r.replay is not null then return r.replay; end if;
  insert into public.attendance_settings(branch_id, late_grace_minutes, early_clock_in_minutes, standard_work_days, require_location, updated_by)
  values (target_branch_id, coalesce((settings->>'late_grace_minutes')::integer, 10), coalesce((settings->>'early_clock_in_minutes')::integer, 60),
    coalesce((settings->>'standard_work_days')::numeric, 26), coalesce((settings->>'require_location')::boolean, false), auth.uid())
  on conflict (branch_id) do update set late_grace_minutes = excluded.late_grace_minutes, early_clock_in_minutes = excluded.early_clock_in_minutes,
    standard_work_days = excluded.standard_work_days, require_location = excluded.require_location, version = public.attendance_settings.version + 1,
    updated_by = auth.uid(), updated_at = now();
  insert into public.command_receipts values (save_attendance_settings.operation_id, auth.uid(), 'save_attendance_settings', r.hash, 'branch', target_branch_id, now());
  return target_branch_id;
end $function$;

create or replace function public.save_work_shift(target_branch_id uuid, target_shift_id uuid, shift_code text, shift_name text,
  starts time, ends time, break_minutes integer, is_active boolean, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; shift_id uuid;
begin
  if not private.has_permission(target_branch_id, 'attendance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_work_shift.operation_id, 'save_work_shift',
    jsonb_build_array(target_branch_id, target_shift_id, shift_code, shift_name, starts, ends, break_minutes, is_active));
  if r.replay is not null then return r.replay; end if;
  if starts is null or ends is null or starts = ends then raise exception 'invalid_shift_time' using errcode='22023'; end if;
  if target_shift_id is null then
    insert into public.work_shifts(branch_id, code, name, start_time, end_time, break_minutes, active, created_by)
    values (target_branch_id, upper(trim(shift_code)), trim(shift_name), starts, ends, coalesce(break_minutes, 0), coalesce(is_active, true), auth.uid())
    returning id into shift_id;
  else
    update public.work_shifts set code = upper(trim(shift_code)), name = trim(shift_name), start_time = starts, end_time = ends,
      break_minutes = coalesce(save_work_shift.break_minutes, 0), active = coalesce(is_active, true), version = version + 1
    where id = target_shift_id and branch_id = target_branch_id returning id into shift_id;
    if shift_id is null then raise exception 'shift_not_found' using errcode='P0002'; end if;
  end if;
  insert into public.command_receipts values (save_work_shift.operation_id, auth.uid(), 'save_work_shift', r.hash, 'work_shift', shift_id, now());
  return shift_id;
end $function$;

-- Xếp lịch: these people on this shift on the chosen weekdays (1 = Monday … 7 = Sunday) between two dates; days already
-- scheduled are kept. Returns how many were added.
create or replace function public.schedule_shifts(target_branch_id uuid, employee_ids uuid[], target_shift_id uuid, from_date date, to_date date,
  weekdays integer[], operation_id uuid) returns integer
language plpgsql security definer set search_path='' as $function$
declare r record; added integer := 0; n integer;
begin
  if not private.has_permission(target_branch_id, 'attendance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(schedule_shifts.operation_id, 'schedule_shifts',
    jsonb_build_array(target_branch_id, employee_ids, target_shift_id, from_date, to_date, weekdays));
  -- A retry adds nothing more.
  if r.replay is not null then return 0; end if;
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 92 or coalesce(cardinality(employee_ids), 0) = 0
    or not exists (select 1 from public.work_shifts s where s.id = target_shift_id and s.branch_id = target_branch_id and s.active) then
    raise exception 'invalid_schedule' using errcode='22023'; end if;
  if exists (select 1 from unnest(employee_ids) e where not exists (select 1 from public.employee_branch_access a join public.employees x on x.id = a.employee_id
      where a.employee_id = e and a.branch_id = target_branch_id and a.active and x.active)) then
    raise exception 'employee_not_in_branch' using errcode='22023'; end if;
  insert into public.shift_assignments(branch_id, employee_id, shift_id, work_date, created_by)
  select target_branch_id, e, target_shift_id, d::date, auth.uid()
  from unnest(employee_ids) e cross join generate_series(from_date, to_date, interval '1 day') d
  where extract(isodow from d)::integer = any(coalesce(weekdays, array[1,2,3,4,5,6,7]))
  on conflict do nothing;
  get diagnostics n = row_count; added := n;
  insert into public.command_receipts values (schedule_shifts.operation_id, auth.uid(), 'schedule_shifts', r.hash, 'work_shift', target_shift_id, now());
  return added;
end $function$;

create or replace function public.cancel_shift_assignment(target_assignment_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare a public.shift_assignments%rowtype;
begin
  select * into a from public.shift_assignments where id = target_assignment_id for update;
  if a.id is null or not private.has_permission(a.branch_id, 'attendance.manage') or operation_id is null then raise exception 'forbidden' using errcode='42501'; end if;
  if a.cancelled_at is not null then return a.id; end if;
  if private.attendance_day_locked(a.branch_id, a.work_date) then raise exception 'attendance_period_closed' using errcode='55000'; end if;
  update public.shift_assignments set cancelled_at = now(), cancelled_by = auth.uid() where id = a.id;
  return a.id;
end $function$;

-- Vào ca / Ra ca on the worker portal. IN takes the person's shift of today whose window is open (from "early" minutes before
-- its start to its end), or an unscheduled day; OUT closes the open record. A second tap returns the same record.
create or replace function public.clock_attendance(target_branch_id uuid, kind text, lat numeric, lng numeric, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare me uuid := private.current_employee_id(); r record; s public.attendance_settings; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  shift public.work_shifts%rowtype; rec public.attendance_records%rowtype; m record; b record;
begin
  if me is null or kind not in ('IN','OUT') or not exists (select 1 from public.employee_branch_access a where a.employee_id = me
      and a.branch_id = target_branch_id and a.active) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(clock_attendance.operation_id, 'clock_attendance', jsonb_build_array(target_branch_id, kind, lat, lng));
  if r.replay is not null then return r.replay; end if;
  s := private.attendance_settings_of(target_branch_id);
  if s.require_location and (lat is null or lng is null) then raise exception 'attendance_location_required' using errcode='22023'; end if;
  if kind = 'IN' then
    select * into rec from public.attendance_records x where x.employee_id = me and x.clock_in_at is not null and x.clock_out_at is null
      and x.clock_in_at > now() - interval '20 hours' order by x.clock_in_at desc limit 1;
    if rec.id is not null then raise exception 'attendance_already_in' using errcode='23505'; end if;
    select w.* into shift from public.shift_assignments a join public.work_shifts w on w.id = a.shift_id
      cross join lateral private.shift_bounds(w, a.work_date) bd
      where a.employee_id = me and a.branch_id = target_branch_id and a.cancelled_at is null and a.work_date between today - 1 and today
        and now() between bd.starts_at - make_interval(mins => s.early_clock_in_minutes) and bd.ends_at
        and not exists (select 1 from public.attendance_records x where x.employee_id = me and x.work_date = a.work_date and x.shift_id = w.id)
      order by bd.starts_at limit 1;
    if private.attendance_day_locked(target_branch_id, today) then raise exception 'attendance_period_closed' using errcode='55000'; end if;
    insert into public.attendance_records(branch_id, employee_id, shift_id, work_date, clock_in_at, clock_in_lat, clock_in_lng, source, created_by)
    values (target_branch_id, me, shift.id,
      case when shift.id is null then today else (select a.work_date from public.shift_assignments a where a.employee_id = me and a.shift_id = shift.id
        and a.cancelled_at is null and a.work_date between today - 1 and today order by a.work_date desc limit 1) end,
      now(), lat, lng, 'WORKER', auth.uid())
    on conflict do nothing returning * into rec;
    if rec.id is null then raise exception 'attendance_already_recorded' using errcode='23505'; end if;
  else
    select * into rec from public.attendance_records x where x.employee_id = me and x.branch_id = target_branch_id and x.clock_in_at is not null
      and x.clock_out_at is null order by x.clock_in_at desc limit 1 for update;
    if rec.id is null then raise exception 'attendance_not_in' using errcode='P0002'; end if;
    if private.attendance_day_locked(target_branch_id, rec.work_date) then raise exception 'attendance_period_closed' using errcode='55000'; end if;
    update public.attendance_records set clock_out_at = now(), clock_out_lat = lat, clock_out_lng = lng, version = version + 1, updated_by = auth.uid(), updated_at = now()
      where id = rec.id returning * into rec;
  end if;
  select * into shift from public.work_shifts w where w.id = rec.shift_id;
  select * into m from private.attendance_minutes(rec, shift, s.late_grace_minutes);
  update public.attendance_records set worked_minutes = m.worked, late_minutes = m.late, early_minutes = m.early, overtime_minutes = m.overtime where id = rec.id;
  insert into public.command_receipts values (clock_attendance.operation_id, auth.uid(), 'clock_attendance', r.hash, 'attendance_record', rec.id, now());
  return rec.id;
end $function$;

-- The office records or corrects a day: hours worked ("chấm hộ"), or a leave / absence. One record per person, day and shift.
create or replace function public.save_attendance(target_branch_id uuid, target_employee_id uuid, day date, target_shift_id uuid, day_status text,
  clock_in timestamptz, clock_out timestamptz, day_note text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; s public.attendance_settings; shift public.work_shifts%rowtype; rec public.attendance_records%rowtype; m record;
begin
  if not private.has_permission(target_branch_id, 'attendance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_attendance.operation_id, 'save_attendance',
    jsonb_build_array(target_branch_id, target_employee_id, day, target_shift_id, day_status, clock_in, clock_out, day_note));
  if r.replay is not null then return r.replay; end if;
  if day is null or day_status not in ('WORKED','LEAVE_PAID','LEAVE_UNPAID','ABSENT')
    or (day_status = 'WORKED' and (clock_in is null or (clock_out is not null and clock_out < clock_in)))
    or not exists (select 1 from public.employee_branch_access a where a.employee_id = target_employee_id and a.branch_id = target_branch_id) then
    raise exception 'invalid_attendance' using errcode='22023'; end if;
  if target_shift_id is not null then
    select * into shift from public.work_shifts w where w.id = target_shift_id and w.branch_id = target_branch_id;
    if shift.id is null then raise exception 'invalid_attendance' using errcode='22023'; end if;
  end if;
  if private.attendance_day_locked(target_branch_id, day) then raise exception 'attendance_period_closed' using errcode='55000'; end if;
  s := private.attendance_settings_of(target_branch_id);
  insert into public.attendance_records(branch_id, employee_id, shift_id, work_date, status, clock_in_at, clock_out_at, source, note, created_by, updated_by)
  values (target_branch_id, target_employee_id, target_shift_id, day, day_status,
    case when day_status = 'WORKED' then clock_in end, case when day_status = 'WORKED' then clock_out end, 'OFFICE', nullif(trim(day_note), ''), auth.uid(), auth.uid())
  on conflict (employee_id, work_date, coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set status = excluded.status,
    clock_in_at = excluded.clock_in_at, clock_out_at = excluded.clock_out_at, source = 'OFFICE', note = excluded.note,
    version = public.attendance_records.version + 1, updated_by = auth.uid(), updated_at = now()
  returning * into rec;
  select * into m from private.attendance_minutes(rec, shift, s.late_grace_minutes);
  update public.attendance_records set worked_minutes = m.worked, late_minutes = m.late, early_minutes = m.early, overtime_minutes = m.overtime where id = rec.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), target_branch_id, 'attendance.saved', 'attendance_record', rec.id, save_attendance.operation_id, array['status','clock_in_at','clock_out_at'], nullif(trim(day_note), ''));
  insert into public.command_receipts values (save_attendance.operation_id, auth.uid(), 'save_attendance', r.hash, 'attendance_record', rec.id, now());
  return rec.id;
end $function$;

-- Chốt chấm công: the period's days are locked for payroll. Reopening needs a reason and is kept in the history.
create or replace function public.close_attendance_period(target_branch_id uuid, from_date date, to_date date, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; period_id uuid;
begin
  if not private.has_permission(target_branch_id, 'attendance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(close_attendance_period.operation_id, 'close_attendance_period', jsonb_build_array(target_branch_id, from_date, to_date));
  if r.replay is not null then return r.replay; end if;
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 62 then raise exception 'invalid_period' using errcode='22023'; end if;
  if exists (select 1 from public.attendance_periods p where p.branch_id = target_branch_id and p.reopened_at is null
      and daterange(p.period_start, p.period_end, '[]') && daterange(from_date, to_date, '[]')) then
    raise exception 'attendance_period_overlaps' using errcode='23505'; end if;
  insert into public.attendance_periods(branch_id, period_start, period_end, closed_by) values (target_branch_id, from_date, to_date, auth.uid()) returning id into period_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), target_branch_id, 'attendance.period_closed', 'attendance_period', period_id, close_attendance_period.operation_id, array['locked']);
  insert into public.command_receipts values (close_attendance_period.operation_id, auth.uid(), 'close_attendance_period', r.hash, 'attendance_period', period_id, now());
  return period_id;
end $function$;

create or replace function public.reopen_attendance_period(target_period_id uuid, reason text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare p public.attendance_periods%rowtype;
begin
  select * into p from public.attendance_periods where id = target_period_id for update;
  if p.id is null or not private.has_permission(p.branch_id, 'attendance.manage') or operation_id is null then raise exception 'forbidden' using errcode='42501'; end if;
  if char_length(trim(coalesce(reason, ''))) < 3 then raise exception 'reason_required' using errcode='22023'; end if;
  if p.reopened_at is not null then return p.id; end if;
  update public.attendance_periods set reopened_at = now(), reopened_by = auth.uid(), reopen_reason = trim(reason) where id = p.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), p.branch_id, 'attendance.period_reopened', 'attendance_period', p.id, operation_id, array['locked'], trim(reason));
  return p.id;
end $function$;

revoke all on function public.save_attendance_settings(uuid, jsonb, uuid), public.save_work_shift(uuid, uuid, text, text, time, time, integer, boolean, uuid),
  public.schedule_shifts(uuid, uuid[], uuid, date, date, integer[], uuid), public.cancel_shift_assignment(uuid, uuid),
  public.clock_attendance(uuid, text, numeric, numeric, uuid), public.save_attendance(uuid, uuid, date, uuid, text, timestamptz, timestamptz, text, uuid),
  public.close_attendance_period(uuid, date, date, uuid), public.reopen_attendance_period(uuid, text, uuid) from public, anon;
grant execute on function public.save_attendance_settings(uuid, jsonb, uuid), public.save_work_shift(uuid, uuid, text, text, time, time, integer, boolean, uuid),
  public.schedule_shifts(uuid, uuid[], uuid, date, date, integer[], uuid), public.cancel_shift_assignment(uuid, uuid),
  public.clock_attendance(uuid, text, numeric, numeric, uuid), public.save_attendance(uuid, uuid, date, uuid, text, timestamptz, timestamptz, text, uuid),
  public.close_attendance_period(uuid, date, date, uuid), public.reopen_attendance_period(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
