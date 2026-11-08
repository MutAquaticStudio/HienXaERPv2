-- D68: a shift the worker forgot to close ("quên Ra ca") no longer swallows days. Before, "Ra ca" always closed the newest open
-- record however old it was, so a shift opened on 01/11 and closed on 07/11 counted about 150 hours and left 07/11 without a day.
-- Now a shift open for more than 20 hours (the threshold "Vào ca" already used) is closed automatically at the end of its shift
-- (8 hours after clock-in when it has no shift), flagged with auto_closed_at, and the office corrects it on "Chấm công"
-- (saving the day clears the flag). Forward-only; a closed payroll period keeps its days untouched.
begin;

alter table public.attendance_records add column if not exists auto_closed_at timestamptz;

-- When a forgotten shift is considered to have ended.
create or replace function private.stale_close_time(rec public.attendance_records, target_shift public.work_shifts) returns timestamptz
language plpgsql stable set search_path='' as $function$
declare ends timestamptz;
begin
  if target_shift.id is not null then
    select b.ends_at into ends from private.shift_bounds(target_shift, rec.work_date) b;
    return greatest(rec.clock_in_at, ends);
  end if;
  return rec.clock_in_at + interval '8 hours';
end $function$;

-- Closes every shift of this person that has been open for more than 20 hours.
create or replace function private.close_stale_attendance(target_employee uuid, target_branch uuid, grace integer) returns integer
language plpgsql security definer set search_path='' as $function$
declare rec public.attendance_records%rowtype; shift public.work_shifts%rowtype; m record; closed integer := 0;
begin
  for rec in select * from public.attendance_records x where x.employee_id = target_employee and x.branch_id = target_branch
      and x.status = 'WORKED' and x.clock_in_at is not null and x.clock_out_at is null and x.clock_in_at <= now() - interval '20 hours'
      order by x.clock_in_at for update loop
    if private.attendance_day_locked(target_branch, rec.work_date) then continue; end if;
    select * into shift from public.work_shifts w where w.id = rec.shift_id;
    update public.attendance_records set clock_out_at = private.stale_close_time(rec, shift), auto_closed_at = now(), version = version + 1,
      updated_by = auth.uid(), updated_at = now() where id = rec.id returning * into rec;
    select * into m from private.attendance_minutes(rec, shift, grace);
    update public.attendance_records set worked_minutes = m.worked, late_minutes = m.late, early_minutes = m.early, overtime_minutes = m.overtime where id = rec.id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
      values (auth.uid(), target_branch, 'attendance.auto_closed', 'attendance_record', rec.id, gen_random_uuid(), array['clock_out_at'],
        'Quên ra ca: hệ thống tự khép ca mở quá 20 giờ');
    closed := closed + 1;
  end loop;
  return closed;
end $function$;
revoke all on function private.stale_close_time(public.attendance_records, public.work_shifts), private.close_stale_attendance(uuid, uuid, integer) from public, anon, authenticated, service_role;

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
    -- D68: a shift left open for more than 20 hours is closed first (at the end of its shift), so it never blocks or swallows the new one.
    perform private.close_stale_attendance(me, target_branch_id, s.late_grace_minutes);
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
    if rec.clock_in_at <= now() - interval '20 hours' then
      -- D68: the shift was left open for days; clocking out now must not credit the days in between. Close it at the end of its
      -- shift and flag it for the office.
      perform private.close_stale_attendance(me, target_branch_id, s.late_grace_minutes);
      select * into rec from public.attendance_records x where x.id = rec.id;
    else
      update public.attendance_records set clock_out_at = now(), clock_out_lat = lat, clock_out_lng = lng, version = version + 1, updated_by = auth.uid(), updated_at = now()
        where id = rec.id returning * into rec;
    end if;
  end if;
  select * into shift from public.work_shifts w where w.id = rec.shift_id;
  select * into m from private.attendance_minutes(rec, shift, s.late_grace_minutes);
  update public.attendance_records set worked_minutes = m.worked, late_minutes = m.late, early_minutes = m.early, overtime_minutes = m.overtime where id = rec.id;
  insert into public.command_receipts values (clock_attendance.operation_id, auth.uid(), 'clock_attendance', r.hash, 'attendance_record', rec.id, now());
  return rec.id;
end $function$;

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
    clock_in_at = excluded.clock_in_at, clock_out_at = excluded.clock_out_at, source = 'OFFICE', note = excluded.note, auto_closed_at = null,
    version = public.attendance_records.version + 1, updated_by = auth.uid(), updated_at = now()
  returning * into rec;
  select * into m from private.attendance_minutes(rec, shift, s.late_grace_minutes);
  update public.attendance_records set worked_minutes = m.worked, late_minutes = m.late, early_minutes = m.early, overtime_minutes = m.overtime where id = rec.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), target_branch_id, 'attendance.saved', 'attendance_record', rec.id, save_attendance.operation_id, array['status','clock_in_at','clock_out_at'], nullif(trim(day_note), ''));
  insert into public.command_receipts values (save_attendance.operation_id, auth.uid(), 'save_attendance', r.hash, 'attendance_record', rec.id, now());
  return rec.id;
end $function$;

notify pgrst, 'reload schema';
commit;
