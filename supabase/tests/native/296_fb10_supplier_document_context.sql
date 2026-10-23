-- FB10 (4.7): invoice matching shows order number, ordered / received quantity and the order price source per line.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f296000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC296', 'NCC 296', '0901296000');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f296000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_K296', 'Kho 296', 'Địa chỉ kho 296');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f296000-0000-4000-8000-000000000031', 'nt_kg296', 'Kilôgam thử 296', 'kg'),
  ('7f296000-0000-4000-8000-000000000032', 'nt_bao296', 'Bao thử 296', 'bao');
insert into public.material_groups(id, code, name) values ('7f296000-0000-4000-8000-000000000041', 'NT_G296', 'Nhóm thử 296');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f296000-0000-4000-8000-000000000051', '7f296000-0000-4000-8000-000000000041', 'NT_XM296', 'Xi măng thử 296', '7f296000-0000-4000-8000-000000000031');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state, supplier_name_snapshot,
  destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f296000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT-PO-296', '7f296000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f296000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 296', 'Kho 296', 'Địa chỉ kho 296', '10000000-0000-4000-8000-000000000001'),
  ('7f296000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT-PO-297', '7f296000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f296000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 296', 'Kho 296', 'Địa chỉ kho 296', '10000000-0000-4000-8000-000000000001');
-- 10 bao of 50 kg at 80 000 ₫ a bao.
insert into public.purchase_order_lines(id, purchase_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason) values
  ('7f296000-0000-4000-8000-000000000061', '7f296000-0000-4000-8000-000000000003', 1, '7f296000-0000-4000-8000-000000000051', 'Xi măng thử 296',
   '7f296000-0000-4000-8000-000000000032', '7f296000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 80000, 800000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
select set_config('request.jwt.claim.sub', '', true);


do $test$
declare receipt uuid; line uuid; ctx record;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  receipt := public.receive_purchase_order('7f296000-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('purchase_order_line_id',
    '7f296000-0000-4000-8000-000000000061', 'received_quantity', '4')), null, now(), '7f296000-0000-4000-8000-0000000000a1');
  perform pg_temp.act_as_admin();
  select id into line from public.purchase_receipt_lines where purchase_receipt_id = receipt;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select * into ctx from public.supplier_document_source_context_read where source_kind = 'RECEIPT_LINE' and source_id = line;
  perform pg_temp.act_as_admin();
  assert ctx.purchase_order_number = 'NT-PO-296', format('order number %s', ctx.purchase_order_number);
  assert ctx.ordered_quantity::numeric = 10 and ctx.received_quantity::numeric = 4, format('ordered %s received %s', ctx.ordered_quantity, ctx.received_quantity);
  assert ctx.ordered_unit_cost = '80000' and ctx.price_source_type = 'MANUAL_APPROVED', 'order price and its source';
  -- Staff without finance read see nothing.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not exists (select 1 from public.supplier_document_source_context_read where source_id = line), 'hidden without finance.ap.read';
  perform pg_temp.act_as_admin();
end
$test$;
