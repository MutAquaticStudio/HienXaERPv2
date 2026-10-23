-- FB10: receiving a draft purchase order confirms it in the same step; a draft without lines still cannot be received.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f290000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC290', 'NCC 290', '0901290000');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f290000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_K290', 'Kho 290', 'Địa chỉ kho 290');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f290000-0000-4000-8000-000000000031', 'nt_kg290', 'Kilôgam thử 290', 'kg'),
  ('7f290000-0000-4000-8000-000000000032', 'nt_bao290', 'Bao thử 290', 'bao');
insert into public.material_groups(id, code, name) values ('7f290000-0000-4000-8000-000000000041', 'NT_G290', 'Nhóm thử 290');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f290000-0000-4000-8000-000000000051', '7f290000-0000-4000-8000-000000000041', 'NT_XM290', 'Xi măng thử 290', '7f290000-0000-4000-8000-000000000031');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state, supplier_name_snapshot,
  destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f290000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT-PO-290', '7f290000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f290000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 290', 'Kho 290', 'Địa chỉ kho 290', '10000000-0000-4000-8000-000000000001'),
  ('7f290000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT-PO-291', '7f290000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f290000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 290', 'Kho 290', 'Địa chỉ kho 290', '10000000-0000-4000-8000-000000000001');
-- 10 bao of 50 kg at 80 000 ₫ a bao.
insert into public.purchase_order_lines(id, purchase_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason) values
  ('7f290000-0000-4000-8000-000000000061', '7f290000-0000-4000-8000-000000000003', 1, '7f290000-0000-4000-8000-000000000051', 'Xi măng thử 290',
   '7f290000-0000-4000-8000-000000000032', '7f290000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 80000, 800000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  po constant uuid := '7f290000-0000-4000-8000-000000000003';
  receipt uuid; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  receipt := public.receive_purchase_order(po, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f290000-0000-4000-8000-000000000061',
    'received_quantity', '4')), null, now(), '7f290000-0000-4000-8000-0000000000a1');
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = po) = 'CONFIRMED', 'draft confirmed by the receipt';
  assert (select confirmed_at is not null from public.purchase_orders where id = po), 'confirmation time kept';
  assert (select sum(base_quantity_delta) from public.inventory_movements where warehouse_id = '7f290000-0000-4000-8000-000000000002') = 200,
    '4 bao = 200 kg received';
  assert (select original_amount_vnd from public.payable_obligations where purchase_receipt_id = receipt) = 320000, 'payable for what was received';
  assert exists (select 1 from public.audit_events where entity_id = po and action = 'purchase_order.confirm' and reason = 'Xác nhận khi nhận hàng'),
    'confirmation recorded';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.receive_purchase_order(po, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f290000-0000-4000-8000-000000000061',
    'received_quantity', '6')), null, now(), '7f290000-0000-4000-8000-0000000000a2');
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = po) = 'CLOSED', 'closed when everything arrived';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin perform public.receive_purchase_order('7f290000-0000-4000-8000-000000000004', jsonb_build_array(jsonb_build_object('purchase_order_line_id',
      '7f290000-0000-4000-8000-000000000061', 'received_quantity', '1')), null, now(), '7f290000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'purchase_order_not_confirmable', format('a draft without lines is not received, got %s', failed);
end
$test$;
