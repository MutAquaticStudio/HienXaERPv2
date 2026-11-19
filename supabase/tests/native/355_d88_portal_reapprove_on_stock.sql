-- D88 (Owner 16/11/2026, "Tự duyệt lại"): a portal order left "Chờ duyệt" because the warehouse was short is tried again,
-- with the D79 conditions, when a transaction adds warehouse stock of one of its materials — at the end of that transaction,
-- oldest order first. The office is told (the order's notification rewritten + a new unread one); a still-waiting order shows
-- the latest reason, replaced not appended. Nothing here ever fails or undoes the stock transaction.
-- Owner's answers: a credit refusal waits for the office ("chờ duyệt tay", never tried again); stock freed without a movement
-- (an order cancelled) counts too; an order older than 7 days is left to the office.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f355000-0000-4000-8000-000000000001', 'nt_m3_355', 'Khối thử 355', 'khối');
insert into public.material_groups(id, code, name) values ('7f355000-0000-4000-8000-000000000002', 'NT_G355', 'Nhóm thử 355');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f355000-0000-4000-8000-000000000003', '7f355000-0000-4000-8000-000000000002', 'NT_CAT355', 'Cát đen 355', '7f355000-0000-4000-8000-000000000001'),
  ('7f355000-0000-4000-8000-000000000004', '7f355000-0000-4000-8000-000000000002', 'NT_DA355', 'Đá 355', '7f355000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name, address_text) values
  ('7f355000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', 'NT_K355', 'Kho 355', 'Địa chỉ kho 355');
insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7f355000-0000-4000-8000-000000000003', '7f355000-0000-4000-8000-000000000001', 300000, 1, 'LIST',
   now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7f355000-0000-4000-8000-000000000004', '7f355000-0000-4000-8000-000000000001', 400000, 1, 'LIST',
   now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7f355000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH3551', 'Khách 355 A', 'BUSINESS', 100000000),
  ('7f355000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT_KH3552', 'Khách 355 hạn mức nhỏ', 'BUSINESS', 1000),
  ('7f355000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_KH3553', 'Khách 355 B', 'BUSINESS', 100000000);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f355000-0000-4000-8000-000000000020', '7f355000-0000-4000-8000-000000000010', 'CT1', 'Công trình 355 A', 'Địa chỉ 355 A', 'Anh A', '0901355001'),
  ('7f355000-0000-4000-8000-000000000021', '7f355000-0000-4000-8000-000000000011', 'CT1', 'Công trình 355 X', 'Địa chỉ 355 X', 'Anh X', '0901355002'),
  ('7f355000-0000-4000-8000-000000000022', '7f355000-0000-4000-8000-000000000012', 'CT1', 'Công trình 355 B', 'Địa chỉ 355 B', 'Anh B', '0901355003');
insert into auth.users(id) values ('7f355000-0000-4000-8000-0000000000a1'), ('7f355000-0000-4000-8000-0000000000a2'), ('7f355000-0000-4000-8000-0000000000a3');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f355000-0000-4000-8000-0000000000a1', '7f355000-0000-4000-8000-000000000010', 'OWNER'),
  ('7f355000-0000-4000-8000-0000000000a2', '7f355000-0000-4000-8000-000000000011', 'OWNER'),
  ('7f355000-0000-4000-8000-0000000000a3', '7f355000-0000-4000-8000-000000000012', 'OWNER');
-- A staff draft (not from the portal) for the same sand: never approved by D88.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, created_at) values
  ('7f355000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', 'NT-SO-355', '7f355000-0000-4000-8000-000000000010',
   '7f355000-0000-4000-8000-000000000020', 'DRAFT', 'Khách 355 A', 'Công trình 355 A', 'Địa chỉ 355 A', 'Anh A', '0901355001',
   '10000000-0000-4000-8000-000000000001', now() - interval '3 hours');
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f355000-0000-4000-8000-000000000031', '7f355000-0000-4000-8000-000000000030', 1, '7f355000-0000-4000-8000-000000000003', 'Cát đen 355',
   '7f355000-0000-4000-8000-000000000001', '7f355000-0000-4000-8000-000000000001', 0.2, 1, 1, 'HALF_UP', 300000, 60000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- A staff order (confirmed) holding 0,6 khối of the warehouse's sand: cancelling it frees stock without a stock movement.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f355000-0000-4000-8000-000000000032', '20000000-0000-4000-8000-00000000000a', 'NT-SO-3552', '7f355000-0000-4000-8000-000000000010',
   '7f355000-0000-4000-8000-000000000020', 'CONFIRMED', 'Khách 355 A', 'Công trình 355 A', 'Địa chỉ 355 A', 'Anh A', '0901355001',
   '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f355000-0000-4000-8000-000000000033', '7f355000-0000-4000-8000-000000000032', 1, '7f355000-0000-4000-8000-000000000003', 'Cát đen 355',
   '7f355000-0000-4000-8000-000000000001', '7f355000-0000-4000-8000-000000000001', 0.6, 1, 1, 'HALF_UP', 300000, 180000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, warehouse_id, allocated_base_quantity, created_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f355000-0000-4000-8000-000000000033', 'WAREHOUSE', '7f355000-0000-4000-8000-000000000005', 0.6,
   '10000000-0000-4000-8000-000000000001');
-- Stone comes in through a purchase receipt (the second stock-in path).
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7f355000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_NCC355', 'NCC 355', '0901355009');
insert into public.purchase_orders(id, branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id, state, supplier_name_snapshot,
  destination_name_snapshot, destination_address_snapshot, created_by) values
  ('7f355000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT-PO-355', '7f355000-0000-4000-8000-000000000040', 'WAREHOUSE',
   '7f355000-0000-4000-8000-000000000005', 'DRAFT', 'NCC 355', 'Kho 355', 'Địa chỉ kho 355', '10000000-0000-4000-8000-000000000001');
insert into public.purchase_order_lines(id, purchase_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_cost_vnd, line_total_cost_vnd, price_source_type, override_by, override_reason) values
  ('7f355000-0000-4000-8000-000000000042', '7f355000-0000-4000-8000-000000000041', 1, '7f355000-0000-4000-8000-000000000004', 'Đá 355',
   '7f355000-0000-4000-8000-000000000001', '7f355000-0000-4000-8000-000000000001', 5, 1, 1, 'HALF_UP', 250000, 1250000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
select set_config('request.jwt.claim.sub', '', true);

-- Counts the warehouse's sand as `counted` (approved count): a positive or negative adjustment in this transaction.
create function pg_temp.count_sand(counted text, op text) returns jsonb language plpgsql as $$
declare count_id uuid; v integer;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  count_id := public.open_stock_count('20000000-0000-4000-8000-00000000000a', '7f355000-0000-4000-8000-000000000005', now(), md5(op || ':open')::uuid);
  select version into v from public.stock_counts where id = count_id;
  perform public.record_stock_count_lines_batch(count_id, jsonb_build_array(jsonb_build_object('material_id', '7f355000-0000-4000-8000-000000000003',
    'counted_base_quantity', counted, 'adjustment_unit_cost_vnd', '200000', 'reason', 'Kiểm kho thử 355')), v, md5(op || ':lines')::uuid);
  select version into v from public.stock_counts where id = count_id;
  perform public.approve_stock_count(count_id, v, md5(op || ':approve')::uuid);
  perform pg_temp.act_as_admin();
  return jsonb_build_object('id', count_id, 'version', v, 'op', md5(op || ':approve')::uuid);
end $$;
-- What happens at the end of the transaction (COMMIT), here and now.
create function pg_temp.commit_point() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  sand constant uuid := '7f355000-0000-4000-8000-000000000003';
  stone constant uuid := '7f355000-0000-4000-8000-000000000004';
  m3 constant uuid := '7f355000-0000-4000-8000-000000000001';
  office constant uuid := '10000000-0000-4000-8000-000000000001';
  staff_draft constant uuid := '7f355000-0000-4000-8000-000000000030';
  holder constant uuid := '7f355000-0000-4000-8000-000000000032';
  order_a uuid; order_x uuid; order_b uuid; order_p uuid; order_old uuid;
  first_note uuid;
  movements integer;
  counted jsonb;
begin
  -- 0. Placed with no stock: all wait "kho chưa đủ hàng" (D79 at submit). An 8-day-old one, then X (small limit), A, B, P.
  perform pg_temp.act_as('7f355000-0000-4000-8000-0000000000a1');
  order_old := public.submit_portal_order('7f355000-0000-4000-8000-000000000010', '7f355000-0000-4000-8000-000000000020', null, null,
    jsonb_build_array(jsonb_build_object('material_id', sand, 'ordered_uom_id', m3, 'quantity', '0.1')), null, '7f355000-0000-4000-8000-0000000000e0');
  perform pg_temp.act_as('7f355000-0000-4000-8000-0000000000a2');
  order_x := public.submit_portal_order('7f355000-0000-4000-8000-000000000011', '7f355000-0000-4000-8000-000000000021', null, null,
    jsonb_build_array(jsonb_build_object('material_id', sand, 'ordered_uom_id', m3, 'quantity', '0.5')), null, '7f355000-0000-4000-8000-0000000000e1');
  perform pg_temp.act_as('7f355000-0000-4000-8000-0000000000a1');
  order_a := public.submit_portal_order('7f355000-0000-4000-8000-000000000010', '7f355000-0000-4000-8000-000000000020', null, null,
    jsonb_build_array(jsonb_build_object('material_id', sand, 'ordered_uom_id', m3, 'quantity', '0.7')), null, '7f355000-0000-4000-8000-0000000000e2');
  perform pg_temp.act_as('7f355000-0000-4000-8000-0000000000a3');
  order_b := public.submit_portal_order('7f355000-0000-4000-8000-000000000012', '7f355000-0000-4000-8000-000000000022', null, null,
    jsonb_build_array(jsonb_build_object('material_id', sand, 'ordered_uom_id', m3, 'quantity', '0.6')), null, '7f355000-0000-4000-8000-0000000000e3');
  perform pg_temp.act_as('7f355000-0000-4000-8000-0000000000a1');
  order_p := public.submit_portal_order('7f355000-0000-4000-8000-000000000010', '7f355000-0000-4000-8000-000000000020', null, null,
    jsonb_build_array(jsonb_build_object('material_id', stone, 'ordered_uom_id', m3, 'quantity', '2')), null, '7f355000-0000-4000-8000-0000000000e4');
  perform pg_temp.act_as_admin();
  update public.sales_orders set created_at = now() - interval '8 days' where id = order_old;
  update public.sales_orders set created_at = now() - interval '40 minutes' where id = order_x;
  update public.sales_orders set created_at = now() - interval '30 minutes' where id = order_a;
  update public.sales_orders set created_at = now() - interval '20 minutes' where id = order_b;
  update public.sales_orders set created_at = now() - interval '10 minutes' where id = order_p;
  perform pg_temp.commit_point();
  assert (select count(*) from public.sales_orders where id in (order_old, order_x, order_a, order_b, order_p) and commercial_state = 'DRAFT') = 5, 'all wait';
  assert (select bool_and(body like '%— chờ duyệt (kho chưa đủ hàng)') from public.notifications
    where kind = 'order.portal_submitted' and entity_id in (order_old, order_x, order_a, order_b, order_p)), 'reason: stock';
  -- The office already read A's notification.
  select id into first_note from public.notifications where kind = 'order.portal_submitted' and entity_id = order_a;
  insert into public.notification_reads(notification_id, auth_user_id) values (first_note, office);

  -- 1. A stock count adds 1,5 khối of sand (0,6 of it held by a staff order: 0,9 free). Decided at the end of the transaction.
  counted := pg_temp.count_sand('1.5', 'd88-count-1');
  assert (select commercial_state from public.sales_orders where id = order_a) = 'DRAFT', 'not yet: decided at commit';
  assert exists (select 1 from private.portal_reapprove_stage where txid = txid_current() and branch_id = branch and material_id = sand), 'sand staged';
  perform pg_temp.commit_point();
  assert not exists (select 1 from private.portal_reapprove_stage where txid = txid_current()), 'work rows cleaned';
  -- X (oldest within 7 days) is over its credit limit: left to the office ("chờ duyệt tay"), nothing held, reason replaced.
  assert (select commercial_state from public.sales_orders where id = order_x) = 'DRAFT'
    and not exists (select 1 from public.credit_commitments where sales_order_id = order_x), 'over the limit waits';
  assert (select body from public.notifications where kind = 'order.portal_submitted' and entity_id = order_x) like '% — chờ duyệt tay (vượt hạn mức nợ)'
    and (select body from public.notifications where kind = 'order.portal_submitted' and entity_id = order_x) not like '%kho chưa đủ hàng%',
    format('reason replaced: %s', (select body from public.notifications where kind = 'order.portal_submitted' and entity_id = order_x));
  assert exists (select 1 from private.portal_manual_review where sales_order_id = order_x and reason = 'vượt hạn mức nợ'), 'X left to the office';
  -- A: approved, sourced, a delivery, audited, office told.
  assert (select commercial_state from public.sales_orders where id = order_a) = 'CONFIRMED', 'A approved';
  assert exists (select 1 from public.credit_commitments where sales_order_id = order_a), 'credit held';
  assert (select count(*) from public.deliveries where sales_order_id = order_a) = 1, 'one delivery';
  assert (select count(*) from public.audit_events where entity_id = order_a and action = 'sales_order.portal_auto_approved'
    and actor_auth_user_id = office and reason like '%(D88)') = 1, 'audited as D88';
  assert (select title = 'Đơn mới từ khách (đã tự duyệt): Khách 355 A' and body like '% — đã tự duyệt khi kho có hàng, đang điều phối giao'
    and body not like '%chờ duyệt%' from public.notifications where id = first_note), 'the order notification rewritten';
  assert (select count(*) from public.notifications where kind = 'order.portal_auto_approved' and entity_id = order_a
    and required_permission = 'orders.read' and link = '/admin/orders/' || order_a and title = 'Đã tự duyệt đơn khách: Khách 355 A') = 1, 'new notification';
  assert not exists (select 1 from public.notification_reads r join public.notifications n on n.id = r.notification_id
    where n.kind = 'order.portal_auto_approved' and n.entity_id = order_a), 'unread for those who read the first one';
  -- B: the stock went to A first; B still short.
  assert (select commercial_state from public.sales_orders where id = order_b) = 'DRAFT', 'B waits';
  assert (select body like '% — chờ duyệt (kho chưa đủ hàng)' from public.notifications where kind = 'order.portal_submitted' and entity_id = order_b),
    'B: stock';
  -- The 8-day-old order is left to the office (it would fit: 0,1); stone order and staff draft untouched.
  assert (select commercial_state from public.sales_orders where id = order_old) = 'DRAFT'
    and not exists (select 1 from public.audit_events where entity_id = order_old and action = 'sales_order.portal_auto_approved'), 'older than 7 days skipped';
  assert (select commercial_state from public.sales_orders where id = order_p) = 'DRAFT', 'P waits';
  assert (select commercial_state from public.sales_orders where id = staff_draft) = 'DRAFT'
    and not exists (select 1 from public.audit_events where entity_id = staff_draft), 'staff draft untouched';

  -- 2. Idempotent: another commit point, a replayed count command: nothing more.
  perform pg_temp.commit_point();
  select count(*) into movements from public.inventory_movements where material_id = sand;
  perform pg_temp.act_as(office);
  perform public.approve_stock_count((counted->>'id')::uuid, (counted->>'version')::integer, (counted->>'op')::uuid);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.inventory_movements where material_id = sand) = movements, 'replay adds no stock';
  perform pg_temp.commit_point();
  assert (select count(*) from public.audit_events where entity_id = order_a and action = 'sales_order.portal_auto_approved') = 1, 'approved once';
  assert (select count(*) from public.notifications where kind = 'order.portal_auto_approved' and entity_id = order_a) = 1, 'told once';
  assert (select count(*) from public.deliveries where sales_order_id = order_a) = 1, 'one delivery still';

  -- 3. Stock going out triggers nothing (1,5 → 1,4).
  perform pg_temp.count_sand('1.4', 'd88-count-2');
  assert (select count(*) from public.inventory_movements where material_id = sand and base_quantity_delta < 0) = 1, 'a loss posted';
  assert not exists (select 1 from private.portal_reapprove_stage where txid = txid_current())
    and not exists (select 1 from private.portal_reapprove_flush where txid = txid_current()), 'nothing staged for a loss';

  -- 4. The second path: a purchase receipt of stone approves P.
  perform pg_temp.act_as(office);
  perform public.receive_purchase_order('7f355000-0000-4000-8000-000000000041', jsonb_build_array(jsonb_build_object(
    'purchase_order_line_id', '7f355000-0000-4000-8000-000000000042', 'received_quantity', '5')), null, now(), '7f355000-0000-4000-8000-0000000000f1');
  perform pg_temp.act_as_admin();
  perform pg_temp.commit_point();
  assert (select commercial_state from public.sales_orders where id = order_p) = 'CONFIRMED', 'P approved by the receipt';
  assert (select count(*) from public.deliveries where sales_order_id = order_p) = 1, 'P delivery';
  assert exists (select 1 from public.notifications where kind = 'order.portal_auto_approved' and entity_id = order_p), 'P told';
  assert (select commercial_state from public.sales_orders where id = order_b) = 'DRAFT', 'stone does not touch B';

  -- 5. The approval raising never fails the stock transaction: B stays waiting, the stock is in (1,4 → 2: 0,7 free).
  create function pg_temp.boom() returns trigger language plpgsql as $f$ begin raise exception 'boom'; end $f$;
  create trigger boom355 before insert on public.audit_events for each row when (new.action = 'sales_order.portal_auto_approved')
    execute function pg_temp.boom();
  perform pg_temp.count_sand('2', 'd88-count-3');
  perform pg_temp.commit_point();
  assert (select sum(base_quantity_delta) from public.inventory_movements where material_id = sand) = 2, 'stock in';
  assert (select commercial_state from public.sales_orders where id = order_b) = 'DRAFT'
    and not exists (select 1 from public.credit_commitments where sales_order_id = order_b), 'B not half-approved';
  drop trigger boom355 on public.audit_events;
  perform pg_temp.count_sand('1.6', 'd88-count-4');
  perform pg_temp.commit_point();
  assert (select commercial_state from public.sales_orders where id = order_b) = 'DRAFT', 'a loss does not retry B (0,3 free)';

  -- 6. Stock freed without a movement: the staff order holding 0,6 is cancelled → B approved at commit. X, now within a
  -- bigger limit, is not tried again (left to the office), though it is older and would fit.
  update public.customers set credit_limit_vnd = 100000000 where id = '7f355000-0000-4000-8000-000000000011';
  perform pg_temp.act_as(office);
  perform public.cancel_sales_order(holder, 'Khách đổi ý', '7f355000-0000-4000-8000-0000000000f2');
  perform pg_temp.act_as_admin();
  assert exists (select 1 from private.portal_reapprove_stage where txid = txid_current() and material_id = sand), 'release staged';
  perform pg_temp.commit_point();
  assert (select commercial_state from public.sales_orders where id = order_b) = 'CONFIRMED', 'B approved when the stock was freed';
  assert (select body like '% — đã tự duyệt khi kho có hàng, đang điều phối giao' and body not like '%chờ duyệt%' from public.notifications
    where kind = 'order.portal_submitted' and entity_id = order_b), 'B: pending reason replaced by the approval';
  assert (select commercial_state from public.sales_orders where id = order_x) = 'DRAFT'
    and not exists (select 1 from public.audit_events where entity_id = order_x and action = 'sales_order.portal_auto_approved'), 'X not retried';
  assert (select body like '% — chờ duyệt tay (vượt hạn mức nợ)' from public.notifications where kind = 'order.portal_submitted' and entity_id = order_x),
    'X: one reason';
  assert (select commercial_state from public.sales_orders where id = order_old) = 'DRAFT', 'old order still skipped';

  -- 7. Automation: the new event can drive a rule.
  assert (select count(*) from pg_constraint where conname = 'automation_rules_event_check'
    and pg_get_constraintdef(oid) like '%order.portal_auto_approved%') = 1, 'event allowed for rules';
end
$test$;
