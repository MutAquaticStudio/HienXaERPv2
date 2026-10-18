-- FB3 F5: rules turn notifications into outbound jobs in the same transaction (push only to people who may see it, Telegram,
-- signed webhook, email through the app), pg_net is handed the request, results settle to SENT / retry with backoff / DEAD,
-- missing setup waits with a clear reason, and the morning digest is posted once a day. pg_net and Vault are stubbed here.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
create schema if not exists net;
create table net._http_response(id bigint primary key, status_code integer, error_msg text, created timestamptz not null default now());
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz not null default now());
insert into vault.decrypted_secrets(name, decrypted_secret) values
  ('hx_telegram_bot_token', 'TESTTOKEN'), ('hx_app_url', 'https://app.example.test/'), ('hx_automation_secret', 'k1'), ('hx_webhook_secret', 'w1');

insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f215000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH215', 'Khách 215', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f215000-0000-4000-8000-000000000041', '7f215000-0000-4000-8000-000000000040', 'CT1', 'Công trình 215', 'Địa chỉ 215');
insert into public.units_of_measure(id, code, name, symbol) values ('7f215000-0000-4000-8000-000000000001', 'nt_bao215', 'Bao thử 215', 'bao');
insert into public.material_groups(id, code, name) values ('7f215000-0000-4000-8000-000000000005', 'NT_G215', 'Nhóm thử 215');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f215000-0000-4000-8000-000000000010', '7f215000-0000-4000-8000-000000000005', 'NT_XM215', 'Xi măng 215', '7f215000-0000-4000-8000-000000000001');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by) values
  ('7f215000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2151', '7f215000-0000-4000-8000-000000000040',
   '7f215000-0000-4000-8000-000000000041', 'Khách 215', 'Công trình 215', 'Địa chỉ 215', '10000000-0000-4000-8000-000000000001'),
  ('7f215000-0000-4000-8000-000000000051', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2152', '7f215000-0000-4000-8000-000000000040',
   '7f215000-0000-4000-8000-000000000041', 'Khách 215', 'Công trình 215', 'Địa chỉ 215', '10000000-0000-4000-8000-000000000001');
insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f215000-0000-4000-8000-000000000050', 1, '7f215000-0000-4000-8000-000000000010', 'Xi măng 215', '7f215000-0000-4000-8000-000000000001',
   '7f215000-0000-4000-8000-000000000001', 20, 1, 1, 'HALF_UP', 100000, 2000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f215000-0000-4000-8000-000000000051', 1, '7f215000-0000-4000-8000-000000000010', 'Xi măng 215', '7f215000-0000-4000-8000-000000000001',
   '7f215000-0000-4000-8000-000000000001', 2, 1, 1, 'HALF_UP', 100000, 200000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');

do $test$
declare
  branch uuid := '20000000-0000-4000-8000-00000000000a';
  telegram uuid;
  webhook uuid;
  push uuid;
  email uuid;
  sub1 uuid;
  sub3 uuid;
  job public.outbound_jobs%rowtype;
  sent record;
  data jsonb;
  failed boolean;
  overview jsonb;
  made integer;
begin
  -- Rules: only roles.manage, only whitelisted channels and safe targets.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  telegram := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Đơn khách lớn', 'event', 'order.portal_submitted', 'min_amount_vnd', '1000000',
    'channel', 'TELEGRAM', 'target', '-1001234567'), null, '7f215000-0000-4000-8000-0000000000a1');
  assert public.save_automation_rule(null, branch, jsonb_build_object('name', 'Đơn khách lớn', 'event', 'order.portal_submitted', 'min_amount_vnd', '1000000',
    'channel', 'TELEGRAM', 'target', '-1001234567'), null, '7f215000-0000-4000-8000-0000000000a1') = telegram, 'replay';
  webhook := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Giao có vấn đề', 'event', 'delivery.result_submitted', 'problems_only', true,
    'channel', 'WEBHOOK', 'target', 'https://hooks.example.test/hx'), null, '7f215000-0000-4000-8000-0000000000a2');
  push := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Việc mới', 'event', 'work.assigned', 'channel', 'PUSH', 'target', 'bỏ qua'),
    null, '7f215000-0000-4000-8000-0000000000a3');
  email := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Khách mới', 'event', 'customer.self_registered', 'channel', 'EMAIL', 'target', 'Boss@Example.test'),
    null, '7f215000-0000-4000-8000-0000000000a4');
  assert (select target is null from public.automation_rules where id = push), 'push has no target';
  assert (select target = 'boss@example.test' from public.automation_rules where id = email), 'email lower-cased';
  foreach data in array array[
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channel', 'WEBHOOK', 'target', 'http://hooks.example.test/x'),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channel', 'WEBHOOK', 'target', 'https://192.168.1.10/x'),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channel', 'WEBHOOK', 'target', 'https://localhost/x'),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channel', 'TELEGRAM', 'target', 'abc'),
    jsonb_build_object('name', 'Sai', 'event', 'không có', 'channel', 'PUSH'),
    jsonb_build_object('name', 'Sai', 'event', 'order.portal_submitted', 'channel', 'SMS', 'target', '0901')] loop
    failed := false;
    begin perform public.save_automation_rule(null, branch, data, null, gen_random_uuid()); exception when invalid_parameter_value then failed := true; end;
    assert failed, format('rejected %s', data);
  end loop;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := false;
  begin perform public.save_automation_rule(null, branch, jsonb_build_object('name', 'Lén', 'event', 'work.assigned', 'channel', 'PUSH'), null, gen_random_uuid());
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'reader cannot save rules';

  -- Devices.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  sub1 := public.save_push_subscription('https://push.example.test/e1', repeat('p', 40), repeat('a', 16), 'Thử 1');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  perform public.save_push_subscription('https://push.example.test/e2', repeat('p', 40), repeat('a', 16), 'Thử 2');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  sub3 := public.save_push_subscription('https://push.example.test/e3', repeat('p', 40), repeat('a', 16), 'Thử 3');
  assert (select count(*) from public.push_subscriptions) = 1, 'own devices only';

  -- Small order: below the amount, nothing. Big order: one Telegram job handed to pg_net with the app link.
  perform pg_temp.act_as_admin();
  perform private.notify(branch, 'order.portal_submitted', 'sales_order', '7f215000-0000-4000-8000-000000000051', 'Đơn mới nhỏ', 'Khách 215', '/admin/orders/x', 'orders.confirm', null, 'nt215:small');
  assert not exists (select 1 from public.outbound_jobs where rule_id = telegram), 'below amount';
  perform private.notify(branch, 'order.portal_submitted', 'sales_order', '7f215000-0000-4000-8000-000000000050', 'Đơn mới lớn', 'Khách 215',
    '/admin/orders/7f215000-0000-4000-8000-000000000050', 'orders.confirm', null, 'nt215:big');
  perform private.notify(branch, 'order.portal_submitted', 'sales_order', '7f215000-0000-4000-8000-000000000050', 'Đơn mới lớn', 'Khách 215',
    '/admin/orders/7f215000-0000-4000-8000-000000000050', 'orders.confirm', null, 'nt215:big');
  assert (select count(*) from public.outbound_jobs where rule_id = telegram) = 1, 'one job per notification';
  select * into job from public.outbound_jobs where rule_id = telegram;
  select * into sent from net.sent where id = job.request_id;
  assert job.state = 'SENDING' and job.attempt = 1 and sent.url = 'https://api.telegram.org/botTESTTOKEN/sendMessage' and sent.body->>'chat_id' = '-1001234567'
    and sent.body->>'text' like 'Đơn mới lớn%https://app.example.test/admin/orders/7f215000-0000-4000-8000-000000000050', format('telegram %s', to_jsonb(sent));

  -- Push only to devices of people allowed to see it (work.assigned to employee 1: not the reader, not branch B).
  perform private.notify(branch, 'work.assigned', 'work_item', gen_random_uuid(), 'Việc mới: giao 20 bao', null, '/work', 'work.read',
    '30000000-0000-4000-8000-000000000001', 'nt215:work');
  assert (select array_agg(target) = array[sub1::text] from public.outbound_jobs where rule_id = push), 'push recipients';
  select * into job from public.outbound_jobs where rule_id = push;
  select * into sent from net.sent where id = job.request_id;
  data := (sent.body->>'data')::jsonb;
  assert sent.url = 'https://app.example.test/api/automation/deliver' and data->>'channel' = 'PUSH' and data->'subscription'->>'endpoint' = 'https://push.example.test/e1'
    and data->>'link' = 'https://app.example.test/work' and sent.body->>'signature' = encode(extensions.hmac(sent.body->>'data', 'k1', 'sha256'), 'hex'), format('push %s', to_jsonb(sent));

  -- problems_only: a delivery that is not a short or failed one does not fire.
  perform private.notify(branch, 'delivery.result_submitted', 'delivery', gen_random_uuid(), 'GH-1 đã giao', null, '/admin/deliveries', 'delivery.verify', null, 'nt215:ok');
  assert not exists (select 1 from public.outbound_jobs where rule_id = webhook), 'only problems';

  -- Email through the app.
  perform private.notify(branch, 'customer.self_registered', 'customer', gen_random_uuid(), 'Khách mới tự đăng ký: Anh Ba', '0901 · Huế', '/admin/customers', 'customers.manage', null, 'nt215:customer');
  select * into job from public.outbound_jobs where rule_id = email;
  select * into sent from net.sent where id = job.request_id;
  assert (sent.body->>'data')::jsonb->>'to' = 'boss@example.test', 'email recipient';

  -- Results: 200 → SENT, 410 → device removed, 500 → retry later, then sent again when due.
  insert into net._http_response(id, status_code) select request_id, 200 from public.outbound_jobs where rule_id = telegram;
  insert into net._http_response(id, status_code) select request_id, 410 from public.outbound_jobs where rule_id = push;
  insert into net._http_response(id, status_code) select request_id, 500 from public.outbound_jobs where rule_id = email;
  perform private.process_outbound_jobs(50);
  assert (select state = 'SENT' and sent_at is not null from public.outbound_jobs where rule_id = telegram), 'sent';
  assert (select state = 'DEAD' from public.outbound_jobs where rule_id = push) and not exists (select 1 from public.push_subscriptions where id = sub1), 'device gone';
  select * into job from public.outbound_jobs where rule_id = email;
  assert job.state = 'FAILED' and job.attempt = 1 and job.next_run_at > now() and job.last_error_safe like '%500%', format('retry %s', to_jsonb(job));
  update public.outbound_jobs set next_run_at = now() - interval '1 second' where id = job.id;
  perform private.process_outbound_jobs(50);
  assert (select state = 'SENDING' and attempt = 2 from public.outbound_jobs where id = job.id), 'sent again';

  -- Webhook test send is signed; a missing Telegram token waits with the reason.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.test_automation_rule(webhook, '7f215000-0000-4000-8000-0000000000b1') = 1, 'test webhook';
  perform pg_temp.act_as_admin();
  select s.* into sent from net.sent s order by s.id desc limit 1;
  assert sent.url = 'https://hooks.example.test/hx' and sent.body->>'signature' = encode(extensions.hmac(sent.body->>'data', 'w1', 'sha256'), 'hex')
    and (sent.body->>'data')::jsonb->>'kind' = 'automation.test', 'signed webhook';
  delete from vault.decrypted_secrets where name = 'hx_telegram_bot_token';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.test_automation_rule(telegram, '7f215000-0000-4000-8000-0000000000b2');
  perform pg_temp.act_as_admin();
  assert (select state = 'FAILED' and last_error_safe like 'Chưa cấu hình Telegram%' from public.outbound_jobs where dedupe_key = 'test:7f215000-0000-4000-8000-0000000000b2'), 'waits for setup';

  -- Morning digest: once per branch and day (here: a stock threshold with nothing in stock).
  insert into public.warehouses(id, branch_id, code, name) values ('7f215000-0000-4000-8000-000000000020', branch, 'NT_K215', 'Kho 215');
  insert into public.inventory_stock_thresholds(branch_id, warehouse_id, material_id, threshold_base_quantity, created_by, updated_by)
  values (branch, '7f215000-0000-4000-8000-000000000020', '7f215000-0000-4000-8000-000000000010', 10, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
  made := private.morning_digest();
  assert made >= 1 and private.morning_digest() = made, 'digest';
  assert (select count(*) from public.notifications where branch_id = branch and kind = 'inventory.low_stock_digest') = 1, 'once a day';

  -- Overview and visibility.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  overview := public.automation_overview(branch);
  assert jsonb_array_length(overview->'rules') = 4 and jsonb_array_length(overview->'jobs') >= 4 and (overview->'setup'->>'app_delivery')::boolean
    and not (overview->'setup'->>'telegram')::boolean, format('overview %s', overview->'setup');
  assert (select count(*) from public.outbound_jobs) >= 4, 'manager sees jobs';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.outbound_jobs) = 0 and (select count(*) from public.automation_rules) = 0, 'reader sees nothing';
  failed := false; begin perform public.automation_overview(branch); exception when insufficient_privilege then failed := true; end;
  assert failed, 'reader overview';
  failed := false; begin perform public.delete_automation_rule(push, gen_random_uuid()); exception when insufficient_privilege then failed := true; end;
  assert failed, 'reader delete';
  -- The same browser signed in by another login belongs to that login now.
  perform public.save_push_subscription('https://push.example.test/e2', repeat('q', 40), repeat('b', 16), 'Máy chung');
  perform pg_temp.act_as_admin();
  assert (select auth_user_id = '10000000-0000-4000-8000-000000000003' from public.push_subscriptions where endpoint = 'https://push.example.test/e2'), 'device moved';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.delete_automation_rule(push, gen_random_uuid());
  assert not exists (select 1 from public.automation_rules where id = push), 'deleted';

  perform pg_temp.act_as_admin();
  set local role anon;
  failed := false; begin perform public.save_push_subscription('https://push.example.test/x', repeat('p', 40), repeat('a', 16), null); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon';
  reset role;
end
$test$;
