-- D85 (Owner 16/11/2026): a lead worker ("thợ chính") with the personal grant work.field_dispatch gives the branch's waiting
-- deliveries and service jobs to workers from the worker portal "Điều phối" tab, and changes the person until loading / start.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f349000-0000-4000-8000-000000000001', 'nt_kg349', 'Kilôgam thử 349', 'kg');
insert into public.material_groups(id, code, name) values ('7f349000-0000-4000-8000-000000000002', 'NT_G349', 'Nhóm thử 349');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f349000-0000-4000-8000-000000000003', '7f349000-0000-4000-8000-000000000002', 'NT_XM349', 'Xi măng 349', '7f349000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f349000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K349', 'Kho 349');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f349000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f349000-0000-4000-8000-000000000004', 'NT-KK-349', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f349000-0000-4000-8000-000000000006', '7f349000-0000-4000-8000-000000000005', '7f349000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f349000-0000-4000-8000-000000000003', '7f349000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f349000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f349000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7f349000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH349', 'Khách 349', 'BUSINESS', 100000000);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f349000-0000-4000-8000-000000000011', '7f349000-0000-4000-8000-000000000010', 'CT1', 'Nhà anh Bình 349', 'Ngõ 12 Đại Mỗ', 'Anh Bình', '0901349000');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f349000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT-SO-349', '7f349000-0000-4000-8000-000000000010',
   '7f349000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 349', 'Nhà anh Bình 349', 'Ngõ 12 Đại Mỗ', 'Anh Bình', '0901349000', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f349000-0000-4000-8000-000000000013', '7f349000-0000-4000-8000-000000000012', 1, '7f349000-0000-4000-8000-000000000003', 'Xi măng 349',
   '7f349000-0000-4000-8000-000000000001', '7f349000-0000-4000-8000-000000000001', 5000, 1, 1, 'HALF_UP', 2000, 10000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- The lead (Tuấn), a second lead (Phong) and two workers (Hùng, Sơn), all "Thợ & tài xế" (work.claim + work.read); two trucks.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000349'), ('10000000-0000-4000-8000-000000000350'), ('10000000-0000-4000-8000-000000000351'),
  ('10000000-0000-4000-8000-000000000352');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000349', '10000000-0000-4000-8000-000000000349', 'NT_TC349', 'Tuấn'),
  ('30000000-0000-4000-8000-000000000350', '10000000-0000-4000-8000-000000000350', 'NT_TH350', 'Hùng'),
  ('30000000-0000-4000-8000-000000000351', '10000000-0000-4000-8000-000000000351', 'NT_TH351', 'Sơn'),
  ('30000000-0000-4000-8000-000000000352', '10000000-0000-4000-8000-000000000352', 'NT_TC352', 'Phong');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000349', 'nt_worker349', 'Thợ thử 349');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000349', 'work.claim'), ('40000000-0000-4000-8000-000000000349', 'work.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000349', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000349'),
  ('30000000-0000-4000-8000-000000000350', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000349'),
  ('30000000-0000-4000-8000-000000000351', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000349'),
  ('30000000-0000-4000-8000-000000000352', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000349');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7f349000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_V3491', '99C-349.01'),
  ('7f349000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_V3492', '99C-349.02');
-- Tuấn and Hùng switched notifications on; Hùng has clocked in, Sơn not yet.
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f349000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000349', 'https://push.example.test/lead', repeat('a', 30), repeat('k', 10)),
  ('7f349000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-000000000350', 'https://push.example.test/hung', repeat('b', 30), repeat('k', 10));
insert into public.attendance_records(branch_id, employee_id, work_date, clock_in_at, source, created_by) values
  ('20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000350', (now() at time zone 'Asia/Ho_Chi_Minh')::date, now() - interval '1 hour',
   'WORKER', '10000000-0000-4000-8000-000000000350');
select set_config('request.jwt.claim.sub', '', true);
-- Current versions, read past RLS (what the screen would hold).
create function pg_temp.dv(target uuid) returns integer language sql security definer as $$ select version from public.deliveries where id = target $$;
create function pg_temp.wv(target uuid) returns integer language sql security definer as $$ select version from public.work_items where id = target $$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  sale constant uuid := '7f349000-0000-4000-8000-000000000012';
  line constant uuid := '7f349000-0000-4000-8000-000000000013';
  wh constant uuid := '7f349000-0000-4000-8000-000000000004';
  v1 constant uuid := '7f349000-0000-4000-8000-000000000020';
  v2 constant uuid := '7f349000-0000-4000-8000-000000000021';
  lead constant uuid := '30000000-0000-4000-8000-000000000349';
  hung constant uuid := '30000000-0000-4000-8000-000000000350';
  son constant uuid := '30000000-0000-4000-8000-000000000351';
  phong constant uuid := '30000000-0000-4000-8000-000000000352';
  lead_user constant uuid := '10000000-0000-4000-8000-000000000349';
  hung_user constant uuid := '10000000-0000-4000-8000-000000000350';
  son_user constant uuid := '10000000-0000-4000-8000-000000000351';
  office constant uuid := '10000000-0000-4000-8000-000000000001';
  day constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 2;
  nine constant timestamptz := (day + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  midnight constant timestamptz := ((now() at time zone 'Asia/Ho_Chi_Minh')::date + time '00:01') at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
  board jsonb;
  row jsonb;
  summary jsonb;
  labels jsonb;
  d1 uuid; d2 uuid; d4 uuid; d5 uuid; work5 uuid;
  num1 text; num2 text;
  work uuid;
  sj uuid; wi uuid; sj_number text;
  version_now integer;
  failed text;
  hint text;
  proposal_employee uuid; proposal_vehicle uuid;
begin
  perform pg_temp.act_as(office);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"SUGGEST"}', null, '7f349000-0000-4000-8000-0000000000c1');

  -- 0. A new, narrow permission: whoever manages roles holds it (to grant it); no template role carries it.
  assert (select name from public.permissions where code = 'work.field_dispatch') = 'Điều phối hiện trường (thợ chính)', 'permission named';
  assert not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
    where r.code like 'builtin_%' and rp.permission_code = 'work.field_dispatch'), 'not in any template role';

  -- 1. Without the grant: the lead is an ordinary worker; readers and anonymous callers are refused too.
  perform pg_temp.act_as(lead_user);
  failed := null;
  begin perform public.field_dispatch_board(branch); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'no board without the grant';
  failed := null;
  begin perform public.field_dispatch_summary(branch); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'no count without the grant';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.field_dispatch_board(branch); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'a reader has no board';
  perform pg_temp.act_as_admin();
  set local role anon;
  failed := null;
  begin perform public.field_assign_delivery(gen_random_uuid(), hung, v1, null, 1, gen_random_uuid()); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'anon cannot dispatch';
  reset role;

  -- 2. The office grants it under Nhân viên & quyền → Quyền riêng.
  perform pg_temp.act_as(office);
  perform public.set_employee_explicit_permissions(lead, branch, array['work.field_dispatch'], 'Thợ chính chi nhánh', '7f349000-0000-4000-8000-0000000000c2');
  perform public.set_employee_explicit_permissions(phong, branch, array['work.field_dispatch'], 'Thợ chính thứ hai', '7f349000-0000-4000-8000-0000000000c3');
  perform pg_temp.act_as(lead_user);
  assert (public.field_dispatch_summary(branch)->>'waiting')::integer = 0, 'nothing waits yet';

  -- 3. A delivery waits (suggestion mode): the lead is told once, to Điều phối, with a push; the workers as before.
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f349000-0000-4000-8000-0000000000b1');
  d1 := (result->>'delivery_id')::uuid;
  assert result->'dispatch'->>'status' = 'SUGGESTED', format('suggested %s', result->'dispatch');
  perform pg_temp.act_as_admin();
  num1 := (select delivery_number from public.deliveries where id = d1);
  select p.employee_id, p.vehicle_id into proposal_employee, proposal_vehicle from public.delivery_dispatch_proposals p where p.delivery_id = d1;
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*) from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = lead) = 1
    and exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = lead
      and link = '/work/dispatch' and required_permission = 'work.field_dispatch' and title = 'Việc chờ người: Nhà anh Bình 349'), 'lead told once, to Điều phối';
  assert exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = hung and link = '/work/pool'),
    'workers told as before';
  assert exists (select 1 from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.kind = 'delivery.pool_open' and n.entity_id = d1 and n.recipient_employee_id = lead and j.channel = 'PUSH' and j.rule_id is null
      and j.target = '7f349000-0000-4000-8000-0000000000f1' and j.dedupe_key like 'worker:%'), 'lead phone pushed without a rule';

  -- 4. The board: what to carry, every free worker + truck, the suggestion first; workers with their shift. No money.
  perform pg_temp.act_as(lead_user);
  board := public.field_dispatch_board(branch);
  select x into row from jsonb_array_elements(board->'waiting') x where x->>'id' = d1::text;
  assert row->>'kind' = 'DELIVERY' and row->'lines'->0->>'quantity' = '1000' and row->'lines'->0->>'unit' = 'kg', format('delivery row %s', row);
  assert not (row ? 'pairs') and jsonb_array_length(public.field_dispatch_options('DELIVERY', d1)->'pairs') = 8,
    'the sheet loads 4 workers x 2 trucks';
  assert (row->'suggestion'->>'start_at')::timestamptz = nine, format('suggested time %s', row->'suggestion');
  assert row->'suggestion'->>'from_proposal' = 'true' and row->'suggestion'->>'employee_id' = proposal_employee::text
    and row->'suggestion'->>'vehicle_id' = proposal_vehicle::text, format('the office suggestion %s', row->'suggestion');
  assert proposal_employee = hung and proposal_vehicle = v1, 'suggestion: Hùng with truck 1';
  assert jsonb_array_length(board->'workers') = 4 and board->>'me' = lead::text, format('workers %s', board->'workers');
  assert (select x ? 'clocked_in_at' from jsonb_array_elements(board->'workers') x where x->>'id' = hung::text), 'Hùng on shift';
  assert (select not (x ? 'clocked_in_at') from jsonb_array_elements(board->'workers') x where x->>'id' = son::text), 'Sơn not clocked in';
  assert board::text !~* '(price|_vnd|amount|credit|debt)', 'no money on the board';
  assert (public.field_dispatch_summary(branch)->>'waiting')::integer = 1, 'one waiting';
  version_now := (row->>'version')::integer;

  -- 5. An ordinary worker cannot dispatch; a stale screen is refused.
  perform pg_temp.act_as(hung_user);
  failed := null;
  begin perform public.field_assign_delivery(d1, son, v1, null, version_now, '7f349000-0000-4000-8000-0000000000d0'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('ordinary worker refused, got %s', failed);
  failed := null;
  begin perform public.field_dispatch_board(branch); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'ordinary worker has no board';
  perform pg_temp.act_as(lead_user);
  failed := null;
  begin perform public.field_assign_delivery(d1, hung, v1, null, version_now - 1, '7f349000-0000-4000-8000-0000000000d1'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_stale', format('stale refused, got %s', failed);

  -- 6. One tap = the suggestion: Hùng gets it with truck 1 at the suggested time and his "Việc mới"; the office is told and it is audited.
  result := public.field_assign_delivery(d1, hung, v1, null, version_now, '7f349000-0000-4000-8000-0000000000d2');
  work := (result->>'work_item_id')::uuid;
  assert (result->>'start_at')::timestamptz = nine, format('suggested time %s', result);
  assert public.field_assign_delivery(d1, hung, v1, null, version_now, '7f349000-0000-4000-8000-0000000000d2')->>'work_item_id' = work::text, 'replay';
  perform pg_temp.act_as_admin();
  assert (select a.employee_id = hung and a.vehicle_id = v1 and a.assigned_by = lead_user from public.delivery_assignments a
    where a.delivery_id = d1 and a.superseded_at is null) and (select execution_state from public.deliveries where id = d1) = 'ASSIGNED', 'Hùng with truck 1, by the lead';
  assert (select wa.employee_id from public.work_item_assignments wa where wa.work_item_id = work and wa.superseded_at is null) = hung, 'his job';
  assert not exists (select 1 from public.delivery_dispatch_proposals where delivery_id = d1), 'suggestion used up';
  assert exists (select 1 from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.kind = 'work.assigned' and n.entity_id = work and n.recipient_employee_id = hung and j.target = '7f349000-0000-4000-8000-0000000000f2'),
    'Hùng gets "Việc mới" on his phone';
  assert exists (select 1 from public.audit_events where entity_id = d1 and action = 'delivery.field_assigned' and actor_auth_user_id = lead_user
    and reason like 'Thợ chính giao: NT_V3491 / Hùng — 09:00%'), 'audited';
  assert exists (select 1 from public.notifications where kind = 'delivery.field_assigned' and entity_id = d1 and recipient_employee_id is null
    and required_permission = 'delivery.assign' and title = 'Tuấn đã giao ' || num1 || ' cho Hùng'), 'office told "Tuấn đã giao … cho Hùng"';

  -- 7. First tap wins: a second tap, a worker in "Nhận việc" and the office's suggestion all find it taken.
  perform pg_temp.act_as(lead_user);
  failed := null;
  begin perform public.field_assign_delivery(d1, son, v2, null, version_now, '7f349000-0000-4000-8000-0000000000d3'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_taken', format('second tap refused, got %s', failed);
  perform pg_temp.act_as(son_user);
  failed := null;
  begin perform public.claim_delivery(d1, v2, version_now, '7f349000-0000-4000-8000-0000000000d4'); exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_not_claimable', format('worker refused, got %s', failed);
  perform pg_temp.act_as(hung_user);
  assert public.work_item_field_dispatcher(work)->>'name' = 'Tuấn', 'job page: Người giao việc = Tuấn';

  -- 8. Hùng declines: the lead is told (push), the delivery waits again and Hùng cannot be chosen for it.
  select w.version into version_now from public.work_items w where w.id = work;
  perform pg_temp.act_as_admin();
  insert into public.automation_rules(id, branch_id, name, event, channel, target, created_by)
  values ('7f349000-0000-4000-8000-0000000000aa', branch, 'Báo nhóm khi thợ từ chối', 'work.declined', 'TELEGRAM', '-100349349', office);
  perform pg_temp.act_as(hung_user);
  perform public.decline_portal_work_item(work, 'Ngõ hẹp, xe không vào được', version_now, '7f349000-0000-4000-8000-0000000000d5');
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.outbound_jobs where rule_id = '7f349000-0000-4000-8000-0000000000aa' and channel = 'TELEGRAM') = 1,
    'the office Telegram rule fires once per refusal, whatever the number of leads';
  assert exists (select 1 from public.notifications where kind = 'work.field_declined' and entity_id = d1 and recipient_employee_id = lead
    and link = '/work/dispatch' and title = 'Hùng từ chối ' || num1 and body = 'Ngõ hẹp, xe không vào được · Phiếu đang chờ người khác'), 'lead told of the refusal';
  assert not exists (select 1 from public.notifications where kind = 'work.declined' and recipient_employee_id is not null), 'work.declined stays the office''s';
  assert exists (select 1 from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.kind = 'work.field_declined' and n.entity_id = d1 and n.recipient_employee_id = lead and j.target = '7f349000-0000-4000-8000-0000000000f1'), 'pushed';
  assert exists (select 1 from public.notifications where kind = 'work.declined' and entity_id = d1 and recipient_employee_id is null), 'office still told';
  set constraints all immediate;
  set constraints all deferred;
  -- Waiting again: each lead got the refusal only (no second "Việc chờ người" push); the other workers are told as in D80.
  assert (select count(*) from public.notifications where entity_id = d1 and recipient_employee_id in (lead, phong)
    and dedupe_key like 'delivery.pool_open:%:' || pg_temp.dv(d1)) = 2
    and not exists (select 1 from public.notifications where entity_id = d1 and recipient_employee_id in (lead, phong)
      and kind = 'delivery.pool_open' and dedupe_key like 'delivery.pool_open:%:' || pg_temp.dv(d1)), 'one message per lead for the refusal';
  assert (select count(*) from public.outbound_jobs j join public.notifications n on n.id = j.notification_id
    where n.entity_id = d1 and n.recipient_employee_id = lead and n.dedupe_key like 'delivery.pool_open:%:' || pg_temp.dv(d1)) = 1, 'one push for the lead';
  assert exists (select 1 from public.notifications where kind = 'delivery.pool_open' and entity_id = d1 and recipient_employee_id = son
    and link = '/work/pool' and dedupe_key like '%:' || pg_temp.dv(d1)), 'workers told it waits again';
  perform pg_temp.act_as(lead_user);
  summary := public.field_dispatch_summary(branch);
  assert (summary->>'waiting')::integer = 1 and (summary->>'declined')::integer = 1, format('summary %s', summary);
  select x into row from jsonb_array_elements(public.field_dispatch_board(branch)->'waiting') x where x->>'id' = d1::text;
  assert row->'declined'->0->>'name' = 'Hùng' and row->'declined'->0->>'reason' = 'Ngõ hẹp, xe không vào được', format('declined %s', row->'declined');
  assert not (row ? 'suggestion'), 'the office suggestion was used up: no one-tap suggestion';
  assert not exists (select 1 from jsonb_array_elements(public.field_dispatch_options('DELIVERY', d1)->'pairs') p where p->>'employee_id' = hung::text), 'no pair for Hùng';
  version_now := (row->>'version')::integer;
  failed := null;
  begin perform public.field_assign_delivery(d1, hung, v1, null, version_now, '7f349000-0000-4000-8000-0000000000d6'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_worker_declined', format('declined worker blocked, got %s', failed);

  -- 9. A picked time: checked again for the worker and the truck. Sơn (not clocked in yet) may be given jobs.
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '500')), nine, null,
    '7f349000-0000-4000-8000-0000000000b2');
  d2 := (result->>'delivery_id')::uuid;
  num2 := (select delivery_number from public.deliveries where id = d2);
  perform pg_temp.act_as(lead_user);
  result := public.field_assign_delivery(d2, son, v2, nine + interval '1 hour', pg_temp.dv(d2), '7f349000-0000-4000-8000-0000000000d7');
  assert (result->>'start_at')::timestamptz = nine + interval '1 hour' and (result->>'end_at')::timestamptz = nine + interval '2 hours', format('picked 10:00 %s', result);
  failed := null; hint := null;
  begin perform public.field_assign_delivery(d1, son, v1, nine + interval '90 minutes', version_now, '7f349000-0000-4000-8000-0000000000d8');
  exception when others then get stacked diagnostics failed = message_text, hint = pg_exception_hint; end;
  assert failed = 'field_dispatch_busy' and hint = 'next_free_at=' || to_char((nine + interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    format('Sơn busy at 10:30, free 11:00: %s / %s', failed, hint);
  failed := null;
  begin perform public.field_assign_delivery(d1, lead, v2, nine + interval '1 hour', version_now, '7f349000-0000-4000-8000-0000000000d9');
  exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_busy', format('truck 2 busy at 10:00, got %s', failed);
  failed := null;
  begin perform public.field_assign_delivery(d1, son, v1, nine + interval '20 days', version_now, '7f349000-0000-4000-8000-0000000000da');
  exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_time_out_of_range', format('far time refused, got %s', failed);
  result := public.field_assign_delivery(d1, son, v1, nine + interval '4 hours', version_now, '7f349000-0000-4000-8000-0000000000db');
  assert (result->>'start_at')::timestamptz = nine + interval '4 hours', 'Sơn at 13:00, not clocked in';

  -- 10. Change the person before loading: the job moves to the lead himself; the office sees it.
  version_now := pg_temp.dv(d1);
  result := public.field_dispatch_options('DELIVERY', d1);
  assert jsonb_array_length(result->'pairs') = 6 and result->'declined'->0->>'name' = 'Hùng'
    and not exists (select 1 from jsonb_array_elements(result->'pairs') p where p->>'employee_id' = hung::text), format('change options %s', result);
  failed := null;
  begin perform public.field_reassign_delivery(d1, son, v2, null, version_now, '7f349000-0000-4000-8000-0000000000dc'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_same_worker', format('same worker refused, got %s', failed);
  failed := null;
  begin perform public.field_reassign_delivery(d1, hung, v1, null, version_now, '7f349000-0000-4000-8000-0000000000dd'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_worker_declined', format('declined worker blocked on change too, got %s', failed);
  result := public.field_reassign_delivery(d1, lead, v1, null, version_now, '7f349000-0000-4000-8000-0000000000de');
  assert (result->>'work_item_id')::uuid = work and (result->>'start_at')::timestamptz = nine + interval '4 hours', format('moved to the lead %s', result);
  perform pg_temp.act_as_admin();
  assert (select wa.employee_id from public.work_item_assignments wa where wa.work_item_id = work and wa.superseded_at is null) = lead, 'the same job, now his';
  assert exists (select 1 from public.audit_events where entity_id = d1 and action = 'delivery.field_reassigned' and actor_auth_user_id = lead_user
    and reason like 'Thợ chính giao: NT_V3491 / Tuấn — 13:00% (trước đó: Sơn)'), 'change audited';
  assert exists (select 1 from public.notifications where kind = 'delivery.field_assigned' and entity_id = d1
    and title = 'Tuấn đã đổi người ' || num1 || ': Sơn → Tuấn'), 'office told of the change';
  assert not exists (select 1 from public.notifications n where n.kind = 'work.assigned' and n.entity_id = work and n.recipient_employee_id = lead),
    'no "Việc mới" for taking it himself';
  perform pg_temp.act_as(son_user);
  assert not exists (select 1 from jsonb_array_elements(public.worker_portal_snapshot()->'jobs') x where x->>'id' = work::text), 'Sơn no longer sees it';
  perform pg_temp.act_as(office);
  labels := public.field_dispatch_labels(branch, day);
  assert labels->>d1::text = 'Tuấn đổi người: Sơn → Tuấn' and labels->>d2::text = 'Thợ chính Tuấn giao', format('board labels %s', labels);
  -- The office can still change worker / truck; the label goes with the lead's assignment.
  perform public.assign_delivery_scheduled(d2, hung, v2, null, null, pg_temp.dv(d2),
    '7f349000-0000-4000-8000-0000000000df', nine + interval '1 hour', nine + interval '2 hours');
  assert not (public.field_dispatch_labels(branch, day) ? d2::text), 'office change: no lead label';

  -- 11. Locked once the goods are on the truck.
  perform pg_temp.act_as_admin();
  update public.work_items set execution_state = 'IN_PROGRESS', started_at = now(), version = version + 1 where id = work;
  update public.deliveries set execution_state = 'DISPATCHED', version = version + 1 where id = d1;
  perform pg_temp.act_as(lead_user);
  failed := null;
  begin perform public.field_reassign_delivery(d1, son, v1, null, pg_temp.dv(d1), '7f349000-0000-4000-8000-0000000000e0');
  exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_locked', format('locked after loading, got %s', failed);

  -- 12. A service job waiting in the pool: the lead is told; he gives it (DIRECT → "Việc mới"), changes the person, then it starts.
  perform pg_temp.act_as(office);
  sj := public.create_service_job(branch, '7f349000-0000-4000-8000-000000000010', '7f349000-0000-4000-8000-000000000011', 'Bốc hàng lên tầng 3',
    '120 bao xi măng, cầu thang bộ', nine + interval '4 hours', nine + interval '6 hours', 120, 'bao', null, null, null, '7f349000-0000-4000-8000-0000000000e1');
  wi := public.publish_work_item(branch, 'SERVICE_JOB', sj, 'POOL_CLAIM', null, '7f349000-0000-4000-8000-0000000000e2');
  sj_number := (select job_number from public.service_jobs where id = sj);
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert exists (select 1 from public.notifications n join public.outbound_jobs j on j.notification_id = n.id
    where n.kind = 'work.pool_open' and n.entity_id = wi and n.recipient_employee_id = lead and n.link = '/work/dispatch'
      and n.title = 'Việc chờ người: Bốc hàng lên tầng 3 · Nhà anh Bình 349' and j.target = '7f349000-0000-4000-8000-0000000000f1'), 'lead told, pushed';
  perform pg_temp.act_as(lead_user);
  board := public.field_dispatch_board(branch);
  select x into row from jsonb_array_elements(board->'waiting') x where x->>'id' = wi::text;
  assert row->>'kind' = 'SERVICE_JOB' and row->>'title' = 'Bốc hàng lên tầng 3' and row->>'number' = sj_number
    and not (row ? 'candidates') and jsonb_array_length(public.field_dispatch_options('SERVICE_JOB', wi)->'candidates') = 4, format('service row %s', row);
  assert (select (c->>'start_at')::timestamptz from jsonb_array_elements(public.field_dispatch_options('SERVICE_JOB', wi)->'candidates') c
    where c->>'employee_id' = lead::text) = nine + interval '5 hours',
    'the lead is free only after his delivery';
  assert board::text !~* '(price|_vnd|amount)', 'no service price';
  result := public.field_assign_work_item(wi, hung, null, (row->>'version')::integer, '7f349000-0000-4000-8000-0000000000e3');
  assert (result->>'start_at')::timestamptz = nine + interval '4 hours', format('Hùng at 13:00 %s', result);
  failed := null;
  begin perform public.field_assign_work_item(wi, son, null, (row->>'version')::integer, '7f349000-0000-4000-8000-0000000000e4'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_taken', format('first tap wins on services, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select a.employee_id = hung and a.assignment_kind = 'DIRECT' and a.assigned_by = lead_user from public.work_item_assignments a
    where a.work_item_id = wi and a.superseded_at is null), 'a direct assignment';
  assert exists (select 1 from public.notifications where kind = 'work.assigned' and entity_id = wi and recipient_employee_id = hung), 'Việc mới for Hùng';
  assert exists (select 1 from public.audit_events where entity_id = sj and action = 'service_job.field_assigned' and actor_auth_user_id = lead_user), 'audited';
  assert exists (select 1 from public.notifications where kind = 'work.field_assigned' and entity_id = sj and required_permission = 'work.manage'
    and title = 'Tuấn đã giao ' || sj_number || ' cho Hùng'), 'office told';
  perform pg_temp.act_as(lead_user);
  failed := null; hint := null;
  begin perform public.field_reassign_work_item(wi, lead, nine + interval '4 hours', pg_temp.wv(wi), '7f349000-0000-4000-8000-0000000000e5');
  exception when others then get stacked diagnostics failed = message_text, hint = pg_exception_hint; end;
  assert failed = 'field_dispatch_busy' and hint like 'next_free_at=%', format('lead busy at 13:00 with his delivery: %s %s', failed, hint);
  assert jsonb_array_length(public.field_dispatch_options('SERVICE_JOB', wi)->'candidates') = 4, 'service change options';
  perform pg_temp.act_as(hung_user);
  failed := null;
  begin perform public.field_dispatch_options('SERVICE_JOB', wi); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'ordinary worker has no options';
  perform pg_temp.act_as(lead_user);
  result := public.field_reassign_work_item(wi, son, null, pg_temp.wv(wi), '7f349000-0000-4000-8000-0000000000e6');
  perform pg_temp.act_as_admin();
  assert (select a.employee_id from public.work_item_assignments a where a.work_item_id = wi and a.superseded_at is null) = son, 'moved to Sơn';
  assert exists (select 1 from public.audit_events where entity_id = sj and action = 'service_job.field_reassigned' and reason like '%(trước đó: Hùng)'), 'change audited';
  perform pg_temp.act_as(son_user);
  perform public.start_work_item(wi, pg_temp.wv(wi), '7f349000-0000-4000-8000-0000000000e7');
  perform pg_temp.act_as(lead_user);
  failed := null;
  begin perform public.field_reassign_work_item(wi, hung, null, pg_temp.wv(wi), '7f349000-0000-4000-8000-0000000000e8');
  exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_locked', format('locked once started, got %s', failed);

  -- 12b. A service job not published to the pool (DIRECT, nobody on it) stays the office's.
  perform pg_temp.act_as(office);
  sj := public.create_service_job(branch, '7f349000-0000-4000-8000-000000000010', '7f349000-0000-4000-8000-000000000011', 'Vận chuyển',
    'Chở đồ cho khách', nine + interval '7 hours', nine + interval '8 hours', 1, 'chuyến', null, null, null, '7f349000-0000-4000-8000-0000000000eb');
  wi := public.publish_work_item(branch, 'SERVICE_JOB', sj, 'POOL_CLAIM', null, '7f349000-0000-4000-8000-0000000000ec');
  perform pg_temp.act_as_admin();
  update public.work_items set assignment_mode = 'DIRECT' where id = wi;
  perform pg_temp.act_as(lead_user);
  assert not exists (select 1 from jsonb_array_elements(public.field_dispatch_board(branch)->'waiting') x where x->>'id' = wi::text), 'DIRECT job not listed';
  failed := null;
  begin perform public.field_assign_work_item(wi, hung, null, pg_temp.wv(wi), '7f349000-0000-4000-8000-0000000000ed'); exception when others then failed := sqlerrm; end;
  assert failed = 'field_dispatch_not_open', format('DIRECT job refused, got %s', failed);

  -- 13. "Đã giao hôm nay": today's jobs by worker, a short delivery marked with the receiver's phone to call.
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '300')), nine, null,
    '7f349000-0000-4000-8000-0000000000b4');
  d4 := (result->>'delivery_id')::uuid;
  perform public.assign_delivery_scheduled(d4, hung, v1, null, null, pg_temp.dv(d4),
    '7f349000-0000-4000-8000-0000000000e9', midnight, midnight + interval '1 hour');
  perform pg_temp.act_as(lead_user);
  select x into row from jsonb_array_elements(public.field_dispatch_board(branch)->'given') x where x->>'id' = d4::text;
  assert row->>'employee_id' = hung::text and (row->>'can_change')::boolean and row->>'state' = 'ASSIGNED' and not (row ? 'field'), format('today row %s', row);
  perform pg_temp.act_as_admin();
  update public.deliveries set execution_state = 'RESULT_SUBMITTED', result_kind = 'PARTIAL', version = version + 1 where id = d4;
  perform pg_temp.act_as(lead_user);
  select x into row from jsonb_array_elements(public.field_dispatch_board(branch)->'given') x where x->>'id' = d4::text;
  assert row->>'result_kind' = 'PARTIAL' and row->>'receiver_phone' = '0901349000' and not (row->>'can_change')::boolean
    and row->>'shortfall' = 'Xi măng 349 0/300 kg', format('short row %s', row);
  summary := public.field_dispatch_summary(branch);
  assert (summary->>'short')::integer = 1 and (summary->>'given')::integer >= 1, format('summary %s', summary);

  -- 13b. A refusal of a delivery that does not come back to the leads' board (dispatch mode Tắt): the office handles it, and the
  --      lead's notice says so, without a link to Điều phối where it would not appear.
  perform pg_temp.act_as(office);
  result := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '200')), nine, null,
    '7f349000-0000-4000-8000-0000000000f5');
  d5 := (result->>'delivery_id')::uuid;
  perform public.assign_delivery_scheduled(d5, hung, v2, null, null, pg_temp.dv(d5), '7f349000-0000-4000-8000-0000000000f6',
    nine + interval '8 hours', nine + interval '9 hours');
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', 1, '7f349000-0000-4000-8000-0000000000f7');
  perform pg_temp.act_as_admin();
  work5 := (select id from public.work_items where delivery_id = d5);
  perform pg_temp.act_as(hung_user);
  perform public.decline_portal_work_item(work5, 'Xe hỏng', pg_temp.wv(work5), '7f349000-0000-4000-8000-0000000000f8');
  perform pg_temp.act_as_admin();
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*) from public.notifications where entity_id = d5 and recipient_employee_id = lead) = 1
    and exists (select 1 from public.notifications where entity_id = d5 and recipient_employee_id = lead and kind = 'work.field_declined'
      and body = 'Xe hỏng · Văn phòng xử lý phiếu này' and link is null), 'not on the board: the office handles it, no link';
  perform pg_temp.act_as(lead_user);
  assert not exists (select 1 from jsonb_array_elements(public.field_dispatch_board(branch)->'waiting') x where x->>'id' = d5::text), 'indeed not on the board';

  -- 14. Taking the grant back closes the tab at once.
  perform pg_temp.act_as(office);
  perform public.set_employee_explicit_permissions(lead, branch, array[]::text[], 'Thu hồi thợ chính', '7f349000-0000-4000-8000-0000000000ea');
  perform pg_temp.act_as(lead_user);
  failed := null;
  begin perform public.field_dispatch_board(branch); exception when insufficient_privilege then failed := 'denied'; end;
  assert failed = 'denied', 'revoked at once';
end
$test$;
