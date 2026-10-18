-- FB3 A2 + FB4 F2: assigning a driver puts the job on the worker portal; a stop takes the branch's stop time (not 4 hours);
-- "Giao ngay" for a busy driver is placed after what they already have; a clash at a chosen time names the next free time.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f170000-0000-4000-8000-000000000031', 'nt_kg175', 'Kilôgam thử 4', 'kg'),
  ('7f170000-0000-4000-8000-000000000032', 'nt_bao175', 'Bao thử 4', 'bao');
insert into public.material_groups(id, code, name) values ('7f171000-0000-4000-8000-000000000031', 'NT_G175', 'Nhóm thử 4');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f172000-0000-4000-8000-000000000031', '7f171000-0000-4000-8000-000000000031', 'NT_XM175', 'Xi măng thử 4', '7f170000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f178000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH175', 'Khách thử 4', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f178000-0000-4000-8000-000000000002', '7f178000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử', 'Địa chỉ thử');
update public.customer_sites set receiver_name = 'Anh Nhận', receiver_phone = '0901000175' where id = '7f178000-0000-4000-8000-000000000002';
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f178000-0000-4000-8000-000000000005', '7f178000-0000-4000-8000-000000000001', 'CT2', 'Công trình chưa có người nhận', 'Địa chỉ thử 2');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f178000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K1751', 'Kho thử 1'),
  ('7f178000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K1752', 'Kho thử 2');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by, confirmed_at) values
  ('7f178000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1751', '7f178000-0000-4000-8000-000000000001',
   '7f178000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 4', 'Công trình thử', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', now()),
  ('7f178000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1752', '7f178000-0000-4000-8000-000000000001',
   '7f178000-0000-4000-8000-000000000005', 'CONFIRMED', 'Khách thử 4', 'Công trình chưa có người nhận', 'Địa chỉ thử 2', '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of 50 kg (= 500 kg) sold, plus one line on the draft order.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f178000-0000-4000-8000-000000000020', '7f178000-0000-4000-8000-000000000010', 1, '7f172000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '7f170000-0000-4000-8000-000000000032', '7f170000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f178000-0000-4000-8000-000000000021', '7f178000-0000-4000-8000-000000000011', 1, '7f172000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '7f170000-0000-4000-8000-000000000032', '7f170000-0000-4000-8000-000000000031', 1, 50, 1, 'HALF_UP', 90000, 90000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- 400 kg on hand in warehouse 1 (from an approved count), nothing in warehouse 2.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f178000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f178000-0000-4000-8000-000000000003', 'NT-KK-1751', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f178000-0000-4000-8000-000000000031', '7f178000-0000-4000-8000-000000000030', '7f172000-0000-4000-8000-000000000031', 0, 400, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f172000-0000-4000-8000-000000000031', '7f170000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f178000-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 400, 600000, 1500, '7f178000-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');

-- The order carries the receiver it was sold with; the other order has none.
update public.sales_orders set receiver_name_snapshot = 'Anh Nhận', receiver_phone_snapshot = '0901000175' where id = '7f178000-0000-4000-8000-000000000010';
-- A truck of 1 000 kg with verified capacity.
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id, capacity_source_note, capacity_verified_at, capacity_verified_by) values
  ('7f178000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE175', '99C-175.01', 1000, '7f170000-0000-4000-8000-000000000031',
   'Đăng kiểm thử', now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  orders constant uuid := '7f178000-0000-4000-8000-000000000010';
  other_order constant uuid := '7f178000-0000-4000-8000-000000000011';
  line constant uuid := '7f178000-0000-4000-8000-000000000020';
  other_line constant uuid := '7f178000-0000-4000-8000-000000000021';
  w1 constant uuid := '7f178000-0000-4000-8000-000000000003';
  driver constant uuid := '30000000-0000-4000-8000-000000000001';
  truck constant uuid := '7f178000-0000-4000-8000-000000000040';
  start_at constant timestamptz := date_trunc('hour', now()) + interval '2 hours';
  result jsonb;
  first_delivery uuid;
  second_delivery uuid;
  failed text;
  hint text;
  v integer;
begin
  -- Stop time is a branch setting of the owner (roles.manage), 5–720 minutes, with optimistic locking.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_branch_operation_settings(branch, '{"stop_minutes":"30"}', null, '7f179000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must not change settings, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_branch_operation_settings(branch, '{"stop_minutes":"3"}', null, '7f179000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('3 minutes must be refused, got %s', failed);
  v := public.save_branch_operation_settings(branch, '{"stop_minutes":"45"}', null, '7f179000-0000-4000-8000-0000000000a3');
  assert v = 1, format('first save is version 1, got %s', v);
  failed := null;
  begin perform public.save_branch_operation_settings(branch, '{"stop_minutes":"30"}', null, '7f179000-0000-4000-8000-0000000000a4');
  exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale save must reload, got %s', failed);
  v := public.save_branch_operation_settings(branch, '{"stop_minutes":"30"}', 1, '7f179000-0000-4000-8000-0000000000a5');
  assert v = 2 and (select stop_minutes from public.branch_operation_settings where branch_id = branch) = 30, 'stop time is 30 minutes';

  -- A delivery assigned without an end time takes 30 minutes, and the driver's work item appears by itself.
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), start_at,
    jsonb_build_object('employee_id', driver, 'vehicle_id', truck, 'scheduled_start', start_at), '7f179000-0000-4000-8000-000000000001');
  first_delivery := (result->>'delivery_id')::uuid;
  assert (result->>'scheduled_end_at')::timestamptz = start_at + interval '30 minutes', format('first stop %s', result);
  perform pg_temp.act_as_admin();
  assert (select execution_state || ':' || assignment_mode from public.work_items where delivery_id = first_delivery) = 'CLAIMED:DIRECT', 'work item claimed for the driver';
  assert (select a.employee_id from public.work_item_assignments a join public.work_items w on w.id = a.work_item_id
    where w.delivery_id = first_delivery and a.superseded_at is null) = driver, 'work item assigned to the driver';
  assert (select scheduled_end from public.work_items where delivery_id = first_delivery) = start_at + interval '30 minutes', 'work item takes the stop time';

  -- "Giao ngay" for the same driver and truck goes right after the first stop instead of failing.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), start_at,
    jsonb_build_object('employee_id', driver, 'vehicle_id', truck, 'schedule_mode', 'NOW'), '7f179000-0000-4000-8000-000000000002');
  second_delivery := (result->>'delivery_id')::uuid;
  assert (result->>'scheduled_at')::timestamptz = start_at + interval '30 minutes'
    and (result->>'scheduled_end_at')::timestamptz = start_at + interval '60 minutes', format('second stop follows the first %s', result);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.work_items w join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
    where a.employee_id = driver and w.delivery_id in (first_delivery, second_delivery)) = 2, 'one driver holds two jobs';

  -- A chosen time that clashes is refused and names the next free time.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin
    perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1')), start_at,
      jsonb_build_object('employee_id', driver, 'vehicle_id', truck, 'scheduled_start', start_at + interval '10 minutes'), '7f179000-0000-4000-8000-0000000000a6');
  exception when others then failed := sqlstate; get stacked diagnostics hint = pg_exception_hint; end;
  assert failed = '23P01', format('clash must be refused, got %s', failed);
  assert hint = 'next_free_at=' || to_char((start_at + interval '60 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), format('hint %s', hint);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.deliveries where sales_order_id = orders) = 2, 'refused delivery left nothing behind';

  -- Without a receiver phone the delivery is assigned but no work item is made (the delivery page asks for it).
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order(other_order, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', other_line, 'quantity', '1')),
    start_at + interval '3 hours', jsonb_build_object('employee_id', driver, 'vehicle_id', truck), '7f179000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = (result->>'delivery_id')::uuid) = 'ASSIGNED', 'assigned without receiver phone';
  assert not exists (select 1 from public.work_items where delivery_id = (result->>'delivery_id')::uuid), 'no work item without receiver phone';
  -- Adding the receiver on the delivery page puts the job on the portal.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.update_delivery_receiver((result->>'delivery_id')::uuid, 'Chị Nhận', '0902000175', 'Bổ sung người nhận',
    (select version from public.deliveries where id = (result->>'delivery_id')::uuid), '7f179000-0000-4000-8000-000000000004');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.work_items where delivery_id = (result->>'delivery_id')::uuid) = 'CLAIMED', 'work item after receiver is added';
end
$test$;
