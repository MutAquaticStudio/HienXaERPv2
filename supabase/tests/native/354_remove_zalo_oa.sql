-- D91: Zalo OA is removed. Its tables, functions, triggers, schedules and the customer's switch are gone; confirming an order,
-- verifying a delivery or posting a payment queues nothing for Zalo; the queue refuses a ZALO job; PUSH (Web Push + FCM),
-- WEBHOOK and PUSH are still sent as before (TELEGRAM/EMAIL removed by D93). The manual "Gửi NCC qua Zalo" record is kept.
-- pg_net and Vault are stubbed here, as in 215_automation / 350_d86_app_push.
create schema if not exists net;
create table net._http_response(id bigint primary key, status_code integer, error_msg text, content text, created timestamptz not null default now());
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz not null default now());
insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_app_url', 'https://app.example.test/'), ('hx_automation_secret', 'k1'),
  ('hx_telegram_bot_token', 'bot354'), ('hx_webhook_secret', 'w354'), ('hx_zalo_access_token', 'tok-354');

insert into public.customers(id, branch_id, code, display_name, customer_type, phone) values
  ('7f354000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'KH354', 'Khách thử 354', 'BUSINESS', '0912 345 678');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f354000-0000-4000-8000-000000000050', '7f354000-0000-4000-8000-000000000040', 'CT354', 'Công trình 354', 'Đại Mỗ, Hà Nội');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f354000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_VCB354', 'Vietcombank 354', 'BANK', '10000000-0000-4000-8000-000000000001');
insert into public.units_of_measure(id, code, name, symbol) values ('7f354000-0000-4000-8000-000000000901', 'nt_kg354', 'Kg 354', 'kg');
insert into public.material_groups(id, code, name) values ('7f354000-0000-4000-8000-000000000900', 'NT_G354', 'Nhóm 354');
insert into public.materials(id, group_id, code, name, base_uom_id) values ('7f354000-0000-4000-8000-000000000801',
  '7f354000-0000-4000-8000-000000000900', 'NT_M354', 'Xi măng 354', '7f354000-0000-4000-8000-000000000901');

-- A delivered order with a debt of 3 000 000 ₫ (written directly, as in the D47 test).
set local session_replication_role = replica;
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f354000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-00000000000a', 'SO-2026-354001', '7f354000-0000-4000-8000-000000000040',
  '7f354000-0000-4000-8000-000000000050', 'Khách thử 354', 'Công trình 354', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f354000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', '7f354000-0000-4000-8000-000000000101', 'DLV-354001',
  '7f354000-0000-4000-8000-000000000040', '7f354000-0000-4000-8000-000000000050', 'Khách thử 354', 'Công trình 354', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by)
values ('7f354000-0000-4000-8000-000000000103', '7f354000-0000-4000-8000-000000000102', gen_random_uuid(), '10000000-0000-4000-8000-000000000001');
insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id)
values ('7f354000-0000-4000-8000-000000000104', '20000000-0000-4000-8000-00000000000a', '7f354000-0000-4000-8000-000000000040', 3000000, current_date - 1,
  '10000000-0000-4000-8000-000000000001', null, '7f354000-0000-4000-8000-000000000103');
-- A draft order of 1 500 000 ₫ that will be confirmed.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by)
values ('7f354000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-00000000000a', 'SO-2026-354201', '7f354000-0000-4000-8000-000000000040',
  '7f354000-0000-4000-8000-000000000050', 'DRAFT', 'Khách thử 354', 'Công trình 354', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
values (gen_random_uuid(), '7f354000-0000-4000-8000-000000000201', 1, '7f354000-0000-4000-8000-000000000801', 'Xi măng 354',
  '7f354000-0000-4000-8000-000000000901', '7f354000-0000-4000-8000-000000000901', 10, 1, 1, 'HALF_UP', 150000, 1500000, 'MANUAL_APPROVED',
  '10000000-0000-4000-8000-000000000001', 'Giá thử');
set local session_replication_role = origin;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  reader constant uuid := '10000000-0000-4000-8000-000000000003';
  customer constant uuid := '7f354000-0000-4000-8000-000000000040';
  web_id uuid;
  fcm_id uuid;
  job public.outbound_jobs%rowtype;
  sent record;
  data jsonb;
  dedupe text;
  failed text;
  before_jobs bigint;
begin
  -- 1. The Zalo OA objects are gone.
  assert to_regclass('public.zalo_templates') is null and to_regclass('private.zalo_connection') is null, 'Zalo tables dropped';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and (p.proname like '%zalo%')), 'no Zalo function left';
  assert not exists (select 1 from pg_trigger t where not t.tgisinternal and (t.tgname like '%zalo%' or t.tgfoid::regproc::text like '%zalo%')),
    'no Zalo trigger left (order confirmed, delivery verified, payment received)';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'zalo_notify'),
    'customers.zalo_notify dropped';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ilike '%zalo_notify%'), 'no function reads zalo_notify';
  assert pg_get_functiondef('private.dispatch_outbound_job(uuid)'::regprocedure) not ilike '%zalo%'
    and pg_get_functiondef('private.process_outbound_jobs(integer)'::regprocedure) not ilike '%zalo%', 'the queue has no Zalo branch';
  if to_regclass('cron.job') is not null then
    assert not exists (select 1 from cron.job where jobname in ('hx-zalo-refresh', 'hx-zalo-debt-reminder')), 'Zalo schedules removed';
  end if;

  -- 2. The queue refuses a ZALO job.
  failed := null;
  begin
    perform private.enqueue_outbound_job(branch, null, null, 'ZALO', '84912345678', '{"title": "Zalo"}'::jsonb, 'nt354:zalo');
  exception when check_violation then failed := 'check';
  end;
  assert failed = 'check', 'ZALO is no longer a queue channel';

  -- 3. Confirming an order, verifying a delivery and posting a payment queue nothing for Zalo.
  select count(*) into before_jobs from public.outbound_jobs;
  perform set_config('request.jwt.claim.sub', owner_login::text, true);
  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id = '7f354000-0000-4000-8000-000000000201';
  perform set_config('request.jwt.claim.sub', '', true);
  set constraints all immediate; set constraints all deferred;
  assert (select commercial_state = 'CONFIRMED' from public.sales_orders where id = '7f354000-0000-4000-8000-000000000201'), 'order confirmed';
  update public.deliveries set execution_state = 'VERIFIED' where id = '7f354000-0000-4000-8000-000000000102';
  set constraints all immediate; set constraints all deferred;
  assert (select execution_state = 'VERIFIED' from public.deliveries where id = '7f354000-0000-4000-8000-000000000102'), 'delivery verified';
  perform pg_temp.act_as(owner_login);
  perform public.post_payment(branch, 'RECEIPT', customer, null, '7f354000-0000-4000-8000-000000000002', 1000000, now(), 'CASH', null,
    jsonb_build_array(jsonb_build_object('obligation_id', '7f354000-0000-4000-8000-000000000104', 'amount_vnd', 1000000)), 0, gen_random_uuid());
  perform pg_temp.act_as_admin();
  set constraints all immediate; set constraints all deferred;
  assert not exists (select 1 from public.outbound_jobs where channel = 'ZALO'
    or payload->>'event' in ('ORDER_CONFIRMED', 'DELIVERY_DONE', 'PAYMENT_RECEIVED', 'DEBT_REMINDER')), 'nothing queued for Zalo';
  assert (select count(*) from public.outbound_jobs) = before_jobs, 'no job at all without a rule or a device';

  -- 4. WEBHOOK and PUSH (Web Push + FCM) are sent as before (TELEGRAM / EMAIL were removed later by D93).

  perform private.enqueue_outbound_job(branch, null, null, 'WEBHOOK', 'https://hook.example.test/354', '{"title": "Phiếu giao"}'::jsonb, 'nt354:hook');
  select * into job from public.outbound_jobs where dedupe_key = 'nt354:hook';
  select * into sent from net.sent where id = job.request_id;
  data := (sent.body->>'data')::jsonb;
  assert job.state = 'SENDING' and sent.url = 'https://hook.example.test/354' and data->>'title' = 'Phiếu giao' and data->>'delivery_id' = job.id::text
    and sent.body->>'signature' = encode(extensions.hmac(sent.body->>'data', 'w354', 'sha256'), 'hex'), format('webhook %s', data);

  perform pg_temp.act_as(reader);
  web_id := public.save_push_subscription('https://fcm.googleapis.com/fcm/send/r354', repeat('p', 40), repeat('a', 16), 'Chrome');
  fcm_id := public.save_app_push_token('fcmToken354:APA91b' || repeat('z', 60), 'ANDROID', null);
  perform pg_temp.act_as_admin();
  perform private.enqueue_outbound_job(branch, null, null, 'PUSH', web_id::text, '{"kind": "automation.test", "title": "Thử web"}'::jsonb, 'nt354:web');
  perform private.enqueue_outbound_job(branch, null, null, 'PUSH', fcm_id::text, '{"kind": "automation.test", "title": "Thử app"}'::jsonb, 'nt354:fcm');
  select * into sent from net.sent where id = (select request_id from public.outbound_jobs where dedupe_key = 'nt354:web');
  data := (sent.body->>'data')::jsonb;
  assert data->>'channel' = 'PUSH' and data->'subscription'->>'endpoint' = 'https://fcm.googleapis.com/fcm/send/r354' and data->'fcm' = 'null'::jsonb, format('web push %s', data);
  select * into sent from net.sent where id = (select request_id from public.outbound_jobs where dedupe_key = 'nt354:fcm');
  data := (sent.body->>'data')::jsonb;
  assert data->'fcm'->>'token' like 'fcmToken354:%' and data->'subscription' = 'null'::jsonb and data->>'kind' = 'automation.test', format('fcm %s', data);

  -- The answers are settled as before: 2xx sent, 410 for a push removes the device, an error is retried.
  insert into net._http_response(id, status_code, content)
    select request_id, 200, '{"ok":true}' from public.outbound_jobs where dedupe_key in ('nt354:web');
  insert into net._http_response(id, status_code, content) select request_id, 410, '{}' from public.outbound_jobs where dedupe_key = 'nt354:fcm';
  insert into net._http_response(id, status_code, content) select request_id, 500, 'boom' from public.outbound_jobs where dedupe_key = 'nt354:hook';
  perform private.process_outbound_jobs(50);
  foreach dedupe in array array['nt354:web'] loop
    assert (select state = 'SENT' and sent_at is not null from public.outbound_jobs where dedupe_key = dedupe), format('%s sent', dedupe);
  end loop;
  assert (select last_success_at is not null from public.push_subscriptions where id = web_id), 'web device marked reached';
  assert (select state = 'DEAD' from public.outbound_jobs where dedupe_key = 'nt354:fcm') and not exists (select 1 from public.push_subscriptions where id = fcm_id),
    'a gone app token is removed';
  assert (select state = 'FAILED' and last_error_safe = 'Nơi nhận trả lỗi HTTP 500' from public.outbound_jobs where dedupe_key = 'nt354:hook'), 'webhook retried';

  -- 5. The manual "Gửi NCC qua Zalo" record keeps its ZALO channel.
  assert (select pg_get_constraintdef(c.oid) like '%ZALO%' from pg_constraint c where c.conname = 'purchase_order_dispatches_channel_check'),
    'manual Zalo dispatch kept';
end
$test$;
