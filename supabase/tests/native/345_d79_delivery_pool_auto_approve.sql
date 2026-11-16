-- D79 (Owner 15/11/2026): a delivery waiting for dispatch is open in the worker "Nhận việc" pool at the same time as the
-- dispatch suggestion; the first one wins (a worker taking it with a free truck, or the office). A portal order within the
-- credit limit and fully in stock is approved at once; otherwise it waits for "Duyệt đơn" and the office is told why.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f345000-0000-4000-8000-000000000001', 'nt_kg345', 'Kilôgam thử 345', 'kg');
insert into public.material_groups(id, code, name) values ('7f345000-0000-4000-8000-000000000002', 'NT_G345', 'Nhóm thử 345');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f345000-0000-4000-8000-000000000003', '7f345000-0000-4000-8000-000000000002', 'NT_XM345', 'Xi măng 345', '7f345000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f345000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K345', 'Kho 345');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f345000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f345000-0000-4000-8000-000000000004', 'NT-KK-345', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f345000-0000-4000-8000-000000000006', '7f345000-0000-4000-8000-000000000005', '7f345000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f345000-0000-4000-8000-000000000003', '7f345000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f345000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f345000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7f345000-0000-4000-8000-000000000003', '7f345000-0000-4000-8000-000000000001', 2000, 1, 'LIST',
   now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7f345000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH345', 'Khách 345', 'BUSINESS', 100000000),
  ('7f345000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-00000000000a', 'NT_KH3452', 'Khách 345 hạn mức nhỏ', 'BUSINESS', 1000);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f345000-0000-4000-8000-000000000011', '7f345000-0000-4000-8000-000000000010', 'CT1', 'Công trình 345', 'Địa chỉ 345', 'Anh Nhận', '0901345000'),
  ('7f345000-0000-4000-8000-000000000015', '7f345000-0000-4000-8000-000000000014', 'CT1', 'Công trình 345 B', 'Địa chỉ 345 B', 'Chị Nhận', '0901345001');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f345000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT-SO-345', '7f345000-0000-4000-8000-000000000010',
   '7f345000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 345', 'Công trình 345', 'Địa chỉ 345', 'Anh Nhận', '0901345000', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f345000-0000-4000-8000-000000000013', '7f345000-0000-4000-8000-000000000012', 1, '7f345000-0000-4000-8000-000000000003', 'Xi măng 345',
   '7f345000-0000-4000-8000-000000000001', '7f345000-0000-4000-8000-000000000001', 3000, 1, 1, 'HALF_UP', 2000, 6000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- Two drivers (work.claim), two trucks; a portal owner for each customer.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000345'), ('10000000-0000-4000-8000-000000000346'),
  ('7f345000-0000-4000-8000-0000000000a1'), ('7f345000-0000-4000-8000-0000000000a2');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000345', '10000000-0000-4000-8000-000000000345', 'NT_TX345', 'Tài xế A'),
  ('30000000-0000-4000-8000-000000000346', '10000000-0000-4000-8000-000000000346', 'NT_TX346', 'Tài xế B');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000345', 'nt_driver345', 'Tài xế thử 345');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000345', 'work.claim'), ('40000000-0000-4000-8000-000000000345', 'work.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000345', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000345'),
  ('30000000-0000-4000-8000-000000000346', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000345');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7f345000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_V3451', '99C-345.01'),
  ('7f345000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_V3452', '99C-345.02');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f345000-0000-4000-8000-0000000000a1', '7f345000-0000-4000-8000-000000000010', 'OWNER'),
  ('7f345000-0000-4000-8000-0000000000a2', '7f345000-0000-4000-8000-000000000014', 'OWNER');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  sale constant uuid := '7f345000-0000-4000-8000-000000000012';
  line constant uuid := '7f345000-0000-4000-8000-000000000013';
  wh constant uuid := '7f345000-0000-4000-8000-000000000004';
  cement constant uuid := '7f345000-0000-4000-8000-000000000003';
  kg constant uuid := '7f345000-0000-4000-8000-000000000001';
  v1 constant uuid := '7f345000-0000-4000-8000-000000000020';
  v2 constant uuid := '7f345000-0000-4000-8000-000000000021';
  driver_a constant uuid := '30000000-0000-4000-8000-000000000345';
  driver_b constant uuid := '30000000-0000-4000-8000-000000000346';
  user_a constant uuid := '10000000-0000-4000-8000-000000000345';
  user_b constant uuid := '10000000-0000-4000-8000-000000000346';
  office constant uuid := '10000000-0000-4000-8000-000000000001';
  day constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 2;
  nine constant timestamptz := (day + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
  pool jsonb;
  row jsonb;
  d1 uuid; d2 uuid;
  other uuid;
  work uuid;
  version_now integer;
  failed text;
  ordered uuid;
begin
  perform pg_temp.act_as(office);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"SUGGEST"}', null, '7f345000-0000-4000-8000-0000000000c1');
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f345000-0000-4000-8000-0000000000b1');
  d1 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'status' = 'SUGGESTED', format('suggested %s', result->'dispatch');

  -- 1. Open to both drivers at once; the suggestion's truck is pre-selected; quantities in the sold unit.
  perform pg_temp.act_as(user_a);
  assert public.worker_delivery_pool_count() = 1, 'driver A sees one delivery';
  pool := public.worker_delivery_pool();
  row := pool->0;
  assert jsonb_array_length(pool) = 1 and row->>'id' = d1::text and row->>'address' = 'Địa chỉ 345'
    and row->'lines'->0->>'quantity' = '1000' and row->'lines'->0->>'unit' = 'kg', format('pool row %s', row);
  assert jsonb_array_length(row->'vehicles') = 2, format('both trucks offered %s', row->'vehicles');
  assert row->>'suggested_vehicle_id' = coalesce((select p.vehicle_id::text from public.delivery_dispatch_proposals p where p.delivery_id = d1
    and p.employee_id = driver_a), row->>'suggested_vehicle_id'), 'suggestion truck first when it is his';
  version_now := (row->>'version')::integer;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert public.worker_delivery_pool_count() = 0, 'a reader is not a worker';

  -- 2. A stale screen is refused; then driver A takes it with truck 2.
  perform pg_temp.act_as(user_a);
  failed := null;
  begin perform public.claim_delivery(d1, v2, version_now - 1, '7f345000-0000-4000-8000-0000000000d0'); exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_claim_stale', format('stale refused, got %s', failed);
  result := public.claim_delivery(d1, v2, version_now, '7f345000-0000-4000-8000-0000000000d1');
  work := (result->>'work_item_id')::uuid;
  assert public.claim_delivery(d1, v2, version_now, '7f345000-0000-4000-8000-0000000000d1')->>'work_item_id' = work::text, 'replay';
  assert jsonb_array_length(public.worker_portal_snapshot()->'jobs') = 1 and public.worker_portal_snapshot()->'jobs'->0->>'id' = work::text,
    'the job is on his list';
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d1) = 'ASSIGNED', 'assigned';
  assert (select a.employee_id = driver_a and a.vehicle_id = v2 and a.assigned_by = user_a from public.delivery_assignments a
    where a.delivery_id = d1 and a.superseded_at is null), 'driver A with truck 2, by himself';
  assert (select w.execution_state || ':' || wa.employee_id from public.work_items w join public.work_item_assignments wa on wa.work_item_id = w.id
    and wa.superseded_at is null where w.id = work) = 'CLAIMED:' || driver_a, 'work item his';
  assert not exists (select 1 from public.delivery_dispatch_proposals where delivery_id = d1), 'suggestion gone';
  assert exists (select 1 from public.notifications where kind = 'delivery.claimed' and entity_id = d1 and title = 'Tài xế A đã nhận '
    || (select delivery_number from public.deliveries where id = d1) and required_permission = 'delivery.assign'), 'office told';
  assert exists (select 1 from public.audit_events where entity_id = d1 and action = 'delivery.claimed' and actor_auth_user_id = user_a), 'audited';

  -- 3. One winner: driver B and the office's suggestion are refused with a clear reason.
  perform pg_temp.act_as(user_b);
  assert public.worker_delivery_pool_count() = 0, 'gone from the pool';
  failed := null;
  begin perform public.claim_delivery(d1, v1, version_now, '7f345000-0000-4000-8000-0000000000d2'); exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_not_claimable', format('second taker refused, got %s', failed);
  perform pg_temp.act_as(office);
  failed := null;
  begin perform public.apply_dispatch_proposal(d1, '7f345000-0000-4000-8000-0000000000d3'); exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_already_claimed', format('office told it was taken, got %s', failed);

  -- 4. Driver A declines before starting: open again, but not for him; driver B takes the same job.
  perform pg_temp.act_as(user_a);
  select w.version into version_now from public.work_items w where w.id = work;
  perform public.decline_portal_work_item(work, 'Xe hỏng lốp', version_now, '7f345000-0000-4000-8000-0000000000d4');
  assert public.worker_delivery_pool_count() = 0, 'not offered again to who declined';
  perform pg_temp.act_as(user_b);
  pool := public.worker_delivery_pool();
  assert jsonb_array_length(pool) = 1 and pool->0->>'id' = d1::text, 'driver B sees it';
  failed := null;
  begin perform public.claim_delivery(d1, gen_random_uuid(), (pool->0->>'version')::integer, '7f345000-0000-4000-8000-0000000000d5');
  exception when others then failed := sqlerrm; end;
  assert failed = 'claim_vehicle_unavailable', format('unknown truck refused, got %s', failed);
  result := public.claim_delivery(d1, v1, (pool->0->>'version')::integer, '7f345000-0000-4000-8000-0000000000d6');
  assert (result->>'work_item_id')::uuid = work, 'the same job moved to driver B';
  perform pg_temp.act_as_admin();
  assert (select w.execution_state || ':' || wa.employee_id from public.work_items w join public.work_item_assignments wa on wa.work_item_id = w.id
    and wa.superseded_at is null where w.id = work) = 'CLAIMED:' || driver_b, 'work item now driver B''s';

  -- 5. Owner 16/11 (D79 sửa): listed even without address, receiver or phone; not listed when dispatch is OFF; an anonymous
  -- caller cannot take anything.
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '500')), nine, null,
    '7f345000-0000-4000-8000-0000000000b2');
  d2 := (result->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  update public.deliveries set receiver_phone_snapshot = null, receiver_name_snapshot = null, delivery_address_snapshot = '' where id = d2;
  perform pg_temp.act_as(user_a);
  assert public.worker_delivery_pool_count() = 1, 'no phone, receiver or address: still listed';
  pool := public.worker_delivery_pool();
  assert jsonb_array_length(pool) = 1 and pool->0->>'id' = d2::text and coalesce(pool->0->>'address', '') = '', format('listed without an address %s', pool);
  -- 20261116210000: taking it also works without those details (a job is created); probed and rolled back.
  begin
    result := public.claim_delivery(d2, v2, (pool->0->>'version')::integer, '7f345000-0000-4000-8000-0000000000d9');
    assert (result->>'work_item_id') is not null and exists (select 1 from public.work_items w where w.id = (result->>'work_item_id')::uuid),
      format('claimed without receiver details %s', result);
    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
  perform pg_temp.act_as_admin();
  update public.deliveries set receiver_phone_snapshot = '0901345000', receiver_name_snapshot = 'Người nhận 345', delivery_address_snapshot = 'Địa chỉ 345'
    where id = d2;
  perform pg_temp.act_as(user_a);
  assert public.worker_delivery_pool_count() = 1, 'listed with the details too';
  perform pg_temp.act_as(office);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', 1, '7f345000-0000-4000-8000-0000000000c2');
  perform pg_temp.act_as(user_a);
  assert public.worker_delivery_pool_count() = 0, 'dispatch OFF: the office decides';
  perform pg_temp.act_as_admin();
  set local role anon;
  failed := null;
  begin perform public.claim_delivery(d2, v1, 1, gen_random_uuid()); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'anon cannot claim';
  reset role;

  -- 6. Portal order in stock and within the limit: approved and sourced at once, the delivery open for the drivers.
  perform pg_temp.act_as(office);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"SUGGEST"}', 2, '7f345000-0000-4000-8000-0000000000c3');
  perform pg_temp.act_as('7f345000-0000-4000-8000-0000000000a1');
  ordered := public.submit_portal_order('7f345000-0000-4000-8000-000000000010', '7f345000-0000-4000-8000-000000000011', null, nine,
    jsonb_build_array(jsonb_build_object('material_id', cement, 'ordered_uom_id', kg, 'quantity', '100')), null, '7f345000-0000-4000-8000-0000000000e1');
  assert current_setting('request.jwt.claim.sub', true) = '7f345000-0000-4000-8000-0000000000a1', 'caller restored after the approval';
  assert public.submit_portal_order('7f345000-0000-4000-8000-000000000010', '7f345000-0000-4000-8000-000000000011', null, nine,
    jsonb_build_array(jsonb_build_object('material_id', cement, 'ordered_uom_id', kg, 'quantity', '100')), null, '7f345000-0000-4000-8000-0000000000e1') = ordered, 'replay';
  assert public.customer_portal_order(ordered)->>'state' = 'CONFIRMED', 'the customer sees it approved';
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = ordered) = 'CONFIRMED', 'approved';
  assert exists (select 1 from public.credit_commitments where sales_order_id = ordered), 'credit held';
  assert (select count(*) from public.deliveries where sales_order_id = ordered and execution_state = 'PLANNED') = 1, 'one delivery waiting for a driver';
  assert exists (select 1 from public.audit_events where entity_id = ordered and action = 'sales_order.portal_auto_approved' and actor_auth_user_id = office),
    'approved as the owner account, audited';
  assert (select title like 'Đơn mới từ khách (đã tự duyệt)%' and body like '%— đã tự duyệt, đang điều phối giao' from public.notifications
    where kind = 'order.portal_submitted' and entity_id = ordered), 'office notification says so';
  select id into d2 from public.deliveries where sales_order_id = ordered;
  perform pg_temp.act_as(user_a);
  assert exists (select 1 from jsonb_array_elements(public.worker_delivery_pool()) x where x->>'id' = d2::text), 'its delivery is in the pool';

  -- 7. Not enough stock, or over the credit limit: waits for "Duyệt đơn", the reason is in the notification.
  perform pg_temp.act_as('7f345000-0000-4000-8000-0000000000a1');
  other := public.submit_portal_order('7f345000-0000-4000-8000-000000000010', '7f345000-0000-4000-8000-000000000011', null, null,
    jsonb_build_array(jsonb_build_object('material_id', cement, 'ordered_uom_id', kg, 'quantity', '20000')), null, '7f345000-0000-4000-8000-0000000000e2');
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = other) = 'DRAFT', 'short stock waits';
  assert (select body like '%— chờ duyệt (kho chưa đủ hàng)' from public.notifications where kind = 'order.portal_submitted' and entity_id = other),
    'reason: stock';
  perform pg_temp.act_as('7f345000-0000-4000-8000-0000000000a2');
  other := public.submit_portal_order('7f345000-0000-4000-8000-000000000014', '7f345000-0000-4000-8000-000000000015', null, null,
    jsonb_build_array(jsonb_build_object('material_id', cement, 'ordered_uom_id', kg, 'quantity', '10')), null, '7f345000-0000-4000-8000-0000000000e3');
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = other) = 'DRAFT'
    and not exists (select 1 from public.credit_commitments where sales_order_id = other), 'over the limit waits, nothing held';
  assert (select body like '%— chờ duyệt tay (vượt hạn mức nợ)' from public.notifications where kind = 'order.portal_submitted' and entity_id = other),
    'reason: credit';
end
$test$;
