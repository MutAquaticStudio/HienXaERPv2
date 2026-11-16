-- D96 (S4): business dates are Vietnam days. private.business_today(ts) turns an instant into its Asia/Ho_Chi_Minh day; the
-- supplier payable of a receipt is due on the Vietnam day it was received, the receipt number takes the Vietnam year, and the
-- overdue check that blocks credit compares with the Vietnam day.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f370000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC370', 'NCC 370', '0901370000');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f370000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_K370', 'Kho 370', 'Địa chỉ kho 370');
insert into public.units_of_measure(id, code, name, symbol) values ('7f370000-0000-4000-8000-000000000031', 'nt_kg370', 'Kilôgam thử 370', 'kg');
insert into public.material_groups(id, code, name) values ('7f370000-0000-4000-8000-000000000041', 'NT_G370', 'Nhóm thử 370');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f370000-0000-4000-8000-000000000051', '7f370000-0000-4000-8000-000000000041', 'NT_XM370', 'Xi măng thử 370', '7f370000-0000-4000-8000-000000000031');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state, supplier_name_snapshot,
  destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f370000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT-PO-370', '7f370000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f370000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 370', 'Kho 370', 'Địa chỉ kho 370', '10000000-0000-4000-8000-000000000001');
insert into public.purchase_order_lines(id, purchase_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason) values
  ('7f370000-0000-4000-8000-000000000061', '7f370000-0000-4000-8000-000000000003', 1, '7f370000-0000-4000-8000-000000000051', 'Xi măng thử 370',
   '7f370000-0000-4000-8000-000000000031', '7f370000-0000-4000-8000-000000000031', 10, 1, 1, 'HALF_UP', 1000, 10000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- A customer with a limit, an order to confirm, and a debt whose due date moves around "today" below.
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7f370000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', 'NT_KH370', 'Khách 370', 'BUSINESS', 100000000);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f370000-0000-4000-8000-000000000072', '7f370000-0000-4000-8000-000000000071', 'CT370', 'Công trình 370', 'Thủ Đức', 'Anh Nhận', '0901370001');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by) values
  ('7f370000-0000-4000-8000-000000000081', '20000000-0000-4000-8000-00000000000a', 'NT-SO-370', '7f370000-0000-4000-8000-000000000071',
   '7f370000-0000-4000-8000-000000000072', 'DRAFT', 'Khách 370', 'Công trình 370', 'Thủ Đức', 'Anh Nhận', '0901370001', '10000000-0000-4000-8000-000000000001');
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f370000-0000-4000-8000-000000000082', '7f370000-0000-4000-8000-000000000081', 1, '7f370000-0000-4000-8000-000000000051', 'Xi măng thử 370',
   '7f370000-0000-4000-8000-000000000031', '7f370000-0000-4000-8000-000000000031', 10, 1, 1, 'HALF_UP', 2000, 20000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
set local session_replication_role = replica;
insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id) values
  ('7f370000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-00000000000a', '7f370000-0000-4000-8000-000000000071', 5000,
   (now() at time zone 'Asia/Ho_Chi_Minh')::date, '10000000-0000-4000-8000-000000000001', gen_random_uuid());
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  po constant uuid := '7f370000-0000-4000-8000-000000000003';
  so constant uuid := '7f370000-0000-4000-8000-000000000081';
  receipt uuid; failed text;
begin
  -- The Vietnam day changes at 17:00 UTC, whatever the database time zone is.
  perform set_config('timezone', 'UTC', true);
  assert private.business_today('2026-11-16 16:59:59+00') = date '2026-11-16', 'before midnight in Vietnam';
  assert private.business_today('2026-11-16 17:00:00+00') = date '2026-11-17', 'midnight in Vietnam';
  assert private.business_today('2026-11-16 23:40:00+00') = date '2026-11-17', '06:40 on 17/11 in Vietnam';
  assert private.business_today('2026-12-31 17:30:00+00') = date '2027-01-01', 'new year in Vietnam';
  assert private.business_today() = (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'default is now';

  -- Goods received at 06:40 on 11/11 Vietnam time (23:40 UTC on 10/11): the supplier is owed from 11/11.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  receipt := public.receive_purchase_order(po, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f370000-0000-4000-8000-000000000061',
    'received_quantity', '4')), null, '2026-11-10 23:40:00+00', '7f370000-0000-4000-8000-0000000000a1');
  perform pg_temp.act_as_admin();
  assert (select due_date from public.payable_obligations where purchase_receipt_id = receipt) = date '2026-11-11',
    format('payable due on the Vietnam day, got %s', (select due_date from public.payable_obligations where purchase_receipt_id = receipt));
  assert (select receipt_number like 'PR-' || to_char(private.business_today(), 'YYYY') || '-%' from public.purchase_receipts where id = receipt),
    'receipt number with the Vietnam year';

  -- A debt due today (Vietnam) is not overdue: the order is confirmed.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.confirm_sales_order(so, 1, '7f370000-0000-4000-8000-0000000000b1');
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = so) = 'CONFIRMED', 'debt due today does not block';

  -- The same debt due yesterday (Vietnam) blocks the next order.
  perform set_config('session_replication_role', 'replica', true);
  update public.sales_orders set commercial_state = 'DRAFT', confirmed_at = null where id = so;
  delete from public.credit_commitments where sales_order_id = so;
  update public.receivable_obligations set due_date = private.business_today() - 1 where id = '7f370000-0000-4000-8000-000000000091';
  perform set_config('session_replication_role', 'origin', true);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin perform public.confirm_sales_order(so, 1, '7f370000-0000-4000-8000-0000000000b2');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'overdue_receivable_blocks_credit', format('debt due yesterday blocks, got %s', failed);
  assert (private.sales_order_credit_snapshot(so)->>'overdue_vnd')::bigint = 5000, 'override snapshot counts the overdue debt';
end
$test$;
