-- D93 / D94 follow-ups (Owner 16/11/2026): (1) no customer push for the daily sales-ledger import's orders, their deliveries and
-- their payments, while staff rules and in-app notifications still run; (3) overdue debt reminders every 3 days, due soon / today
-- daily; (4) short / failed delivery push shows only the driver's reason, else "Cửa hàng sẽ liên hệ lại"; (5) after "Hủy đơn" the
-- customer sees the plain reason, the list of cancelled deliveries is its own audit event; (6) "Hủy đơn" releases the order lines'
-- reservations that no delivery holds.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
-- Customer logins: a1 = "Chủ tài khoản" of K1, a2 = "Chủ tài khoản" of K2. Devices: d0 Owner (staff), d1, d2.
insert into auth.users(id) values ('7f358000-0000-4000-8000-0000000000a1'), ('7f358000-0000-4000-8000-0000000000a2');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f358000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT_K358A', 'Khách 358 A', 'BUSINESS'),
  ('7f358000-0000-4000-8000-000000000042', '20000000-0000-4000-8000-00000000000a', 'NT_K358B', 'Khách 358 B', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f358000-0000-4000-8000-0000000000a1', '7f358000-0000-4000-8000-000000000041', 'OWNER'),
  ('7f358000-0000-4000-8000-0000000000a2', '7f358000-0000-4000-8000-000000000042', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f358000-0000-4000-8000-000000000051', '7f358000-0000-4000-8000-000000000041', 'CT358', 'Công trình 358', 'Thủ Đức', 'Anh Nhận', '0901358000');
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f358000-0000-4000-8000-0000000000d0', '10000000-0000-4000-8000-000000000001', 'https://push.example.test/358-0', repeat('p', 40), repeat('a', 16)),
  ('7f358000-0000-4000-8000-0000000000d1', '7f358000-0000-4000-8000-0000000000a1', 'https://push.example.test/358-1', repeat('p', 40), repeat('a', 16)),
  ('7f358000-0000-4000-8000-0000000000d2', '7f358000-0000-4000-8000-0000000000a2', 'https://push.example.test/358-2', repeat('p', 40), repeat('a', 16));
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f358000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', 'NT_TM358', 'Tiền mặt 358', 'CASH', '10000000-0000-4000-8000-000000000001');
-- Stock for the cancel case: 10 000 kg on hand.
insert into public.units_of_measure(id, code, name, symbol) values ('7f358000-0000-4000-8000-000000000001', 'nt_kg358', 'Kilôgam thử 358', 'kg');
insert into public.material_groups(id, code, name) values ('7f358000-0000-4000-8000-000000000002', 'NT_G358', 'Nhóm thử 358');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f358000-0000-4000-8000-000000000003', '7f358000-0000-4000-8000-000000000002', 'NT_XM358', 'Xi măng 358', '7f358000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f358000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K358', 'Kho 358');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f358000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f358000-0000-4000-8000-000000000004', 'NT-KK-358', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f358000-0000-4000-8000-000000000006', '7f358000-0000-4000-8000-000000000005', '7f358000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f358000-0000-4000-8000-000000000003', '7f358000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f358000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f358000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
-- The order to cancel (K1, confirmed, one line of 100 kg, its credit held).
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f358000-0000-4000-8000-000000000103', '20000000-0000-4000-8000-00000000000a', 'NT-SO-358C', '7f358000-0000-4000-8000-000000000041',
   '7f358000-0000-4000-8000-000000000051', 'CONFIRMED', 'Khách 358 A', 'Công trình 358', 'Thủ Đức', 'Anh Nhận', '0901358000',
   '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f358000-0000-4000-8000-000000000133', '7f358000-0000-4000-8000-000000000103', 1, '7f358000-0000-4000-8000-000000000003', 'Xi măng 358',
   '7f358000-0000-4000-8000-000000000001', '7f358000-0000-4000-8000-000000000001', 100, 1, 1, 'HALF_UP', 2000, 200000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('20000000-0000-4000-8000-00000000000a', '7f358000-0000-4000-8000-000000000041', 'SALES_ORDER', '7f358000-0000-4000-8000-000000000103',
   200000, '10000000-0000-4000-8000-000000000001', '7f358000-0000-4000-8000-000000000103');

-- Push fixtures (state changes below go through the triggers): imported order I (sales-ledger marker), normal order N.
set local session_replication_role = replica;
insert into public.vehicles(id, branch_id, code, plate_number) values ('7f358000-0000-4000-8000-000000000060', '20000000-0000-4000-8000-00000000000a', 'XE358', '51C-358.01');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, order_channel, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, commercial_terms, created_by) values
  ('7f358000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-00000000000a', 'NT-SO-358I', '7f358000-0000-4000-8000-000000000041',
   '7f358000-0000-4000-8000-000000000051', 'DRAFT', 'INTERNAL', 'Khách 358 A', 'Công trình 358', 'Thủ Đức', 'Sổ 11.26 dòng 7 · Nhập theo sổ bán hàng',
   '10000000-0000-4000-8000-000000000001'),
  ('7f358000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', 'NT-SO-358N', '7f358000-0000-4000-8000-000000000041',
   '7f358000-0000-4000-8000-000000000051', 'DRAFT', 'INTERNAL', 'Khách 358 A', 'Công trình 358', 'Thủ Đức', 'Giao trong ngày',
   '10000000-0000-4000-8000-000000000001');
-- I: 201 assigned, 202 short (result submitted). N: 203 short without a reason (only a note), 204 failed with a reason.
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, execution_state, customer_id, site_id, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, scheduled_at, created_by)
select ('7f358000-0000-4000-8000-00000000020' || n)::uuid, '20000000-0000-4000-8000-00000000000a',
  case when n <= 2 then '7f358000-0000-4000-8000-000000000101' else '7f358000-0000-4000-8000-000000000102' end::uuid,
  'DLV-3580' || n, case when n = 1 then 'ASSIGNED' else 'RESULT_SUBMITTED' end, '7f358000-0000-4000-8000-000000000041',
  '7f358000-0000-4000-8000-000000000051', 'Khách 358 A', 'Công trình 358', 'Thủ Đức', now() + interval '1 day', '10000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;
insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id, assigned_by) values
  ('7f358000-0000-4000-8000-000000000201', 1, '30000000-0000-4000-8000-000000000001', '7f358000-0000-4000-8000-000000000060', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_results(id, delivery_id, result_kind, missing_arrival_reason, note, submitted_by) values
  ('7f358000-0000-4000-8000-000000000302', '7f358000-0000-4000-8000-000000000202', 'PARTIAL', 'Thiếu 2 bao', null, '10000000-0000-4000-8000-000000000001'),
  ('7f358000-0000-4000-8000-000000000303', '7f358000-0000-4000-8000-000000000203', 'PARTIAL', '  ', 'Ghi chú nội bộ: tài xế về sớm', '10000000-0000-4000-8000-000000000001'),
  ('7f358000-0000-4000-8000-000000000304', '7f358000-0000-4000-8000-000000000204', 'FAILED', '  Công trình đóng cửa ', 'Ghi chú nội bộ', '10000000-0000-4000-8000-000000000001');
-- The imported order's debt (from its verified delivery) and K2's debts for the reminder cadence.
insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by) values
  ('7f358000-0000-4000-8000-000000000402', '7f358000-0000-4000-8000-000000000202', '7f358000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000001');
insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id) values
  ('7f358000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f358000-0000-4000-8000-000000000041', 3000000,
   '2027-03-01', '10000000-0000-4000-8000-000000000001', null, '7f358000-0000-4000-8000-000000000402'),
  ('7f358000-0000-4000-8000-000000000072', '20000000-0000-4000-8000-00000000000a', '7f358000-0000-4000-8000-000000000042', 4000000,
   '2026-11-01', '10000000-0000-4000-8000-000000000001', gen_random_uuid(), null),
  ('7f358000-0000-4000-8000-000000000073', '20000000-0000-4000-8000-00000000000a', '7f358000-0000-4000-8000-000000000042', 1000000,
   '2026-11-10', '10000000-0000-4000-8000-000000000001', gen_random_uuid(), null);
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.commit_point() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;
create function pg_temp.pushes(dedupe_like text) returns integer language sql as $$
  select count(*)::integer from public.outbound_jobs where dedupe_key like dedupe_like
$$;
-- Read as the Owner (the stock view shows only what the login may see), back to the test admin afterwards.
create function pg_temp.available358() returns numeric language plpgsql as $$
declare available numeric;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select available_base_quantity::numeric into available from public.warehouse_inventory_read
  where warehouse_id = '7f358000-0000-4000-8000-000000000004' and material_id = '7f358000-0000-4000-8000-000000000003';
  perform pg_temp.act_as_admin();
  return available;
end $$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner constant uuid := '10000000-0000-4000-8000-000000000001';
  k2 constant uuid := '7f358000-0000-4000-8000-000000000042';
  oi constant uuid := '7f358000-0000-4000-8000-000000000101';
  onorm constant uuid := '7f358000-0000-4000-8000-000000000102';
  oc constant uuid := '7f358000-0000-4000-8000-000000000103';
  wh constant uuid := '7f358000-0000-4000-8000-000000000004';
  op constant uuid := '7f358000-0000-4000-8000-0000000009c1';
  staff_rule uuid;
  note uuid;
  pay uuid;
  d_planned uuid;
  before_reserve numeric;
  numbers text;
  day date;
  sent_days text;
begin
  -- ===== (1) Sales-ledger import: no customer push; staff flow intact =====
  perform pg_temp.act_as(owner);
  staff_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Đơn cần giao 358', 'event', 'sales_order.needs_delivery',
    'channels', jsonb_build_array('PUSH'), 'recipient_mode', 'PERMISSION', 'active', true), null, gen_random_uuid());
  perform pg_temp.act_as_admin();
  perform set_config('request.jwt.claim.sub', owner::text, true);

  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id in (oi, onorm);
  perform pg_temp.commit_point();
  assert pg_temp.pushes('customer:customer.order_confirmed:' || oi || ':%') = 0, 'imported order: no "đã duyệt" push';
  assert pg_temp.pushes('customer:customer.order_confirmed:' || onorm || ':%') = 1, 'a normal order is still pushed';
  -- Staff: the in-app notification and the Owner's rule still run for the imported order.
  note := private.notify(branch, 'sales_order.needs_delivery', 'sales_order', oi, 'Đơn NT-SO-358I cần giao', null, '/admin/orders', 'orders.read', null, 'nt358:s1');
  assert note is not null and exists (select 1 from public.notifications where id = note), 'in-app notification kept';
  assert exists (select 1 from public.outbound_jobs where rule_id = staff_rule and notification_id = note
    and target = '7f358000-0000-4000-8000-0000000000d0'), 'staff push rule still sends for the imported order';

  update public.deliveries set execution_state = 'DISPATCHED' where id = '7f358000-0000-4000-8000-000000000201';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'PARTIAL', verified_at = now() where id = '7f358000-0000-4000-8000-000000000202';
  perform pg_temp.commit_point();
  assert pg_temp.pushes('customer:customer.delivery_dispatched:7f358000-0000-4000-8000-000000000201:%') = 0, 'imported: no "xe đang đến"';
  assert pg_temp.pushes('customer:customer.delivery_problem:7f358000-0000-4000-8000-000000000202:%') = 0, 'imported: no "giao thiếu"';

  -- Payments: the imported order's prepayment, and a receipt settling only its debt, are not pushed; another receipt is.
  insert into public.payments(branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, external_reference, effective_at, posted_by)
  values (branch, 'PT-358-01', 'RECEIPT', '7f358000-0000-4000-8000-000000000041', '7f358000-0000-4000-8000-000000000070', 500000, 'CASH',
    'Trả trước đơn NT-SO-358I', now(), owner);
  insert into public.payments(branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, effective_at, posted_by)
  values (branch, 'PT-358-02', 'RECEIPT', '7f358000-0000-4000-8000-000000000041', '7f358000-0000-4000-8000-000000000070', 1000000, 'CASH', now(), owner)
  returning id into pay;
  perform set_config('session_replication_role', 'replica', true);
  insert into public.payment_allocations(payment_id, receivable_obligation_id, amount_delta_vnd, allocated_by)
  values (pay, '7f358000-0000-4000-8000-000000000071', 1000000, owner);
  perform set_config('session_replication_role', 'origin', true);
  insert into public.payments(branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, effective_at, posted_by)
  values (branch, 'PT-358-03', 'RECEIPT', '7f358000-0000-4000-8000-000000000041', '7f358000-0000-4000-8000-000000000070', 700000, 'CASH', now(), owner);
  perform pg_temp.commit_point();
  assert pg_temp.pushes('customer:customer.payment_received:' || (select id from public.payments where payment_number = 'PT-358-01') || ':%') = 0,
    'imported order prepayment: no "đã nhận tiền"';
  assert pg_temp.pushes('customer:customer.payment_received:' || pay || ':%') = 0, 'receipt settling only imported debt: no "đã nhận tiền"';
  assert pg_temp.pushes('customer:customer.payment_received:' || (select id from public.payments where payment_number = 'PT-358-03') || ':%') = 1,
    'other money is still pushed';

  -- ===== (4) Short / failed: the driver's reason only, else "Cửa hàng sẽ liên hệ lại" =====
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'PARTIAL', verified_at = now() where id = '7f358000-0000-4000-8000-000000000203';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'FAILED', verified_at = now() where id = '7f358000-0000-4000-8000-000000000204';
  perform pg_temp.commit_point();
  assert (select payload->>'title' = 'Giao thiếu DLV-35803' and payload->>'body' = 'Công trình 358 · Cửa hàng sẽ liên hệ lại'
    from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:7f358000-0000-4000-8000-000000000203:%'),
    format('no reason: fallback, never the note, got %s', (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:%203:%'));
  assert (select payload->>'title' = 'Chưa giao được DLV-35804' and payload->>'body' = 'Công trình 358 · Công trình đóng cửa'
    from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:7f358000-0000-4000-8000-000000000204:%'), 'the driver''s reason';

  -- ===== (3) Debt reminders of K2: overdue since 01/11 every 3 days (02, 05, 08 …); due 10/11 daily from 07/11 =====
  sent_days := '';
  for day in select generate_series('2026-11-02'::date, '2026-11-11'::date, interval '1 day')::date loop
    perform private.customer_debt_reminders(day);
    if pg_temp.pushes('customer:customer.debt_reminder:' || k2 || ':' || day || ':%') > 0 then sent_days := sent_days || to_char(day, 'DD') || ' '; end if;
  end loop;
  assert sent_days = '02 05 07 08 09 10 11 ', format('overdue every 3 days, due soon daily, got %s', sent_days);
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:' || k2 || ':2026-11-05:%') = 'Quá hạn từ 01/11/2026', 'overdue text';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:' || k2 || ':2026-11-07:%') = 'Đến hạn 10/11/2026', 'due soon between overdue days';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:' || k2 || ':2026-11-10:%') = 'Đến hạn hôm nay', 'due today';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:' || k2 || ':2026-11-11:%') = 'Quá hạn từ 01/11/2026', 'overdue again on day 10';
  assert (select payload->>'title' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:' || k2 || ':2026-11-02:%') = 'Nhắc thanh toán: 4.000.000 ₫', 'owed in the window';
  assert (select payload->>'title' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:' || k2 || ':2026-11-07:%') = 'Nhắc thanh toán: 5.000.000 ₫', 'owed with the debt due soon';
  -- Run twice the same day: still one push.
  perform private.customer_debt_reminders('2026-11-05');
  assert pg_temp.pushes('customer:customer.debt_reminder:' || k2 || ':2026-11-05:%') = 1, 'once a day';

  -- ===== (5) + (6) "Hủy đơn": plain reason for the customer, list in its own audit, line reservations released =====
  perform pg_temp.act_as(owner);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', null, '7f358000-0000-4000-8000-0000000000a0');
  d_planned := (public.create_delivery_for_order(oc, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f358000-0000-4000-8000-000000000133', 'quantity', '40')),
    now() + interval '1 day', null, '7f358000-0000-4000-8000-0000000000b1')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  before_reserve := pg_temp.available358();
  -- 25 kg of the line held without a delivery, and an older released hold that stays as it is.
  perform set_config('request.jwt.claim.sub', owner::text, true);
  insert into public.inventory_reservations(id, branch_id, warehouse_id, material_id, sales_order_line_id, reserved_base_quantity, created_by) values
    ('7f358000-0000-4000-8000-000000000501', branch, wh, '7f358000-0000-4000-8000-000000000003', '7f358000-0000-4000-8000-000000000133', 25, owner);
  insert into public.inventory_reservations(id, branch_id, warehouse_id, material_id, sales_order_line_id, reserved_base_quantity, state, created_by, finalized_at) values
    ('7f358000-0000-4000-8000-000000000502', branch, wh, '7f358000-0000-4000-8000-000000000003', '7f358000-0000-4000-8000-000000000133', 5, 'RELEASED', owner, now() - interval '1 day');
  perform set_config('request.jwt.claim.sub', '', true);
  assert pg_temp.available358() = before_reserve - 25, format('25 kg held by the line, available %s', pg_temp.available358());
  assert before_reserve = 10000 - 40, format('40 kg held by the delivery, available %s', before_reserve);
  select delivery_number into numbers from public.deliveries where id = d_planned;

  perform pg_temp.act_as(owner);
  assert public.cancel_sales_order(oc, 'Khách đổi ý', op) = oc, 'cancelled';
  perform pg_temp.commit_point();
  perform pg_temp.act_as_admin();
  assert pg_temp.available358() = 10000, format('every hold of the order released, available %s', pg_temp.available358());
  assert (select state from public.inventory_reservations where id = '7f358000-0000-4000-8000-000000000501') = 'RELEASED'
    and (select version from public.inventory_reservations where id = '7f358000-0000-4000-8000-000000000501') = 2, 'line reservation released';
  assert (select version from public.inventory_reservations where id = '7f358000-0000-4000-8000-000000000502') = 1, 'the old released hold untouched';
  assert (select reason from public.audit_events where action = 'sales_order.cancel' and entity_id = oc and trace_id = op) = 'Khách đổi ý', 'audit reason plain';
  assert (select reason from public.audit_events where action = 'sales_order.cancel_deliveries' and entity_id = oc and trace_id = op)
    = 'Hủy kèm 1 phiếu giao chưa chạy: ' || numbers, 'the list is its own internal audit event';
  assert (private.customer_order_extras(oc, 'OWNER')->>'cancel_reason') = 'Khách đổi ý', 'the portal shows the plain reason';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.order_cancelled:' || oc || ':%') = 'Lý do: Khách đổi ý',
    'the cancel push carries the plain reason';
  -- Replay writes nothing more.
  perform pg_temp.act_as(owner);
  assert public.cancel_sales_order(oc, 'Khách đổi ý', op) = oc, 'replay';
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.audit_events where trace_id = op and entity_type = 'sales_order') = 2, 'replay adds no audit';
end
$test$;
