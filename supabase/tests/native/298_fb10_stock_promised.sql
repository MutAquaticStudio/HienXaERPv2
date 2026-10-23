-- FB10 (5.1): stock promised to a confirmed order without a delivery yet is shown apart ("Đã hứa cho đơn") and is what
-- sourcing already holds back, so "Có thể bán" on the stock page matches what the system hands out.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f298000-0000-4000-8000-000000000001', 'nt_kg298', 'Kilôgam thử 298', 'kg'),
  ('7f298000-0000-4000-8000-000000000002', 'nt_bao298', 'Bao thử 298', 'bao'),
  ('7f298000-0000-4000-8000-000000000003', 'nt_vien298', 'Viên thử 298', 'viên'),
  ('7f298000-0000-4000-8000-000000000004', 'nt_m3298', 'Khối thử 298', 'm³');
insert into public.material_groups(id, code, name) values ('7f298000-0000-4000-8000-000000000005', 'NT_G298', 'Nhóm thử 298');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f298000-0000-4000-8000-000000000010', '7f298000-0000-4000-8000-000000000005', 'NT_XM298', 'Xi măng 298', '7f298000-0000-4000-8000-000000000001'),
  ('7f298000-0000-4000-8000-000000000011', '7f298000-0000-4000-8000-000000000005', 'NT_GA298', 'Gạch 298', '7f298000-0000-4000-8000-000000000003'),
  ('7f298000-0000-4000-8000-000000000012', '7f298000-0000-4000-8000-000000000005', 'NT_CA298', 'Cát 298', '7f298000-0000-4000-8000-000000000004');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f298000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_K2981', 'Kho chính 298'),
  ('7f298000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_K2982', 'Kho phụ 298');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f298000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', '7f298000-0000-4000-8000-000000000020', 'NT-KK-2981', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001'),
  ('7f298000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f298000-0000-4000-8000-000000000021', 'NT-KK-2982', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f298000-0000-4000-8000-000000000072', '7f298000-0000-4000-8000-000000000070', '7f298000-0000-4000-8000-000000000010', 0, 1000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f298000-0000-4000-8000-000000000073', '7f298000-0000-4000-8000-000000000070', '7f298000-0000-4000-8000-000000000011', 0, 300, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f298000-0000-4000-8000-000000000074', '7f298000-0000-4000-8000-000000000071', '7f298000-0000-4000-8000-000000000011', 0, 2000, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f298000-0000-4000-8000-000000000010', '7f298000-0000-4000-8000-000000000001', 'WAREHOUSE', '7f298000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 1000, 1500000, 1500, '7f298000-0000-4000-8000-000000000072', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f298000-0000-4000-8000-000000000011', '7f298000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f298000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 300, 270000, 900, '7f298000-0000-4000-8000-000000000073', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f298000-0000-4000-8000-000000000011', '7f298000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f298000-0000-4000-8000-000000000021', 'STOCK_ADJUSTMENT', 2000, 1800000, 900, '7f298000-0000-4000-8000-000000000074', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f298000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH298', 'Khách 298', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f298000-0000-4000-8000-000000000041', '7f298000-0000-4000-8000-000000000040', 'CT1', 'Công trình 298', 'Địa chỉ 298', 'Anh Nhận', '0901298099');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f298000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2981', '7f298000-0000-4000-8000-000000000040',
   '7f298000-0000-4000-8000-000000000041', 'CONFIRMED', 'Khách 298', 'Công trình 298', 'Địa chỉ 298', 'Anh Nhận', '0901298099', '10000000-0000-4000-8000-000000000001', now()),
  ('7f298000-0000-4000-8000-000000000051', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2982', '7f298000-0000-4000-8000-000000000040',
   '7f298000-0000-4000-8000-000000000041', 'CONFIRMED', 'Khách 298', 'Công trình 298', 'Địa chỉ 298', 'Anh Nhận', '0901298099', '10000000-0000-4000-8000-000000000001', now()),
  ('7f298000-0000-4000-8000-000000000052', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2983', '7f298000-0000-4000-8000-000000000040',
   '7f298000-0000-4000-8000-000000000041', 'CONFIRMED', 'Khách 298', 'Công trình 298', 'Địa chỉ 298', 'Anh Nhận', '0901298099', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f298000-0000-4000-8000-000000000060', '7f298000-0000-4000-8000-000000000050', 1, '7f298000-0000-4000-8000-000000000010', 'Xi măng 298',
   '7f298000-0000-4000-8000-000000000002', '7f298000-0000-4000-8000-000000000001', 10, 50, 1, 'HALF_UP', 95000, 950000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, warehouse_id, allocated_base_quantity, created_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f298000-0000-4000-8000-000000000060', 'WAREHOUSE', '7f298000-0000-4000-8000-000000000020', 500, '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare promised text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select p.promised_base_quantity into promised from public.warehouse_stock_promised('20000000-0000-4000-8000-00000000000a') p
    where p.warehouse_id = '7f298000-0000-4000-8000-000000000020' and p.material_id = '7f298000-0000-4000-8000-000000000010';
  perform pg_temp.act_as_admin();
  assert promised::numeric = 500, format('10 bao promised = 500 kg, got %s', promised);
  assert private.free_warehouse_stock('7f298000-0000-4000-8000-000000000020', '7f298000-0000-4000-8000-000000000010') = 1000 - promised::numeric,
    'same figure as sourcing';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not exists (select 1 from public.warehouse_stock_promised('20000000-0000-4000-8000-00000000000a')), 'hidden without inventory.read';
  perform pg_temp.act_as_admin();
end
$test$;
