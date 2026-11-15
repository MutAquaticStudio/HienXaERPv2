-- Chấm công: "Vào ca" sau nửa đêm của một ca qua đêm bắt đầu từ tối hôm trước ghi đúng ngày công của ca đó (ngày bắt đầu), tính đi
-- muộn theo ca đó. Trước đây ngày công lấy theo ngày xếp ca mới nhất (hôm nay), nên giờ vào ca bị so với ca của tối nay
-- (không tính đi muộn) và kỳ công khóa được kiểm theo hôm nay. Chỉ đổi cách chọn ngày công; còn lại giữ nguyên.
begin;

CREATE OR REPLACE FUNCTION public.clock_attendance(target_branch_id uuid, kind text, lat numeric, lng numeric, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := private.current_employee_id(); r record; s public.attendance_settings; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  shift public.work_shifts%rowtype; rec public.attendance_records%rowtype; m record; b record; shift_day date; matched uuid;
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
    -- The work day is the one of the shift window that matched (an overnight shift clocked in after midnight belongs to the day
    -- it started), not the latest day the shift is scheduled.
    select w.id, a.work_date into matched, shift_day from public.shift_assignments a join public.work_shifts w on w.id = a.shift_id
      cross join lateral private.shift_bounds(w, a.work_date) bd
      where a.employee_id = me and a.branch_id = target_branch_id and a.cancelled_at is null and a.work_date between today - 1 and today
        and now() between bd.starts_at - make_interval(mins => s.early_clock_in_minutes) and bd.ends_at
        and not exists (select 1 from public.attendance_records x where x.employee_id = me and x.work_date = a.work_date and x.shift_id = w.id)
      order by bd.starts_at limit 1;
    select * into shift from public.work_shifts w where w.id = matched;
    if private.attendance_day_locked(target_branch_id, coalesce(shift_day, today)) then raise exception 'attendance_period_closed' using errcode='55000'; end if;
    insert into public.attendance_records(branch_id, employee_id, shift_id, work_date, clock_in_at, clock_in_lat, clock_in_lng, source, created_by)
    values (target_branch_id, me, shift.id, coalesce(shift_day, today), now(), lat, lng, 'WORKER', auth.uid())
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

notify pgrst, 'reload schema';
commit;
