-- D93: notification rules. Recipients by role / by person never reach anyone without the notification's permission (nor
-- someone else's personal notification); a rule sends to several channels; built-in pushes can be turned off (the in-app
-- notification stays); quiet hours hold pushes and send one combined push per device when they end, except the chosen
-- classes; Telegram and Email are gone; "Gửi thử" reaches only the caller's own devices; every notification kind can get a
-- push rule ("+ Báo về điện thoại"); customers are pushed their own order / delivery / money news, money only to "Chủ tài
-- khoản" and "Kế toán", never another customer's. pg_net and Vault are stubbed as in 215 / 352.
create schema if not exists net;
create table net._http_response(id bigint primary key, status_code integer, error_msg text, content text, created timestamptz not null default now());
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz not null default now());
insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_app_url', 'https://app.example.test/'), ('hx_automation_secret', 'k1');

-- People of branch A: 1 = Owner (all permissions), 3 = reader (orders.read), 4 = sales (orders.confirm), 5 = store (inventory.read).
-- Customers: K1 with "Chủ tài khoản" (6) and "Người nhận hàng" (7); K2 with its own owner (8).
insert into auth.users(id) values
  ('7f356000-0000-4000-8000-0000000000a4'), ('7f356000-0000-4000-8000-0000000000a5'), ('7f356000-0000-4000-8000-0000000000a6'),
  ('7f356000-0000-4000-8000-0000000000a7'), ('7f356000-0000-4000-8000-0000000000a8');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('7f356000-0000-4000-8000-0000000000e4', '7f356000-0000-4000-8000-0000000000a4', 'NT_E356S', 'Bán hàng 356'),
  ('7f356000-0000-4000-8000-0000000000e5', '7f356000-0000-4000-8000-0000000000a5', 'NT_E356K', 'Kho 356');
insert into public.roles(id, code, name) values
  ('7f356000-0000-4000-8000-0000000000c4', 'nt_sales356', 'Bán hàng thử 356'),
  ('7f356000-0000-4000-8000-0000000000c5', 'nt_store356', 'Kho thử 356');
insert into public.role_permissions(role_id, permission_code) values
  ('7f356000-0000-4000-8000-0000000000c4', 'orders.confirm'), ('7f356000-0000-4000-8000-0000000000c4', 'orders.read'),
  ('7f356000-0000-4000-8000-0000000000c5', 'inventory.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('7f356000-0000-4000-8000-0000000000e4', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-0000000000c4'),
  ('7f356000-0000-4000-8000-0000000000e5', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-0000000000c5');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f356000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT_K356A', 'Khách 356 A', 'BUSINESS'),
  ('7f356000-0000-4000-8000-000000000042', '20000000-0000-4000-8000-00000000000a', 'NT_K356B', 'Khách 356 B', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f356000-0000-4000-8000-0000000000a6', '7f356000-0000-4000-8000-000000000041', 'OWNER'),
  ('7f356000-0000-4000-8000-0000000000a7', '7f356000-0000-4000-8000-000000000041', 'RECEIVER'),
  ('7f356000-0000-4000-8000-0000000000a8', '7f356000-0000-4000-8000-000000000042', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f356000-0000-4000-8000-000000000051', '7f356000-0000-4000-8000-000000000041', 'CT356', 'Công trình 356', 'Thủ Đức'),
  ('7f356000-0000-4000-8000-000000000052', '7f356000-0000-4000-8000-000000000042', 'CT357', 'Công trình 357', 'Quận 9');
-- One device each (d1 … d8 by login).
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f356000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001', 'https://push.example.test/356-1', repeat('p', 40), repeat('a', 16)),
  ('7f356000-0000-4000-8000-0000000000d3', '10000000-0000-4000-8000-000000000003', 'https://push.example.test/356-3', repeat('p', 40), repeat('a', 16)),
  ('7f356000-0000-4000-8000-0000000000d4', '7f356000-0000-4000-8000-0000000000a4', 'https://push.example.test/356-4', repeat('p', 40), repeat('a', 16)),
  ('7f356000-0000-4000-8000-0000000000d5', '7f356000-0000-4000-8000-0000000000a5', 'https://push.example.test/356-5', repeat('p', 40), repeat('a', 16)),
  ('7f356000-0000-4000-8000-0000000000d6', '7f356000-0000-4000-8000-0000000000a6', 'https://push.example.test/356-6', repeat('p', 40), repeat('a', 16)),
  ('7f356000-0000-4000-8000-0000000000d7', '7f356000-0000-4000-8000-0000000000a7', 'https://push.example.test/356-7', repeat('p', 40), repeat('a', 16)),
  ('7f356000-0000-4000-8000-0000000000d8', '7f356000-0000-4000-8000-0000000000a8', 'https://push.example.test/356-8', repeat('p', 40), repeat('a', 16));

-- Customer documents (fixtures only; the state changes below go through the triggers).
set local session_replication_role = replica;
insert into public.vehicles(id, branch_id, code, plate_number) values ('7f356000-0000-4000-8000-000000000060', '20000000-0000-4000-8000-00000000000a', 'XE356', '51C-356.01');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, order_channel, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by) values
  ('7f356000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-00000000000a', 'SO-356-01', '7f356000-0000-4000-8000-000000000041',
   '7f356000-0000-4000-8000-000000000051', 'DRAFT', 'INTERNAL', 'Khách 356 A', 'Công trình 356', 'Thủ Đức', '10000000-0000-4000-8000-000000000001'),
  ('7f356000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', 'SO-356-02', '7f356000-0000-4000-8000-000000000041',
   '7f356000-0000-4000-8000-000000000051', 'CONFIRMED', 'INTERNAL', 'Khách 356 A', 'Công trình 356', 'Thủ Đức', '10000000-0000-4000-8000-000000000001'),
  ('7f356000-0000-4000-8000-000000000103', '20000000-0000-4000-8000-00000000000a', 'SO-356-03', '7f356000-0000-4000-8000-000000000041',
   '7f356000-0000-4000-8000-000000000051', 'DRAFT', 'CUSTOMER_PORTAL', 'Khách 356 A', 'Công trình 356', 'Thủ Đức', '7f356000-0000-4000-8000-0000000000a6');
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, execution_state, customer_id, site_id, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, scheduled_at, created_by) values
  ('7f356000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-000000000101', 'DLV-35601', 'ASSIGNED',
   '7f356000-0000-4000-8000-000000000041', '7f356000-0000-4000-8000-000000000051', 'Khách 356 A', 'Công trình 356', 'Thủ Đức',
   '2026-11-17 01:30:00+00', '10000000-0000-4000-8000-000000000001'),
  ('7f356000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-000000000101', 'DLV-35602', 'RESULT_SUBMITTED',
   '7f356000-0000-4000-8000-000000000041', '7f356000-0000-4000-8000-000000000051', 'Khách 356 A', 'Công trình 356', 'Thủ Đức', null,
   '10000000-0000-4000-8000-000000000001'),
  ('7f356000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-000000000101', 'DLV-35603', 'RESULT_SUBMITTED',
   '7f356000-0000-4000-8000-000000000041', '7f356000-0000-4000-8000-000000000051', 'Khách 356 A', 'Công trình 356', 'Thủ Đức', null,
   '10000000-0000-4000-8000-000000000001');
insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id, assigned_by) values
  ('7f356000-0000-4000-8000-000000000201', 1, '30000000-0000-4000-8000-000000000001', '7f356000-0000-4000-8000-000000000060', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_results(delivery_id, result_kind, missing_arrival_reason, submitted_by) values
  ('7f356000-0000-4000-8000-000000000202', 'PARTIAL', 'Thiếu 5 bao, xe không vào được hẻm', '10000000-0000-4000-8000-000000000001'),
  ('7f356000-0000-4000-8000-000000000203', 'FULL', null, '10000000-0000-4000-8000-000000000001');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f356000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', 'NT_TM356', 'Tiền mặt 356', 'CASH', '10000000-0000-4000-8000-000000000001');
insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id) values
  ('7f356000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-000000000041', 5000000,
   (now() at time zone 'Asia/Ho_Chi_Minh')::date, '10000000-0000-4000-8000-000000000001', gen_random_uuid()),
  ('7f356000-0000-4000-8000-000000000072', '20000000-0000-4000-8000-00000000000a', '7f356000-0000-4000-8000-000000000042', 9000000,
   (now() at time zone 'Asia/Ho_Chi_Minh')::date + 30, '10000000-0000-4000-8000-000000000001', gen_random_uuid());
set local session_replication_role = origin;

create function pg_temp.commit_point() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;
create function pg_temp.devices(dedupe_like text) returns text[] language sql as $$
  select coalesce(array_agg(right(target, 2) order by target), '{}') from public.outbound_jobs where dedupe_key like dedupe_like
$$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner constant uuid := '10000000-0000-4000-8000-000000000001';
  reader constant uuid := '10000000-0000-4000-8000-000000000003';
  roles_rule uuid;
  people_rule uuid;
  personal_rule uuid;
  phone_rule uuid;
  note uuid;
  failed boolean;
  version_now integer;
  local_minute integer;
  held_until timestamptz;
  job public.outbound_jobs%rowtype;
  made integer;
  overview jsonb;
begin
  -- 1. Recipients by role: only the chosen roles, and among them only who holds the permission (store has no orders.confirm).
  --    The same rule also sends to a webhook (several channels at once).
  perform pg_temp.act_as(owner);
  roles_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Đơn khách mới → bán hàng', 'event', 'order.portal_submitted',
    'channels', jsonb_build_array('WEBHOOK', 'PUSH'), 'target', 'https://hooks.example.test/356', 'recipient_mode', 'ROLES',
    'role_ids', jsonb_build_array('7f356000-0000-4000-8000-0000000000c4', '7f356000-0000-4000-8000-0000000000c5')), null, gen_random_uuid());
  assert (select channels = array['PUSH', 'WEBHOOK'] and channel = 'PUSH' and recipient_mode = 'ROLES' from public.automation_rules where id = roles_rule),
    'channels kept in a fixed order';
  assert (select count(*) from public.automation_rule_recipients where rule_id = roles_rule) = 2, 'two roles stored';
  -- Recipients by person: the Owner and the store keeper; the store keeper may not see new orders.
  people_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Khách hủy đơn → hai người', 'event', 'order.portal_cancelled',
    'channels', jsonb_build_array('PUSH'), 'recipient_mode', 'PEOPLE',
    'employee_ids', jsonb_build_array('30000000-0000-4000-8000-000000000003', '7f356000-0000-4000-8000-0000000000e5')), null, gen_random_uuid());
  -- A personal notification never reaches the other chosen people.
  personal_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Phiếu tách → hai người', 'event', 'work.delivery_split',
    'channels', jsonb_build_array('PUSH'), 'recipient_mode', 'PEOPLE',
    'employee_ids', jsonb_build_array('30000000-0000-4000-8000-000000000003', '7f356000-0000-4000-8000-0000000000e4')), null, gen_random_uuid());

  perform pg_temp.act_as_admin();
  note := private.notify(branch, 'order.portal_submitted', 'sales_order', gen_random_uuid(), 'Đơn mới từ khách: Anh Tuấn', null, '/admin/orders', 'orders.confirm', null, 'nt356:o1');
  assert pg_temp.devices('rule:' || roles_rule || ':' || note || ':%') = array['d4'], 'role rule: only sales (store lacks the permission, Owner not chosen)';
  assert (select count(*) from public.outbound_jobs where rule_id = roles_rule and notification_id = note and channel = 'WEBHOOK'
    and target = 'https://hooks.example.test/356' and state = 'SENDING') = 1, 'and the webhook of the same rule';
  note := private.notify(branch, 'order.portal_cancelled', 'sales_order', gen_random_uuid(), 'Khách hủy đơn SO-1', null, '/admin/orders', 'orders.read', null, 'nt356:c1');
  assert pg_temp.devices('rule:' || people_rule || ':' || note || ':%') = array['d3'], 'person rule: the reader yes, the store keeper (no orders.read) no';
  note := private.notify(branch, 'work.delivery_split', 'delivery', gen_random_uuid(), 'Phiếu DLV-1 đã được tách', null, '/work', 'orders.read',
    '30000000-0000-4000-8000-000000000003', 'nt356:s1');
  assert pg_temp.devices('rule:' || personal_rule || ':' || note || ':%') = array['d3'], 'personal notification: its recipient only';

  -- Invalid recipients are refused: no role, an employee of another branch.
  perform pg_temp.act_as(owner);
  foreach overview in array array[
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channels', jsonb_build_array('PUSH'), 'recipient_mode', 'ROLES', 'role_ids', '[]'::jsonb),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channels', jsonb_build_array('PUSH'), 'recipient_mode', 'PEOPLE',
      'employee_ids', jsonb_build_array('30000000-0000-4000-8000-000000000002')),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channels', '[]'::jsonb),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channels', jsonb_build_array('PUSH', 'SMS')),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channels', jsonb_build_array('PUSH', 'WEBHOOK')),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channel', 'TELEGRAM', 'target', '-1001234567'),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channels', jsonb_build_array('EMAIL'), 'target', 'boss@example.test')] loop
    failed := false;
    begin perform public.save_automation_rule(null, branch, overview, null, gen_random_uuid()); exception when invalid_parameter_value then failed := true; end;
    assert failed, format('refused %s', overview);
  end loop;

  -- 2. Telegram and Email are gone from rules and from the queue; an older writer naming one channel still works.
  perform pg_temp.act_as_admin();
  failed := false;
  begin insert into public.automation_rules(branch_id, name, event, channel, target) values (branch, 'Telegram cũ', 'work.declined', 'TELEGRAM', '-100356');
  exception when check_violation then failed := true; end;
  assert failed, 'no TELEGRAM rule';
  failed := false;
  begin insert into public.outbound_jobs(branch_id, channel, target, payload, dedupe_key) values (branch, 'EMAIL', 'a@b.vn', '{}', 'nt356:email');
  exception when check_violation then failed := true; end;
  assert failed, 'no EMAIL job';
  insert into public.automation_rules(branch_id, name, event, channel) values (branch, 'Kiểu cũ một kênh', 'purchase.draft_ready', 'PUSH') returning id into phone_rule;
  assert (select channels = array['PUSH'] and recipient_mode = 'PERMISSION' from public.automation_rules where id = phone_rule), 'one channel becomes the list';
  update public.automation_rules set channels = array['PUSH', 'WEBHOOK'], target = 'https://hooks.example.test/x' where id = phone_rule;
  assert (select channel = 'PUSH' from public.automation_rules where id = phone_rule), 'channel follows channels';
  delete from public.automation_rules where id = phone_rule;

  -- 3. "+ Báo về điện thoại" on a kind that was only in the app (and one that could not drive a rule before).
  perform pg_temp.act_as(owner);
  phone_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Nợ quá hạn → báo điện thoại', 'event', 'finance.overdue_digest',
    'channels', jsonb_build_array('PUSH'), 'recipient_mode', 'PERMISSION', 'active', true), null, gen_random_uuid());
  perform public.save_automation_rule(null, branch, jsonb_build_object('name', 'Chuyển khoản cần xem → báo điện thoại', 'event', 'payment.bank_needs_review',
    'channels', jsonb_build_array('PUSH')), null, gen_random_uuid());
  perform pg_temp.act_as_admin();
  note := private.notify(branch, 'finance.overdue_digest', 'branch', branch, 'Nợ quá hạn: 2 khoản', null, '/admin/receivables', 'finance.ar.read', null, 'nt356:debt');
  assert pg_temp.devices('rule:' || phone_rule || ':' || note || ':%') = array['d1'], 'the new push rule reaches who may read receivables';

  -- 4. Built-in worker push turned off: the notification stays, no push. Back on: pushed again. Only roles.manage may switch.
  perform pg_temp.act_as(owner);
  assert public.set_builtin_push(branch, 'work.assigned', false, gen_random_uuid()) = false, 'switched off';
  perform pg_temp.act_as_admin();
  note := private.notify(branch, 'work.assigned', 'work_item', gen_random_uuid(), 'Việc mới: giao 20 bao', null, '/work', 'work.claim',
    '30000000-0000-4000-8000-000000000001', 'nt356:w1');
  assert note is not null and exists (select 1 from public.notifications where id = note), 'the in-app notification is kept';
  assert not exists (select 1 from public.outbound_jobs where dedupe_key like 'worker:' || note || ':%'), 'no built-in push while off';
  perform pg_temp.act_as(owner);
  perform public.set_builtin_push(branch, 'work.assigned', true, gen_random_uuid());
  perform pg_temp.act_as_admin();
  note := private.notify(branch, 'work.assigned', 'work_item', gen_random_uuid(), 'Việc mới: giao 30 bao', null, '/work', 'work.claim',
    '30000000-0000-4000-8000-000000000001', 'nt356:w2');
  assert pg_temp.devices('worker:' || note || ':%') = array['d1'], 'built-in push back on';
  perform pg_temp.act_as(reader);
  failed := false; begin perform public.set_builtin_push(branch, 'work.assigned', false, gen_random_uuid()); exception when insufficient_privilege then failed := true; end;
  assert failed, 'reader cannot switch built-ins';
  perform pg_temp.act_as(owner);
  failed := false; begin perform public.set_builtin_push(branch, 'không.có', false, gen_random_uuid()); exception when invalid_parameter_value then failed := true; end;
  assert failed, 'unknown built-in';
  -- The Owner's composed announcement: popup kept, push off.
  perform public.set_builtin_push(branch, 'announcement.manual', false, gen_random_uuid());
  note := public.create_announcement(branch, 'OFFICE', 'NEWS', 'Nghỉ lễ 356', 'Cửa hàng nghỉ ngày 20/11.', null, null, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.announcements where id = note) and not exists (select 1 from public.outbound_jobs where dedupe_key like 'announcement:' || note || ':%'),
    'announcement shown, not pushed';

  -- 5. Quiet hours around now (local time), exceptions: worker jobs only.
  local_minute := (extract(hour from now() at time zone 'Asia/Ho_Chi_Minh') * 60 + extract(minute from now() at time zone 'Asia/Ho_Chi_Minh'))::integer;
  perform pg_temp.act_as(owner);
  version_now := public.save_quiet_hours(branch, jsonb_build_object('enabled', true, 'start_minute', (local_minute + 1380) % 1440,
    'end_minute', (local_minute + 60) % 1440, 'exempt_keys', jsonb_build_array('worker_jobs')), null, gen_random_uuid());
  assert version_now = 1, 'saved';
  failed := false;
  begin perform public.save_quiet_hours(branch, jsonb_build_object('enabled', true, 'start_minute', 60, 'end_minute', 60, 'exempt_keys', '[]'::jsonb), 1, gen_random_uuid());
  exception when invalid_parameter_value then failed := true; end;
  assert failed, 'start = end refused';
  failed := false;
  begin perform public.save_quiet_hours(branch, jsonb_build_object('enabled', false, 'start_minute', 60, 'end_minute', 120, 'exempt_keys', '[]'::jsonb), null, gen_random_uuid());
  exception when sqlstate 'PT409' then failed := true; end;
  assert failed, 'stale version refused';
  perform pg_temp.act_as_admin();
  held_until := private.quiet_until(branch);
  assert held_until between now() + interval '55 minutes' and now() + interval '61 minutes', format('quiet until %s', held_until);
  note := private.notify(branch, 'order.portal_submitted', 'sales_order', gen_random_uuid(), 'Đơn mới từ khách: Chị Lan', null, '/admin/orders', 'orders.confirm', null, 'nt356:o2');
  select * into job from public.outbound_jobs where dedupe_key like 'rule:' || roles_rule || ':' || note || ':%';
  assert job.state = 'HELD' and job.next_run_at = held_until and job.request_id is null, format('held %s', to_jsonb(job));
  assert (select state from public.outbound_jobs where rule_id = roles_rule and notification_id = note and channel = 'WEBHOOK') = 'SENDING', 'webhooks are not held';
  perform private.notify(branch, 'order.portal_cancelled', 'sales_order', gen_random_uuid(), 'Khách hủy đơn SO-2', null, '/admin/orders', 'orders.read', null, 'nt356:c2');
  perform private.notify(branch, 'order.portal_submitted', 'sales_order', gen_random_uuid(), 'Đơn mới từ khách: Anh Hùng', null, '/admin/orders', 'orders.confirm', null, 'nt356:o3');
  note := private.notify(branch, 'work.assigned', 'work_item', gen_random_uuid(), 'Việc mới: giao gạch', null, '/work', 'work.claim',
    '30000000-0000-4000-8000-000000000001', 'nt356:w3');
  assert (select state from public.outbound_jobs where dedupe_key like 'worker:' || note || ':%') = 'SENDING', 'worker jobs are an exception';
  -- Test sends are never held.
  perform pg_temp.act_as(owner);
  assert public.send_test_push(branch, 'Đơn khách mới: ĐB-0415', 'Anh Tuấn · Nhà phố Phú Mỹ', '7f356000-0000-4000-8000-0000000000f1') = 1, 'one own device';
  assert public.test_automation_rule(roles_rule, '7f356000-0000-4000-8000-0000000000f2') = 1, 'rule test: own device only';
  perform pg_temp.act_as_admin();
  assert pg_temp.devices('test:7f356000-0000-4000-8000-0000000000f1:%') = array['d1'] and pg_temp.devices('test:7f356000-0000-4000-8000-0000000000f2:%') = array['d1'],
    'tests reach the caller only, never the rule''s people or webhook';
  assert (select bool_and(state = 'SENDING' and channel = 'PUSH') from public.outbound_jobs where dedupe_key like 'test:7f356000-0000-4000-8000-0000000000f%'), 'tests not held';
  assert (select (s.body->>'data')::jsonb->>'title' from public.outbound_jobs j join net.sent s on s.id = j.request_id
    where j.dedupe_key like 'test:7f356000-0000-4000-8000-0000000000f1:%') = 'Thử: Đơn khách mới: ĐB-0415', 'preview text sent';
  -- Not due yet: nothing released. When quiet hours end: sales (2 held) gets one combined push, the reader (1 held) his own.
  assert private.release_quiet_pushes(now()) = 0, 'still quiet';
  made := private.release_quiet_pushes(now() + interval '2 hours');
  assert made = 2, format('released %s devices', made);
  assert (select count(*) from public.outbound_jobs where state = 'MERGED' and target = '7f356000-0000-4000-8000-0000000000d4') = 2, 'sales: both folded';
  select * into job from public.outbound_jobs where dedupe_key like 'quiet:7f356000-0000-4000-8000-0000000000d4:%';
  assert job.state = 'SENDING' and job.payload->>'title' = 'Trong giờ yên lặng có 2 thông báo'
    and job.payload->>'body' like '%Chị Lan%' and job.payload->>'body' like '%Anh Hùng%' and job.payload->>'body' like '% · %' and job.payload->>'link' = '/admin/orders', format('combined %s', job.payload);
  assert (select state = 'SENDING' from public.outbound_jobs where state <> 'MERGED' and target = '7f356000-0000-4000-8000-0000000000d3'
    and dedupe_key like 'rule:' || people_rule || ':%' and payload->>'title' = 'Khách hủy đơn SO-2'), 'a single held push goes out as it is';
  assert not exists (select 1 from public.outbound_jobs where state = 'HELD'), 'nothing left held';
  -- Fixed times: 21:00 – 06:30 runs over midnight.
  perform pg_temp.act_as(owner);
  version_now := public.save_quiet_hours(branch, jsonb_build_object('enabled', true, 'start_minute', 1260, 'end_minute', 390,
    'exempt_keys', jsonb_build_array('worker_jobs', 'delivery_problems')), version_now, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert private.quiet_until(branch, '2026-11-16 22:00:00+07') = '2026-11-17 06:30:00+07', 'evening';
  assert private.quiet_until(branch, '2026-11-17 05:59:00+07') = '2026-11-17 06:30:00+07', 'early morning';
  assert private.quiet_until(branch, '2026-11-17 06:30:00+07') is null and private.quiet_until(branch, '2026-11-17 12:00:00+07') is null, 'day';
  assert private.quiet_until('20000000-0000-4000-8000-00000000000b', '2026-11-16 22:00:00+07') is null, 'other branch has none';
  perform pg_temp.act_as(owner);
  perform public.save_quiet_hours(branch, jsonb_build_object('enabled', false, 'start_minute', 1260, 'end_minute', 390, 'exempt_keys', '[]'::jsonb),
    version_now, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert private.quiet_until(branch, '2026-11-16 22:00:00+07') is null, 'switched off';

  -- 6. Customers. Order approved (both members, no money), truck on its way, delivered, short, cancelled by the store.
  --    (State changes written directly as the database owner on behalf of the Owner, as 322 does.)
  perform set_config('request.jwt.claim.sub', owner::text, true);
  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id = '7f356000-0000-4000-8000-000000000101';
  perform pg_temp.commit_point();
  assert pg_temp.devices('customer:customer.order_confirmed:7f356000-0000-4000-8000-000000000101:%') = array['d6', 'd7'], 'approved: both members of K1';
  assert (select payload->>'title' = 'SO-356-01 đã duyệt, dự kiến giao 08:30 17/11' and payload->>'link' = '/customer/orders/7f356000-0000-4000-8000-000000000101'
    from public.outbound_jobs where dedupe_key like 'customer:customer.order_confirmed:%d6'), 'approved text and link';
  update public.deliveries set execution_state = 'DISPATCHED' where id = '7f356000-0000-4000-8000-000000000201';
  perform pg_temp.commit_point();
  assert pg_temp.devices('customer:customer.delivery_dispatched:7f356000-0000-4000-8000-000000000201:%') = array['d6', 'd7'], 'on its way';
  assert (select payload->>'title' = 'Xe 51C-356.01 đang chở hàng tới Công trình 356' and payload->>'body' = 'DLV-35601'
    from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_dispatched:%d7'), 'truck text';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'PARTIAL', verified_at = now() where id = '7f356000-0000-4000-8000-000000000202';
  perform pg_temp.commit_point();
  assert (select payload->>'title' = 'Giao thiếu DLV-35602' and payload->>'body' = 'Công trình 356 · Thiếu 5 bao, xe không vào được hẻm'
    from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:%d6'), 'short delivery with the reason';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'FULL', verified_at = now() where id = '7f356000-0000-4000-8000-000000000203';
  perform pg_temp.commit_point();
  assert pg_temp.devices('customer:customer.delivery_done:7f356000-0000-4000-8000-000000000203:%') = array['d6', 'd7']
    and (select payload->>'title' = 'Đã giao xong DLV-35603' from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_done:%d6'), 'delivered';
  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = '7f356000-0000-4000-8000-000000000102';
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (owner, branch, 'sales_order.cancel', 'sales_order', '7f356000-0000-4000-8000-000000000102', gen_random_uuid(), array['commercial_state'], 'Khách đổi công trình');
  perform pg_temp.commit_point();
  assert (select array_agg(right(target, 2) order by target) = array['d6', 'd7'] and bool_and(payload->>'title' = 'Đơn SO-356-02 đã hủy')
    and bool_and(payload->>'body' = 'Lý do: Khách đổi công trình') from public.outbound_jobs where dedupe_key like 'customer:customer.order_cancelled:%'), 'cancelled with reason';
  -- The customer cancelling his own portal order is not told.
  perform set_config('request.jwt.claim.sub', '7f356000-0000-4000-8000-0000000000a6', true);
  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = '7f356000-0000-4000-8000-000000000103';
  perform pg_temp.commit_point();
  perform set_config('request.jwt.claim.sub', owner::text, true);
  assert not exists (select 1 from public.outbound_jobs where dedupe_key like 'customer:customer.order_cancelled:7f356000-0000-4000-8000-000000000103:%'), 'own cancel';
  -- Money: payment received and the debt reminder reach "Chủ tài khoản" only (not "Người nhận hàng").
  insert into public.payments(branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, effective_at, posted_by)
  values (branch, 'PT-356-01', 'RECEIPT', '7f356000-0000-4000-8000-000000000041', '7f356000-0000-4000-8000-000000000070', 2000000, 'CASH', now(), owner);
  perform pg_temp.commit_point();
  assert pg_temp.devices('customer:customer.payment_received:%') = array['d6'], 'payment: money roles only';
  assert (select payload->>'title' = 'Cửa hàng đã nhận 2.000.000 ₫' and payload->>'body' like 'Còn nợ %' and payload->>'link' = '/customer/debts'
    from public.outbound_jobs where dedupe_key like 'customer:customer.payment_received:%'), 'payment text';
  assert private.customer_debt_reminders() = 1 and private.customer_debt_reminders() = 0, 'one reminder per customer and day (K2 is not due)';
  assert pg_temp.devices('customer:customer.debt_reminder:%') = array['d6']
    and (select payload->>'body' = 'Đến hạn hôm nay' from public.outbound_jobs where dedupe_key like 'customer:customer.debt_reminder:%'), 'reminder';
  -- Never another customer's news, nor the office's.
  assert not exists (select 1 from public.outbound_jobs where target = '7f356000-0000-4000-8000-0000000000d8'), 'K2 owner got nothing';
  assert not exists (select 1 from public.outbound_jobs where dedupe_key like 'customer:%' and target not in
    ('7f356000-0000-4000-8000-0000000000d6', '7f356000-0000-4000-8000-0000000000d7')), 'only K1 members';
  -- A customer push turned off.
  perform pg_temp.act_as(owner);
  perform public.set_builtin_push(branch, 'customer.delivery_dispatched', false, gen_random_uuid());
  perform pg_temp.act_as_admin();
  perform set_config('request.jwt.claim.sub', owner::text, true);
  update public.deliveries set execution_state = 'ASSIGNED' where id = '7f356000-0000-4000-8000-000000000201';
  delete from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_dispatched:%';
  update public.deliveries set execution_state = 'DISPATCHED' where id = '7f356000-0000-4000-8000-000000000201';
  perform pg_temp.commit_point();
  assert not exists (select 1 from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_dispatched:%'), 'switched off';

  -- 7. The overview carries what the page needs.
  perform pg_temp.act_as(owner);
  overview := public.automation_overview(branch);
  assert (overview->'builtins'->>'work.assigned')::boolean and not (overview->'builtins'->>'customer.delivery_dispatched')::boolean, 'built-in switches';
  assert not (overview->'quiet_hours'->>'enabled')::boolean and (overview->'quiet_hours'->>'start_minute')::integer = 1260, 'quiet hours';
  assert (select r->'channels' = '["PUSH", "WEBHOOK"]'::jsonb and r->>'recipient_mode' = 'ROLES' and jsonb_array_length(r->'role_ids') = 2
    from jsonb_array_elements(overview->'rules') r where r->>'id' = roles_rule::text), 'rule recipients';
  assert (select p->'permissions' ? 'orders.confirm' and (p->>'devices')::integer = 1 and p->>'role_name' = 'Bán hàng thử 356'
    from jsonb_array_elements(overview->'people') p where p->>'id' = '7f356000-0000-4000-8000-0000000000e4'), 'people with permissions and devices';
  assert (overview->>'my_devices')::integer = 1 and (overview->'customers'->>'people')::integer = 3 and (overview->'customers'->>'devices')::integer = 3, 'counts';
  assert exists (select 1 from jsonb_array_elements(overview->'jobs') j where j->>'state' = 'MERGED'), 'history shows merged pushes';
  perform pg_temp.act_as(reader);
  assert (select count(*) from public.notification_builtin_settings) = 0 and (select count(*) from public.notification_quiet_hours) = 0
    and (select count(*) from public.automation_rule_recipients) = 0, 'reader sees no settings';
  failed := false; begin perform public.save_quiet_hours(branch, '{}'::jsonb, null, gen_random_uuid()); exception when insufficient_privilege then failed := true; end;
  assert failed, 'reader cannot set quiet hours';
  failed := false; begin perform public.send_test_push(branch, 'Thử thử', null, gen_random_uuid()); exception when insufficient_privilege then failed := true; end;
  assert failed, 'reader cannot test';
  perform pg_temp.act_as_admin();
end
$test$;
