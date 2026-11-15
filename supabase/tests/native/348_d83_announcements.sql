-- D83 (Owner 16/11/2026): "Thông báo cập nhật". Every sales price save tells each customer whose own price changed (only its own
-- lines, owner and accountant, never the receiver), the office about the common price, workers about pay rates; the owner composes
-- the rest. Seen once per account, gone after 30 days, pushed to every device of every recipient.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f348000-0000-4000-8000-000000000001', 'nt_bao348', 'Bao thử 348', 'bao');
insert into public.material_groups(id, code, name) values ('7f348000-0000-4000-8000-000000000002', 'NT_G348', 'Nhóm vật tư 348');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f348000-0000-4000-8000-000000000003', '7f348000-0000-4000-8000-000000000002', 'NT_XM348', 'Xi măng 348', '7f348000-0000-4000-8000-000000000001'),
  ('7f348000-0000-4000-8000-000000000004', '7f348000-0000-4000-8000-000000000002', 'NT_TH348', 'Thép 348', '7f348000-0000-4000-8000-000000000001');
insert into public.customer_price_groups(branch_id, code, name) values ('20000000-0000-4000-8000-00000000000a', 'NT_SI348', 'Nhóm Sỉ thử 348');
insert into public.customers(id, branch_id, code, display_name, customer_type, tier_code) values
  ('7f348000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT_KH3481', 'Khách giá chung 348', 'BUSINESS', null),
  ('7f348000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_KH3482', 'Khách nhóm Sỉ 348', 'BUSINESS', 'NT_SI348'),
  ('7f348000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-00000000000a', 'NT_KH3483', 'Khách giá riêng 348', 'BUSINESS', null),
  ('7f348000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-00000000000a', 'NT_KH3484', 'Khách không có cổng 348', 'BUSINESS', null);
insert into auth.users(id) values
  ('7f348000-0000-4000-8000-0000000000a1'), ('7f348000-0000-4000-8000-0000000000a2'), ('7f348000-0000-4000-8000-0000000000a3'),
  ('7f348000-0000-4000-8000-0000000000b1'), ('7f348000-0000-4000-8000-0000000000b2'), ('7f348000-0000-4000-8000-0000000000b3'),
  ('7f348000-0000-4000-8000-0000000000b4'), ('7f348000-0000-4000-8000-0000000000b5');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('7f348000-0000-4000-8000-0000000000e1', '7f348000-0000-4000-8000-0000000000a1', 'NT_BH348', 'Bán hàng 348'),
  ('7f348000-0000-4000-8000-0000000000e2', '7f348000-0000-4000-8000-0000000000a2', 'NT_TH3481', 'Thợ A 348'),
  ('7f348000-0000-4000-8000-0000000000e3', '7f348000-0000-4000-8000-0000000000a3', 'NT_TH3482', 'Thợ B 348');
insert into public.roles(id, code, name) values
  ('7f348000-0000-4000-8000-0000000000c1', 'nt_sales348', 'Bán hàng thử 348'),
  ('7f348000-0000-4000-8000-0000000000c2', 'nt_worker348', 'Thợ thử 348');
insert into public.role_permissions(role_id, permission_code) values
  ('7f348000-0000-4000-8000-0000000000c1', 'pricing.read'), ('7f348000-0000-4000-8000-0000000000c1', 'orders.read'),
  ('7f348000-0000-4000-8000-0000000000c2', 'work.read'), ('7f348000-0000-4000-8000-0000000000c2', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('7f348000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-00000000000a', '7f348000-0000-4000-8000-0000000000c1'),
  ('7f348000-0000-4000-8000-0000000000e2', '20000000-0000-4000-8000-00000000000a', '7f348000-0000-4000-8000-0000000000c2'),
  ('7f348000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-00000000000a', '7f348000-0000-4000-8000-0000000000c2');
-- Customer 1: owner, accountant, receiver. Customers 2 and 3: an owner each. Customer 4: nobody on the portal.
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f348000-0000-4000-8000-0000000000b1', '7f348000-0000-4000-8000-000000000011', 'OWNER'),
  ('7f348000-0000-4000-8000-0000000000b2', '7f348000-0000-4000-8000-000000000011', 'FINANCE_CONTACT'),
  ('7f348000-0000-4000-8000-0000000000b3', '7f348000-0000-4000-8000-000000000011', 'RECEIVER'),
  ('7f348000-0000-4000-8000-0000000000b4', '7f348000-0000-4000-8000-000000000012', 'OWNER'),
  ('7f348000-0000-4000-8000-0000000000b5', '7f348000-0000-4000-8000-000000000013', 'OWNER');
-- Common price of both items, the group's own cement price, customer 3's own cement price.
insert into public.pricing_rules(branch_id, scope_type, customer_id, material_id, customer_tier_code, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', null, '7f348000-0000-4000-8000-000000000003', null, '7f348000-0000-4000-8000-000000000001', 95000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', null, '7f348000-0000-4000-8000-000000000004', null, '7f348000-0000-4000-8000-000000000001', 120000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'CUSTOMER_TIER', null, '7f348000-0000-4000-8000-000000000003', 'NT_SI348', '7f348000-0000-4000-8000-000000000001', 90000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'CUSTOMER_MATERIAL', '7f348000-0000-4000-8000-000000000013', '7f348000-0000-4000-8000-000000000003', null, '7f348000-0000-4000-8000-000000000001', 93000, 1, 'CONTRACT', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);
-- Devices: customer 1's owner has two, its receiver one, worker A one.
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f348000-0000-4000-8000-0000000000f1', '7f348000-0000-4000-8000-0000000000b1', 'https://push.example.test/348-1', repeat('a', 30), repeat('k', 10)),
  ('7f348000-0000-4000-8000-0000000000f2', '7f348000-0000-4000-8000-0000000000b1', 'https://push.example.test/348-2', repeat('b', 30), repeat('k', 10)),
  ('7f348000-0000-4000-8000-0000000000f3', '7f348000-0000-4000-8000-0000000000b3', 'https://push.example.test/348-3', repeat('c', 30), repeat('k', 10)),
  ('7f348000-0000-4000-8000-0000000000f4', '7f348000-0000-4000-8000-0000000000a2', 'https://push.example.test/348-4', repeat('d', 30), repeat('k', 10));

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner constant uuid := '10000000-0000-4000-8000-000000000001';
  sales constant uuid := '7f348000-0000-4000-8000-0000000000a1';
  worker_a constant uuid := '7f348000-0000-4000-8000-0000000000a2';
  c1_owner constant uuid := '7f348000-0000-4000-8000-0000000000b1';
  c1_finance constant uuid := '7f348000-0000-4000-8000-0000000000b2';
  c1_receiver constant uuid := '7f348000-0000-4000-8000-0000000000b3';
  c2_owner constant uuid := '7f348000-0000-4000-8000-0000000000b4';
  c3_owner constant uuid := '7f348000-0000-4000-8000-0000000000b5';
  c1 constant uuid := '7f348000-0000-4000-8000-000000000011';
  c2 constant uuid := '7f348000-0000-4000-8000-000000000012';
  c3 constant uuid := '7f348000-0000-4000-8000-000000000013';
  bao constant uuid := '7f348000-0000-4000-8000-000000000001';
  cement constant uuid := '7f348000-0000-4000-8000-000000000003';
  steel constant uuid := '7f348000-0000-4000-8000-000000000004';
  today constant timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
  pending jsonb;
  a1 uuid; a1b uuid; office_a uuid; pay_a uuid; manual_a uuid; first_rule uuid;
  n integer;
  failed boolean;
begin
  set constraints all immediate;
  set constraints all deferred;
  assert not exists (select 1 from public.announcements), 'the first prices of a new item tell nobody';

  -- The resolver at a given time chooses as the price resolver does now (customer → group → common).
  assert (select unit_price_vnd from private.announcement_prices(branch, cement, bao, now(), array[c1]))
    = (select p.unit_price_vnd from public.pricing_rules p where p.id = private.preferred_commercial_price_rule(branch, c1, cement, bao)), 'common price';
  assert (select unit_price_vnd from private.announcement_prices(branch, cement, bao, now(), array[c2]))
    = (select p.unit_price_vnd from public.pricing_rules p where p.id = private.preferred_commercial_price_rule(branch, c2, cement, bao)), 'group price';
  assert (select unit_price_vnd from private.announcement_prices(branch, cement, bao, now(), array[c3])) = 93000, 'customer price';

  -- 1. The owner saves the common price list: cement 95 000 → 98 000, steel 120 000 → 116 000.
  perform pg_temp.act_as(owner);
  result := public.save_pricing_rules_batch(branch, jsonb_build_array(
    jsonb_build_object('material_id', cement, 'price_uom_id', bao, 'unit_price_vnd', 98000,
      'supersedes_id', (select id from public.pricing_rules where scope_type = 'DEFAULT' and material_id = cement and active order by version desc limit 1), 'expected_version', 1),
    jsonb_build_object('material_id', steel, 'price_uom_id', bao, 'unit_price_vnd', 116000,
      'supersedes_id', (select id from public.pricing_rules where scope_type = 'DEFAULT' and material_id = steel and active order by version desc limit 1), 'expected_version', 1)),
    today, 'Nhà máy tăng giá xi măng', '7f348000-0000-4000-8000-000000000101');
  first_rule := (result->'rule_ids'->>0)::uuid;
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.announcements), 'decided at commit';
  set constraints all immediate;
  set constraints all deferred;
  select id into a1 from public.announcements where customer_id = c1;
  assert (select count(*) from public.announcement_lines where announcement_id = a1) = 2, 'customer 1 (common price): both items';
  assert exists (select 1 from public.announcement_lines where announcement_id = a1 and item_name = 'Xi măng 348' and old_value = 95000 and new_value = 98000
    and unit_name = 'Bao thử 348'), 'cement old → new';
  assert (select array_agg(item_name order by item_name) from public.announcement_lines l join public.announcements a on a.id = l.announcement_id
    where a.customer_id = c2) = array['Thép 348'], 'customer 2 keeps its group price for cement: only steel';
  assert (select array_agg(item_name order by item_name) from public.announcement_lines l join public.announcements a on a.id = l.announcement_id
    where a.customer_id = c3) = array['Thép 348'], 'customer 3 keeps its own cement price: only steel';
  assert (select count(*) from public.announcements where audience = 'CUSTOMER') = 3, 'nobody for the customer without portal accounts';
  assert (select title from public.announcements where id = a1) = 'Giá mới từ ' || private.announcement_day(now()), 'title with the day';
  select id into office_a from public.announcements where audience = 'OFFICE' and kind = 'PRICE';
  assert (select count(*) from public.announcement_lines where announcement_id = office_a) = 2, 'office: the common price changes';
  assert (select body from public.announcements where id = office_a) like 'Lý do: Nhà máy tăng giá xi măng.%Đã báo 3 khách%', 'office: reason and reach';
  -- One push per device of the owner and the accountant; the receiver's phone gets nothing.
  assert (select count(*) from public.outbound_jobs where dedupe_key like 'announcement:' || a1 || ':%' and channel = 'PUSH') = 2, 'owner has two devices';
  assert not exists (select 1 from public.outbound_jobs where target = '7f348000-0000-4000-8000-0000000000f3'), 'receiver gets no price push';
  assert (select payload->>'link' from public.outbound_jobs where dedupe_key like 'announcement:' || a1 || ':%' limit 1) = '/customer', 'opens the portal home';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'announcement:' || a1 || ':%' limit 1)
    = '2 mặt hàng đổi giá từ ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'), 'short push text';
  perform pg_temp.act_as(owner);
  assert public.price_announcement_reach(branch, first_rule) = 3, 'reach after saving';

  -- 2. Each customer sees only its own lines; the receiver no price; other customers / anon nothing.
  perform pg_temp.act_as(c1_receiver);
  assert public.pending_announcements('CUSTOMER') = '[]'::jsonb, 'receiver: no price announcement';
  assert (select count(*) from public.announcements) = 0, 'receiver reads none (row security)';
  perform pg_temp.act_as(c2_owner);
  pending := public.pending_announcements('CUSTOMER');
  assert jsonb_array_length(pending) = 1 and jsonb_array_length(pending->0->'lines') = 1 and pending->0->'lines'->0->>'name' = 'Thép 348', 'customer 2: its steel line';
  assert pending::text not like '%Xi măng%' and pending::text not like '%Nhóm Sỉ%' and pending::text not like '%95000%', 'no other price, no group name';
  assert (select count(*) from public.announcement_lines) = 1, 'customer 2 reads only its line (row security)';
  assert (select count(*) from public.announcements where customer_id = c1) = 0, 'not customer 1 announcement';
  perform pg_temp.act_as(c1_owner);
  pending := public.pending_announcements('CUSTOMER');
  assert jsonb_array_length(pending) = 1 and pending->0->>'kind' = 'PRICE' and jsonb_array_length(pending->0->'lines') = 2, 'customer 1 owner';
  perform pg_temp.act_as(sales);
  assert jsonb_array_length(public.pending_announcements('OFFICE')) = 1, 'office staff who read prices';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert public.pending_announcements('OFFICE') = '[]'::jsonb, 'office staff who cannot read prices';
  perform pg_temp.act_as(owner);
  assert public.pending_announcements('OFFICE') = '[]'::jsonb, 'not to the one who saved';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert (select count(*) from public.announcements) = 0, 'other branch reads none';
  perform pg_temp.act_as_admin();
  set local role anon;
  failed := false;
  begin perform count(*) from public.announcements; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot read announcements';
  failed := false;
  begin perform public.pending_announcements('CUSTOMER'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot call the popup';
  reset role;

  -- 3. Saved again before anyone saw it: folded into the same announcement (old price kept, new price updated);
  -- an item changed back disappears; an announcement left empty goes.
  perform pg_temp.act_as(owner);
  perform public.save_pricing_rules_batch(branch, jsonb_build_array(
    jsonb_build_object('material_id', cement, 'price_uom_id', bao, 'unit_price_vnd', 97000,
      'supersedes_id', (select id from public.pricing_rules where scope_type = 'DEFAULT' and material_id = cement and active order by version desc limit 1), 'expected_version', 2),
    jsonb_build_object('material_id', steel, 'price_uom_id', bao, 'unit_price_vnd', 120000,
      'supersedes_id', (select id from public.pricing_rules where scope_type = 'DEFAULT' and material_id = steel and active order by version desc limit 1), 'expected_version', 2)),
    today, 'Sửa lại giá', '7f348000-0000-4000-8000-000000000102');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*) from public.announcements where customer_id = c1) = 1, 'still one for customer 1';
  assert (select array_agg(item_name || ' ' || old_value || '→' || new_value) from public.announcement_lines where announcement_id = a1)
    = array['Xi măng 348 95000→97000'], 'cement 95 000 → 97 000, steel back to its old price';
  assert not exists (select 1 from public.announcements where customer_id in (c2, c3)), 'customers 2 and 3: nothing changed any more';
  assert (select count(*) from public.announcements where audience = 'OFFICE') = 1, 'office: still one';
  assert (select count(*) from public.outbound_jobs where dedupe_key like 'announcement:' || a1 || ':%') = 2, 'no second push';
  assert (select body from public.announcements where id = a1) like 'Cửa hàng điều chỉnh giá 1 mặt hàng%', 'text follows the lines';

  -- 4. Seen once per account: the owner's "Đã hiểu" does not hide it from the accountant.
  perform pg_temp.act_as(c1_owner);
  assert public.mark_announcements_seen(array[a1], '7f348000-0000-4000-8000-000000000201') = 1, 'seen';
  assert public.mark_announcements_seen(array[a1], '7f348000-0000-4000-8000-000000000202') = 0, 'seen once';
  assert public.pending_announcements('CUSTOMER') = '[]'::jsonb, 'not again for this account';
  assert jsonb_array_length(public.announcement_history('CUSTOMER')) = 1
    and public.announcement_history('CUSTOMER')->0->>'seen_at' is not null, 'still in the history';
  perform pg_temp.act_as(c2_owner);
  assert public.mark_announcements_seen(array[a1], '7f348000-0000-4000-8000-000000000203') = 0, 'cannot mark another customer''s';
  perform pg_temp.act_as(c1_finance);
  assert jsonb_array_length(public.pending_announcements('CUSTOMER')) = 1, 'the accountant still has it';

  -- Once seen, a new save makes a new announcement (from the price they were told).
  perform pg_temp.act_as(owner);
  perform public.save_pricing_rules_batch(branch, jsonb_build_array(
    jsonb_build_object('material_id', cement, 'price_uom_id', bao, 'unit_price_vnd', 99000,
      'supersedes_id', (select id from public.pricing_rules where scope_type = 'DEFAULT' and material_id = cement and active order by version desc limit 1), 'expected_version', 3)),
    today, 'Cập nhật giá', '7f348000-0000-4000-8000-000000000103');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  select id into a1b from public.announcements where customer_id = c1 and id <> a1;
  assert a1b is not null and (select old_value || '→' || new_value from public.announcement_lines where announcement_id = a1b) = '97000→99000', 'a new one';

  -- A customer's own price, saved alone, tells only that customer.
  perform pg_temp.act_as(owner);
  perform public.save_pricing_rule('7f348000-0000-4000-8000-000000000301', branch,
    (select id from public.pricing_rules where scope_type = 'CUSTOMER_MATERIAL' and customer_id = c3 and active order by version desc limit 1), 1,
    jsonb_build_object('unit_price_vnd', 94000, 'source_type', 'CONTRACT', 'effective_from', today), 'Giá hợp đồng mới', '7f348000-0000-4000-8000-000000000104');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*) from public.announcements a join public.announcement_lines l on l.announcement_id = a.id
    where a.customer_id = c3 and l.old_value = 93000 and l.new_value = 94000) = 1, 'customer 3 told';
  assert (select count(*) from public.announcements where audience = 'CUSTOMER' and created_at = now() and customer_id not in (c1, c3)) = 0, 'nobody else';

  -- 5. After 30 days an unseen announcement stops showing.
  update public.announcements set created_at = now() - interval '31 days', expires_at = now() - interval '1 day' where id in (a1, a1b);
  perform pg_temp.act_as(c1_finance);
  assert public.pending_announcements('CUSTOMER') = '[]'::jsonb, 'expired';
  perform pg_temp.act_as_admin();

  -- 6. Pay rates: workers of the branch are told, with a push; a person's own trip price is not announced.
  perform pg_temp.act_as(owner);
  perform public.save_transport_pay_rate(branch, cement, bao, 3000, true, '7f348000-0000-4000-8000-000000000401');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  select id into pay_a from public.announcements where audience = 'WORKER' and kind = 'PAY_RATE';
  assert (select old_value is null and new_value = 3000 from public.announcement_lines where announcement_id = pay_a), 'new rate';
  assert exists (select 1 from public.outbound_jobs where dedupe_key = 'announcement:' || pay_a || ':7f348000-0000-4000-8000-0000000000f4'), 'worker A phone';
  perform pg_temp.act_as(owner);
  perform public.save_transport_pay_rate(branch, cement, bao, 3500, true, '7f348000-0000-4000-8000-000000000402');
  perform public.save_payroll_component(branch, null, 'XE348', 'Tiền chuyến 348', 'BONUS', 'PER_TRIP', 30000, null, null, true, '7f348000-0000-4000-8000-000000000403');
  perform public.save_payroll_component(branch, null, 'RIENG348', 'Tiền chuyến riêng 348', 'BONUS', 'PER_TRIP', 45000, null,
    '7f348000-0000-4000-8000-0000000000e2', true, '7f348000-0000-4000-8000-000000000404');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*) from public.announcements where audience = 'WORKER') = 1, 'folded into the unseen one';
  assert (select array_agg(item_name || ':' || coalesce(old_value::text, '-') || '→' || new_value order by item_name) from public.announcement_lines
    where announcement_id = pay_a) = array['Tiền chuyến 348:-→30000', 'Xi măng 348:-→3500'], 'rates, without the private trip price';
  assert (select body from public.announcements where id = pay_a) like 'Văn phòng đổi 2 đơn giá công lúc %', 'when it changed';
  perform pg_temp.act_as(worker_a);
  pending := public.pending_announcements('WORKER');
  assert jsonb_array_length(pending) = 1 and pending->0->>'kind' = 'PAY_RATE' and pending::text not like '%45000%', 'worker sees it';
  perform pg_temp.act_as(c1_owner);
  assert public.pending_announcements('WORKER') = '[]'::jsonb, 'not a worker';

  -- 7. Only the owner (roles.manage) composes; customers' composed messages reach every member, the receiver too.
  perform pg_temp.act_as(sales);
  failed := false;
  begin
    perform public.create_announcement(branch, 'CUSTOMER', 'NEWS', 'Mới: đặt dịch vụ', 'Bấm Đặt.', null, null, '7f348000-0000-4000-8000-000000000501');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'staff cannot compose';
  perform pg_temp.act_as(owner);
  failed := false;
  begin
    perform public.create_announcement(branch, 'CUSTOMER', 'NEWS', 'Có link ngoài', null, '/admin/orders', null, '7f348000-0000-4000-8000-000000000502');
  exception when sqlstate '22023' then failed := true; end;
  assert failed, 'only the portal''s own pages';
  -- A customer login switches push on for its phone ("Thông báo trên điện thoại" on the account page).
  perform pg_temp.act_as(c2_owner);
  assert public.save_push_subscription('https://push.example.test/348-5', repeat('e', 30), repeat('k', 10), 'Điện thoại thử') is not null, 'customer saves a device';
  perform pg_temp.act_as(owner);
  manual_a := public.create_announcement(branch, 'CUSTOMER', 'FEATURE', 'Mới: đặt dịch vụ ngay trên app', 'Bấm nút Đặt ở giữa thanh dưới.',
    '/customer/services/new', null, '7f348000-0000-4000-8000-000000000503');
  assert public.create_announcement(branch, 'CUSTOMER', 'FEATURE', 'Mới: đặt dịch vụ ngay trên app', 'Bấm nút Đặt ở giữa thanh dưới.',
    '/customer/services/new', null, '7f348000-0000-4000-8000-000000000503') = manual_a, 'replay';
  failed := false;
  begin
    perform public.create_announcement(branch, 'CUSTOMER', 'FEATURE', 'Khác', null, null, null, '7f348000-0000-4000-8000-000000000503');
  exception when unique_violation then failed := true; end;
  assert failed, 'same operation, other content';
  assert (select count(*) from public.outbound_jobs where dedupe_key like 'announcement:' || manual_a || ':%') = 4, 'owner 2 devices + receiver 1 + customer 2';
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.outbound_jobs j join public.push_subscriptions s on s.id::text = j.target
    where j.dedupe_key like 'announcement:' || manual_a || ':%' and s.auth_user_id = c2_owner and j.payload->>'link' = '/customer'
      and j.payload->>'title' = 'Mới: đặt dịch vụ ngay trên app' and j.payload->>'body' = 'Bấm nút Đặt ở giữa thanh dưới.'), 'customer phone, portal home';
  perform pg_temp.act_as(c1_receiver);
  pending := public.pending_announcements('CUSTOMER');
  assert jsonb_array_length(pending) = 1 and pending->0->>'label' = 'FEATURE' and pending->0->>'link' = '/customer/services/new', 'receiver gets news';
  perform pg_temp.act_as(c3_owner);
  pending := public.pending_announcements('CUSTOMER');
  assert pending->0->>'kind' = 'PRICE' and pending->1->>'kind' = 'MANUAL', 'price first';
  perform pg_temp.act_as(owner);
  assert (select count(*) from jsonb_array_elements(public.sent_announcements(branch)) g where g->>'group_id' = manual_a::text and (g->>'recipients')::integer = 5), 'reach';

  -- "Ngừng hiện": gone from the popup and the history.
  perform public.stop_announcement(manual_a, '7f348000-0000-4000-8000-000000000504');
  perform pg_temp.act_as(c1_receiver);
  assert public.pending_announcements('CUSTOMER') = '[]'::jsonb and public.announcement_history('CUSTOMER') = '[]'::jsonb, 'withdrawn';
  perform pg_temp.act_as(sales);
  failed := false;
  begin perform public.sent_announcements(branch); exception when insufficient_privilege then failed := true; end;
  assert failed, 'only the owner lists what was sent';

  -- At most five at a time.
  perform pg_temp.act_as(owner);
  for n in 1..6 loop
    perform public.create_announcement(branch, 'WORKER', 'RULE', 'Quy định ' || n, null, null, null, gen_random_uuid());
  end loop;
  perform pg_temp.act_as(worker_a);
  assert jsonb_array_length(public.pending_announcements('WORKER')) = 5, 'five at a time';
  assert public.pending_announcements('WORKER')->0->>'kind' = 'PAY_RATE', 'pay rates first';
  perform pg_temp.act_as_admin();
end
$test$;
