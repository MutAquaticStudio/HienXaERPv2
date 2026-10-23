-- FB10 (4.6): "Trả hàng nhập" in one step, in the unit the goods were bought in; refund into a fund when already paid.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f295000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC295', 'NCC 295', '0901295000');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f295000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_K295', 'Kho 295', 'Địa chỉ kho 295');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f295000-0000-4000-8000-000000000031', 'nt_kg295', 'Kilôgam thử 295', 'kg'),
  ('7f295000-0000-4000-8000-000000000032', 'nt_bao295', 'Bao thử 295', 'bao');
insert into public.material_groups(id, code, name) values ('7f295000-0000-4000-8000-000000000041', 'NT_G295', 'Nhóm thử 295');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f295000-0000-4000-8000-000000000051', '7f295000-0000-4000-8000-000000000041', 'NT_XM295', 'Xi măng thử 295', '7f295000-0000-4000-8000-000000000031');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state, supplier_name_snapshot,
  destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f295000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT-PO-295', '7f295000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f295000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 295', 'Kho 295', 'Địa chỉ kho 295', '10000000-0000-4000-8000-000000000001'),
  ('7f295000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT-PO-296', '7f295000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f295000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 295', 'Kho 295', 'Địa chỉ kho 295', '10000000-0000-4000-8000-000000000001');
-- 10 bao of 50 kg at 80 000 ₫ a bao.
insert into public.purchase_order_lines(id, purchase_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason) values
  ('7f295000-0000-4000-8000-000000000061', '7f295000-0000-4000-8000-000000000003', 1, '7f295000-0000-4000-8000-000000000051', 'Xi măng thử 295',
   '7f295000-0000-4000-8000-000000000032', '7f295000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 80000, 800000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f295000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', 'NT_QUY295', 'Quỹ thử 295', 'CASH', '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);


do $test$
declare
  po constant uuid := '7f295000-0000-4000-8000-000000000003';
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  fund constant uuid := '7f295000-0000-4000-8000-000000000071';
  r1 uuid; r2 uuid; l1 uuid; l2 uuid; first_case uuid; again uuid; failed text; payable1 uuid; payable2 uuid;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  r1 := public.receive_purchase_order(po, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f295000-0000-4000-8000-000000000061',
    'received_quantity', '4')), null, now(), '7f295000-0000-4000-8000-0000000000a1');
  r2 := public.receive_purchase_order(po, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f295000-0000-4000-8000-000000000061',
    'received_quantity', '6')), null, now(), '7f295000-0000-4000-8000-0000000000a2');
  perform pg_temp.act_as_admin();
  select id into l1 from public.purchase_receipt_lines where purchase_receipt_id = r1;
  select id into l2 from public.purchase_receipt_lines where purchase_receipt_id = r2;
  select id into payable1 from public.payable_obligations where purchase_receipt_id = r1;
  select id into payable2 from public.payable_obligations where purchase_receipt_id = r2;

  -- 1. Unpaid receipt: return 2 bao (= 100 kg) in one step; the payable drops by 2 × 80 000.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert (select returnable_quantity from public.supplier_return_receipt_line_read where receipt_line_id = l1) = '4.000000', 'returnable in bao';
  first_case := public.complete_supplier_return(r1, jsonb_build_array(jsonb_build_object('receipt_line_id', l1, 'quantity', '2')), null, '',
    '7f295000-0000-4000-8000-0000000000b1');
  again := public.complete_supplier_return(r1, jsonb_build_array(jsonb_build_object('receipt_line_id', l1, 'quantity', '2')), null, '',
    '7f295000-0000-4000-8000-0000000000b1');
  assert (select returnable_quantity from public.supplier_return_receipt_line_read where receipt_line_id = l1) = '2.000000', 'returned shown in bao';
  perform pg_temp.act_as_admin();
  assert again = first_case, 'retry replays';
  assert (select count(*) from public.supplier_return_cases where source_receipt_line_id = l1) = 1, 'one case';
  assert (select requested_base_quantity from public.supplier_return_cases where id = first_case) = 100, '2 bao = 100 kg';
  assert (select sum(base_quantity_delta) from public.inventory_movements where warehouse_id = '7f295000-0000-4000-8000-000000000002') = 400,
    '500 kg received − 100 kg returned';
  assert private.current_payable_outstanding(payable1) = 160000, format('payable 320 000 − 160 000, got %s', private.current_payable_outstanding(payable1));

  -- 2. Paid receipt: return 1 bao and the supplier pays back into the fund at once.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.post_payment(branch, 'DISBURSEMENT', null, '7f295000-0000-4000-8000-000000000001', fund, 480000, now(), 'CASH', null,
    jsonb_build_array(jsonb_build_object('obligation_id', payable2, 'amount_vnd', 480000)), 0, '7f295000-0000-4000-8000-0000000000c1');
  perform public.complete_supplier_return(r2, jsonb_build_array(jsonb_build_object('receipt_line_id', l2, 'quantity', '1')), fund, 'Hàng vỡ',
    '7f295000-0000-4000-8000-0000000000b2');
  perform pg_temp.act_as_admin();
  assert (select amount_vnd from public.payments where supplier_id = '7f295000-0000-4000-8000-000000000001' and direction = 'RECEIPT') = 80000,
    'supplier refund received into the fund';
  assert private.current_payable_outstanding(payable2) = 0, 'paid payable stays settled';

  -- 3. Cannot return more than what is left.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin perform public.complete_supplier_return(r1, jsonb_build_array(jsonb_build_object('receipt_line_id', l1, 'quantity', '3')), null, '',
      '7f295000-0000-4000-8000-0000000000b3');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'supplier_return_exceeds_source_quantity', format('over-return refused, got %s', failed);
end
$test$;
