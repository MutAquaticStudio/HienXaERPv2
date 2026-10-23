-- FB4 D19: a confirmed order is sourced for the whole order at once — stock first (the warehouse covering most lines, the
-- default warehouse on a tie), stock promised to other orders is not taken twice, the rest from the cheapest supplier on a
-- draft supplier-direct purchase order (or the whole line when the extra trip costs more), "Thiếu nguồn" without a price.
-- A confirmed direct purchase order gets its delivery (contact = supplier), reported with "NCC đã giao".
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f190000-0000-4000-8000-000000000001', 'nt_kg190', 'Kilôgam thử 190', 'kg'),
  ('7f190000-0000-4000-8000-000000000002', 'nt_bao190', 'Bao thử 190', 'bao'),
  ('7f190000-0000-4000-8000-000000000003', 'nt_vien190', 'Viên thử 190', 'viên'),
  ('7f190000-0000-4000-8000-000000000004', 'nt_m3190', 'Khối thử 190', 'm³');
insert into public.material_groups(id, code, name) values ('7f190000-0000-4000-8000-000000000005', 'NT_G190', 'Nhóm thử 190');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f190000-0000-4000-8000-000000000010', '7f190000-0000-4000-8000-000000000005', 'NT_XM190', 'Xi măng 190', '7f190000-0000-4000-8000-000000000001'),
  ('7f190000-0000-4000-8000-000000000011', '7f190000-0000-4000-8000-000000000005', 'NT_GA190', 'Gạch 190', '7f190000-0000-4000-8000-000000000003'),
  ('7f190000-0000-4000-8000-000000000012', '7f190000-0000-4000-8000-000000000005', 'NT_CA190', 'Cát 190', '7f190000-0000-4000-8000-000000000004');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type) values
  ('7f190000-0000-4000-8000-000000000010', '7f190000-0000-4000-8000-000000000002', '7f190000-0000-4000-8000-000000000001', 50, 1, 'PACKAGING');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f190000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_K1901', 'Kho chính 190'),
  ('7f190000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_K1902', 'Kho phụ 190');
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f190000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', 'NT_NCC1901', 'NCC Rẻ 190', '0901190001'),
  ('7f190000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-00000000000a', 'NT_NCC1902', 'NCC Đắt 190', '0901190002');
-- Cement: 80 000 đ/bao (= 1 600 đ/kg) at the cheap supplier; brick 1 000 đ vs 1 200 đ a piece; sand has no purchase price.
insert into public.purchase_price_rules(branch_id, supplier_id, material_id, purchase_uom_id, unit_cost_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000030', '7f190000-0000-4000-8000-000000000010', '7f190000-0000-4000-8000-000000000002', 80000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000030', '7f190000-0000-4000-8000-000000000011', '7f190000-0000-4000-8000-000000000003', 1000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000031', '7f190000-0000-4000-8000-000000000011', '7f190000-0000-4000-8000-000000000003', 1200, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
-- Stock (approved counts): main warehouse 1 000 kg cement + 300 bricks; second warehouse 2 000 bricks.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f190000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000020', 'NT-KK-1901', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001'),
  ('7f190000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000021', 'NT-KK-1902', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f190000-0000-4000-8000-000000000072', '7f190000-0000-4000-8000-000000000070', '7f190000-0000-4000-8000-000000000010', 0, 1000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f190000-0000-4000-8000-000000000073', '7f190000-0000-4000-8000-000000000070', '7f190000-0000-4000-8000-000000000011', 0, 300, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f190000-0000-4000-8000-000000000074', '7f190000-0000-4000-8000-000000000071', '7f190000-0000-4000-8000-000000000011', 0, 2000, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000010', '7f190000-0000-4000-8000-000000000001', 'WAREHOUSE', '7f190000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 1000, 1500000, 1500, '7f190000-0000-4000-8000-000000000072', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000011', '7f190000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f190000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 300, 270000, 900, '7f190000-0000-4000-8000-000000000073', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000011', '7f190000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f190000-0000-4000-8000-000000000021', 'STOCK_ADJUSTMENT', 2000, 1800000, 900, '7f190000-0000-4000-8000-000000000074', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f190000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH190', 'Khách 190', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f190000-0000-4000-8000-000000000041', '7f190000-0000-4000-8000-000000000040', 'CT1', 'Công trình 190', 'Địa chỉ 190', 'Anh Nhận', '0901190099');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f190000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1901', '7f190000-0000-4000-8000-000000000040',
   '7f190000-0000-4000-8000-000000000041', 'CONFIRMED', 'Khách 190', 'Công trình 190', 'Địa chỉ 190', 'Anh Nhận', '0901190099', '10000000-0000-4000-8000-000000000001', now()),
  ('7f190000-0000-4000-8000-000000000051', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1902', '7f190000-0000-4000-8000-000000000040',
   '7f190000-0000-4000-8000-000000000041', 'CONFIRMED', 'Khách 190', 'Công trình 190', 'Địa chỉ 190', 'Anh Nhận', '0901190099', '10000000-0000-4000-8000-000000000001', now()),
  ('7f190000-0000-4000-8000-000000000052', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1903', '7f190000-0000-4000-8000-000000000040',
   '7f190000-0000-4000-8000-000000000041', 'CONFIRMED', 'Khách 190', 'Công trình 190', 'Địa chỉ 190', 'Anh Nhận', '0901190099', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  -- Order 1: 10 bao cement (main warehouse covers), 1 000 bricks (only the second warehouse covers), 30 bao cement (part), 5 m³ sand (no source).
  ('7f190000-0000-4000-8000-000000000060', '7f190000-0000-4000-8000-000000000050', 1, '7f190000-0000-4000-8000-000000000010', 'Xi măng 190',
   '7f190000-0000-4000-8000-000000000002', '7f190000-0000-4000-8000-000000000001', 10, 50, 1, 'HALF_UP', 95000, 950000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f190000-0000-4000-8000-000000000061', '7f190000-0000-4000-8000-000000000050', 2, '7f190000-0000-4000-8000-000000000011', 'Gạch 190',
   '7f190000-0000-4000-8000-000000000003', '7f190000-0000-4000-8000-000000000003', 1000, 1, 1, 'HALF_UP', 1300, 1300000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f190000-0000-4000-8000-000000000062', '7f190000-0000-4000-8000-000000000050', 3, '7f190000-0000-4000-8000-000000000010', 'Xi măng 190',
   '7f190000-0000-4000-8000-000000000002', '7f190000-0000-4000-8000-000000000001', 30, 50, 1, 'HALF_UP', 95000, 2850000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f190000-0000-4000-8000-000000000063', '7f190000-0000-4000-8000-000000000050', 4, '7f190000-0000-4000-8000-000000000012', 'Cát 190',
   '7f190000-0000-4000-8000-000000000004', '7f190000-0000-4000-8000-000000000004', 5, 1, 1, 'HALF_UP', 300000, 1500000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  -- Order 2: 2 500 bricks (second warehouse has 2 000, 1 000 of them promised to order 1).
  ('7f190000-0000-4000-8000-000000000064', '7f190000-0000-4000-8000-000000000051', 1, '7f190000-0000-4000-8000-000000000011', 'Gạch 190',
   '7f190000-0000-4000-8000-000000000003', '7f190000-0000-4000-8000-000000000003', 2500, 1, 1, 'HALF_UP', 1300, 3250000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  -- Order 3: 4 000 bricks, nothing left in stock, sourced by someone without purchasing.
  ('7f190000-0000-4000-8000-000000000065', '7f190000-0000-4000-8000-000000000052', 1, '7f190000-0000-4000-8000-000000000011', 'Gạch 190',
   '7f190000-0000-4000-8000-000000000003', '7f190000-0000-4000-8000-000000000003', 4000, 1, 1, 'HALF_UP', 1300, 5200000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- A salesperson who confirms orders but cannot buy.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000190');
insert into public.employees(id, auth_user_id, code, display_name) values ('30000000-0000-4000-8000-000000000190', '10000000-0000-4000-8000-000000000190', 'NT_E190', 'Bán hàng 190');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000190', 'nt_sales190', 'Bán hàng thử 190');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000190', 'orders.read'), ('40000000-0000-4000-8000-000000000190', 'orders.confirm');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000190', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000190');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  order1 constant uuid := '7f190000-0000-4000-8000-000000000050';
  order2 constant uuid := '7f190000-0000-4000-8000-000000000051';
  order3 constant uuid := '7f190000-0000-4000-8000-000000000052';
  main_wh constant uuid := '7f190000-0000-4000-8000-000000000020';
  second_wh constant uuid := '7f190000-0000-4000-8000-000000000021';
  cheap constant uuid := '7f190000-0000-4000-8000-000000000030';
  op1 constant uuid := '7f190000-0000-4000-8000-0000000000a1';
  plan jsonb;
  outcome jsonb;
  again jsonb;
  po uuid;
  delivery uuid;
  failed text;
  v integer;
begin
  -- Only people working on orders, purchasing or deliveries may source.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.auto_source_sales_order(order1, op1); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must not source, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_branch_operation_settings(branch, jsonb_build_object('default_warehouse_id', main_wh), null, '7f190000-0000-4000-8000-0000000000b1');
  plan := public.order_sourcing_plan(order1);
  assert jsonb_array_length(plan->'lines') = 4, format('four lines to source %s', plan);
  assert plan->'lines'->0->>'choice' = 'WAREHOUSE' and plan->'lines'->0->'warehouse'->>'id' = main_wh::text, format('line 1 from main %s', plan->'lines'->0);
  assert plan->'lines'->1->>'choice' = 'WAREHOUSE' and plan->'lines'->1->'warehouse'->>'id' = second_wh::text
    and plan->'lines'->1->>'reason' like 'Kho chính thiếu%', format('line 2 from the second warehouse %s', plan->'lines'->1);
  assert plan->'lines'->2->>'choice' = 'SPLIT' and (plan->'lines'->2->'warehouse'->>'quantity')::numeric = 500
    and (plan->'lines'->2->'supplier'->>'quantity')::numeric = 20 and plan->'lines'->2->'supplier'->>'supplier_id' = cheap::text,
    format('line 3: 500 kg of stock + 20 bao from the cheap supplier %s', plan->'lines'->2);
  assert plan->'lines'->3->>'choice' = 'SHORT' and (plan->'lines'->3->>'short')::numeric = 5, format('sand is short %s', plan->'lines'->3);
  assert not exists (select 1 from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id where l.sales_order_id = order1),
    'the preview writes nothing';

  outcome := public.auto_source_sales_order(order1, op1);
  assert (outcome->>'warehouse_lines')::int = 3 and jsonb_array_length(outcome->'purchase_orders') = 1, format('outcome %s', outcome);
  po := (outcome->'purchase_orders'->0->>'purchase_order_id')::uuid;
  assert (select state || ':' || destination_type || ':' || supplier_id from public.purchase_orders where id = po) = 'DRAFT:CUSTOMER_SITE:' || cheap,
    'one draft direct purchase order at the cheapest supplier';
  assert (select count(*) || ':' || min(quantity) from public.purchase_order_lines where purchase_order_id = po) = '1:20.000000', 'buys the 20 bao still missing';
  assert (select string_agg(a.supply_mode || ':' || coalesce(w.code, '-') || ':' || trim_scale(a.allocated_base_quantity), ',' order by l.line_number, a.supply_mode)
    from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id left join public.warehouses w on w.id = a.warehouse_id
    where l.sales_order_id = order1) = 'WAREHOUSE:NT_K1901:500,WAREHOUSE:NT_K1902:1000,SUPPLIER_DIRECT:-:1000,WAREHOUSE:NT_K1901:500',
    'sources recorded per line';
  assert exists (select 1 from public.notifications where kind = 'purchase.draft_ready' and entity_id = po and required_permission = 'purchasing.confirm'),
    'purchasing is asked to approve the draft';
  assert exists (select 1 from public.notifications where kind = 'sales_order.short_source' and entity_id = order1 and body like 'Cát 190 5 m³%'),
    'purchasing is told what is short';
  assert (select count(*) from public.sales_order_sourcing_runs where sales_order_id = order1) = 1, 'run kept with its reasons';
  -- F3: the warehouse parts went on one delivery per warehouse; no truck has a default driver yet, so they wait for dispatch.
  assert jsonb_array_length(outcome->'deliveries') = 2 and outcome->'deliveries'->0->'dispatch'->>'status' = 'WAITING', format('deliveries %s', outcome->'deliveries');
  assert (select string_agg(w.code || ':' || trim_scale(l.planned_base_quantity), ',' order by w.code, l.planned_base_quantity)
    from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id join public.warehouses w on w.id = l.warehouse_id
    where d.sales_order_id = order1) = 'NT_K1901:500,NT_K1901:500,NT_K1902:1000', 'stock reserved on the deliveries';
  assert exists (select 1 from public.notifications where kind = 'delivery.waiting_dispatch'), 'dispatchers told';

  again := public.auto_source_sales_order(order1, op1);
  assert (again->>'replayed')::boolean and (select count(*) from public.purchase_orders where source_sales_order_id = order1) = 1, 'replay changes nothing';
  outcome := public.auto_source_sales_order(order1, '7f190000-0000-4000-8000-0000000000a2');
  assert (outcome->>'warehouse_lines')::int = 0 and jsonb_array_length(outcome->'purchase_orders') = 0, format('only sand is left %s', outcome);

  -- Order 2: 1 000 of the 2 000 bricks are promised to order 1. Without a trip cost the stock is used first.
  plan := public.order_sourcing_plan(order2);
  assert plan->'lines'->0->>'choice' = 'SPLIT' and (plan->'lines'->0->'warehouse'->>'quantity')::numeric = 1000
    and plan->'lines'->0->'warehouse'->>'id' = second_wh::text and (plan->'lines'->0->'supplier'->>'quantity')::numeric = 1500,
    format('free stock excludes what order 1 holds %s', plan->'lines'->0);
  -- With 5 000 000 đ a trip, one more trip to the warehouse costs more than buying the 1 000 bricks: the whole line is bought.
  perform public.save_branch_operation_settings(branch, '{"trip_cost_vnd":"5000000"}', 1, '7f190000-0000-4000-8000-0000000000b2');
  plan := public.order_sourcing_plan(order2);
  assert plan->'lines'->0->>'choice' = 'SUPPLIER' and (plan->'lines'->0->'supplier'->>'quantity')::numeric = 2500
    and plan->'lines'->0->'supplier'->>'supplier_id' = cheap::text and plan->'lines'->0->>'reason' like 'Mua cả dòng%',
    format('whole line from the supplier %s', plan->'lines'->0);

  -- Order 3 sourced by someone who cannot buy: nothing is bought, purchasing is told.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000190');
  outcome := public.auto_source_sales_order(order3, '7f190000-0000-4000-8000-0000000000a3');
  assert (outcome->>'waiting_purchase')::boolean and jsonb_array_length(outcome->'purchase_orders') = 0, format('waits for purchasing %s', outcome);
  assert not exists (select 1 from public.purchase_orders where source_sales_order_id = order3), 'no purchase order without purchasing.create';
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.notifications where kind = 'sales_order.needs_purchase' and entity_id = order3), 'purchasing notified';

  -- FB10: planning the supplier's delivery confirms the draft; the delivery is made with the supplier as contact.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  delivery := public.create_supplier_direct_delivery(po, '7f190000-0000-4000-8000-0000000000c2');
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = po) = 'CONFIRMED', 'draft confirmed by planning the delivery';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.create_supplier_direct_delivery(po, '7f190000-0000-4000-8000-0000000000c2') = delivery, 'replay returns the same delivery';
  assert (select d.execution_state || ':' || a.external_carrier_name || ':' || coalesce(a.external_carrier_phone, '')
    from public.deliveries d join public.delivery_assignments a on a.delivery_id = d.id and a.superseded_at is null where d.id = delivery)
    = 'ASSIGNED:NCC Rẻ 190:0901190001', 'assigned to the supplier';
  assert (select count(*) || ':' || min(trim_scale(planned_base_quantity)) || ':' || min(source_mode) from public.delivery_lines where delivery_id = delivery)
    = '1:1000:SUPPLIER_DIRECT', 'the 1 000 kg bought';
  failed := null;
  begin perform public.create_supplier_direct_delivery(po, '7f190000-0000-4000-8000-0000000000c3'); exception when others then failed := sqlstate; end;
  assert failed = '23514', 'nothing left to deliver';

  -- "NCC đã giao": a delivered quantity needs a photo; "not delivered" with a reason goes through and counts as arrived.
  select d.version into v from public.deliveries d where d.id = delivery;
  failed := null;
  begin perform public.submit_supplier_delivery_done(delivery, null, null, null, null, v, '7f190000-0000-4000-8000-0000000000d1');
  exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_photo_required', format('photo required, got %s', failed);
  assert (select execution_state from public.deliveries where id = delivery) = 'ASSIGNED', 'refusal changes nothing';
  perform public.submit_supplier_delivery_done(delivery,
    (select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'actual_base_quantity', 0)) from public.delivery_lines l where l.delivery_id = delivery),
    'Anh Nhận', 'NCC báo xe hỏng', null, v, '7f190000-0000-4000-8000-0000000000d2');
  assert (select execution_state || ':' || result_kind from public.deliveries where id = delivery) = 'RESULT_SUBMITTED:FAILED', 'reported as not delivered';
  assert exists (select 1 from public.notifications where kind = 'delivery.result_submitted' and entity_id = delivery and title like 'Không giao được%'),
    'the office is told';
  perform pg_temp.act_as_admin();
end
$test$;
