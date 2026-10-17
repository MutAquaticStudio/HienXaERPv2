-- FB2 Đợt 7: a route plan carries an expected window per stop; applying it schedules the deliveries that had none with
-- their stop window, keeps the schedule of the others, and stays all-or-nothing.
-- Operational rows need an acting employee of the branch (private.require_active_operations); the fixture is written
-- by the database owner on behalf of user 1.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7e000000-0000-4000-8000-000000000001', 'nt_kg_rt', 'Kilôgam lộ trình', 'kg');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id, capacity_source_note, capacity_verified_at, capacity_verified_by) values
  ('7e000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_XE_RT', 'NT-RT-01', 5000, '7e000000-0000-4000-8000-000000000001',
   'Giấy đăng kiểm thử', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7e000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_KH_RT', 'Khách lộ trình', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7e000000-0000-4000-8000-000000000004', '7e000000-0000-4000-8000-000000000003', 'CT1', 'Công trình lộ trình', 'Địa chỉ lộ trình');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by, confirmed_at) values
  ('7e000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', 'NT-SO-RT', '7e000000-0000-4000-8000-000000000003',
   '7e000000-0000-4000-8000-000000000004', 'CONFIRMED', 'Khách lộ trình', 'Công trình lộ trình', 'Địa chỉ lộ trình', '10000000-0000-4000-8000-000000000001', now());
-- D1, D2 and D4 have no schedule; D3 is agreed for 10:00–11:00 on day 1; D5 for 07:30–08:30 on day 2 (Vietnam time).
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, scheduled_at, scheduled_end_at, created_by)
select ('7e000000-0000-4000-8000-00000000001' || n)::uuid, '20000000-0000-4000-8000-00000000000a', '7e000000-0000-4000-8000-000000000005',
  'NT-GH-RT-' || n, '7e000000-0000-4000-8000-000000000003', '7e000000-0000-4000-8000-000000000004', 'Khách lộ trình', 'Công trình lộ trình',
  'Địa chỉ lộ trình', s, e, '10000000-0000-4000-8000-000000000001'
from (values (1, null::timestamptz, null::timestamptz), (2, null, null),
  (3, '2200-01-01 10:00+07', '2200-01-01 11:00+07'), (4, null, null), (5, '2200-01-02 07:30+07', '2200-01-02 08:30+07')) v(n, s, e);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  vehicle constant uuid := '7e000000-0000-4000-8000-000000000002';
  driver constant uuid := '30000000-0000-4000-8000-000000000001';
  d1 constant uuid := '7e000000-0000-4000-8000-000000000011';
  d2 constant uuid := '7e000000-0000-4000-8000-000000000012';
  d3 constant uuid := '7e000000-0000-4000-8000-000000000013';
  d4 constant uuid := '7e000000-0000-4000-8000-000000000014';
  d5 constant uuid := '7e000000-0000-4000-8000-000000000015';
  departure constant timestamptz := '2200-01-01 07:00+07';
  apply_op constant uuid := '7e100000-0000-4000-8000-000000000001';
  no_window_plan uuid;
  plan uuid;
  overlap_plan uuid;
  failed text;
begin
  -- Readers cannot plan routes.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin
    perform public.create_route_plan(branch, departure, vehicle, driver, 'MANUAL_FALLBACK', null, null, null,
      jsonb_build_array(jsonb_build_object('delivery_id', d1, 'stop_order', 1, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ')),
      '7e100000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);

  -- Windows must start at departure and follow the stop order without overlapping.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin
    perform public.create_route_plan(branch, departure, vehicle, driver, 'MANUAL_FALLBACK', null, null, null, jsonb_build_array(
      jsonb_build_object('delivery_id', d1, 'stop_order', 1, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
        'planned_start_at', '2200-01-01T06:00:00+07:00', 'planned_end_at', '2200-01-01T07:00:00+07:00')),
      '7e100000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlerrm; end;
  assert failed = 'route_stop_window_invalid', format('window before departure, got %s', failed);
  failed := null;
  begin
    perform public.create_route_plan(branch, departure, vehicle, driver, 'MANUAL_FALLBACK', null, null, null, jsonb_build_array(
      jsonb_build_object('delivery_id', d1, 'stop_order', 1, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
        'planned_start_at', '2200-01-01T07:00:00+07:00', 'planned_end_at', '2200-01-01T08:00:00+07:00'),
      jsonb_build_object('delivery_id', d2, 'stop_order', 2, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
        'planned_start_at', '2200-01-01T07:30:00+07:00', 'planned_end_at', '2200-01-01T08:30:00+07:00')),
      '7e100000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlerrm; end;
  assert failed = 'route_stop_window_invalid', format('overlapping stops, got %s', failed);

  -- A plan without stop windows cannot schedule D1: applying fails and assigns nothing.
  no_window_plan := public.create_route_plan(branch, departure, vehicle, driver, 'MANUAL_FALLBACK', null, null, null, jsonb_build_array(
    jsonb_build_object('delivery_id', d1, 'stop_order', 1, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ')),
    '7e100000-0000-4000-8000-0000000000a4');
  failed := null;
  begin perform public.apply_route_plan(no_window_plan, 1, '7e100000-0000-4000-8000-0000000000a5'); exception when others then failed := sqlerrm; end;
  assert failed = 'route_stop_schedule_required', format('unscheduled stop without window, got %s', failed);

  -- 07:00 departure, 60 minutes per stop: D1 07–08, D2 08–09, D3 keeps its agreed 10–11.
  plan := public.create_route_plan(branch, departure, vehicle, driver, 'MANUAL_FALLBACK', null, null, null, jsonb_build_array(
    jsonb_build_object('delivery_id', d1, 'stop_order', 1, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
      'planned_start_at', '2200-01-01T07:00:00+07:00', 'planned_end_at', '2200-01-01T08:00:00+07:00'),
    jsonb_build_object('delivery_id', d2, 'stop_order', 2, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
      'planned_start_at', '2200-01-01T08:00:00+07:00', 'planned_end_at', '2200-01-01T09:00:00+07:00'),
    jsonb_build_object('delivery_id', d3, 'stop_order', 3, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
      'planned_start_at', '2200-01-01T09:00:00+07:00', 'planned_end_at', '2200-01-01T10:00:00+07:00')),
    '7e100000-0000-4000-8000-0000000000a6');
  perform pg_temp.act_as_admin();
  assert (select planned_start_at from public.route_plan_stops where route_plan_id = plan and stop_order = 2) = '2200-01-01 08:00+07', 'stop window stored';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.apply_route_plan(plan, 1, apply_op) = plan, 'applied';
  assert public.apply_route_plan(plan, 1, apply_op) = plan, 'replay returns the plan';
  perform pg_temp.act_as_admin();
  assert (select status from public.route_plans where id = plan) = 'APPLIED', 'plan applied';
  assert (select scheduled_at = '2200-01-01 07:00+07' and scheduled_end_at = '2200-01-01 08:00+07' and execution_state = 'ASSIGNED' from public.deliveries where id = d1), 'D1 gets stop 1 window';
  assert (select scheduled_at = '2200-01-01 08:00+07' and scheduled_end_at = '2200-01-01 09:00+07' from public.deliveries where id = d2), 'D2 gets stop 2 window';
  assert (select scheduled_at = '2200-01-01 10:00+07' and scheduled_end_at = '2200-01-01 11:00+07' and execution_state = 'ASSIGNED' from public.deliveries where id = d3), 'D3 keeps its schedule';
  assert (select count(*) from public.delivery_assignments where delivery_id in (d1, d2, d3) and superseded_at is null and employee_id = driver and vehicle_id = vehicle) = 3, 'three assignments';
  assert (select count(*) from public.audit_events where action = 'route_plan.applied' and entity_id = plan) = 1, 'one apply audit';

  -- D4 would get 07:00–08:00 on day 2, overlapping D5 on the same vehicle: the whole plan is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  overlap_plan := public.create_route_plan(branch, '2200-01-02 07:00+07', vehicle, driver, 'MANUAL_FALLBACK', null, null, null, jsonb_build_array(
    jsonb_build_object('delivery_id', d4, 'stop_order', 1, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
      'planned_start_at', '2200-01-02T07:00:00+07:00', 'planned_end_at', '2200-01-02T08:00:00+07:00'),
    jsonb_build_object('delivery_id', d5, 'stop_order', 2, 'expected_delivery_version', 1, 'expected_assignment_version', 0, 'address_snapshot', 'Địa chỉ',
      'planned_start_at', '2200-01-02T08:00:00+07:00', 'planned_end_at', '2200-01-02T09:00:00+07:00')),
    '7e100000-0000-4000-8000-0000000000a7');
  failed := null;
  begin perform public.apply_route_plan(overlap_plan, 1, '7e100000-0000-4000-8000-0000000000a8'); exception when others then failed := sqlstate; end;
  assert failed = '23P01', format('collision expected, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select scheduled_at is null and execution_state = 'PLANNED' from public.deliveries where id = d4), 'D4 left untouched';
  assert (select status from public.route_plans where id = overlap_plan) = 'DRAFT', 'plan stays a draft';
end
$test$;
