-- D96 (N1): "Chốt chấm công" refuses a period with shifts clocked in and never out, says how many, and closes once they are fixed.
insert into public.attendance_records(id, branch_id, employee_id, work_date, status, clock_in_at, clock_out_at, source, created_by) values
  ('7f375000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', '2026-10-30',
   'WORKED', '2026-10-30 00:00:00+00', '2026-10-30 09:00:00+00', 'WORKER', '10000000-0000-4000-8000-000000000001'),
  ('7f375000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', '2026-10-31',
   'WORKED', '2026-10-31 00:00:00+00', null, 'WORKER', '10000000-0000-4000-8000-000000000001'),
  ('7f375000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000003', '2026-10-31',
   'WORKED', '2026-10-31 01:00:00+00', null, 'WORKER', '10000000-0000-4000-8000-000000000001'),
  -- Another branch's open shift does not count.
  ('7f375000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000002', '2026-10-31',
   'WORKED', '2026-10-31 01:00:00+00', null, 'WORKER', '10000000-0000-4000-8000-000000000002'),
  -- Outside the period.
  ('7f375000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', '2026-11-01',
   'WORKED', '2026-11-01 00:00:00+00', null, 'WORKER', '10000000-0000-4000-8000-000000000001');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  failed text; period uuid;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin perform public.close_attendance_period(branch, '2026-10-01', '2026-10-31', '7f375000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlerrm || ':' || sqlstate; end;
  assert failed = 'attendance_period_open_shifts:2:55000', format('two open shifts refuse the close, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.attendance_periods where branch_id = branch), 'nothing locked';

  update public.attendance_records set clock_out_at = clock_in_at + interval '8 hours'
    where id in ('7f375000-0000-4000-8000-000000000002', '7f375000-0000-4000-8000-000000000003');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  period := public.close_attendance_period(branch, '2026-10-01', '2026-10-31', '7f375000-0000-4000-8000-0000000000a2');
  perform pg_temp.act_as_admin();
  assert (select period_end from public.attendance_periods where id = period) = date '2026-10-31', 'closed once fixed';
end
$test$;
