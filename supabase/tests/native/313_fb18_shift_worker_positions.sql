-- FB18 (D40): a worker's position is accepted only during their shift; the office (delivery.read) sees the latest point and
-- the trail of the shift; people without the right and other branches see nothing.
do $test$
declare
  failed text;
  rec uuid;
begin
  -- Not clocked in: nothing is stored.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.record_worker_position(10.8, 106.7, 12, now()); exception when others then failed := sqlerrm; end;
  assert failed = 'worker_not_on_shift', 'off shift is refused: ' || coalesce(failed, 'accepted');

  perform pg_temp.act_as_admin();
  insert into public.attendance_records(branch_id, employee_id, work_date, clock_in_at, source, created_by)
  values ('20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000003', current_date, now() - interval '1 hour', 'WORKER',
    '10000000-0000-4000-8000-000000000003') returning id into rec;

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.record_worker_position(95, 106.7, 12, now()); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_position', 'latitude range';
  assert public.record_worker_position(10.8231, 106.6297, 12, now() + interval '1 hour'), 'first point stored (future time clamped)';
  assert not public.record_worker_position(10.8232, 106.6298, 12, now()), 'second point within 10 s is skipped';
  assert not public.record_worker_position(10.8232, 106.6298, 12, now() - interval '10 minutes'), 'old point is skipped';
  failed := null;
  begin perform count(*) from public.worker_positions; exception when others then failed := sqlerrm; end;
  assert failed like 'permission denied%', 'table is not readable directly';

  -- Office in branch A sees the worker; the trail has the point.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert (select count(*) = 1 and bool_and(employee_name = 'Nhân viên thử 3' and latitude = 10.823100 and not is_stale)
    from public.worker_positions_snapshot('20000000-0000-4000-8000-00000000000a')), 'office sees the worker';
  assert (select count(*) = 1 from public.worker_position_trail('20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000003')), 'trail';
  failed := null;
  begin perform * from public.worker_positions_snapshot('20000000-0000-4000-8000-00000000000b'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'branch A office cannot read branch B';
  failed := null;
  begin perform public.worker_position_trail('20000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000003'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'nor its trails';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert not exists (select 1 from public.worker_positions_snapshot('20000000-0000-4000-8000-00000000000b')), 'but sees nobody from A';

  -- Reader without delivery.read is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform * from public.worker_positions_snapshot('20000000-0000-4000-8000-00000000000a'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'no delivery.read';

  -- After Ra ca the worker leaves the map and new points are refused.
  perform pg_temp.act_as_admin();
  update public.attendance_records set clock_out_at = now() where id = rec;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert not exists (select 1 from public.worker_positions_snapshot('20000000-0000-4000-8000-00000000000a')), 'off the map after clock-out';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.record_worker_position(10.8, 106.7, 12, now()); exception when others then failed := sqlerrm; end;
  assert failed = 'worker_not_on_shift', 'refused after clock-out';
end
$test$;
