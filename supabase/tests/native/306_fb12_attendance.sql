-- FB12 (D34a): ca làm việc, xếp lịch, thợ bấm vào / ra ca (đi muộn, về sớm), văn phòng chấm hộ / nghỉ phép, chốt kỳ.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  worker constant uuid := '30000000-0000-4000-8000-000000000003';
  local_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  shift_start timestamp := date_trunc('minute', local_now - interval '30 minutes');
  shift uuid; rec uuid; again uuid; added integer; failed text; period uuid; r public.attendance_records%rowtype;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_work_shift(branch, null, 'S1', 'Ca thử', '07:00', '11:00', 0, true, gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a reader cannot manage shifts';

  -- A shift that started 30 minutes ago and lasts 4 hours.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  shift := public.save_work_shift(branch, null, 'S1', 'Ca thử', shift_start::time, (shift_start + interval '4 hours')::time, 0, true, '7f306000-0000-4000-8000-000000000001');
  added := public.schedule_shifts(branch, array[worker], shift, shift_start::date, shift_start::date + 6, null, '7f306000-0000-4000-8000-000000000002');
  assert added = 7, format('a week scheduled, got %s', added);
  assert public.schedule_shifts(branch, array[worker], shift, shift_start::date, shift_start::date + 6, null, '7f306000-0000-4000-8000-000000000002') = 0, 'replay adds nothing';
  assert public.schedule_shifts(branch, array[worker], shift, shift_start::date, shift_start::date + 6, null, gen_random_uuid()) = 0, 'days already scheduled kept';

  -- The worker clocks in 30 minutes after the start: late (grace 10 minutes).
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  rec := public.clock_attendance(branch, 'IN', 10.762622, 106.660172, '7f306000-0000-4000-8000-000000000003');
  assert public.clock_attendance(branch, 'IN', 10.762622, 106.660172, '7f306000-0000-4000-8000-000000000003') = rec, 'replay returns the record';
  failed := null;
  begin perform public.clock_attendance(branch, 'IN', null, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'attendance_already_in', format('one open record, got %s', failed);
  select * into r from public.attendance_records where id = rec;
  assert r.shift_id = shift and r.work_date = shift_start::date and r.source = 'WORKER' and r.late_minutes between 29 and 31, format('late %s', row_to_json(r));
  again := public.clock_attendance(branch, 'OUT', null, null, '7f306000-0000-4000-8000-000000000004');
  assert again = rec, 'out closes the same record';
  select * into r from public.attendance_records where id = rec;
  assert r.clock_out_at is not null and r.early_minutes between 209 and 211 and r.overtime_minutes = 0, format('left early %s', row_to_json(r));
  -- The worker sees their own record but cannot change anyone's.
  assert (select count(*) from public.attendance_records where employee_id = worker) = 1, 'own record visible';
  failed := null;
  begin perform public.save_attendance(branch, worker, shift_start::date + 1, shift, 'LEAVE_PAID', null, null, null, gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'worker cannot record for the office';

  -- The office records a paid leave tomorrow and corrects today's hours.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_attendance(branch, worker, shift_start::date + 1, shift, 'LEAVE_PAID', null, null, 'Nghỉ phép', gen_random_uuid());
  perform public.save_attendance(branch, worker, shift_start::date, shift, 'WORKED', (shift_start at time zone 'Asia/Ho_Chi_Minh'),
    ((shift_start + interval '5 hours') at time zone 'Asia/Ho_Chi_Minh'), 'Chấm hộ', gen_random_uuid());
  select * into r from public.attendance_records where id = rec;
  assert r.source = 'OFFICE' and r.late_minutes = 0 and r.early_minutes = 0 and r.overtime_minutes = 60 and r.worked_minutes = 300,
    format('office correction recomputed %s', row_to_json(r));
  assert (select status from public.attendance_records where employee_id = worker and work_date = shift_start::date + 1) = 'LEAVE_PAID', 'leave kept';

  -- Closing the week locks its days until reopened with a reason.
  period := public.close_attendance_period(branch, shift_start::date, shift_start::date + 6, gen_random_uuid());
  failed := null;
  begin perform public.save_attendance(branch, worker, shift_start::date + 2, shift, 'ABSENT', null, null, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'attendance_period_closed', format('locked, got %s', failed);
  failed := null;
  begin perform public.close_attendance_period(branch, shift_start::date + 3, shift_start::date + 8, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'attendance_period_overlaps', format('no overlap, got %s', failed);
  perform public.reopen_attendance_period(period, 'Sửa ngày công', gen_random_uuid());
  perform public.save_attendance(branch, worker, shift_start::date + 2, shift, 'ABSENT', null, null, null, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.audit_events where action = 'attendance.period_reopened' and entity_id = period), 'reopen audited';
end
$test$;
