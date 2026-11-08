-- D68: a shift left open for more than 20 hours is closed automatically (end of its shift, or 8 hours after clock-in without one),
-- flagged for the office, never credited up to the moment the worker finally taps "Ra ca"; the office saving the day clears the flag.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  worker constant uuid := '30000000-0000-4000-8000-000000000003';
  worker_auth constant uuid := '10000000-0000-4000-8000-000000000003';
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  shift uuid; stale uuid; fresh uuid; r public.attendance_records%rowtype; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  shift := public.save_work_shift(branch, null, 'D68', 'Ca D68', '07:00', '17:00', 0, true, '7f330000-0000-4000-8000-000000000001');

  -- 1. "Vào ca" with a shift open for six days (no shift): the old one is closed at clock-in + 8 hours, flagged, then a new shift opens.
  perform pg_temp.act_as_admin();
  insert into public.attendance_records(branch_id, employee_id, work_date, status, clock_in_at, source, created_by)
    values (branch, worker, today - 6, 'WORKED', now() - interval '6 days', 'WORKER', worker_auth) returning id into stale;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  fresh := public.clock_attendance(branch, 'IN', null, null, gen_random_uuid());
  assert fresh <> stale, 'a new shift opens';
  select * into r from public.attendance_records where id = stale;
  assert r.auto_closed_at is not null and r.clock_out_at = r.clock_in_at + interval '8 hours' and r.worked_minutes = 480, format('stale closed at +8h %s', row_to_json(r));
  assert (select clock_out_at is null and auto_closed_at is null from public.attendance_records where id = fresh), 'the new shift is open and unflagged';
  assert public.clock_attendance(branch, 'OUT', null, null, gen_random_uuid()) = fresh, 'out closes the new shift';
  assert (select auto_closed_at is null and clock_out_at is not null from public.attendance_records where id = fresh), 'a normal out is not flagged';

  -- 2. "Ra ca" straight onto a shift forgotten five days ago does not credit the days in between.
  perform pg_temp.act_as_admin();
  insert into public.attendance_records(branch_id, employee_id, work_date, status, clock_in_at, source, created_by)
    values (branch, worker, today - 5, 'WORKED', now() - interval '5 days', 'WORKER', worker_auth) returning id into stale;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert public.clock_attendance(branch, 'OUT', null, null, gen_random_uuid()) = stale, 'out returns the forgotten record';
  select * into r from public.attendance_records where id = stale;
  assert r.auto_closed_at is not null and r.clock_out_at = r.clock_in_at + interval '8 hours' and r.worked_minutes = 480, format('not credited %s', row_to_json(r));

  -- 3. A forgotten shift that has a shift is closed at that shift's end.
  perform pg_temp.act_as_admin();
  insert into public.attendance_records(branch_id, employee_id, shift_id, work_date, status, clock_in_at, source, created_by)
    values (branch, worker, shift, today - 3, 'WORKED', ((today - 3) + time '07:05') at time zone 'Asia/Ho_Chi_Minh', 'WORKER', worker_auth) returning id into stale;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  perform public.clock_attendance(branch, 'OUT', null, null, gen_random_uuid());
  select * into r from public.attendance_records where id = stale;
  assert r.clock_out_at = ((today - 3) + time '17:00') at time zone 'Asia/Ho_Chi_Minh' and r.worked_minutes = 595 and r.auto_closed_at is not null, format('closed at shift end %s', row_to_json(r));
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.audit_events where action = 'attendance.auto_closed' and entity_id = stale), 'the automatic close is audited';

  -- 4. The office checks the day and saves it: the flag goes away.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_attendance(branch, worker, today - 3, shift, 'WORKED', ((today - 3) + time '07:05') at time zone 'Asia/Ho_Chi_Minh',
    ((today - 3) + time '12:00') at time zone 'Asia/Ho_Chi_Minh', 'Chỉ làm nửa ngày', gen_random_uuid());
  select * into r from public.attendance_records where id = stale;
  assert r.auto_closed_at is null and r.source = 'OFFICE' and r.worked_minutes = 295, format('office save clears the flag %s', row_to_json(r));

  -- 5. A shift open for a few hours still blocks a second "Vào ca".
  perform pg_temp.act_as_admin();
  insert into public.attendance_records(branch_id, employee_id, work_date, status, clock_in_at, source, created_by)
    values (branch, worker, today - 1, 'WORKED', now() - interval '2 hours', 'WORKER', worker_auth);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.clock_attendance(branch, 'IN', null, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'attendance_already_in', format('recent open shift still blocks, got %s', failed);
  assert (select count(*) from public.attendance_records where employee_id = worker and auto_closed_at is not null) = 2, 'only the forgotten shifts that nobody has checked are flagged';
end
$test$;
