-- D17: sending a confirmed purchase order to the supplier is recorded once per operation, by purchasing staff only.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f200000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC200', 'NCC 200', '0901200000');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f200000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_K200', 'Kho 200', 'Địa chỉ kho 200');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state, supplier_name_snapshot,
  destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f200000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT-PO-200', '7f200000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f200000-0000-4000-8000-000000000002', 'CONFIRMED', 'NCC 200', 'Kho 200', 'Địa chỉ kho 200', '10000000-0000-4000-8000-000000000001'),
  ('7f200000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT-PO-201', '7f200000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f200000-0000-4000-8000-000000000002', 'DRAFT', 'NCC 200', 'Kho 200', 'Địa chỉ kho 200', '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  po constant uuid := '7f200000-0000-4000-8000-000000000003';
  draft constant uuid := '7f200000-0000-4000-8000-000000000004';
  sent uuid;
  failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.record_purchase_order_sent(po, 'ZALO', '7f200000-0000-4000-8000-0000000000a0'); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a reader cannot record';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  sent := public.record_purchase_order_sent(po, 'ZALO', '7f200000-0000-4000-8000-0000000000a1');
  assert public.record_purchase_order_sent(po, 'ZALO', '7f200000-0000-4000-8000-0000000000a1') = sent, 'replay returns the same record';
  failed := null;
  begin perform public.record_purchase_order_sent(po, 'EMAIL', '7f200000-0000-4000-8000-0000000000a1'); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', 'same operation, other channel refused';
  assert (select count(*) from public.purchase_order_dispatches where purchase_order_id = po) = 1, 'one record';
  failed := null;
  begin perform public.record_purchase_order_sent(draft, 'ZALO', '7f200000-0000-4000-8000-0000000000a2'); exception when others then failed := sqlerrm; end;
  assert failed = 'purchase_order_not_sendable', 'a draft is not sent';
  assert exists (select 1 from public.audit_events where entity_id = po and action = 'purchase_order.sent' and reason = 'Gửi NCC qua Zalo'), 'audited';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert (select count(*) from public.purchase_order_dispatches) = 0, 'other branch sees nothing';
  perform pg_temp.act_as_admin();
end
$test$;
