-- FB2 Đợt 3: create_delivery_for_order allocates from one warehouse and creates the delivery in one command, with
-- quantities in the unit the order was sold in; order_delivery_plan reads what is left.
-- Operational rows need an acting employee of the branch (private.require_active_operations); the fixture is written
-- by the database owner on behalf of user 1.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('70000000-0000-4000-8000-000000000031', 'nt_kg4', 'Kilôgam thử 4', 'kg'),
  ('70000000-0000-4000-8000-000000000032', 'nt_bao4', 'Bao thử 4', 'bao');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000031', 'NT_G4', 'Nhóm thử 4');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000031', '71000000-0000-4000-8000-000000000031', 'NT_XM4', 'Xi măng thử 4', '70000000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('78000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH4', 'Khách thử 4', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử', 'Địa chỉ thử');
insert into public.warehouses(id, branch_id, code, name) values
  ('78000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K1', 'Kho thử 1'),
  ('78000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K2', 'Kho thử 2');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by, confirmed_at) values
  ('78000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1', '78000000-0000-4000-8000-000000000001',
   '78000000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 4', 'Công trình thử', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', now()),
  ('78000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2', '78000000-0000-4000-8000-000000000001',
   '78000000-0000-4000-8000-000000000002', 'DRAFT', 'Khách thử 4', 'Công trình thử', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', null);
-- 10 bao of 50 kg (= 500 kg) sold, plus one line on the draft order.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('78000000-0000-4000-8000-000000000020', '78000000-0000-4000-8000-000000000010', 1, '72000000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('78000000-0000-4000-8000-000000000021', '78000000-0000-4000-8000-000000000011', 1, '72000000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000031', 1, 50, 1, 'HALF_UP', 90000, 90000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- 400 kg on hand in warehouse 1 (from an approved count), nothing in warehouse 2.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('78000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '78000000-0000-4000-8000-000000000003', 'NT-KK-1', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('78000000-0000-4000-8000-000000000031', '78000000-0000-4000-8000-000000000030', '72000000-0000-4000-8000-000000000031', 0, 400, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '72000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '78000000-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 400, 600000, 1500, '78000000-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');

do $test$
declare
  orders constant uuid := '78000000-0000-4000-8000-000000000010';
  draft_order constant uuid := '78000000-0000-4000-8000-000000000011';
  line constant uuid := '78000000-0000-4000-8000-000000000020';
  draft_line constant uuid := '78000000-0000-4000-8000-000000000021';
  w1 constant uuid := '78000000-0000-4000-8000-000000000003';
  w2 constant uuid := '78000000-0000-4000-8000-000000000004';
  op constant uuid := '79000000-0000-4000-8000-000000000001';
  plan jsonb;
  result jsonb;
  failed text;
  first_delivery uuid;
begin
  -- Readers cannot read the plan or create deliveries.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.order_delivery_plan(orders); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must not read the plan, got %s', failed);
  failed := null;
  begin perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now(), null, '79000000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  plan := public.order_delivery_plan(orders);
  assert (plan->'lines'->0->>'required_base_quantity')::numeric = 500 and jsonb_array_length(plan->'lines'->0->'allocations') = 0, format('plan %s', plan);

  -- Draft orders cannot be delivered; quantities finer than 6 decimals in base units are refused.
  failed := null;
  begin perform public.create_delivery_for_order(draft_order, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', draft_line, 'quantity', '1')), now(), null, '79000000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('draft order must be refused, got %s', failed);
  failed := null;
  begin perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', draft_line, 'quantity', '1')), now(), null, '79000000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlstate; end;
  assert failed = '23514', format('line of another order must be refused, got %s', failed);

  -- Not enough stock in warehouse 2: nothing is allocated or created.
  failed := null;
  begin perform public.create_delivery_for_order(orders, w2, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now(), null, '79000000-0000-4000-8000-0000000000a4');
  exception when others then failed := sqlstate; end;
  assert failed = '23514', format('insufficient stock must fail, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.supply_allocations where sales_order_line_id = line), 'no allocation left behind';

  -- An assignment that cannot be made fails the whole command.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now(),
      jsonb_build_object('employee_id', '30000000-0000-4000-8000-000000000001'), '79000000-0000-4000-8000-0000000000a5');
  exception when others then failed := sqlstate; end;
  assert failed is not null, 'incomplete assignment must fail';
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.deliveries where sales_order_id = orders), 'no delivery left behind';

  -- 2 bao = 100 kg from warehouse 1: allocation, delivery and reservation in base units.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now(), null, op);
  first_delivery := (result->>'delivery_id')::uuid;
  assert (result->>'replayed')::boolean = false and first_delivery is not null, format('result %s', result);
  perform pg_temp.act_as_admin();
  assert (select allocated_base_quantity from public.supply_allocations where sales_order_line_id = line and warehouse_id = w1) = 100, 'allocated 100 kg';
  assert (select planned_base_quantity from public.delivery_lines where delivery_id = first_delivery) = 100, 'planned 100 kg';
  assert (select reserved_base_quantity from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id where l.delivery_id = first_delivery and r.state = 'ACTIVE') = 100, 'reserved 100 kg';
  assert (select count(*) from public.audit_events where action = 'delivery.create_for_order' and trace_id = op) = 1, 'one audit event';

  -- Replay returns the same delivery; another payload under the same operation is a conflict.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now() - interval '0 seconds', null, op);
  assert (result->>'replayed')::boolean and (result->>'delivery_id')::uuid = first_delivery, format('replay %s', result);
  failed := null;
  begin perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '3')), now(), null, op);
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict expected, got %s', failed);

  -- A second delivery of 4 bao tops up the same warehouse allocation instead of adding another one.
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '4')), now(), null, '79000000-0000-4000-8000-000000000002');
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.supply_allocations where sales_order_line_id = line) = 1, 'one allocation per warehouse';
  assert (select allocated_base_quantity from public.supply_allocations where sales_order_line_id = line) = 300, 'allocation topped up to 300 kg';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  plan := public.order_delivery_plan(orders);
  assert (plan->'lines'->0->'allocations'->0->>'consumed_base_quantity')::numeric = 300, format('plan after deliveries %s', plan);

  -- Beyond what was sold (500 kg) is refused even with stock.
  failed := null;
  begin perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '5')), now(), null, '79000000-0000-4000-8000-0000000000a6');
  exception when others then failed := sqlstate; end;
  assert failed is not null, 'over-delivery must fail';

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid)', 'execute'), 'anon cannot execute';
  assert not has_function_privilege('anon', 'public.order_delivery_plan(uuid)', 'execute'), 'anon cannot read plans';
end
$test$;
