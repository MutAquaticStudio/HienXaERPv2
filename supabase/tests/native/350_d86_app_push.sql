-- D86: the Android app's Firebase token is a device in push_subscriptions (kind FCM). Saved for the signed-in login only, taken
-- away from another login (never shared), deleted on sign-out, invisible to others; every push path reaches it, the queue hands
-- the token (not Web Push keys) to the app route, and a token Firebase no longer knows (410) removes the device.
-- pg_net and Vault are stubbed here, as in 215_automation.
create schema if not exists net;
create table net._http_response(id bigint primary key, status_code integer, error_msg text, content text, created timestamptz not null default now());
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz not null default now());
insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_app_url', 'https://app.example.test/'), ('hx_automation_secret', 'k1');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  office constant uuid := '10000000-0000-4000-8000-000000000001';
  reader constant uuid := '10000000-0000-4000-8000-000000000003';
  reader_employee constant uuid := '30000000-0000-4000-8000-000000000003';
  phone constant text := 'fcmTokenA1:APA91b' || repeat('x', 60);
  other_phone constant text := 'fcmTokenB2:APA91b' || repeat('y', 60);
  first_id uuid;
  again uuid;
  moved uuid;
  web_id uuid;
  rule uuid;
  job public.outbound_jobs%rowtype;
  sent record;
  data jsonb;
  note uuid;
  failed boolean;
begin
  -- 1. Saved for the signed-in login, once per phone; saving again keeps the same device.
  perform pg_temp.act_as(office);
  first_id := public.save_app_push_token(phone, 'ANDROID', 'Mozilla/5.0 (Linux; Android 14; wv) HienXaAndroid/2.3.0');
  again := public.save_app_push_token(phone, 'ANDROID', 'Mozilla/5.0 (Linux; Android 14; wv) HienXaAndroid/2.3.0');
  assert first_id = again, 'same phone, same device';
  assert (select kind = 'FCM' and platform = 'ANDROID' and endpoint is null and p256dh is null and auth_secret is null and auth_user_id = office
    from public.push_subscriptions where id = first_id), 'an app device';
  assert (select count(*) from public.push_subscriptions where token = phone) = 1, 'the owner sees it';

  -- Bad input: wrong platform, a token with spaces or too short.
  foreach data in array array['["IOS", "fcmTokenA1:APA91bxxxxxxxxxxxxxxxxxxxxxxxx"]'::jsonb, '["ANDROID", "has spaces in it, not a token at all"]'::jsonb,
    '["ANDROID", "short"]'::jsonb] loop
    failed := false;
    begin perform public.save_app_push_token(data->>1, data->>0, null); exception when invalid_parameter_value then failed := true; end;
    assert failed, format('rejected %s', data);
  end loop;

  -- 2. Another login cannot read or delete it.
  perform pg_temp.act_as(reader);
  assert (select count(*) from public.push_subscriptions) = 0, 'others see nothing';
  perform public.delete_app_push_token(phone);
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.push_subscriptions where id = first_id and auth_user_id = office), 'not deleted by another login';

  -- 3. The phone signed in by another login: the token moves to that login as a new device (nothing queued follows it).
  perform pg_temp.act_as_admin();
  delete from vault.decrypted_secrets where name = 'hx_automation_secret';
  perform private.enqueue_outbound_job(branch, null, null, 'PUSH', first_id::text, '{"kind": "automation.test", "title": "Tin của văn phòng"}'::jsonb,
    'nt350:queued');
  assert (select state = 'FAILED' from public.outbound_jobs where dedupe_key = 'nt350:queued'), 'still waiting to be sent';
  perform pg_temp.act_as(reader);
  moved := public.save_app_push_token(phone, 'ANDROID', 'Máy chung');
  perform pg_temp.act_as_admin();
  assert moved <> first_id and not exists (select 1 from public.push_subscriptions where id = first_id), 'taken away from the first login';
  assert (select count(*) from public.push_subscriptions where token = phone) = 1
    and (select auth_user_id = reader and user_agent = 'Máy chung' from public.push_subscriptions where id = moved), 'one owner only';
  insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_automation_secret', 'k1');
  update public.outbound_jobs set next_run_at = now() - interval '1 second' where dedupe_key = 'nt350:queued';
  perform private.process_outbound_jobs(50);
  assert (select state = 'DEAD' from public.outbound_jobs where dedupe_key = 'nt350:queued'), 'the first login''s push never reaches the new owner';
  perform pg_temp.act_as(office);
  assert (select count(*) from public.push_subscriptions) = 0, 'the first login has no device left';

  -- 4. Every push path reaches the app: the D80 built-in worker push and a PUSH rule. The app route gets the token, kind and id.
  perform pg_temp.act_as(reader);
  web_id := public.save_push_subscription('https://push.example.test/r1', repeat('p', 40), repeat('a', 16), 'Chrome');
  perform pg_temp.act_as_admin();
  note := private.notify(branch, 'work.assigned', 'work_item', gen_random_uuid(), 'Việc mới: giao 20 bao', 'Công trình 350', '/work/jobs/350', 'work.read',
    reader_employee, 'nt350:work');
  assert (select count(*) from public.outbound_jobs where notification_id = note and channel = 'PUSH') = 2, 'both devices of the worker';
  select * into job from public.outbound_jobs where notification_id = note and target = moved::text;
  select * into sent from net.sent where id = job.request_id;
  data := (sent.body->>'data')::jsonb;
  assert job.state = 'SENDING' and sent.url = 'https://app.example.test/api/automation/deliver' and data->>'channel' = 'PUSH'
    and data->'fcm'->>'token' = phone and data->'subscription' = 'null'::jsonb and data->>'kind' = 'work.assigned' and data->>'id' = note::text
    and data->>'link' = 'https://app.example.test/work/jobs/350' and data->>'title' = 'Việc mới: giao 20 bao'
    and sent.body->>'signature' = encode(extensions.hmac(sent.body->>'data', 'k1', 'sha256'), 'hex'), format('fcm hand-over %s', data);
  select * into sent from net.sent where id = (select request_id from public.outbound_jobs where notification_id = note and target = web_id::text);
  data := (sent.body->>'data')::jsonb;
  assert data->'subscription'->>'endpoint' = 'https://push.example.test/r1' and data->'fcm' = 'null'::jsonb, format('web push unchanged %s', data);

  perform pg_temp.act_as(office);
  perform public.save_app_push_token(other_phone, 'ANDROID', null);
  perform pg_temp.act_as_admin();
  insert into public.automation_rules(id, branch_id, name, event, channel) values
    ('7f350000-0000-4000-8000-0000000000a1', branch, 'Đơn khách mới', 'order.portal_submitted', 'PUSH')
  returning id into rule;
  perform private.notify(branch, 'order.portal_submitted', 'sales_order', gen_random_uuid(), 'Đơn mới từ khách', null, '/admin/orders', 'orders.read',
    null, 'nt350:order');
  assert (select array_agg(s.token order by s.token) from public.outbound_jobs j join public.push_subscriptions s on s.id::text = j.target
    where j.rule_id = rule and s.kind = 'FCM') = array[phone, other_phone], 'the rule reaches the app phones of everyone allowed';

  -- 5. What the app route answers: 410 (a token Firebase no longer knows) removes the device, a missing FIREBASE_SERVICE_ACCOUNT
  -- waits with a readable reason, 200 is sent.
  select * into job from public.outbound_jobs where rule_id = rule and target = (select id::text from public.push_subscriptions where token = other_phone);
  insert into net._http_response(id, status_code, content) values (job.request_id, 410, '{"error":"subscription_gone"}');
  insert into net._http_response(id, status_code, content)
    select request_id, 503, '{"error":"fcm_not_configured"}' from public.outbound_jobs where rule_id = rule and target = moved::text;
  insert into net._http_response(id, status_code, content)
    select request_id, 200, '{"ok":true}' from public.outbound_jobs where notification_id = note and target = moved::text;
  perform private.process_outbound_jobs(50);
  assert (select state = 'DEAD' from public.outbound_jobs where id = job.id) and not exists (select 1 from public.push_subscriptions where token = other_phone),
    'a token Firebase no longer knows is removed';
  assert (select state = 'FAILED' and attempt = 1 and last_error_safe = 'Chưa cấu hình Firebase cho app Android (FIREBASE_SERVICE_ACCOUNT)'
    from public.outbound_jobs where rule_id = rule and target = moved::text), 'waits with the reason';
  assert (select last_success_at is not null from public.push_subscriptions where id = moved), 'sent';

  -- 5b. A 404 from the route itself (missing deployment, wrong hx_app_url) is retried; it never deletes the device.
  select * into job from public.outbound_jobs where rule_id = rule and target = web_id::text;
  assert job.id is not null and job.request_id is not null, 'the rule also reached the web subscription';
  insert into net._http_response(id, status_code, content) values (job.request_id, 404, 'Not Found');
  perform private.process_outbound_jobs(50);
  assert exists (select 1 from public.push_subscriptions where id = web_id), 'a 404 from the route keeps the device';
  assert (select state from public.outbound_jobs where id = job.id) = 'FAILED', 'and retries';

  -- 6. Signing out of the app deletes the phone's token (only the owner's, only the app's).
  perform pg_temp.act_as(reader);
  perform public.delete_app_push_token(phone);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.push_subscriptions where token = phone) and exists (select 1 from public.push_subscriptions where id = web_id),
    'only the app token goes';

  -- 7. Not for anonymous callers.
  set local role anon;
  failed := false; begin perform public.save_app_push_token(phone, 'ANDROID', null); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon save';
  failed := false; begin perform public.delete_app_push_token(phone); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon delete';
  reset role;
end
$test$;
