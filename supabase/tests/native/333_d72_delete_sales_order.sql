-- D72: "Xóa đơn bán". Xóa hẳn đơn nháp / đã hủy / đã xác nhận chưa phát sinh gì, kèm phần giữ hạn mức, giữ hàng, phân nguồn;
-- chặn khi có phiếu giao, ngoại lệ tín dụng, khoản trả trước còn hiệu lực hoặc đơn đã đóng; ghi nhật ký; chống ghi trùng.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f720000-0000-4000-8000-000000000001', 'nt_bao720', 'Bao thử 720', 'bao');
insert into public.material_groups(id, code, name) values ('7f720000-0000-4000-8000-000000000002', 'NT_G720', 'Nhóm thử 720');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f720000-0000-4000-8000-000000000003', '7f720000-0000-4000-8000-000000000002', 'NT_XM720', 'Xi măng 720', '7f720000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f720000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K720', 'Kho 720');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f720000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH720', 'Khách 720', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f720000-0000-4000-8000-000000000011', '7f720000-0000-4000-8000-000000000010', 'CT1', 'Công trình 720', 'Địa chỉ 720', 'Anh Nhận', '0901720099');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f720000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_TM720', 'Tiền mặt 720', 'CASH', '10000000-0000-4000-8000-000000000001');
-- Orders: 51 draft, 52 confirmed with its credit/stock/sourcing, 53 with a delivery, 54 with a credit override,
-- 55 with a live prepayment, 56 with a reversed prepayment, 57 cancelled, 58 closed, 59 confirmed (replay / wrong caller).
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at)
select ('7f720000-0000-4000-8000-0000000000' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-SO-72' || n,
  '7f720000-0000-4000-8000-000000000010', '7f720000-0000-4000-8000-000000000011', s, 'Khách 720', 'Công trình 720', 'Địa chỉ 720', 'Anh Nhận', '0901720099',
  '10000000-0000-4000-8000-000000000001', case when s = 'DRAFT' then null else now() end
from (values ('51', 'DRAFT'), ('52', 'CONFIRMED'), ('53', 'CONFIRMED'), ('54', 'CONFIRMED'), ('55', 'CONFIRMED'), ('56', 'CONFIRMED'),
  ('57', 'CANCELLED'), ('58', 'CLOSED'), ('59', 'CONFIRMED')) as t(n, s);
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
select ('7f720000-0000-4000-8000-0000000001' || n)::uuid, ('7f720000-0000-4000-8000-0000000000' || n)::uuid, 1, '7f720000-0000-4000-8000-000000000003', 'Xi măng 720',
  '7f720000-0000-4000-8000-000000000001', '7f720000-0000-4000-8000-000000000001', 10, 1, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
  '10000000-0000-4000-8000-000000000001', 'Giá thử'
from unnest(array['51', '52', '53', '54', '55', '56', '57', '58', '59']) as n;
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id)
select ('7f720000-0000-4000-8000-0000000002' || n)::uuid, '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000010', 'SALES_ORDER',
  ('7f720000-0000-4000-8000-0000000000' || n), 900000, '10000000-0000-4000-8000-000000000001', ('7f720000-0000-4000-8000-0000000000' || n)::uuid
from unnest(array['52', '53', '54']) as n;
-- Order 52: promised stock, allocation and a sourcing run (what confirming and sourcing leave behind).
insert into public.supply_allocations(id, branch_id, sales_order_line_id, supply_mode, warehouse_id, allocated_base_quantity, created_by) values
  ('7f720000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000152', 'WAREHOUSE',
   '7f720000-0000-4000-8000-000000000004', 10, '10000000-0000-4000-8000-000000000001'),
  ('7f720000-0000-4000-8000-000000000303', '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000153', 'WAREHOUSE',
   '7f720000-0000-4000-8000-000000000004', 10, '10000000-0000-4000-8000-000000000001');
insert into public.inventory_reservations(id, branch_id, warehouse_id, material_id, sales_order_line_id, reserved_base_quantity, created_by) values
  ('7f720000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000004',
   '7f720000-0000-4000-8000-000000000003', '7f720000-0000-4000-8000-000000000152', 10, '10000000-0000-4000-8000-000000000001');
insert into public.sales_order_sourcing_runs(id, branch_id, sales_order_id, operation_id, plan, outcome, created_by) values
  ('7f720000-0000-4000-8000-000000000502', '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000052',
   '7f720000-0000-4000-8000-0000000005a2', '{"lines":[]}', '{}', '10000000-0000-4000-8000-000000000001');
-- Order 53: a planned delivery (even a cancelled plan would keep the history).
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by) values
  ('7f720000-0000-4000-8000-000000000603', '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000053', 'NT-GH-723',
   '7f720000-0000-4000-8000-000000000010', '7f720000-0000-4000-8000-000000000011', 'Khách 720', 'Công trình 720', 'Địa chỉ 720', '10000000-0000-4000-8000-000000000001');
-- Order 54: a recorded credit override (history is immutable).
insert into public.command_receipts values ('7f720000-0000-4000-8000-0000000005a4', '10000000-0000-4000-8000-000000000001', 'confirm_sales_order_with_credit_override',
  repeat('a', 64), 'sales_order', '7f720000-0000-4000-8000-000000000054', now());
insert into public.sales_order_credit_overrides(sales_order_id, branch_id, customer_id, commitment_id, operation_id, actor_auth_user_id, reason,
  approved_limit_vnd, exposure_before_vnd, order_amount_vnd, exposure_after_vnd, overdue_vnd, snapshot_hash) values
  ('7f720000-0000-4000-8000-000000000054', '20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000010', '7f720000-0000-4000-8000-000000000254',
   '7f720000-0000-4000-8000-0000000005a4', '10000000-0000-4000-8000-000000000001', 'Vượt hạn mức tín dụng', 500000, 0, 900000, 900000, 0, repeat('b', 64));
-- Orders 55 and 56: prepayments tied to the order by reference; the one on 56 was reversed.
insert into public.payments(id, branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, external_reference, effective_at, posted_by) values
  ('7f720000-0000-4000-8000-000000000705', '20000000-0000-4000-8000-00000000000a', 'NT-PT-7255', 'RECEIPT', '7f720000-0000-4000-8000-000000000010',
   '7f720000-0000-4000-8000-000000000012', 100000, 'CASH', 'Trả trước đơn NT-SO-7255', now(), '10000000-0000-4000-8000-000000000001'),
  ('7f720000-0000-4000-8000-000000000706', '20000000-0000-4000-8000-00000000000a', 'NT-PT-7256', 'RECEIPT', '7f720000-0000-4000-8000-000000000010',
   '7f720000-0000-4000-8000-000000000012', 100000, 'CASH', 'Trả trước đơn NT-SO-7256', now(), '10000000-0000-4000-8000-000000000001');
insert into public.payments(id, branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, external_reference, effective_at, posted_by,
  reversal_of_payment_id, reversal_reason) values
  ('7f720000-0000-4000-8000-000000000716', '20000000-0000-4000-8000-00000000000a', 'NT-DAO-7256', 'RECEIPT', '7f720000-0000-4000-8000-000000000010',
   '7f720000-0000-4000-8000-000000000012', 100000, 'CASH', 'Đảo phiếu NT-PT-7256', now(), '10000000-0000-4000-8000-000000000001',
   '7f720000-0000-4000-8000-000000000706', 'Nhập nhầm');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  draft constant uuid := '7f720000-0000-4000-8000-000000000051';
  confirmed constant uuid := '7f720000-0000-4000-8000-000000000052';
  with_delivery constant uuid := '7f720000-0000-4000-8000-000000000053';
  with_override constant uuid := '7f720000-0000-4000-8000-000000000054';
  prepaid constant uuid := '7f720000-0000-4000-8000-000000000055';
  prepaid_reversed constant uuid := '7f720000-0000-4000-8000-000000000056';
  cancelled constant uuid := '7f720000-0000-4000-8000-000000000057';
  closed_order constant uuid := '7f720000-0000-4000-8000-000000000058';
  replay constant uuid := '7f720000-0000-4000-8000-000000000059';
  op constant uuid := '7f720000-0000-4000-8000-0000000007a1';
  failed text;
begin
  -- Only people who may cancel orders in the order's branch can delete one.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.delete_sales_order(draft, 'Nhập nhầm', op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must not delete, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.delete_sales_order(draft, 'Nhập nhầm', op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('another branch must not delete, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- A reason is required.
  failed := null;
  begin perform public.delete_sales_order(draft, ' x ', op); exception when others then failed := sqlerrm; end;
  assert failed = 'delete_reason_required', format('reason required, got %s', failed);
  assert exists (select 1 from public.sales_orders where id = draft), 'refusal deletes nothing';

  -- Draft: gone with its lines.
  assert public.delete_sales_order(draft, 'Nhập nhầm khách', op) = draft, 'returns the deleted order id';
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.sales_orders where id = draft) and not exists (select 1 from public.sales_order_lines where sales_order_id = draft),
    format('draft and lines are gone (orders %s, lines %s, receipts %s, audits %s)', (select count(*) from public.sales_orders where id = draft),
      (select count(*) from public.sales_order_lines where sales_order_id = draft), (select count(*) from public.command_receipts where operation_id = op),
      (select count(*) from public.audit_events where trace_id = op));
  assert exists (select 1 from public.audit_events where action = 'sales_order.delete' and entity_id = draft and trace_id = op
    and reason like 'Xóa đơn NT-SO-7251 · Khách 720 · 1 dòng · 900000 đ · lý do: Nhập nhầm khách%'), 'the delete is in the audit log with what was deleted';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- Replay: same operation and payload answers the same, even though the order no longer exists.
  assert public.delete_sales_order(draft, 'Nhập nhầm khách', op) = draft, 'replay returns the same answer';
  failed := null;
  begin perform public.delete_sales_order(draft, 'Lý do khác', op); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', format('same operation with another reason conflicts, got %s', failed);
  -- Someone else cannot reuse the operation id.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.delete_sales_order(draft, 'Nhập nhầm khách', op); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', format('another caller cannot replay, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Confirmed order: the held credit, stock promise, allocation and sourcing run go with it.
  assert public.delete_sales_order(confirmed, 'Khách hủy trước khi giao', '7f720000-0000-4000-8000-0000000007a2') = confirmed, 'confirmed order deleted';
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.sales_orders where id = confirmed)
    and not exists (select 1 from public.credit_commitments where sales_order_id = confirmed)
    and not exists (select 1 from public.inventory_reservations where sales_order_line_id = '7f720000-0000-4000-8000-000000000152')
    and not exists (select 1 from public.supply_allocations where sales_order_line_id = '7f720000-0000-4000-8000-000000000152')
    and not exists (select 1 from public.sales_order_sourcing_runs where sales_order_id = confirmed), 'what confirming left behind is gone';
  -- Other orders keep theirs.
  assert exists (select 1 from public.credit_commitments where sales_order_id = with_delivery) and exists (select 1 from public.supply_allocations where sales_order_line_id = '7f720000-0000-4000-8000-000000000153'),
    'other orders are untouched';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Cancelled order and an order whose prepayment was reversed can be deleted.
  assert public.delete_sales_order(cancelled, 'Dọn đơn thử', '7f720000-0000-4000-8000-0000000007a3') = cancelled, 'cancelled order deleted';
  assert public.delete_sales_order(prepaid_reversed, 'Dọn đơn thử', '7f720000-0000-4000-8000-0000000007a4') = prepaid_reversed, 'reversed prepayment does not block';

  -- Blocked: delivery history, credit override, live prepayment, closed order.
  failed := null;
  begin perform public.delete_sales_order(with_delivery, 'Thử xóa', '7f720000-0000-4000-8000-0000000007b1'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_has_delivery', format('delivery blocks, got %s', failed);
  failed := null;
  begin perform public.delete_sales_order(with_override, 'Thử xóa', '7f720000-0000-4000-8000-0000000007b2'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_has_credit_override', format('credit override blocks, got %s', failed);
  failed := null;
  begin perform public.delete_sales_order(prepaid, 'Thử xóa', '7f720000-0000-4000-8000-0000000007b3'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_has_prepayment', format('live prepayment blocks, got %s', failed);
  failed := null;
  begin perform public.delete_sales_order(closed_order, 'Thử xóa', '7f720000-0000-4000-8000-0000000007b4'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_not_deletable', format('closed order cannot be deleted, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.sales_orders where id in (with_delivery, with_override, prepaid, closed_order)) = 4, 'blocked deletes leave the orders';
  assert not exists (select 1 from public.command_receipts where operation_id in ('7f720000-0000-4000-8000-0000000007b1', '7f720000-0000-4000-8000-0000000007b2',
    '7f720000-0000-4000-8000-0000000007b3', '7f720000-0000-4000-8000-0000000007b4')), 'a refused delete leaves no receipt';

  -- A missing order is refused like a forbidden one.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.delete_sales_order(replay, 'Thử xóa', '7f720000-0000-4000-8000-0000000007c1'); perform public.delete_sales_order(replay, 'Thử xóa lần hai', '7f720000-0000-4000-8000-0000000007c2');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('deleting an order that is already gone is forbidden, got %s', failed);
  -- The function is not callable without a session.
  perform pg_temp.act_as_admin();
  failed := null;
  begin perform public.delete_sales_order(prepaid, 'Thử xóa', '7f720000-0000-4000-8000-0000000007c3'); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('no session, no delete, got %s', failed);
end
$test$;
