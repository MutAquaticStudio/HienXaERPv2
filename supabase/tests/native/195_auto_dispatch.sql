-- FB4 D22 + C2: a warehouse delivery without a driver goes to the truck + default driver free soonest within the working day
-- (then fewest deliveries, then truck code); SUGGEST stores a proposal, OFF does nothing; "Tự chia việc" dispatches the day;
-- a worker declines an unstarted job and is not proposed for it again.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f195000-0000-4000-8000-000000000001', 'nt_kg195', 'Kilôgam thử 195', 'kg');
insert into public.material_groups(id, code, name) values ('7f195000-0000-4000-8000-000000000002', 'NT_G195', 'Nhóm thử 195');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f195000-0000-4000-8000-000000000003', '7f195000-0000-4000-8000-000000000002', 'NT_XM195', 'Xi măng 195', '7f195000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f195000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K195', 'Kho 195');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f195000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f195000-0000-4000-8000-000000000004', 'NT-KK-195', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f195000-0000-4000-8000-000000000006', '7f195000-0000-4000-8000-000000000005', '7f195000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f195000-0000-4000-8000-000000000003', '7f195000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f195000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f195000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f195000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH195', 'Khách 195', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f195000-0000-4000-8000-000000000011', '7f195000-0000-4000-8000-000000000010', 'CT1', 'Công trình 195', 'Địa chỉ 195');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f195000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT-SO-195', '7f195000-0000-4000-8000-000000000010',
   '7f195000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 195', 'Công trình 195', 'Địa chỉ 195', 'Anh Nhận', '0901195000', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f195000-0000-4000-8000-000000000013', '7f195000-0000-4000-8000-000000000012', 1, '7f195000-0000-4000-8000-000000000003', 'Xi măng 195',
   '7f195000-0000-4000-8000-000000000001', '7f195000-0000-4000-8000-000000000001', 9000, 1, 1, 'HALF_UP', 2000, 18000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- Two drivers (work.claim) with a truck each; a third employee in the other branch.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000195'), ('10000000-0000-4000-8000-000000000196');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000195', '10000000-0000-4000-8000-000000000195', 'NT_TX195', 'Tài xế A'),
  ('30000000-0000-4000-8000-000000000196', '10000000-0000-4000-8000-000000000196', 'NT_TX196', 'Tài xế B');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000195', 'nt_driver195', 'Tài xế thử 195');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000195', 'work.claim'), ('40000000-0000-4000-8000-000000000195', 'work.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000195', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000195'),
  ('30000000-0000-4000-8000-000000000196', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000195');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id, capacity_source_note, capacity_verified_at, capacity_verified_by) values
  ('7f195000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_V1', '99C-195.01', 5000, '7f195000-0000-4000-8000-000000000001', 'Đăng kiểm thử', now(), '10000000-0000-4000-8000-000000000001'),
  ('7f195000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_V2', '99C-195.02', 5000, '7f195000-0000-4000-8000-000000000001', 'Đăng kiểm thử', now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  sale constant uuid := '7f195000-0000-4000-8000-000000000012';
  line constant uuid := '7f195000-0000-4000-8000-000000000013';
  wh constant uuid := '7f195000-0000-4000-8000-000000000004';
  v1 constant uuid := '7f195000-0000-4000-8000-000000000020';
  v2 constant uuid := '7f195000-0000-4000-8000-000000000021';
  driver_a constant uuid := '30000000-0000-4000-8000-000000000195';
  driver_b constant uuid := '30000000-0000-4000-8000-000000000196';
  day constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 2;
  nine constant timestamptz := (day + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid; d5 uuid; d6 uuid;
  work uuid;
  failed text;
  n integer := 0;
  op uuid;
  a record;
  version_now integer;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- A truck's default driver must work in the branch.
  failed := null;
  begin
    perform public.save_catalog_record('vehicles', v1, branch, jsonb_build_object('default_driver_employee_id', '30000000-0000-4000-8000-000000000002'),
      jsonb_build_object('default_driver_employee_id', null), 'Tài xế mặc định', '7f195000-0000-4000-8000-0000000000a0');
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_default_driver', format('driver of another branch refused, got %s', failed);
  perform public.save_catalog_record('vehicles', v1, branch, jsonb_build_object('default_driver_employee_id', driver_a),
    jsonb_build_object('default_driver_employee_id', null), 'Tài xế mặc định', '7f195000-0000-4000-8000-0000000000a1');
  perform public.save_catalog_record('vehicles', v2, branch, jsonb_build_object('default_driver_employee_id', driver_b),
    jsonb_build_object('default_driver_employee_id', null), 'Tài xế mặc định', '7f195000-0000-4000-8000-0000000000a2');
  assert (select default_driver_employee_id from public.vehicles where id = v1) = driver_a, 'default driver saved';

  -- 1. No driver chosen, AUTO (default): first truck by code at 09:00.
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f195000-0000-4000-8000-0000000000b1');
  d1 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'status' = 'ASSIGNED' and result->'dispatch'->>'vehicle_id' = v1::text, format('d1 to truck 1 %s', result->'dispatch');
  assert (select scheduled_at from public.deliveries where id = d1) = nine, 'd1 at 09:00';
  assert (select w.execution_state from public.work_items w where w.delivery_id = d1) = 'CLAIMED', 'job on driver A portal';
  -- 2. Same time again: truck 1 is busy until 10:00, truck 2 is free at 09:00.
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f195000-0000-4000-8000-0000000000b2');
  d2 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'vehicle_id' = v2::text and (result->'dispatch'->>'start_at')::timestamptz = nine, format('d2 to truck 2 at 09:00 %s', result->'dispatch');
  -- 3. Both free at 10:00 with one delivery each: truck code decides; the reason is kept.
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f195000-0000-4000-8000-0000000000b3');
  d3 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'vehicle_id' = v1::text and (result->'dispatch'->>'start_at')::timestamptz = nine + interval '1 hour',
    format('d3 after d1 on truck 1 %s', result->'dispatch');
  assert exists (select 1 from public.audit_events where entity_id = d3 and action = 'delivery.auto_dispatched' and reason like 'Tự điều phối: NT_V1 / Tài xế A%'),
    'auto-dispatch reason audited';

  -- 4. A stop that would end after the working day moves to the next morning.
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '500')),
    (day + time '17:30') at time zone 'Asia/Ho_Chi_Minh', null, '7f195000-0000-4000-8000-0000000000b4');
  d4 := (result->>'delivery_id')::uuid;
  assert (result->'dispatch'->>'start_at')::timestamptz = (day + 1 + time '07:00') at time zone 'Asia/Ho_Chi_Minh', format('next morning %s', result->'dispatch');

  -- 5. SUGGEST: nothing assigned, a proposal to apply.
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"SUGGEST"}', null, '7f195000-0000-4000-8000-0000000000c1');
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '500')), nine, null,
    '7f195000-0000-4000-8000-0000000000b5');
  d5 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'status' = 'SUGGESTED' and (select execution_state from public.deliveries where id = d5) = 'PLANNED'
    and not exists (select 1 from public.work_items where delivery_id = d5), format('suggested only %s', result->'dispatch');
  assert exists (select 1 from public.delivery_dispatch_proposals where delivery_id = d5), 'proposal stored';
  assert exists (select 1 from public.notifications where kind = 'delivery.dispatch_suggested' and entity_id = d5), 'dispatcher told';
  perform public.apply_dispatch_proposal(d5, '7f195000-0000-4000-8000-0000000000c2');
  assert (select execution_state from public.deliveries where id = d5) = 'ASSIGNED' and not exists (select 1 from public.delivery_dispatch_proposals where delivery_id = d5),
    'proposal applied';
  assert public.apply_dispatch_proposal(d5, '7f195000-0000-4000-8000-0000000000c2') is not null, 'applying again returns the assignment';

  -- 6. OFF: left to the dispatcher; "Tự chia việc" assigns it.
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', 1, '7f195000-0000-4000-8000-0000000000c3');
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '500')), nine, null,
    '7f195000-0000-4000-8000-0000000000b6');
  d6 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'status' = 'OFF' and (select execution_state from public.deliveries where id = d6) = 'PLANNED', 'off leaves it planned';
  result := public.dispatch_day(branch, day);
  assert jsonb_array_length(result->'waiting') = 1 and result->'waiting'->0->>'id' = d6::text and result->>'mode' = 'OFF', format('waiting on the board %s', result->'waiting');
  assert (select count(*) from jsonb_array_elements(result->'drivers')) = 2, 'both drivers on the board';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.auto_dispatch_day(branch, day, '7f195000-0000-4000-8000-0000000000c4'); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a reader cannot dispatch';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.auto_dispatch_day(branch, day, '7f195000-0000-4000-8000-0000000000c5');
  assert (result->>'assigned')::int = 1 and (select execution_state from public.deliveries where id = d6) = 'ASSIGNED', format('day dispatched %s', result);

  -- 7. C2: driver B declines d2 (not handed over yet). It goes back to waiting and B is not proposed again.
  select w.id, w.version into work, version_now from public.work_items w where w.delivery_id = d2;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000196');
  failed := null;
  begin perform public.decline_portal_work_item(work, 'x', version_now, '7f195000-0000-4000-8000-0000000000d0'); exception when others then failed := sqlerrm; end;
  assert failed = 'decline_reason_required', 'a reason is required';
  perform public.decline_portal_work_item(work, 'Xe hỏng lốp', version_now, '7f195000-0000-4000-8000-0000000000d1');
  assert public.decline_portal_work_item(work, 'Xe hỏng lốp', version_now, '7f195000-0000-4000-8000-0000000000d1') = work, 'replay';
  assert jsonb_array_length(public.worker_portal_snapshot()->'jobs') = (select count(*) from public.work_item_assignments wa join public.work_items w on w.id = wa.work_item_id
    where wa.superseded_at is null and wa.employee_id = driver_b and w.execution_state in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED')), 'declined job left the list';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000195');
  failed := null;
  begin perform public.decline_portal_work_item(work, 'Không phải việc của tôi', version_now + 1, '7f195000-0000-4000-8000-0000000000d2'); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'only the assigned worker declines';
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d2) = 'PLANNED', 'back to planned';
  assert exists (select 1 from public.delivery_dispatch_exclusions where delivery_id = d2 and employee_id = driver_b), 'exclusion kept';
  assert exists (select 1 from public.notifications where kind = 'work.declined' and entity_id = d2 and title = 'Tài xế B từ chối ' || (select delivery_number from public.deliveries where id = d2)
    and body = 'Xe hỏng lốp'), 'dispatchers told why';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.auto_dispatch_day(branch, day, '7f195000-0000-4000-8000-0000000000c6');
  select a2.employee_id, a2.vehicle_id into a from public.delivery_assignments a2 where a2.delivery_id = d2 and a2.superseded_at is null;
  assert a.employee_id = driver_a and a.vehicle_id = v1, format('d2 goes to driver A, not B again %s', result);
  assert (select w.execution_state || ':' || wa.employee_id from public.work_items w join public.work_item_assignments wa on wa.work_item_id = w.id and wa.superseded_at is null
    where w.delivery_id = d2) = 'CLAIMED:' || driver_a, 'the same job moved to driver A';
  -- A started job cannot be declined.
  select w.id, w.version into work, version_now from public.work_items w where w.delivery_id = d1;
  perform pg_temp.act_as_admin();
  update public.deliveries set execution_state = 'DISPATCHED' where id = d1;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000195');
  failed := null;
  begin perform public.decline_portal_work_item(work, 'Muộn quá', version_now, '7f195000-0000-4000-8000-0000000000d3'); exception when others then failed := sqlerrm; end;
  assert failed = 'work_already_started', format('started job refused, got %s', failed);
  perform pg_temp.act_as_admin();
end
$test$;
