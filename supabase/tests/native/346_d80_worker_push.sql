-- D80 (Owner 15/11/2026): a worker's phone is told about a job given to him and about a delivery waiting in "Nhận việc" that
-- he may take, without an automation rule; decided at commit, so a delivery assigned in the same transaction calls nobody.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f346000-0000-4000-8000-000000000001', 'nt_kg346', 'Kilôgam thử 346', 'kg');
insert into public.material_groups(id, code, name) values ('7f346000-0000-4000-8000-000000000002', 'NT_G346', 'Nhóm thử 346');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f346000-0000-4000-8000-000000000003', '7f346000-0000-4000-8000-000000000002', 'NT_XM346', 'Xi măng 346', '7f346000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f346000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K346', 'Kho 346');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f346000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f346000-0000-4000-8000-000000000004', 'NT-KK-346', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f346000-0000-4000-8000-000000000006', '7f346000-0000-4000-8000-000000000005', '7f346000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f346000-0000-4000-8000-000000000003', '7f346000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f346000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f346000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7f346000-0000-4000-8000-000000000003', '7f346000-0000-4000-8000-000000000001', 2000, 1, 'LIST',
   now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7f346000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH346', 'Khách 346', 'BUSINESS', 100000000),
  ('7f346000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-00000000000a', 'NT_KH3462', 'Khách 346 hạn mức nhỏ', 'BUSINESS', 1000);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f346000-0000-4000-8000-000000000011', '7f346000-0000-4000-8000-000000000010', 'CT1', 'Công trình 346', 'Địa chỉ 346', 'Anh Nhận', '0901346000'),
  ('7f346000-0000-4000-8000-000000000015', '7f346000-0000-4000-8000-000000000014', 'CT1', 'Công trình 346 B', 'Địa chỉ 346 B', 'Chị Nhận', '0901346001');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f346000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT-SO-346', '7f346000-0000-4000-8000-000000000010',
   '7f346000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 346', 'Công trình 346', 'Địa chỉ 346', 'Anh Nhận', '0901346000', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f346000-0000-4000-8000-000000000013', '7f346000-0000-4000-8000-000000000012', 1, '7f346000-0000-4000-8000-000000000003', 'Xi măng 346',
   '7f346000-0000-4000-8000-000000000001', '7f346000-0000-4000-8000-000000000001', 3000, 1, 1, 'HALF_UP', 2000, 6000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- Two drivers (work.claim), two trucks; a portal owner for each customer.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000347'), ('10000000-0000-4000-8000-000000000348'),
  ('7f346000-0000-4000-8000-0000000000a1'), ('7f346000-0000-4000-8000-0000000000a2');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000347', '10000000-0000-4000-8000-000000000347', 'NT_TX347', 'Tài xế A'),
  ('30000000-0000-4000-8000-000000000348', '10000000-0000-4000-8000-000000000348', 'NT_TX348', 'Tài xế B');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000347', 'nt_driver346', 'Tài xế thử 346');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000347', 'work.claim'), ('40000000-0000-4000-8000-000000000347', 'work.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000347', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000347'),
  ('30000000-0000-4000-8000-000000000348', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000347');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7f346000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_V3461', '99C-346.01'),
  ('7f346000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_V3462', '99C-346.02');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f346000-0000-4000-8000-0000000000a1', '7f346000-0000-4000-8000-000000000010', 'OWNER'),
  ('7f346000-0000-4000-8000-0000000000a2', '7f346000-0000-4000-8000-000000000014', 'OWNER');
select set_config('request.jwt.claim.sub', '', true);

-- Both drivers switched notifications on.
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f346000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000347', 'https://push.example.test/a', repeat('a', 30), repeat('k', 10)),
  ('7f346000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-000000000348', 'https://push.example.test/b', repeat('b', 30), repeat('k', 10));

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  sale constant uuid := '7f346000-0000-4000-8000-000000000012';
  line constant uuid := '7f346000-0000-4000-8000-000000000013';
  wh constant uuid := '7f346000-0000-4000-8000-000000000004';
  v1 constant uuid := '7f346000-0000-4000-8000-000000000020';
  driver_a constant uuid := '30000000-0000-4000-8000-000000000347';
  driver_b constant uuid := '30000000-0000-4000-8000-000000000348';
  user_a constant uuid := '10000000-0000-4000-8000-000000000347';
  office constant uuid := '10000000-0000-4000-8000-000000000001';
  nine constant timestamptz := (((now() at time zone 'Asia/Ho_Chi_Minh')::date + 2) + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
  d1 uuid; d2 uuid; d3 uuid;
  work uuid;
  version_now integer;
begin
  perform pg_temp.act_as(office);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"SUGGEST"}', null, '7f346000-0000-4000-8000-0000000000c1');

  -- 1. A delivery waiting for a driver: each driver who can take it is told, with a push to his phone.
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f346000-0000-4000-8000-0000000000b1');
  d1 := (result->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d1), 'nothing before commit';
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*) from public.notifications where kind = 'delivery.pool_open' and entity_id = d1) = 2, 'both drivers told';
  assert exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = driver_a
    and link = '/work/pool' and title = 'Phiếu giao chờ người nhận: Công trình 346' and body like '%Xi măng 346 1000 kg%'), 'what and where';
  assert (select count(*) from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.kind = 'delivery.pool_open' and n.entity_id = d1 and j.channel = 'PUSH' and j.rule_id is null and j.dedupe_key like 'worker:%') = 2,
    'one push per driver phone, without a rule';
  assert exists (select 1 from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.entity_id = d1 and n.recipient_employee_id = driver_a and j.target = '7f346000-0000-4000-8000-0000000000f1'), 'to his own phone';

  -- 2. Created and given away in the same transaction (the daily import's "Khách tự lấy"): nobody is called.
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '200')), nine, null,
    '7f346000-0000-4000-8000-0000000000b2');
  d2 := (result->>'delivery_id')::uuid;
  perform public.assign_delivery(d2, null, null, 'Khách tự lấy', null, (select version from public.deliveries where id = d2), '7f346000-0000-4000-8000-0000000000b3');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert not exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d2), 'pickup calls nobody';

  -- 3. Driver A takes d1 himself: no "job given to you" for his own claim. Then he declines it: driver B is told again.
  perform pg_temp.act_as(user_a);
  result := public.claim_delivery(d1, v1, (public.worker_delivery_pool()->0->>'version')::integer, '7f346000-0000-4000-8000-0000000000d1');
  work := (result->>'work_item_id')::uuid;
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.notifications where kind = 'work.assigned' and entity_id = work), 'no push for his own claim';
  perform pg_temp.act_as(user_a);
  select w.version into version_now from public.work_items w where w.id = work;
  perform public.decline_portal_work_item(work, 'Xe hỏng lốp', version_now, '7f346000-0000-4000-8000-0000000000d2');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = driver_b
    and dedupe_key like '%:' || (select version from public.deliveries where id = d1)), 'back in the pool: driver B told again';
  assert (select count(*) from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = driver_a) = 1,
    'not again to the driver who declined';

  -- 4. The office gives d1 to driver B: his phone gets "Việc mới" without a rule.
  perform pg_temp.act_as(office);
  perform public.assign_delivery_scheduled(d1, driver_b, v1, null, null, (select version from public.deliveries where id = d1),
    '7f346000-0000-4000-8000-0000000000d4', nine + interval '3 hours', nine + interval '4 hours');
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.kind = 'work.assigned' and n.recipient_employee_id = driver_b and j.target = '7f346000-0000-4000-8000-0000000000f2'
      and j.dedupe_key like 'worker:%'), 'job given to driver B reaches his phone';

  -- 5. An active PUSH rule for the event takes over: no second push.
  insert into public.automation_rules(branch_id, name, event, channel, created_by)
  values (branch, 'Báo việc mới cho thợ', 'work.assigned', 'PUSH', office);
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '100')), nine, null,
    '7f346000-0000-4000-8000-0000000000b4');
  d3 := (result->>'delivery_id')::uuid;
  perform public.assign_delivery_scheduled(d3, driver_a, v1, null, null, (select version from public.deliveries where id = d3),
    '7f346000-0000-4000-8000-0000000000d5', nine + interval '6 hours', nine + interval '7 hours');
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.kind = 'work.assigned' and n.recipient_employee_id = driver_a and n.entity_id in (select id from public.work_items where delivery_id = d3)) = 1
    and not exists (select 1 from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
      where n.kind = 'work.assigned' and n.recipient_employee_id = driver_a and j.dedupe_key like 'worker:%'
        and n.entity_id in (select id from public.work_items where delivery_id = d3)), 'only the rule sends it';
end
$test$;
