-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý", audit N1): "Chốt chấm công" (public.close_attendance_period,
-- latest body 20261029110100) refuses a period that still has a shift clocked in and never clocked out
-- (`attendance_period_open_shifts:<số ca>`): once locked, D68's automatic closing skips the day and it would count 0 minutes.
-- The office closes or corrects those shifts on "Chấm công" first. Nothing is closed automatically here.
begin;

create or replace function public.close_attendance_period(target_branch_id uuid, from_date date, to_date date, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; period_id uuid; open_shifts integer;
begin
  if not private.has_permission(target_branch_id, 'attendance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(close_attendance_period.operation_id, 'close_attendance_period', jsonb_build_array(target_branch_id, from_date, to_date));
  if r.replay is not null then return r.replay; end if;
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 62 then raise exception 'invalid_period' using errcode='22023'; end if;
  if exists (select 1 from public.attendance_periods p where p.branch_id = target_branch_id and p.reopened_at is null
      and daterange(p.period_start, p.period_end, '[]') && daterange(from_date, to_date, '[]')) then
    raise exception 'attendance_period_overlaps' using errcode='23505'; end if;
  -- D96 (N1): a shift still open (clocked in, never out) would be locked at 0 minutes; the office corrects it first.
  select count(*) into open_shifts from public.attendance_records x where x.branch_id = target_branch_id
    and x.work_date between from_date and to_date and x.clock_in_at is not null and x.clock_out_at is null;
  if open_shifts > 0 then raise exception 'attendance_period_open_shifts:%', open_shifts using errcode='55000'; end if;
  insert into public.attendance_periods(branch_id, period_start, period_end, closed_by) values (target_branch_id, from_date, to_date, auth.uid()) returning id into period_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), target_branch_id, 'attendance.period_closed', 'attendance_period', period_id, close_attendance_period.operation_id, array['locked']);
  insert into public.command_receipts values (close_attendance_period.operation_id, auth.uid(), 'close_attendance_period', r.hash, 'attendance_period', period_id, now());
  return period_id;
end $function$;

notify pgrst, 'reload schema';
commit;
