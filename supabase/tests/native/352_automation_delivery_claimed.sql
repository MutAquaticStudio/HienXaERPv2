-- Owner 16/11: "thêm quy tắc push cho thợ đã nhận phiếu". A worker claiming a delivery (D79 `delivery.claimed`) can drive an
-- automation rule: the PUSH rule reaches the devices of the people who dispatch (delivery.assign), never a login without it,
-- Telegram works for the same event, and an unknown event is still refused. pg_net and Vault are stubbed as in 215 / 350.
create schema if not exists net;
create table net._http_response(id bigint primary key, status_code integer, error_msg text, content text, created timestamptz not null default now());
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz not null default now());
insert into vault.decrypted_secrets(name, decrypted_secret) values
  ('hx_telegram_bot_token', 'TESTTOKEN'), ('hx_app_url', 'https://app.example.test/'), ('hx_automation_secret', 'k1');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  office constant uuid := '10000000-0000-4000-8000-000000000001';
  reader constant uuid := '10000000-0000-4000-8000-000000000003';
  delivery constant uuid := '7f352000-0000-4000-8000-000000000001';
  office_device uuid;
  reader_device uuid;
  push_rule uuid;
  chat_rule uuid;
  note uuid;
  data jsonb;
  failed boolean;
begin
  perform pg_temp.act_as(office);
  office_device := public.save_push_subscription('https://push.example.test/o352', repeat('p', 40), repeat('a', 16), 'Chrome');
  perform pg_temp.act_as(reader);
  reader_device := public.save_push_subscription('https://push.example.test/r352', repeat('q', 40), repeat('b', 16), 'Chrome');

  -- The rule is saved from Cài đặt › Quy tắc tự động like any other event.
  perform pg_temp.act_as(office);
  push_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Thợ nhận phiếu giao → báo điều phối', 'event', 'delivery.claimed',
    'channel', 'PUSH'), null, gen_random_uuid());
  chat_rule := public.save_automation_rule(null, branch, jsonb_build_object('name', 'Thợ nhận phiếu → nhóm điều phối', 'event', 'delivery.claimed',
    'channel', 'TELEGRAM', 'target', '-1001234567890'), null, gen_random_uuid());
  assert (select event = 'delivery.claimed' and active and channel = 'PUSH' from public.automation_rules where id = push_rule), 'rule saved';

  -- The notification D79 writes when a worker claims a delivery (claim_delivery).
  perform pg_temp.act_as_admin();
  note := private.notify(branch, 'delivery.claimed', 'delivery', delivery, 'Thợ thử đã nhận NT-PG-352',
    'XE352 · 08:00 17/11 · Công trình 352', '/admin/deliveries/' || delivery, 'delivery.assign', null, 'nt352:claimed');
  assert (select array_agg(target order by target) from public.outbound_jobs where rule_id = push_rule and notification_id = note and channel = 'PUSH')
    = array[office_device::text], 'push reaches the dispatcher only, never the read-only login';
  assert not exists (select 1 from public.outbound_jobs where notification_id = note and target = reader_device::text), 'no job for the reader';
  select (s.body->>'data')::jsonb into data from public.outbound_jobs j join net.sent s on s.id = j.request_id
    where j.rule_id = push_rule and j.notification_id = note;
  assert data->>'kind' = 'delivery.claimed' and data->>'title' = 'Thợ thử đã nhận NT-PG-352' and data->>'link' = 'https://app.example.test/admin/deliveries/' || delivery,
    format('push payload %s', data);
  assert (select count(*) from public.outbound_jobs where rule_id = chat_rule and notification_id = note and channel = 'TELEGRAM') = 1, 'telegram once';

  -- The same notification again (replay of the same claim) does not push twice.
  perform private.notify(branch, 'delivery.claimed', 'delivery', delivery, 'Thợ thử đã nhận NT-PG-352',
    'XE352 · 08:00 17/11 · Công trình 352', '/admin/deliveries/' || delivery, 'delivery.assign', null, 'nt352:claimed');
  assert (select count(*) from public.outbound_jobs where rule_id = push_rule) = 1, 'no double push on replay';

  -- Events outside the list are still refused.
  failed := false;
  begin
    insert into public.automation_rules(branch_id, name, event, channel) values (branch, 'Sự kiện lạ', 'delivery.unknown', 'PUSH');
  exception when check_violation then failed := true;
  end;
  assert failed, 'unknown event refused';
end
$test$;
