-- FB11: "NCC đã giao" on a supplier-direct delivery verifies it and records the supplier's delivery on the purchase order
-- (payable, direct cost, purchase order closed); the office verification records it too. Fixture as in 190.
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

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f190000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000040', 'SALES_ORDER', '7f190000-0000-4000-8000-000000000050',
   100000000, '10000000-0000-4000-8000-000000000001', '7f190000-0000-4000-8000-000000000050');
insert into public.evidence_objects(id, branch_id, bucket_name, object_path, upload_state, checksum_sha256, byte_size, created_by, verified_at) values
  ('7f190000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-00000000000a', 'delivery-proofs', 'nt304/ncc-1.jpg', 'VERIFIED', repeat('a', 64), 100, '10000000-0000-4000-8000-000000000001', now()),
  ('7f190000-0000-4000-8000-0000000000e2', '20000000-0000-4000-8000-00000000000a', 'delivery-proofs', 'nt304/ncc-2.jpg', 'VERIFIED', repeat('b', 64), 100, '10000000-0000-4000-8000-000000000001', now()),
  ('7f190000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-00000000000a', 'delivery-proofs', 'nt304/ncc-3.jpg', 'VERIFIED', repeat('c', 64), 100, '10000000-0000-4000-8000-000000000001', now());
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f190000-0000-4000-8000-0000000000f3', '20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000040', 'SALES_ORDER',
   '7f190000-0000-4000-8000-000000000052', 100000000, '10000000-0000-4000-8000-000000000001', '7f190000-0000-4000-8000-000000000052');
select set_config('request.jwt.claim.sub', '', true);
-- The storage attestation of a real upload is outside this test.
create or replace function private.assert_verified_evidence(target_evidence_id uuid, target_branch_id uuid) returns void language sql as 'select';

do $test$
declare
  order1 constant uuid := '7f190000-0000-4000-8000-000000000050';
  order2 constant uuid := '7f190000-0000-4000-8000-000000000051';
  order3 constant uuid := '7f190000-0000-4000-8000-000000000052';
  outcome jsonb; po uuid; po2 uuid; po3 uuid; delivery3 uuid; delivery uuid; delivery2 uuid; v integer; result2 uuid;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  outcome := public.auto_source_sales_order(order1, '7f190000-0000-4000-8000-0000000000a1');
  po := (outcome->'purchase_orders'->0->>'purchase_order_id')::uuid;
  delivery := public.create_supplier_direct_delivery(po, '7f190000-0000-4000-8000-0000000000c1');
  select d.version into v from public.deliveries d where d.id = delivery;
  perform public.submit_supplier_delivery_done(delivery, null, 'Anh Nhận', null, '7f190000-0000-4000-8000-0000000000e1', v, '7f190000-0000-4000-8000-0000000000d1');
  perform pg_temp.act_as_admin();
  assert (select execution_state || ':' || result_kind from public.deliveries where id = delivery) = 'VERIFIED:FULL', 'the supplier report verifies the delivery';
  assert (select state from public.purchase_orders where id = po) = 'CLOSED', 'the purchase order is delivered in full';
  assert (select count(*) || ':' || min(trim_scale(fl.supplier_quantity)) || ':' || min(fl.payable_amount_vnd) from public.supplier_fulfillment_lines fl
    join public.supplier_fulfillments f on f.id = fl.supplier_fulfillment_id where f.purchase_order_id = po) = '1:20:1600000', '20 bao at 80 000 đ recorded';
  assert (select sum(o.original_amount_vnd) from public.payable_obligations o join public.supplier_fulfillments f on f.id = o.supplier_fulfillment_id
    where f.purchase_order_id = po) = 1600000, 'owed to the supplier';
  assert (select sum(amount_delta_vnd) from public.direct_cost_entries where sales_order_id = order1 and cost_kind = 'SUPPLIER_DIRECT') = 1600000, 'cost of the order';
  assert exists (select 1 from public.receivable_obligations r join public.delivery_verifications dv on dv.id = r.delivery_verification_id
    where dv.delivery_id = delivery and r.original_amount_vnd = 1900000), '20 bao at 95 000 đ owed by the customer';
  assert private.delivery_cost_sources_complete((select id from public.delivery_verifications where delivery_id = delivery), now()), 'cost sources complete';
  assert exists (select 1 from public.notifications where kind = 'delivery.result_submitted' and entity_id = delivery and title like '%NCC đã giao xong'), 'office told';
  -- Recording again changes nothing.
  assert private.record_supplier_delivery_fulfillment(delivery, null) = 0, 'recorded once';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Order 2 has no credit commitment yet: the report is kept and the office verifies; that also records the supplier delivery.
  outcome := public.auto_source_sales_order(order2, '7f190000-0000-4000-8000-0000000000a2');
  po2 := (outcome->'purchase_orders'->0->>'purchase_order_id')::uuid;
  delivery2 := public.create_supplier_direct_delivery(po2, '7f190000-0000-4000-8000-0000000000c2');
  select d.version into v from public.deliveries d where d.id = delivery2;
  result2 := public.submit_supplier_delivery_done(delivery2, null, 'Anh Nhận', null, '7f190000-0000-4000-8000-0000000000e2', v, '7f190000-0000-4000-8000-0000000000d2');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery2) = 'RESULT_SUBMITTED', 'credit problem: waits for the office';
  assert (select state from public.purchase_orders where id = po2) = 'CONFIRMED', 'nothing recorded yet';
  assert exists (select 1 from public.notifications where kind = 'delivery.result_submitted' and entity_id = delivery2 and title like 'Cần xác minh tay%'), 'office asked';
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
    ('20000000-0000-4000-8000-00000000000a', '7f190000-0000-4000-8000-000000000040', 'SALES_ORDER', '7f190000-0000-4000-8000-000000000051', 100000000, '10000000-0000-4000-8000-000000000001', order2);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.verify_delivery(result2, (select jsonb_agg(jsonb_build_object('delivery_line_id', rl.delivery_line_id,
      'accepted_base_quantity', trim_scale(rl.actual_base_quantity)::text, 'billable_base_quantity', trim_scale(rl.actual_base_quantity)::text))
    from public.delivery_result_lines rl where rl.delivery_result_id = result2), (select d.version from public.deliveries d where d.id = delivery2),
    '7f190000-0000-4000-8000-0000000000d3');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery2) = 'VERIFIED', 'verified by the office';
  assert (select state from public.purchase_orders where id = po2) = 'CLOSED', 'the office verification records the supplier delivery';
  assert (select count(*) from public.supplier_fulfillments f where f.purchase_order_id = po2) = 1, 'one record per delivery';

  -- Order 3 (all bought): "NCC đã giao" was recorded by hand on the purchase order; the delivery report does not record it again.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  outcome := public.auto_source_sales_order(order3, '7f190000-0000-4000-8000-0000000000a3');
  po3 := (outcome->'purchase_orders'->0->>'purchase_order_id')::uuid;
  delivery3 := public.create_supplier_direct_delivery(po3, '7f190000-0000-4000-8000-0000000000c3');
  perform public.verify_supplier_fulfillment(po3, (select jsonb_agg(jsonb_build_object('purchase_order_line_id', l.id, 'supplier_quantity', trim_scale(l.quantity)::text))
    from public.purchase_order_lines l where l.purchase_order_id = po3), '7f190000-0000-4000-8000-0000000000e3', 'Nhập tay', '7f190000-0000-4000-8000-0000000000c4');
  select d.version into v from public.deliveries d where d.id = delivery3;
  perform public.submit_supplier_delivery_done(delivery3, null, 'Anh Nhận', null, '7f190000-0000-4000-8000-0000000000e3', v, '7f190000-0000-4000-8000-0000000000d4');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery3) = 'VERIFIED', 'delivery verified';
  assert (select count(*) || ':' || min(supplier_reference) from public.supplier_fulfillments where purchase_order_id = po3) = '1:Nhập tay', 'the hand entry is not doubled';
end
$test$;
