-- D95 part 3: "Đóng phần còn lại" of a purchase order received in part. The order is CLOSED with its reason audited; what arrived
-- and the payable stay; the sales line's source shrinks to what arrived (so the sales order shows the remainder as needing a source),
-- never below what a delivery already plans from it. Refusals: not confirmed, nothing received, reason, permission; idempotent.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f362000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC362', 'NCC 362', '0901362000');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f362000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_K362', 'Kho 362', 'Địa chỉ kho 362');
insert into public.units_of_measure(id, code, name, symbol) values ('7f362000-0000-4000-8000-000000000003', 'nt_vien362', 'Viên thử 362', 'viên');
insert into public.material_groups(id, code, name) values ('7f362000-0000-4000-8000-000000000004', 'NT_G362', 'Nhóm thử 362');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f362000-0000-4000-8000-000000000005', '7f362000-0000-4000-8000-000000000004', 'NT_GACH362', 'Gạch 362', '7f362000-0000-4000-8000-000000000003');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f362000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH362', 'Khách 362', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f362000-0000-4000-8000-000000000011', '7f362000-0000-4000-8000-000000000010', 'CT1', 'Công trình 362', 'Địa chỉ 362', 'Anh Nhận', '0901362001');
-- Orders 1..3, one line each of 1 000 viên.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at)
select ('7f362000-0000-4000-8000-00000000002' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-SO-362' || n,
  '7f362000-0000-4000-8000-000000000010', '7f362000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 362', 'Công trình 362', 'Địa chỉ 362', 'Anh Nhận', '0901362001',
  '10000000-0000-4000-8000-000000000001', now()
from generate_series(1, 3) as n;
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
select ('7f362000-0000-4000-8000-00000000003' || n)::uuid, ('7f362000-0000-4000-8000-00000000002' || n)::uuid, 1, '7f362000-0000-4000-8000-000000000005', 'Gạch 362',
  '7f362000-0000-4000-8000-000000000003', '7f362000-0000-4000-8000-000000000003', 1000, 1, 1, 'HALF_UP', 1200, 1200000, 'MANUAL_APPROVED',
  '10000000-0000-4000-8000-000000000001', 'Giá thử'
from generate_series(1, 3) as n;
-- P1: warehouse order buying order 1's bricks into the warehouse (draft, confirmed by its first receipt).
-- P2: supplier-direct for order 2 (confirmed). P3: supplier-direct for order 3 (confirmed, nothing arrived yet). P4: a draft.
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state,
  supplier_name_snapshot, destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f362000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT-PO-3621', '7f362000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f362000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 362', 'Kho 362', 'Địa chỉ kho 362', '10000000-0000-4000-8000-000000000001'),
  ('7f362000-0000-4000-8000-000000000044', '20000000-0000-4000-8000-00000000000a', 'NT-PO-3624', '7f362000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f362000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 362', 'Kho 362', 'Địa chỉ kho 362', '10000000-0000-4000-8000-000000000001');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, customer_id, site_id, source_sales_order_id,
  state, confirmed_at, supplier_name_snapshot, destination_name_snapshot, destination_address_snapshot, created_by)
select ('7f362000-0000-4000-8000-00000000004' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-PO-362' || n, '7f362000-0000-4000-8000-000000000001',
  'CUSTOMER_SITE', '7f362000-0000-4000-8000-000000000010', '7f362000-0000-4000-8000-000000000011', ('7f362000-0000-4000-8000-00000000002' || n)::uuid,
  'CONFIRMED', now(), 'NCC 362', 'Công trình 362', 'Địa chỉ 362', '10000000-0000-4000-8000-000000000001'
from generate_series(2, 3) as n;
insert into public.purchase_order_lines(id, purchase_order_id, linked_sales_order_line_id, line_number, material_id, material_name_snapshot, ordered_uom_id,
  base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason)
select ('7f362000-0000-4000-8000-00000000005' || n)::uuid, ('7f362000-0000-4000-8000-00000000004' || n)::uuid,
  case when n in (2, 3) then ('7f362000-0000-4000-8000-00000000003' || n)::uuid end,
  1, '7f362000-0000-4000-8000-000000000005', 'Gạch 362', '7f362000-0000-4000-8000-000000000003', '7f362000-0000-4000-8000-000000000003',
  1000, 1, 1, 'HALF_UP', 1000, 1000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'
from generate_series(1, 4) as n;
-- Order 1's line is sourced from P1 into the warehouse; orders 2 and 3 straight from the supplier.
insert into public.supply_allocations(id, branch_id, sales_order_line_id, supply_mode, purchase_order_line_id, warehouse_id, allocated_base_quantity, created_by) values
  ('7f362000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-00000000000a', '7f362000-0000-4000-8000-000000000031', 'SUPPLIER_TO_WAREHOUSE',
   '7f362000-0000-4000-8000-000000000051', '7f362000-0000-4000-8000-000000000002', 1000, '10000000-0000-4000-8000-000000000001');
insert into public.supply_allocations(id, branch_id, sales_order_line_id, supply_mode, purchase_order_line_id, allocated_base_quantity, created_by) values
  ('7f362000-0000-4000-8000-000000000062', '20000000-0000-4000-8000-00000000000a', '7f362000-0000-4000-8000-000000000032', 'SUPPLIER_DIRECT',
   '7f362000-0000-4000-8000-000000000052', 1000, '10000000-0000-4000-8000-000000000001'),
  ('7f362000-0000-4000-8000-000000000063', '20000000-0000-4000-8000-00000000000a', '7f362000-0000-4000-8000-000000000033', 'SUPPLIER_DIRECT',
   '7f362000-0000-4000-8000-000000000053', 1000, '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  me constant uuid := '10000000-0000-4000-8000-000000000001';
  p1 constant uuid := '7f362000-0000-4000-8000-000000000041';
  p2 constant uuid := '7f362000-0000-4000-8000-000000000042';
  p3 constant uuid := '7f362000-0000-4000-8000-000000000043';
  p4 constant uuid := '7f362000-0000-4000-8000-000000000044';
  op1 constant uuid := '7f362000-0000-4000-8000-0000000009a1';
  payable_before bigint;
  audits integer;
  failed text;
begin
  -- 900 of 1 000 viên arrive in the warehouse; the supplier is out of stock.
  perform pg_temp.act_as(me);
  perform public.receive_purchase_order(p1, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f362000-0000-4000-8000-000000000051',
    'received_quantity', '900')), null, now(), '7f362000-0000-4000-8000-0000000000b1');
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = p1) = 'CONFIRMED', 'received in part: still open';
  select coalesce(sum(original_amount_vnd), 0) into payable_before from public.payable_obligations o join public.purchase_receipts r on r.id = o.purchase_receipt_id where r.purchase_order_id = p1;
  assert payable_before = 900000, format('payable for what arrived %s', payable_before);

  perform pg_temp.act_as(me);
  failed := null;
  begin perform public.close_purchase_order_remaining(p1, 'x', op1); exception when others then failed := sqlerrm; end;
  assert failed = 'close_reason_required', format('a reason is required, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.close_purchase_order_remaining(p1, 'NCC báo hết hàng', op1); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('a reader cannot close, got %s', failed);

  perform pg_temp.act_as(me);
  assert public.close_purchase_order_remaining(p1, 'NCC báo hết hàng', op1) = p1, 'closed';
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = p1) = 'CLOSED', 'the purchase order is closed';
  assert (select allocated_base_quantity from public.supply_allocations where id = '7f362000-0000-4000-8000-000000000061') = 900,
    'the sales line keeps only what arrived from it';
  assert (select remaining_base_quantity::numeric from public.sales_line_supply_read where sales_order_line_id = '7f362000-0000-4000-8000-000000000031') = 100,
    format('the sales order shows 100 viên needing a new source, got %s',
      (select remaining_base_quantity from public.sales_line_supply_read where sales_order_line_id = '7f362000-0000-4000-8000-000000000031'));
  assert (select coalesce(sum(original_amount_vnd), 0) from public.payable_obligations o join public.purchase_receipts r on r.id = o.purchase_receipt_id where r.purchase_order_id = p1) = payable_before,
    'the payable stays as received';
  assert (select sum(base_quantity_delta) from public.inventory_movements where warehouse_id = '7f362000-0000-4000-8000-000000000002') = 900, 'stock stays as received';
  assert exists (select 1 from public.audit_events where action = 'purchase_order.remaining.close' and entity_id = p1 and trace_id = op1
    and reason = 'NCC báo hết hàng' and changed_fields = array['state', 'supply_allocation']), 'audited with the reason';
  select count(*) into audits from public.audit_events where trace_id = op1;
  perform pg_temp.act_as(me);
  assert public.close_purchase_order_remaining(p1, 'NCC báo hết hàng', op1) = p1, 'replay returns the same id';
  failed := null;
  begin perform public.close_purchase_order_remaining(p1, 'Lý do khác', op1); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', format('same operation, other payload, got %s', failed);
  failed := null;
  begin perform public.close_purchase_order_remaining(p1, 'NCC báo hết hàng', '7f362000-0000-4000-8000-0000000009a2'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_order_not_closeable', format('a closed order is not closed twice, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.audit_events where trace_id = op1) = audits, 'replay adds no audit';

  -- P2: the supplier delivered 600 of 1 000 straight to site; closing leaves order 2 with 400 to source again.
  perform pg_temp.act_as(me);
  perform public.verify_supplier_fulfillment(p2, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f362000-0000-4000-8000-000000000052',
    'supplier_quantity', '600')), null, 'NCC giao 600', '7f362000-0000-4000-8000-0000000000b2');
  assert public.close_purchase_order_remaining(p2, 'NCC giao thiếu, không giao tiếp', '7f362000-0000-4000-8000-0000000009a3') = p2, 'direct order closed';
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = p2) = 'CLOSED', 'direct order closed';
  assert (select allocated_base_quantity from public.supply_allocations where id = '7f362000-0000-4000-8000-000000000062') = 600, 'direct source shrinks to 600';

  -- P3: a delivery note already plans all 1 000 from the source; the supplier delivered 700: the source is not cut below the plan.
  perform pg_temp.act_as(me);
  perform public.create_supplier_direct_delivery(p3, '7f362000-0000-4000-8000-0000000000b3');
  failed := null;
  begin perform public.close_purchase_order_remaining(p3, 'NCC báo hết hàng', '7f362000-0000-4000-8000-0000000009a4'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_order_nothing_received', format('nothing arrived: cancel instead, got %s', failed);
  perform public.verify_supplier_fulfillment(p3, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f362000-0000-4000-8000-000000000053',
    'supplier_quantity', '700')), null, 'NCC giao 700', '7f362000-0000-4000-8000-0000000000b4');
  assert public.close_purchase_order_remaining(p3, 'NCC báo hết hàng', '7f362000-0000-4000-8000-0000000009a5') = p3, 'closed with a planned delivery';
  perform pg_temp.act_as_admin();
  assert (select allocated_base_quantity from public.supply_allocations where id = '7f362000-0000-4000-8000-000000000063') = 1000,
    'a source a delivery still plans from is not cut below the plan';

  -- P4: a draft is not closed (cancel it instead).
  perform pg_temp.act_as(me);
  failed := null;
  begin perform public.close_purchase_order_remaining(p4, 'NCC báo hết hàng', '7f362000-0000-4000-8000-0000000009a6'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_order_not_closeable', format('a draft is not closed, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.command_receipts where operation_id in ('7f362000-0000-4000-8000-0000000009a2', '7f362000-0000-4000-8000-0000000009a4',
    '7f362000-0000-4000-8000-0000000009a6')), 'a refused close leaves no receipt';
end
$test$;
