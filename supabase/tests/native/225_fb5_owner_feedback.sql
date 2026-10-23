-- FB5 (Owner 18/10): a truck's capacity is read through the conversions both ways (4 tấn carries 80 bao when 1 tấn = 20 bao),
-- a truck is saved without a capacity evidence note, the order popup learns how much of each line a truck carries, and one
-- purchase price is saved together with the prices it implies for other units, all or nothing.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f225000-0000-4000-8000-000000000001', 'nt_tan225', 'Tấn thử 225', 'tấn'),
  ('7f225000-0000-4000-8000-000000000002', 'nt_bao225', 'Bao thử 225', 'bao'),
  ('7f225000-0000-4000-8000-000000000003', 'nt_kg225', 'Kilôgam thử 225', 'kg'),
  ('7f225000-0000-4000-8000-000000000004', 'nt_cay225', 'Cây thử 225', 'cây');
insert into public.material_groups(id, code, name) values ('7f225100-0000-4000-8000-000000000001', 'NT_G225', 'Nhóm thử 225');
-- Cement counted in bao, sold in bao; 1 tấn = 20 bao (the material's own conversion, stored from tấn to bao).
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f225200-0000-4000-8000-000000000001', '7f225100-0000-4000-8000-000000000001', 'NT_XM225', 'Xi măng thử 225', '7f225000-0000-4000-8000-000000000002');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type, settlement_allowed) values
  ('7f225200-0000-4000-8000-000000000001', '7f225000-0000-4000-8000-000000000001', '7f225000-0000-4000-8000-000000000002', 20, 1, 'PACKAGING', true);
-- A general conversion any material may use: 1 tấn = 1 000 kg.
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type, settlement_allowed) values
  (null, '7f225000-0000-4000-8000-000000000001', '7f225000-0000-4000-8000-000000000003', 1000, 1, 'EXACT', false);
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f225300-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH225', 'Khách thử 225', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f225300-0000-4000-8000-000000000002', '7f225300-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 225', 'Địa chỉ thử', 'Anh Nhận', '0901000225');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f225300-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K225', 'Kho thử 225');
insert into public.suppliers(id, branch_id, code, name) values
  ('7f225300-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_NCC225', 'NCC thử 225');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f225400-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2251', '7f225300-0000-4000-8000-000000000001',
   '7f225300-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 225', 'Công trình thử 225', 'Địa chỉ thử', 'Anh Nhận', '0901000225',
   '10000000-0000-4000-8000-000000000001', now());
-- 200 bao ordered.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f225400-0000-4000-8000-000000000002', '7f225400-0000-4000-8000-000000000001', 1, '7f225200-0000-4000-8000-000000000001', 'Xi măng thử 225',
   '7f225000-0000-4000-8000-000000000002', '7f225000-0000-4000-8000-000000000002', 200, 1, 1, 'HALF_UP', 80000, 16000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- 300 bao on hand (from an approved count).
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f225400-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', '7f225300-0000-4000-8000-000000000003', 'NT-KK-2251', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f225400-0000-4000-8000-000000000004', '7f225400-0000-4000-8000-000000000003', '7f225200-0000-4000-8000-000000000001', 0, 300, 70000, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f225200-0000-4000-8000-000000000001', '7f225000-0000-4000-8000-000000000002', 'WAREHOUSE',
   '7f225300-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 300, 21000000, 70000, '7f225400-0000-4000-8000-000000000004', now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  cement constant uuid := '7f225200-0000-4000-8000-000000000001';
  tan constant uuid := '7f225000-0000-4000-8000-000000000001';
  bao constant uuid := '7f225000-0000-4000-8000-000000000002';
  kg constant uuid := '7f225000-0000-4000-8000-000000000003';
  cay constant uuid := '7f225000-0000-4000-8000-000000000004';
  sale constant uuid := '7f225400-0000-4000-8000-000000000001';
  line constant uuid := '7f225400-0000-4000-8000-000000000002';
  wh constant uuid := '7f225300-0000-4000-8000-000000000003';
  supplier constant uuid := '7f225300-0000-4000-8000-000000000004';
  driver constant uuid := '30000000-0000-4000-8000-000000000001';
  truck constant uuid := '7f225500-0000-4000-8000-000000000001';
  start_at constant timestamptz := date_trunc('hour', now()) + interval '2 hours';
  result jsonb;
  failed text;
  saved jsonb;
  rules_before integer;
begin
  -- Conversions are read both ways and through a general one: 1 bao = 0,05 tấn, 1 tấn = 20 bao, 1 bao = 50 kg; none to cây.
  assert private.capacity_factor(cement, bao, tan, now()) = 0.05, format('1 bao = 0.05 tấn, got %s', private.capacity_factor(cement, bao, tan, now()));
  assert private.capacity_factor(cement, tan, bao, now()) = 20, 'one tấn is 20 bao';
  assert private.capacity_factor(cement, bao, kg, now()) = 50, format('1 bao = 50 kg in two steps, got %s', private.capacity_factor(cement, bao, kg, now()));
  assert private.capacity_factor(cement, bao, bao, now()) = 1, 'same unit is 1';
  assert private.capacity_factor(cement, bao, cay, now()) is null, 'no path to cây';

  -- A truck is saved with its capacity and no evidence note (Owner 18/10); FB10: a default note is kept so it can be assigned.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_catalog_record('vehicles', truck, branch,
    jsonb_build_object('code', 'NT_XE225', 'plate_number', '99C-225.01', 'capacity_quantity', '4', 'capacity_uom_id', tan, 'capacity_source_note', '  '),
    null, 'Xe 4 tấn thử', '7f225600-0000-4000-8000-000000000001');
  assert (select capacity_source_note = 'Sức chở khai báo trên xe' and capacity_verified_at is not null and capacity_quantity = 4 from public.vehicles where id = truck),
    'truck saved without a note, capacity confirmed';

  -- The popup reads how much of the line the truck carries: 4 tấn ≈ 80 bao.
  assert (select capacity_in_line_unit from public.vehicle_capacity_by_order(sale) where vehicle_id = truck and sales_order_line_id = line) = 80,
    'truck of 4 tấn carries 80 bao';

  -- 81 bao do not fit the 4 tấn truck; 80 bao do.
  failed := null;
  begin
    perform public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '81')), start_at,
      jsonb_build_object('employee_id', driver, 'vehicle_id', truck), '7f225600-0000-4000-8000-000000000002');
  exception when others then failed := sqlerrm; end;
  assert failed = 'vehicle_capacity_exceeded', format('81 bao must exceed the 4 tấn truck, got %s', failed);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '80')), start_at,
    jsonb_build_object('employee_id', driver, 'vehicle_id', truck), '7f225600-0000-4000-8000-000000000003');
  assert result->>'assignment_id' is not null, 'the 80 bao delivery is assigned to the 4 tấn truck';
  -- The route planner reads the same load in the truck's unit: 80 bao = 4 tấn.
  assert public.vehicle_load_for_deliveries(truck, array[(result->>'delivery_id')::uuid]) = 4, 'route load of 80 bao is 4 tấn';

  -- Loading on the truck uses the same reading: 80 bao fit, 81 do not.
  perform pg_temp.act_as_admin();
  perform private.assert_vehicle_actual_load((result->>'delivery_id')::uuid, (select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'loaded_base_quantity', 80))
    from public.delivery_lines l where l.delivery_id = (result->>'delivery_id')::uuid), now());
  failed := null;
  begin
    perform private.assert_vehicle_actual_load((result->>'delivery_id')::uuid, (select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'loaded_base_quantity', 81))
      from public.delivery_lines l where l.delivery_id = (result->>'delivery_id')::uuid), now());
  exception when others then failed := sqlerrm; end;
  assert failed = 'vehicle_actual_cargo_capacity_exceeded', format('81 bao loaded must exceed, got %s', failed);

  -- A truck counted in a unit the goods cannot be converted to is refused with the material named.
  update public.vehicles set capacity_uom_id = cay where id = truck;
  failed := null;
  begin
    perform private.assert_vehicle_actual_load((result->>'delivery_id')::uuid, (select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'loaded_base_quantity', 80))
      from public.delivery_lines l where l.delivery_id = (result->>'delivery_id')::uuid), now());
  exception when others then failed := sqlerrm; end;
  assert failed = 'vehicle_capacity_conversion_missing', format('no conversion to cây must be named, got %s', failed);
  update public.vehicles set capacity_uom_id = tan where id = truck;

  -- One purchase price and the price it implies for tấn are saved together; a replay returns the same rules.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin
    perform public.save_purchase_price_rules(branch, jsonb_build_array(jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000001',
      'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement, 'purchase_uom_id', bao, 'unit_cost_vnd', '80000', 'source_type', 'LIST',
        'effective_from', now()))), 'Giá mua thử', '7f225600-0000-4000-8000-000000000010');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('a reader must not save purchase prices, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  saved := public.save_purchase_price_rules(branch, jsonb_build_array(
    jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000001', 'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement,
      'purchase_uom_id', bao, 'unit_cost_vnd', '80000', 'source_type', 'LIST', 'effective_from', date_trunc('day', now()))),
    jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000002', 'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement,
      'purchase_uom_id', tan, 'unit_cost_vnd', '1600000', 'source_type', 'LIST', 'effective_from', date_trunc('day', now())))),
    'Giá mua thử', '7f225600-0000-4000-8000-000000000011');
  assert jsonb_array_length(saved) = 2 and (select count(*) from public.purchase_price_rules where supplier_id = supplier and material_id = cement and active) = 2,
    'both unit prices saved';
  assert (select unit_cost_vnd from public.purchase_price_rules where id = '7f225700-0000-4000-8000-000000000002') = 1600000, 'tấn price stored';
  saved := public.save_purchase_price_rules(branch, jsonb_build_array(
    jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000001', 'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement,
      'purchase_uom_id', bao, 'unit_cost_vnd', '80000', 'source_type', 'LIST', 'effective_from', date_trunc('day', now()))),
    jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000002', 'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement,
      'purchase_uom_id', tan, 'unit_cost_vnd', '1600000', 'source_type', 'LIST', 'effective_from', date_trunc('day', now())))),
    'Giá mua thử', '7f225600-0000-4000-8000-000000000011');
  assert saved = '["7f225700-0000-4000-8000-000000000001", "7f225700-0000-4000-8000-000000000002"]'::jsonb, format('replay returns the same rules, got %s', saved);

  -- A batch whose second rule clashes with an active price saves nothing at all.
  rules_before := (select count(*) from public.purchase_price_rules where supplier_id = supplier);
  failed := null;
  begin
    perform public.save_purchase_price_rules(branch, jsonb_build_array(
      jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000003', 'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement,
        'purchase_uom_id', kg, 'unit_cost_vnd', '1600', 'source_type', 'LIST', 'effective_from', date_trunc('day', now()))),
      jsonb_build_object('target_id', '7f225700-0000-4000-8000-000000000004', 'values', jsonb_build_object('supplier_id', supplier, 'material_id', cement,
        'purchase_uom_id', bao, 'unit_cost_vnd', '79000', 'source_type', 'LIST', 'effective_from', date_trunc('day', now())))),
      'Giá mua thử 2', '7f225600-0000-4000-8000-000000000012');
  exception when others then failed := sqlerrm; end;
  assert failed = 'active_rule_exists', format('the clashing bao price must refuse the batch, got %s', failed);
  assert (select count(*) from public.purchase_price_rules where supplier_id = supplier) = rules_before, 'the kg price of the refused batch is not kept';
end
$test$;
