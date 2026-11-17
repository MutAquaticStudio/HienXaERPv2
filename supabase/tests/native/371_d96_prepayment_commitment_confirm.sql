-- D96: (S3) an order fully paid in advance is confirmed without a credit limit and its receivable is paid by its own prepayment
-- at verification; (S2) delivered 10 bao, billed 9 → the 100 000 ₫ left of the commitment is released, and "Đóng phần còn
-- lại" frees credit still held on a fully delivered order; (S4) the receivable is due on the Vietnam day + terms; (S5)
-- confirm_sales_order refuses a draft changed since it was read.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f371000-0000-4000-8000-000000000001', 'nt_bao371', 'Bao thử 371', 'bao');
insert into public.material_groups(id, code, name) values ('7f371000-0000-4000-8000-000000000002', 'NT_G371', 'Nhóm thử 371');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f371000-0000-4000-8000-000000000003', '7f371000-0000-4000-8000-000000000002', 'NT_XM371', 'Xi măng thử 371', '7f371000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f371000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K371', 'Kho thử 371');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f371000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f371000-0000-4000-8000-000000000004', 'NT-KK-371', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f371000-0000-4000-8000-000000000006', '7f371000-0000-4000-8000-000000000005', '7f371000-0000-4000-8000-000000000003', 0, 100, 70000, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f371000-0000-4000-8000-000000000003', '7f371000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f371000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 100, 7000000, 70000, '7f371000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7f371000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-00000000000a', 'NT_XE371', '51C-371.01');
-- A retail customer without a credit limit, 7 days to pay.
insert into public.customers(id, branch_id, code, display_name, customer_type, payment_terms_days) values
  ('7f371000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH371', 'Khách lẻ 371', 'INDIVIDUAL', 7);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f371000-0000-4000-8000-000000000011', '7f371000-0000-4000-8000-000000000010', 'CT371', 'Công trình 371', 'Thủ Đức', 'Anh Nhận', '0901371000');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f371000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_TM371', 'Tiền mặt 371', 'CASH', '10000000-0000-4000-8000-000000000001');
-- 10 bao × 100 000 ₫.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by) values
  ('7f371000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT-SO-371', '7f371000-0000-4000-8000-000000000010',
   '7f371000-0000-4000-8000-000000000011', 'DRAFT', 'Khách lẻ 371', 'Công trình 371', 'Thủ Đức', 'Anh Nhận', '0901371000', '10000000-0000-4000-8000-000000000001');
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f371000-0000-4000-8000-000000000021', '7f371000-0000-4000-8000-000000000020', 1, '7f371000-0000-4000-8000-000000000003', 'Xi măng thử 371',
   '7f371000-0000-4000-8000-000000000001', '7f371000-0000-4000-8000-000000000001', 10, 1, 1, 'HALF_UP', 100000, 1000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  owner constant uuid := '10000000-0000-4000-8000-000000000001';
  so constant uuid := '7f371000-0000-4000-8000-000000000020';
  customer constant uuid := '7f371000-0000-4000-8000-000000000010';
  prepayment uuid; res jsonb; delivery uuid; dline uuid; v integer; result uuid; receivable uuid; failed text;
begin
  -- No limit, nothing paid: still refused (rule unchanged).
  perform pg_temp.act_as(owner);
  begin perform public.confirm_sales_order(so, 1, '7f371000-0000-4000-8000-0000000000a1'); exception when others then failed := sqlerrm; end;
  assert failed = 'credit_limit_not_approved', format('no limit, no prepayment → refused, got %s', failed);

  -- Half paid in advance: still on credit, still refused.
  prepayment := public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', customer, null, '7f371000-0000-4000-8000-000000000012',
    500000, now(), 'CASH', 'Trả trước đơn NT-SO-371', '[]'::jsonb, 500000, '7f371000-0000-4000-8000-0000000000a2');
  failed := null;
  begin perform public.confirm_sales_order(so, 1, '7f371000-0000-4000-8000-0000000000a3'); exception when others then failed := sqlerrm; end;
  assert failed = 'credit_limit_not_approved', format('half paid → refused, got %s', failed);

  -- Paid in full in advance (two receipts): not credit. A stale screen is refused first.
  perform public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', customer, null, '7f371000-0000-4000-8000-000000000012',
    500000, now() + interval '1 second', 'CASH', 'Trả trước đơn NT-SO-371', '[]'::jsonb, 500000, '7f371000-0000-4000-8000-0000000000a4');
  failed := null;
  begin perform public.confirm_sales_order(so, 2, '7f371000-0000-4000-8000-0000000000a5'); exception when others then failed := sqlerrm || ':' || sqlstate; end;
  assert failed = 'sales_order_confirm_stale_version:PT409', format('stale version refused, got %s', failed);
  failed := null;
  begin perform public.confirm_sales_order(so, null, '7f371000-0000-4000-8000-0000000000a6'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_confirm_stale_version', format('missing version refused, got %s', failed);
  perform public.confirm_sales_order(so, 1, '7f371000-0000-4000-8000-0000000000a7');
  assert public.confirm_sales_order(so, 1, '7f371000-0000-4000-8000-0000000000a7') = so, 'replay';
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = so) = 'CONFIRMED', 'fully prepaid order confirmed without a limit';
  assert (select amount_vnd from public.credit_commitments where sales_order_id = so) = 1000000, 'commitment for the whole order';
  -- The old two-argument form is for database callers only.
  assert not has_function_privilege('authenticated', 'public.confirm_sales_order(uuid, uuid)', 'EXECUTE'), 'old form not for API callers';
  assert has_function_privilege('authenticated', 'public.confirm_sales_order(uuid, integer, uuid)', 'EXECUTE'), 'new form for API callers';

  -- Deliver 10 bao, the customer accepts 10, billed 9 (one broken bag given away).
  perform pg_temp.act_as(owner);
  res := public.create_delivery_for_order(so, '7f371000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f371000-0000-4000-8000-000000000021', 'quantity', '10')), now(),
    jsonb_build_object('employee_id', '30000000-0000-4000-8000-000000000001', 'vehicle_id', '7f371000-0000-4000-8000-000000000007', 'schedule_mode', 'NOW'),
    '7f371000-0000-4000-8000-0000000000b1');
  delivery := (res->>'delivery_id')::uuid;
  select l.id into dline from public.delivery_lines l where l.delivery_id = delivery;
  select version into v from public.deliveries where id = delivery;
  perform public.handoff_delivery_actual(delivery, v, now() - interval '1 minute', '7f371000-0000-4000-8000-0000000000b2',
    jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'loaded_base_quantity', '10')));
  select version into v from public.deliveries where id = delivery;
  result := public.submit_delivery_result(delivery, 'FULL', jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'actual_base_quantity', '10')),
    'Anh Nhận', 'Giao thử', 'Nhập bù thử', null, v, '7f371000-0000-4000-8000-0000000000b3');
  select version into v from public.deliveries where id = delivery;
  perform public.verify_delivery(result, jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'accepted_base_quantity', '10',
    'billable_base_quantity', '9', 'billing_variance_reason', 'Tặng 1 bao vỡ')), v, '7f371000-0000-4000-8000-0000000000b4');
  perform pg_temp.act_as_admin();

  select r.id into receivable from public.receivable_obligations r join public.delivery_verifications dv on dv.id = r.delivery_verification_id
    where dv.delivery_id = delivery;
  assert (select original_amount_vnd from public.receivable_obligations where id = receivable) = 900000, '9 bao billed';
  assert (select due_date from public.receivable_obligations where id = receivable) = private.business_today() + 7, 'due on the Vietnam day + 7';
  -- S3: paid by the order's prepayment, the oldest receipt first.
  assert private.current_receivable_outstanding(receivable) = 0, 'prepaid receivable is not owed';
  assert (select coalesce(sum(amount_delta_vnd), 0) from public.payment_allocations where receivable_obligation_id = receivable and payment_id = prepayment) = 500000,
    'oldest receipt used in full';
  assert (select coalesce(sum(amount_delta_vnd), 0) from public.payment_allocations where receivable_obligation_id = receivable) = 900000, 'both receipts pay it';
  assert private.customer_advance_available(customer) = 100000, '100 000 ₫ of the prepayment is left as an advance';
  assert (select count(*) from public.audit_events where action = 'payment.allocated' and trace_id = '7f371000-0000-4000-8000-0000000000b4'
    and reason like 'Tự trừ tiền trả trước của đơn NT-SO-371%') = 2, 'each allocation audited';
  assert not exists (select 1 from public.receivable_obligations o where o.customer_id = customer and o.due_date < private.business_today() + 30
    and private.current_receivable_outstanding(o.id) > 0), 'nothing will be overdue';
  -- S2: consumed 900 000 + released 100 000 = 1 000 000; nothing held.
  assert (select consumed_vnd || ':' || released_vnd from public.credit_commitments where sales_order_id = so) = '900000:100000',
    format('leftover released, got %s', (select consumed_vnd || ':' || released_vnd from public.credit_commitments where sales_order_id = so));
  assert (select committed_vnd from public.customer_credit_exposure where customer_id = customer) = 0, 'no credit held';
  assert (select receivable_vnd from public.customer_credit_exposure where customer_id = customer) = 0, 'no debt';

  -- Nothing left at all: "Đóng phần còn lại" has nothing to close.
  perform pg_temp.act_as(owner);
  failed := null;
  begin perform public.close_sales_order_remaining(so, 'Đóng thử', '7f371000-0000-4000-8000-0000000000c1'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_has_no_remaining', format('nothing to close, got %s', failed);
  perform pg_temp.act_as_admin();

  -- An order verified before D96 kept 100 000 ₫ held: "Đóng phần còn lại" now frees it although every line is delivered.
  perform set_config('session_replication_role', 'replica', true);
  update public.credit_commitments set released_vnd = 0 where sales_order_id = so;
  perform set_config('session_replication_role', 'origin', true);
  perform pg_temp.act_as(owner);
  perform public.close_sales_order_remaining(so, 'Đóng phần cam kết còn giữ', '7f371000-0000-4000-8000-0000000000c2');
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = so) = 'CLOSED', 'closed';
  assert (select amount_vnd - consumed_vnd - released_vnd from public.credit_commitments where sales_order_id = so) = 0, 'held credit freed';
end
$test$;
