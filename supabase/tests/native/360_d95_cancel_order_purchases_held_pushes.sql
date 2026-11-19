-- D95 part 1: "Hủy đơn" and the purchases, held pushes and route plans around it.
-- S1/P1: a purchase sent to the supplier (confirmed, or a draft with a "Gửi NCC" record), received or verified refuses
-- (sales_order_cancel_has_purchase); a draft purchase order of the order is cancelled with it (audit "Hủy theo đơn bán …", source
-- dropped, unsent pushes stopped); a draft that also buys for something else refuses. A purchase order of a cancelled sales order is
-- not confirmed, received as confirmation, given a supplier delivery note or verified (purchase_linked_sales_order_cancelled).
-- D1: pushes held for quiet hours are stopped by "Hủy đơn" / dropped by "Xóa đơn bán"; release_quiet_pushes drops a held push whose
-- notification was deleted or whose delivery / job is cancelled, and still sends "Phiếu đã được tách" and customer pushes.
-- D3: a cancelled delivery leaves the draft route plans (version + 1), so the plan applies; applied plans keep their stops.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000360');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000360', '10000000-0000-4000-8000-000000000360', 'NT_W360', 'Thợ thử 360');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000360', 'nt_worker360', 'Thợ thử 360');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000360', 'work.read'), ('40000000-0000-4000-8000-000000000360', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000360', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000360');
insert into public.units_of_measure(id, code, name, symbol) values ('7f360000-0000-4000-8000-000000000001', 'nt_kg360', 'Kilôgam thử 360', 'kg');
insert into public.material_groups(id, code, name) values ('7f360000-0000-4000-8000-000000000002', 'NT_G360', 'Nhóm thử 360');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f360000-0000-4000-8000-000000000003', '7f360000-0000-4000-8000-000000000002', 'NT_XM360', 'Xi măng 360', '7f360000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f360000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K360', 'Kho 360', 'Địa chỉ kho 360');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f360000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f360000-0000-4000-8000-000000000004', 'NT-KK-360', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f360000-0000-4000-8000-000000000006', '7f360000-0000-4000-8000-000000000005', '7f360000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f360000-0000-4000-8000-000000000003', '7f360000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f360000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f360000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f360000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH360', 'Khách 360', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f360000-0000-4000-8000-000000000011', '7f360000-0000-4000-8000-000000000010', 'CT1', 'Công trình 360', 'Địa chỉ 360', 'Anh Nhận', '0901360000');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f360000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_XE360', '99C-360.01', 5000, '7f360000-0000-4000-8000-000000000001');
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f360000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-00000000000a', 'NT_NCC360', 'NCC 360', '0901360999');
-- Orders 1..9 (id ...00000000002n), one line each (...00000000003n) of 100 kg, with the credit their confirmation held.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at)
select ('7f360000-0000-4000-8000-00000000002' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-SO-360' || n,
  '7f360000-0000-4000-8000-000000000010', '7f360000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 360', 'Công trình 360', 'Địa chỉ 360', 'Anh Nhận', '0901360000',
  '10000000-0000-4000-8000-000000000001', now()
from generate_series(1, 9) as n;
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
select ('7f360000-0000-4000-8000-00000000003' || n)::uuid, ('7f360000-0000-4000-8000-00000000002' || n)::uuid, 1, '7f360000-0000-4000-8000-000000000003', 'Xi măng 360',
  '7f360000-0000-4000-8000-000000000001', '7f360000-0000-4000-8000-000000000001', 100, 1, 1, 'HALF_UP', 2000, 200000, 'MANUAL_APPROVED',
  '10000000-0000-4000-8000-000000000001', 'Giá thử'
from generate_series(1, 9) as n;
insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id)
select '20000000-0000-4000-8000-00000000000a', '7f360000-0000-4000-8000-000000000010', 'SALES_ORDER', ('7f360000-0000-4000-8000-00000000002' || n),
  200000, '10000000-0000-4000-8000-000000000001', ('7f360000-0000-4000-8000-00000000002' || n)::uuid
from generate_series(1, 9) as n;
-- Supplier-direct purchase orders P1..P7 (...00000000004n), one 100 kg line each (...00000000005n) linked to the order's line:
-- P1 draft of order 1, P2 confirmed of order 2, P3 draft of order 3 already sent to the supplier, P4 draft of order 4 (verified
-- below), P6 draft and P7 confirmed of order 6 (cancelled the old way, before D95). P5 is a warehouse draft of order 5 that also
-- buys stock for the warehouse (an unlinked second line).
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, customer_id, site_id, source_sales_order_id,
  state, confirmed_at, supplier_name_snapshot, destination_name_snapshot, destination_address_snapshot, created_by)
select ('7f360000-0000-4000-8000-00000000004' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-PO-360' || n, '7f360000-0000-4000-8000-000000000013',
  'CUSTOMER_SITE', '7f360000-0000-4000-8000-000000000010', '7f360000-0000-4000-8000-000000000011', ('7f360000-0000-4000-8000-00000000002' || o)::uuid,
  s, case when s = 'CONFIRMED' then now() end, 'NCC 360', 'Công trình 360', 'Địa chỉ 360', '10000000-0000-4000-8000-000000000001'
from (values (1, 1, 'DRAFT'), (2, 2, 'CONFIRMED'), (3, 3, 'DRAFT'), (4, 4, 'DRAFT'), (6, 6, 'DRAFT'), (7, 6, 'CONFIRMED')) as v(n, o, s);
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state,
  supplier_name_snapshot, destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f360000-0000-4000-8000-000000000045', '20000000-0000-4000-8000-00000000000a', 'NT-PO-3605', '7f360000-0000-4000-8000-000000000013', 'WAREHOUSE',
   '7f360000-0000-4000-8000-000000000004', 'DRAFT', 'NCC 360', 'Kho 360', 'Địa chỉ kho 360', '10000000-0000-4000-8000-000000000001');
insert into public.purchase_order_lines(id, purchase_order_id, linked_sales_order_line_id, line_number, material_id, material_name_snapshot, ordered_uom_id,
  base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason)
select ('7f360000-0000-4000-8000-00000000005' || n)::uuid, ('7f360000-0000-4000-8000-00000000004' || n)::uuid, ('7f360000-0000-4000-8000-00000000003' || o)::uuid,
  1, '7f360000-0000-4000-8000-000000000003', 'Xi măng 360', '7f360000-0000-4000-8000-000000000001', '7f360000-0000-4000-8000-000000000001',
  100, 1, 1, 'HALF_UP', 1500, 150000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'
from (values (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 6)) as v(n, o);
insert into public.purchase_order_lines(id, purchase_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id,
  base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason) values
  ('7f360000-0000-4000-8000-000000000059', '7f360000-0000-4000-8000-000000000045', 2, '7f360000-0000-4000-8000-000000000003', 'Xi măng 360',
   '7f360000-0000-4000-8000-000000000001', '7f360000-0000-4000-8000-000000000001', 50, 1, 1, 'HALF_UP', 1500, 75000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- Order 1's line is sourced from P1.
insert into public.supply_allocations(id, branch_id, sales_order_line_id, supply_mode, purchase_order_line_id, allocated_base_quantity, created_by) values
  ('7f360000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-00000000000a', '7f360000-0000-4000-8000-000000000031', 'SUPPLIER_DIRECT',
   '7f360000-0000-4000-8000-000000000051', 100, '10000000-0000-4000-8000-000000000001');
insert into public.purchase_order_dispatches(branch_id, purchase_order_id, channel, operation_id, sent_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f360000-0000-4000-8000-000000000043', 'ZALO', '7f360000-0000-4000-8000-000000000062', '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  wh constant uuid := '7f360000-0000-4000-8000-000000000004';
  worker constant uuid := '30000000-0000-4000-8000-000000000360';
  truck constant uuid := '7f360000-0000-4000-8000-000000000012';
  me constant uuid := '10000000-0000-4000-8000-000000000001';
  o1 constant uuid := '7f360000-0000-4000-8000-000000000021';
  o2 constant uuid := '7f360000-0000-4000-8000-000000000022';
  o3 constant uuid := '7f360000-0000-4000-8000-000000000023';
  o4 constant uuid := '7f360000-0000-4000-8000-000000000024';
  o5 constant uuid := '7f360000-0000-4000-8000-000000000025';
  o6 constant uuid := '7f360000-0000-4000-8000-000000000026';
  o7 constant uuid := '7f360000-0000-4000-8000-000000000027';
  o8 constant uuid := '7f360000-0000-4000-8000-000000000028';
  o9 constant uuid := '7f360000-0000-4000-8000-000000000029';
  p1 constant uuid := '7f360000-0000-4000-8000-000000000041';
  p2 constant uuid := '7f360000-0000-4000-8000-000000000042';
  p4 constant uuid := '7f360000-0000-4000-8000-000000000044';
  p6 constant uuid := '7f360000-0000-4000-8000-000000000046';
  p7 constant uuid := '7f360000-0000-4000-8000-000000000047';
  op1 constant uuid := '7f360000-0000-4000-8000-0000000009a1';
  start_at constant timestamptz := now() + interval '1 day';
  assign constant jsonb := jsonb_build_object('employee_id', '30000000-0000-4000-8000-000000000360', 'vehicle_id', '7f360000-0000-4000-8000-000000000012', 'schedule_mode', 'NOW');
  d7 uuid; d8 uuid; d9 uuid; work7 uuid;
  note_work uuid; note_delivery uuid; note_purchase uuid; note_split uuid; note_gone uuid;
  draft_plan uuid := '7f360000-0000-4000-8000-000000000071';
  applied_plan uuid := '7f360000-0000-4000-8000-000000000072';
  failed text;
begin
  perform pg_temp.act_as(me);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', null, '7f360000-0000-4000-8000-0000000000a0');
  perform pg_temp.act_as_admin();
  -- A push about the draft purchase order P1, held for quiet hours.
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'purchase.draft_ready', 'purchase_order', p1, 'Đơn mua nháp cần duyệt', '/admin/purchase-orders', 'purchasing.confirm') returning id into note_purchase;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at)
  values (branch, note_purchase, 'PUSH', 'máy 360-p', '{}', 'nt360-p1-held', 'HELD', now() + interval '1 hour');

  -- Order 1: its draft purchase order is cancelled with it.
  perform pg_temp.act_as(me);
  assert public.cancel_sales_order(o1, 'Khách đổi ý', op1) = o1, 'order with a draft purchase cancelled';
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = o1) = 'CANCELLED', 'order 1 cancelled';
  assert (select state = 'CANCELLED' and cancelled_at is not null from public.purchase_orders where id = p1), 'its draft purchase order is cancelled';
  assert not exists (select 1 from public.supply_allocations where id = '7f360000-0000-4000-8000-000000000061'), 'the source on it is dropped';
  assert exists (select 1 from public.audit_events where action = 'purchase_order.cancel' and entity_id = p1 and trace_id = op1
    and reason = 'Hủy theo đơn bán NT-SO-3601: Khách đổi ý'), 'the purchase order cancel is audited';
  assert exists (select 1 from public.audit_events where action = 'sales_order.cancel' and entity_id = o1 and reason = 'Khách đổi ý'
    and 'purchase_orders' = any(changed_fields)), 'the order cancel lists the purchase orders';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt360-p1-held') = 'DEAD', 'the held push about the purchase is stopped';
  perform pg_temp.act_as(me);
  assert public.cancel_sales_order(o1, 'Khách đổi ý', op1) = o1, 'replay returns the same id';

  -- Order 2: its purchase order was confirmed (sent to the supplier): refused, nothing changes.
  failed := null;
  begin perform public.cancel_sales_order(o2, 'Khách đổi ý', '7f360000-0000-4000-8000-0000000009a2'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_cancel_has_purchase', format('confirmed purchase blocks, got %s', failed);
  -- Order 3: a draft already sent to the supplier (Gửi NCC): refused.
  failed := null;
  begin perform public.cancel_sales_order(o3, 'Khách đổi ý', '7f360000-0000-4000-8000-0000000009a3'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_cancel_has_purchase', format('sent draft blocks, got %s', failed);
  -- Order 4: the supplier delivered part (the draft is confirmed by it): refused.
  perform public.verify_supplier_fulfillment(p4, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f360000-0000-4000-8000-000000000054',
    'supplier_quantity', '40')), null, 'NCC giao 40', '7f360000-0000-4000-8000-0000000009a4');
  failed := null;
  begin perform public.cancel_sales_order(o4, 'Khách đổi ý', '7f360000-0000-4000-8000-0000000009a5'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_cancel_has_purchase', format('supplier delivery blocks, got %s', failed);
  -- Order 5: a draft that also buys for the warehouse is not the order's to cancel: refused.
  failed := null;
  begin perform public.cancel_sales_order(o5, 'Khách đổi ý', '7f360000-0000-4000-8000-0000000009a6'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_cancel_has_purchase', format('shared draft blocks, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.sales_orders where id in (o2, o3, o4, o5) and commercial_state = 'CONFIRMED') = 4, 'refused orders stay confirmed';
  assert (select state from public.purchase_orders where id = p2) = 'CONFIRMED'
    and (select count(*) from public.purchase_orders where id in ('7f360000-0000-4000-8000-000000000043', '7f360000-0000-4000-8000-000000000045') and state = 'DRAFT') = 2,
    'refused orders keep their purchase orders';
  assert (select released_vnd from public.credit_commitments where sales_order_id = o2) = 0, 'a refused order keeps its credit';
  assert not exists (select 1 from public.command_receipts where operation_id in ('7f360000-0000-4000-8000-0000000009a2', '7f360000-0000-4000-8000-0000000009a3',
    '7f360000-0000-4000-8000-0000000009a5', '7f360000-0000-4000-8000-0000000009a6')), 'a refused cancel leaves no receipt';

  -- Order 6 was cancelled before D95 (no delivery) and kept a draft P6 and a confirmed P7: they go no further.
  perform set_config('request.jwt.claim.sub', me::text, true);
  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = o6;
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.act_as(me);
  failed := null;
  begin perform public.confirm_purchase_order(p6, '7f360000-0000-4000-8000-0000000009b1'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_linked_sales_order_cancelled', format('confirm refused, got %s', failed);
  failed := null;
  begin perform public.verify_supplier_fulfillment(p6, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f360000-0000-4000-8000-000000000056',
    'supplier_quantity', '10')), null, null, '7f360000-0000-4000-8000-0000000009b2'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_linked_sales_order_cancelled', format('supplier delivery on a draft refused, got %s', failed);
  failed := null;
  begin perform public.verify_supplier_fulfillment(p7, jsonb_build_array(jsonb_build_object('purchase_order_line_id', '7f360000-0000-4000-8000-000000000057',
    'supplier_quantity', '10')), null, null, '7f360000-0000-4000-8000-0000000009b3'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_linked_sales_order_cancelled', format('supplier delivery on a confirmed purchase refused, got %s', failed);
  failed := null;
  begin perform public.create_supplier_direct_delivery(p6, '7f360000-0000-4000-8000-0000000009b4'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_linked_sales_order_cancelled', format('supplier delivery note on a draft refused, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select state from public.purchase_orders where id = p6) = 'DRAFT', 'P6 stays a draft';
  assert not exists (select 1 from public.supplier_fulfillments where purchase_order_id in (p6, p7))
    and not exists (select 1 from public.payable_obligations o join public.supplier_fulfillments f on f.id = o.supplier_fulfillment_id where f.purchase_order_id in (p6, p7)),
    'no payable for a cancelled order';
  -- A live order's purchase is still confirmed (order 4 kept P4 confirmed by the supplier delivery above).
  assert (select state from public.purchase_orders where id = p4) = 'CONFIRMED', 'live purchase confirmed as before';

  -- Order 7: an assigned delivery whose job push and delivery push wait for quiet hours, in a draft and an applied route plan.
  -- Order 8: a planned delivery in the same draft plan.
  perform pg_temp.act_as(me);
  d7 := (public.create_delivery_for_order(o7, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f360000-0000-4000-8000-000000000037', 'quantity', '30')),
    start_at, assign, '7f360000-0000-4000-8000-0000000000b1')->>'delivery_id')::uuid;
  d8 := (public.create_delivery_for_order(o8, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f360000-0000-4000-8000-000000000038', 'quantity', '20')),
    start_at, null, '7f360000-0000-4000-8000-0000000000b2')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  select id into work7 from public.work_items where delivery_id = d7;
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'work.assigned', 'work_item', work7, 'Việc mới thử', '/work', 'work.read') returning id into note_work;
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'delivery.waiting_dispatch', 'delivery', d7, 'Phiếu chờ người', '/admin/deliveries', 'delivery.assign') returning id into note_delivery;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at) values
    (branch, note_work, 'PUSH', 'máy 360-w', '{}', 'nt360-work-held', 'HELD', now() + interval '1 hour'),
    (branch, note_work, 'PUSH', 'máy 360-w', '{}', 'nt360-work-pending', 'PENDING', now()),
    (branch, note_delivery, 'PUSH', 'máy 360-d', '{}', 'nt360-delivery-held', 'HELD', now() + interval '1 hour'),
    (branch, note_delivery, 'PUSH', 'máy 360-d', '{}', 'nt360-delivery-sent', 'SENT', now());
  insert into public.route_plans(id, branch_id, departure_at, vehicle_id, driver_employee_id, provider_state, status, created_by, operation_id) values
    (draft_plan, branch, start_at, truck, worker, 'MANUAL_FALLBACK', 'DRAFT', me, '7f360000-0000-4000-8000-000000000073'),
    (applied_plan, branch, start_at, truck, worker, 'MANUAL_FALLBACK', 'APPLIED', me, '7f360000-0000-4000-8000-000000000074');
  insert into public.route_plan_stops(route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version, address_snapshot) values
    (draft_plan, 1, d7, (select version from public.deliveries where id = d7), 1, 'Địa chỉ 360'),
    (draft_plan, 2, d8, (select version from public.deliveries where id = d8), 0, 'Địa chỉ 360'),
    (applied_plan, 1, d7, (select version from public.deliveries where id = d7), 1, 'Địa chỉ 360');
  perform pg_temp.act_as(me);
  assert public.cancel_sales_order(o7, 'Khách đổi ý', '7f360000-0000-4000-8000-0000000009c1') = o7, 'order 7 cancelled';
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d7) = 'CANCELLED', 'its delivery cancelled';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt360-work-held') = 'DEAD'
    and (select state from public.outbound_jobs where dedupe_key = 'nt360-work-pending') = 'DEAD'
    and (select state from public.outbound_jobs where dedupe_key = 'nt360-delivery-held') = 'DEAD', 'held and waiting pushes are stopped';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt360-delivery-sent') = 'SENT', 'a sent push stays';
  assert (select last_error_safe from public.outbound_jobs where dedupe_key = 'nt360-work-held') = 'Không gửi: đơn đã hủy', 'stop reason recorded';
  assert not exists (select 1 from public.route_plan_stops where route_plan_id = draft_plan and delivery_id = d7)
    and exists (select 1 from public.route_plan_stops where route_plan_id = draft_plan and delivery_id = d8), 'the cancelled stop leaves the draft plan';
  assert (select version from public.route_plans where id = draft_plan) = 2, 'the draft plan version moves';
  assert exists (select 1 from public.route_plan_stops where route_plan_id = applied_plan and delivery_id = d7)
    and (select version from public.route_plans where id = applied_plan) = 1, 'an applied plan keeps its stops as history';
  -- The plan with what is left applies (it used to fail with route_delivery_stale).
  update public.route_plan_stops set planned_start_at = start_at + interval '1 hour', planned_end_at = start_at + interval '2 hours' where route_plan_id = draft_plan;
  perform pg_temp.act_as(me);
  assert public.apply_route_plan(draft_plan, 2, '7f360000-0000-4000-8000-0000000009c2') = draft_plan, 'the plan applies';
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d8) = 'ASSIGNED', 'the remaining stop is assigned';

  -- Order 9: "Xóa đơn bán" drops a push held for its delivery too.
  perform pg_temp.act_as(me);
  d9 := (public.create_delivery_for_order(o9, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f360000-0000-4000-8000-000000000039', 'quantity', '10')),
    start_at, null, '7f360000-0000-4000-8000-0000000000b3')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'delivery.waiting_dispatch', 'delivery', d9, 'Phiếu chờ người', '/admin/deliveries', 'delivery.assign') returning id into note_gone;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at)
  values (branch, note_gone, 'PUSH', 'máy 360-x', jsonb_build_object('notification_id', note_gone), 'nt360-deleted-held', 'HELD', now() + interval '1 hour');
  perform pg_temp.act_as(me);
  assert public.delete_sales_order(o9, 'Xác nhận nhầm', '7f360000-0000-4000-8000-0000000009d1') = o9, 'order 9 deleted';
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.outbound_jobs where dedupe_key = 'nt360-deleted-held'), 'the held push of a deleted order is dropped';

  -- Quiet hours end: a held push whose notification is gone, or whose delivery / job is cancelled, is not sent;
  -- "Phiếu đã được tách" about a cancelled delivery and a customer push still go.
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'work.delivery_split', 'delivery', d7, 'Phiếu đã được tách', '/work', 'work.claim') returning id into note_split;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at) values
    (branch, null, 'PUSH', 'máy 360-r1', jsonb_build_object('notification_id', gen_random_uuid(), 'title', 'Việc đã xóa'), 'nt360-r-orphan', 'HELD', now() - interval '1 minute'),
    (branch, note_work, 'PUSH', 'máy 360-r2', jsonb_build_object('notification_id', note_work, 'title', 'Việc mới'), 'nt360-r-work', 'HELD', now() - interval '1 minute'),
    (branch, note_delivery, 'PUSH', 'máy 360-r3', jsonb_build_object('notification_id', note_delivery, 'title', 'Phiếu chờ'), 'nt360-r-delivery', 'HELD', now() - interval '1 minute'),
    (branch, note_split, 'PUSH', 'máy 360-r4', jsonb_build_object('notification_id', note_split, 'title', 'Phiếu đã được tách'), 'nt360-r-split', 'HELD', now() - interval '1 minute'),
    (branch, null, 'PUSH', 'máy 360-r5', jsonb_build_object('kind', 'customer.order_confirmed', 'title', 'Đơn đã duyệt'), 'nt360-r-customer', 'HELD', now() - interval '1 minute');
  assert private.release_quiet_pushes(now()) = 2, 'two pushes released';
  assert (select count(*) from public.outbound_jobs where dedupe_key in ('nt360-r-orphan', 'nt360-r-work', 'nt360-r-delivery')
    and state = 'DEAD' and last_error_safe = 'Việc/đơn đã hủy') = 3, 'stale held pushes dropped';
  assert (select count(*) from public.outbound_jobs where dedupe_key in ('nt360-r-split', 'nt360-r-customer') and state not in ('HELD', 'DEAD', 'MERGED')) = 2,
    'the split notice and the customer push go out';
end
$test$;
