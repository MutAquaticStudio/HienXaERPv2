-- D47 (Owner 02/11/2026): Zalo OA, phase 1 — one-way notifications to the customer's main phone through ZBS Template
-- Message (formerly ZNS): order confirmed, delivered, payment received, daily debt reminder. Every customer receives them
-- unless switched off (staff on the customer profile, or the customer on the portal).
-- * Zalo is one more channel of the existing outbound queue (F5): one outbound_jobs row per message, written in the same
--   transaction as the business event (deferred to commit), sent by pg_net, retried/settled by pg_cron each minute.
--   Zalo answers HTTP 200 with {"error": n}: the body is read, not only the status.
-- * The database holds the connection: OAuth v4 + PKCE started and completed by RPCs, tokens kept in Supabase Vault
--   (hx_zalo_access_token / hx_zalo_refresh_token, rotated here; hx_zalo_app_secret set by the Owner in Vault).
--   The refresh token works once: one refresh at a time (row lock), the new pair is stored in the same transaction as the
--   answer. The app never sees a token. Token calls are synchronous (extension "http"); messages go through pg_net.
-- * Sending mode starts at "development" (Zalo then only delivers to the OA/App admins); the Owner switches Production to
--   "production" when the templates are approved. QA stays in development.
-- * Not in phase 1: the Zalo webhook ("message reached the phone", customer replies). It needs an unauthenticated entry point
--   and is decided with the Owner in phase 2 (like SePay's D42 webhook).
begin;

do $extensions$
begin
  if exists (select 1 from pg_available_extensions where name = 'http') then create extension if not exists http with schema extensions; end if;
end
$extensions$;

-- The queue learns the ZALO channel and keeps the message id Zalo returns.
alter table public.outbound_jobs drop constraint outbound_jobs_channel_check;
alter table public.outbound_jobs add constraint outbound_jobs_channel_check check (channel in ('PUSH', 'TELEGRAM', 'EMAIL', 'WEBHOOK', 'ZALO'));
alter table public.outbound_jobs add column provider_message_id text check (char_length(provider_message_id) <= 100);

-- Customers receive Zalo notifications unless switched off (Owner: on for everyone by default).
alter table public.customers add column zalo_notify boolean not null default true;

-- The one OA connection of the company. Tokens are not here: they live in Vault.
create table private.zalo_connection (
  singleton boolean primary key default true check (singleton),
  app_id text check (app_id ~ '^[0-9]{5,30}$'),
  oa_id text check (char_length(oa_id) <= 40),
  state text not null default 'DISCONNECTED' check (state in ('DISCONNECTED', 'CONNECTED', 'NEEDS_RECONNECT')),
  send_mode text not null default 'development' check (send_mode in ('development', 'production')),
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  oauth_state text,
  oauth_verifier text,
  oauth_redirect_uri text,
  oauth_started_at timestamptz,
  daily_quota integer,
  remaining_quota integer,
  last_error text check (char_length(last_error) <= 300),
  connected_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into private.zalo_connection(singleton) values (true);
revoke all on private.zalo_connection from public, anon, authenticated, service_role;

-- Which approved template each event uses. Parameters are fixed per event (see private.zalo_event_params).
create table public.zalo_templates (
  event_code text primary key check (event_code in ('ORDER_CONFIRMED', 'DELIVERY_DONE', 'PAYMENT_RECEIVED', 'DEBT_REMINDER')),
  template_id text check (template_id ~ '^[0-9]{1,20}$'),
  active boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not active or template_id is not null)
);
insert into public.zalo_templates(event_code) values ('ORDER_CONFIRMED'), ('DELIVERY_DONE'), ('PAYMENT_RECEIVED'), ('DEBT_REMINDER');
alter table public.zalo_templates enable row level security;
revoke all on public.zalo_templates from public, anon, authenticated;
grant select on public.zalo_templates to authenticated;
create policy zalo_templates_select on public.zalo_templates for select to authenticated using ((select private.has_any_permission('roles.manage')));

-- The parameter names each template must declare (in this order), for the settings page and the checks.
create or replace function private.zalo_event_params(event text) returns text[]
language sql immutable set search_path = '' as $$
  select case event
    when 'ORDER_CONFIRMED' then array['order_code', 'order_date', 'total', 'site']
    when 'DELIVERY_DONE' then array['delivery_code', 'site', 'delivered_at', 'receiver']
    when 'PAYMENT_RECEIVED' then array['amount', 'customer', 'paid_at', 'balance']
    when 'DEBT_REMINDER' then array['customer', 'balance', 'due_date']
  end
$$;

-- 0912 345 678 / +84 912… / 84912… → 84912345678; anything else → null (not sent).
create or replace function private.zalo_phone(value text) returns text
language sql immutable set search_path = '' as $$
  select case
    when digits ~ '^0[35789][0-9]{8}$' then '84' || substr(digits, 2)
    when digits ~ '^84[35789][0-9]{8}$' then digits
  end
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') digits) d
$$;

create or replace function private.zalo_money(amount bigint) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(amount, 'FM999,999,999,999,990'), ',', '.') || ' ₫'
$$;

create or replace function private.zalo_time(value timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(value at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
$$;

-- Vault write (create or replace by name). Missing Vault (local) is an error the callers report.
create or replace function private.zalo_secret_put(secret_name text, secret_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare existing uuid;
begin
  if to_regclass('vault.secrets') is null then raise exception 'zalo_vault_unavailable' using errcode = '55000'; end if;
  execute 'select id from vault.secrets where name = $1 order by created_at desc limit 1' into existing using secret_name;
  if existing is null then execute 'select vault.create_secret($1, $2)' using secret_value, secret_name;
  else execute 'select vault.update_secret($1, $2)' using existing, secret_value; end if;
end $$;

-- One synchronous form POST (OAuth token calls). Kept as its own function so tests can stand in for Zalo.
create or replace function private.zalo_http_form(url text, header_name text, header_value text, form text, out status integer, out content text)
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('extensions.http(extensions.http_request)') is null then raise exception 'zalo_http_unavailable' using errcode = '55000'; end if;
  execute 'select r.status, r.content from extensions.http((''POST'', $1, array[extensions.http_header($2, $3)], ''application/x-www-form-urlencoded'', $4)::extensions.http_request) r'
    into status, content using url, header_name, header_value, form;
end $$;

-- Exchanges a code or a refresh token at Zalo and stores the new pair in Vault, in the caller's transaction.
create or replace function private.zalo_token_call(form text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text := private.automation_secret('hx_zalo_app_secret');
  answer record;
  body jsonb;
begin
  if secret is null then raise exception 'zalo_app_secret_missing' using errcode = '55000'; end if;
  select * into answer from private.zalo_http_form('https://oauth.zaloapp.com/v4/oa/access_token', 'secret_key', secret, form);
  begin body := answer.content::jsonb; exception when others then body := null; end;
  if answer.status <> 200 or body is null or nullif(body->>'access_token', '') is null or nullif(body->>'refresh_token', '') is null then
    raise exception 'zalo_token_refused' using errcode = '55000',
      detail = left(coalesce(body->>'error_name', body->>'message', body->>'error', 'HTTP ' || answer.status), 200);
  end if;
  perform private.zalo_secret_put('hx_zalo_access_token', body->>'access_token');
  perform private.zalo_secret_put('hx_zalo_refresh_token', body->>'refresh_token');
  update private.zalo_connection set state = 'CONNECTED', last_error = null, updated_at = now(),
    access_expires_at = now() + make_interval(secs => coalesce(nullif(body->>'expires_in', '')::integer, 90000)),
    refresh_expires_at = now() + make_interval(secs => coalesce(nullif(body->>'refresh_token_expires_in', '')::integer, 7776000));
end $$;

create or replace function private.zalo_urlencode(value text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  bytes bytea := convert_to(coalesce(value, ''), 'UTF8');
  result text := '';
  b integer;
begin
  for i in 0 .. length(bytes) - 1 loop
    b := get_byte(bytes, i);
    if (b between 48 and 57) or (b between 65 and 90) or (b between 97 and 122) or b in (45, 46, 95, 126) then result := result || chr(b);
    else result := result || '%' || upper(lpad(to_hex(b), 2, '0')); end if;
  end loop;
  return result;
end $$;

create or replace function private.zalo_base64url(value bytea) returns text
language sql immutable set search_path = '' as $$
  select translate(rtrim(encode(value, 'base64'), '='), '+/' || chr(10), '-_')
$$;

-- Tell the owners (every active branch, roles.manage) about a connection problem, once per kind and day.
create or replace function private.zalo_alert(kind text, title text, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare branch record;
begin
  for branch in select b.id from public.branches b where b.active order by b.id loop
    perform private.notify(branch.id, 'zalo.problem', 'branch', branch.id, title, body, '/admin/settings/zalo', 'roles.manage', null,
      'zalo.problem:' || kind || ':' || (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  end loop;
end $$;

-- "Kết nối Zalo OA" (owner): PKCE verifier + state kept here, the browser goes to Zalo's permission page.
create or replace function public.start_zalo_oauth(target_app_id text, redirect_uri text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  verifier text := private.zalo_base64url(extensions.gen_random_bytes(32));
  state_token text := private.zalo_base64url(extensions.gen_random_bytes(18));
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(target_app_id, '') !~ '^[0-9]{5,30}$' then raise exception 'zalo_app_id_invalid' using errcode = '22023'; end if;
  if coalesce(redirect_uri, '') !~ '^https://[^ ]+/api/zalo/oauth/callback$' then raise exception 'zalo_redirect_invalid' using errcode = '22023'; end if;
  update private.zalo_connection set app_id = target_app_id, oauth_state = state_token, oauth_verifier = verifier, oauth_redirect_uri = redirect_uri,
    oauth_started_at = now(), updated_at = now();
  return 'https://oauth.zaloapp.com/v4/oa/permission?app_id=' || target_app_id || '&redirect_uri=' || private.zalo_urlencode(redirect_uri)
    || '&code_challenge=' || private.zalo_base64url(extensions.digest(verifier, 'sha256')) || '&state=' || state_token;
end $$;

-- Zalo sent the owner back with a one-time code: exchange it (10 minutes, once) and store the tokens.
create or replace function public.complete_zalo_oauth(code text, state_token text, target_oa_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare connection private.zalo_connection%rowtype;
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into connection from private.zalo_connection for update;
  if connection.oauth_state is null or state_token is distinct from connection.oauth_state or connection.oauth_started_at < now() - interval '15 minutes' then
    raise exception 'zalo_oauth_state_invalid' using errcode = '22023';
  end if;
  if coalesce(code, '') = '' then raise exception 'zalo_oauth_code_missing' using errcode = '22023'; end if;
  perform private.zalo_token_call('code=' || private.zalo_urlencode(code) || '&app_id=' || connection.app_id
    || '&grant_type=authorization_code&code_verifier=' || private.zalo_urlencode(connection.oauth_verifier));
  update private.zalo_connection set oa_id = left(nullif(trim(target_oa_id), ''), 40), oauth_state = null, oauth_verifier = null,
    connected_at = now(), connected_by = auth.uid(), updated_at = now();
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  select auth.uid(), b.id, 'zalo.connected', 'branch', b.id, extensions.gen_random_uuid(), array['zalo_connection'], 'Kết nối Zalo OA'
  from public.branches b where b.active;
  return 'CONNECTED';
end $$;

-- pg_cron every 30 minutes: renew the access token when less than 6 hours remain. One refresh at a time.
create or replace function private.zalo_refresh_tokens() returns text
language plpgsql security definer set search_path = '' as $$
declare
  connection private.zalo_connection%rowtype;
  refresh text;
begin
  select * into connection from private.zalo_connection for update skip locked;
  if connection.singleton is null or connection.state <> 'CONNECTED' then return 'SKIPPED'; end if;
  if connection.access_expires_at is not null and connection.access_expires_at > now() + interval '6 hours' then return 'FRESH'; end if;
  refresh := private.automation_secret('hx_zalo_refresh_token');
  if refresh is null then
    update private.zalo_connection set state = 'NEEDS_RECONNECT', last_error = 'Không còn refresh token', updated_at = now();
    perform private.zalo_alert('reconnect', 'Zalo OA cần kết nối lại', 'Mở Cài đặt → Zalo OA và bấm "Kết nối Zalo OA".');
    return 'NEEDS_RECONNECT';
  end if;
  begin
    perform private.zalo_token_call('refresh_token=' || private.zalo_urlencode(refresh) || '&app_id=' || connection.app_id || '&grant_type=refresh_token');
    return 'REFRESHED';
  exception when others then
    if sqlerrm = 'zalo_token_refused' then
      update private.zalo_connection set state = 'NEEDS_RECONNECT', last_error = 'Zalo từ chối làm mới token', updated_at = now();
      perform private.zalo_alert('reconnect', 'Zalo OA cần kết nối lại', 'Zalo không làm mới được token. Mở Cài đặt → Zalo OA và bấm "Kết nối Zalo OA".');
      return 'NEEDS_RECONNECT';
    end if;
    update private.zalo_connection set last_error = left('Chưa làm mới được token: ' || sqlerrm, 300), updated_at = now();
    return 'RETRY';
  end;
end $$;

-- One message for a business event, to the customer's main phone, in the caller's transaction. Silently nothing when the
-- OA is not connected, the event's template is off, the customer switched Zalo off or has no usable mobile number.
create or replace function private.enqueue_zalo(target_branch_id uuid, event text, target_customer_id uuid, data jsonb, dedupe text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  template public.zalo_templates%rowtype;
  customer public.customers%rowtype;
  phone text;
  job uuid := extensions.gen_random_uuid();
  created uuid;
begin
  if (select state from private.zalo_connection) = 'DISCONNECTED' then return null; end if;
  select * into template from public.zalo_templates t where t.event_code = event and t.active;
  if template.event_code is null then return null; end if;
  select * into customer from public.customers c where c.id = target_customer_id;
  if customer.id is null or not customer.active or not customer.zalo_notify then return null; end if;
  phone := private.zalo_phone(customer.phone);
  if phone is null then return null; end if;
  insert into public.outbound_jobs(id, branch_id, channel, target, payload, dedupe_key)
  values (job, target_branch_id, 'ZALO', phone, jsonb_build_object('event', event, 'template_id', template.template_id,
      'template_data', data, 'tracking_id', job::text, 'customer_id', customer.id), left('zalo:' || dedupe, 200))
  on conflict (dedupe_key) do nothing returning id into created;
  if created is not null then perform private.dispatch_outbound_job(created); end if;
  return created;
end $$;

-- The queue's sender, now with ZALO (ZBS Template Message by phone). Other channels unchanged.
create or replace function private.dispatch_outbound_job(target_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  job public.outbound_jobs%rowtype;
  url text;
  body jsonb;
  headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
  secret text;
  app text;
  data text;
  sub public.push_subscriptions%rowtype;
  request bigint;
  message text;
  connection private.zalo_connection%rowtype;
begin
  select * into job from public.outbound_jobs j where j.id = target_job_id and j.state in ('PENDING', 'FAILED') for update skip locked;
  if job.id is null then return; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    update public.outbound_jobs set last_error_safe = 'Chưa bật pg_net trên cơ sở dữ liệu', next_run_at = now() + interval '15 minutes' where id = job.id;
    return;
  end if;
  app := rtrim(private.automation_secret('hx_app_url'), '/');
  message := job.payload->>'title' || coalesce(E'\n' || nullif(job.payload->>'body', ''), '')
    || case when app is not null and job.payload->>'link' is not null then E'\n' || app || (job.payload->>'link') else '' end;
  if job.channel = 'ZALO' then
    select * into connection from private.zalo_connection;
    secret := private.automation_secret('hx_zalo_access_token');
    if connection.state <> 'CONNECTED' or secret is null then perform private.outbound_retry(job, 'Zalo OA chưa kết nối hoặc cần kết nối lại'); return; end if;
    if connection.access_expires_at is not null and connection.access_expires_at < now() + interval '5 minutes' then
      perform private.outbound_retry(job, 'Đang chờ làm mới token Zalo'); return;
    end if;
    url := 'https://business.openapi.zalo.me/message/template';
    headers := headers || jsonb_build_object('access_token', secret);
    body := jsonb_build_object('phone', job.target, 'template_id', job.payload->>'template_id', 'template_data', job.payload->'template_data',
      'tracking_id', job.payload->>'tracking_id')
      || case when connection.send_mode = 'development' then '{"mode": "development"}'::jsonb else '{}'::jsonb end;
  elsif job.channel = 'TELEGRAM' then
    secret := private.automation_secret('hx_telegram_bot_token');
    if secret is null then perform private.outbound_retry(job, 'Chưa cấu hình Telegram (hx_telegram_bot_token)'); return; end if;
    url := 'https://api.telegram.org/bot' || secret || '/sendMessage';
    body := jsonb_build_object('chat_id', job.target, 'text', left(message, 4000), 'disable_web_page_preview', true);
  elsif job.channel = 'WEBHOOK' then
    url := job.target;
    data := (job.payload || jsonb_build_object('delivery_id', job.id, 'sent_at', now()))::text;
    secret := private.automation_secret('hx_webhook_secret');
    body := jsonb_build_object('data', data, 'signature', case when secret is null then null else encode(extensions.hmac(data, secret, 'sha256'), 'hex') end);
  else
    secret := private.automation_secret('hx_automation_secret');
    if secret is null or app is null then perform private.outbound_retry(job, 'Chưa cấu hình gửi qua ứng dụng (hx_app_url, hx_automation_secret)'); return; end if;
    if job.channel = 'PUSH' then
      select * into sub from public.push_subscriptions s where s.id::text = job.target;
      if sub.id is null then update public.outbound_jobs set state = 'DEAD', last_error_safe = 'Thiết bị đã tắt nhận thông báo' where id = job.id; return; end if;
    end if;
    url := app || '/api/automation/deliver';
    data := jsonb_build_object('job_id', job.id, 'channel', job.channel, 'sent_at', now(),
      'title', job.payload->>'title', 'body', job.payload->>'body', 'link', case when job.payload->>'link' is null then null else app || (job.payload->>'link') end,
      'to', case when job.channel = 'EMAIL' then job.target end,
      'subscription', case when job.channel = 'PUSH' then jsonb_build_object('endpoint', sub.endpoint, 'keys', jsonb_build_object('p256dh', sub.p256dh, 'auth', sub.auth_secret)) end)::text;
    body := jsonb_build_object('data', data, 'signature', encode(extensions.hmac(data, secret, 'sha256'), 'hex'));
  end if;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 8000)' into request using url, body, headers;
  update public.outbound_jobs set state = 'SENDING', attempt = attempt + 1, request_id = request, lease_until = now() + interval '3 minutes', last_error_safe = null
  where id = job.id;
end
$function$;

-- What Zalo answered for one message (HTTP 200 + {"error": n, "data": {"msg_id", "quota"}}).
create or replace function private.settle_zalo_job(job public.outbound_jobs, status integer, content text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  answer jsonb;
  code integer;
begin
  begin answer := content::jsonb; exception when others then answer := null; end;
  code := case when answer ? 'error' and (answer->>'error') ~ '^-?[0-9]+$' then (answer->>'error')::integer end;
  if status is null or status not between 200 and 299 or code is null then
    perform private.outbound_retry(job, case when status is null then 'Lỗi kết nối khi gửi Zalo' else 'Zalo trả lỗi HTTP ' || status end);
  elsif code = 0 then
    update public.outbound_jobs set state = 'SENT', sent_at = now(), request_id = null, lease_until = null,
      provider_message_id = left(answer->'data'->>'msg_id', 100) where id = job.id;
    if answer->'data'->'quota' is not null then
      update private.zalo_connection set daily_quota = nullif(answer->'data'->'quota'->>'dailyQuota', '')::integer,
        remaining_quota = nullif(answer->'data'->'quota'->>'remainingQuota', '')::integer, updated_at = now();
    end if;
  elsif code = -124 then
    update private.zalo_connection set access_expires_at = now(), updated_at = now();
    perform private.outbound_retry(job, 'Token Zalo hết hạn, đang làm mới');
  elsif code in (-118, -108) then
    update public.outbound_jobs set state = 'DEAD', request_id = null, lease_until = null,
      last_error_safe = case when code = -118 then 'Số điện thoại không dùng Zalo' else 'Số điện thoại không hợp lệ' end where id = job.id;
  elsif code in (-131, -109, -1122, -133) then
    update public.outbound_jobs set state = 'DEAD', request_id = null, lease_until = null,
      last_error_safe = 'Mẫu tin chưa được Zalo duyệt hoặc sai tham số (mã ' || code || ')' where id = job.id;
    perform private.zalo_alert('template', 'Mẫu tin Zalo bị từ chối', 'Kiểm tra mẫu ' || coalesce(job.payload->>'event', '') || ' trong Cài đặt → Zalo OA.');
  elsif code in (-115, -120) then
    perform private.outbound_retry(job, case when code = -115 then 'Ví ZBS hết tiền' else 'OA chưa có gói dịch vụ' end);
    perform private.zalo_alert('wallet' || code, case when code = -115 then 'Ví Zalo (ZBS) hết tiền' else 'Zalo OA chưa có gói dịch vụ' end,
      'Tin Zalo đang chờ gửi. Nạp tiền / mua gói rồi hệ thống tự gửi lại.');
  else
    perform private.outbound_retry(job, 'Zalo báo lỗi ' || code);
  end if;
end $$;

-- The queue's settler, now reading Zalo's answer body. Other channels unchanged.
create or replace function private.process_outbound_jobs(batch_size integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  job public.outbound_jobs%rowtype;
  status integer;
  failure text;
  answer text;
  rows integer;
  settled integer := 0;
  dispatched integer := 0;
begin
  if to_regclass('net._http_response') is not null then
    for job in select * from public.outbound_jobs j where j.state = 'SENDING' order by j.lease_until limit 500 for update skip locked loop
      execute 'select r.status_code, r.error_msg, to_jsonb(r)->>''content'' from net._http_response r where r.id = $1' into status, failure, answer using job.request_id;
      get diagnostics rows = row_count;
      if rows = 0 then
        if job.lease_until < now() then perform private.outbound_retry(job, 'Không nhận được phản hồi'); settled := settled + 1; end if;
        continue;
      end if;
      settled := settled + 1;
      if job.channel = 'ZALO' then
        perform private.settle_zalo_job(job, status, answer);
      elsif status between 200 and 299 then
        update public.outbound_jobs set state = 'SENT', sent_at = now(), request_id = null, lease_until = null where id = job.id;
        if job.channel = 'PUSH' then update public.push_subscriptions set last_success_at = now() where id::text = job.target; end if;
      elsif job.channel = 'PUSH' and status in (404, 410) then
        update public.outbound_jobs set state = 'DEAD', last_error_safe = 'Thiết bị đã tắt nhận thông báo', request_id = null where id = job.id;
        delete from public.push_subscriptions where id::text = job.target;
      else
        perform private.outbound_retry(job, case when status is null then 'Lỗi kết nối khi gửi' else 'Nơi nhận trả lỗi HTTP ' || status end);
      end if;
    end loop;
  end if;
  for job in select * from public.outbound_jobs j where j.state in ('PENDING', 'FAILED') and j.next_run_at <= now()
    order by j.next_run_at limit greatest(1, least(coalesce(batch_size, 50), 500)) loop
    perform private.dispatch_outbound_job(job.id);
    dispatched := dispatched + 1;
  end loop;
  delete from public.outbound_jobs j where j.state in ('SENT', 'DEAD') and j.created_at < now() - interval '60 days';
  return jsonb_build_object('settled', settled, 'dispatched', dispatched);
end
$function$;

-- Events. Deferred to commit, so totals, allocations and balances are final when the message is written.
create or replace function private.zalo_on_order_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare total bigint;
begin
  if new.commercial_state <> 'CONFIRMED' or old.commercial_state = 'CONFIRMED' then return null; end if;
  select coalesce(sum(l.line_total_vnd), 0) into total from public.sales_order_lines l where l.sales_order_id = new.id;
  perform private.enqueue_zalo(new.branch_id, 'ORDER_CONFIRMED', new.customer_id, jsonb_build_object(
    'order_code', new.order_number, 'order_date', to_char(coalesce(new.confirmed_at, now()) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
    'total', private.zalo_money(total), 'site', left(coalesce(new.site_name_snapshot, new.delivery_address_snapshot, ''), 100)),
    'ORDER_CONFIRMED:' || new.id);
  return null;
end $$;
create constraint trigger sales_orders_zalo_confirmed after update of commercial_state on public.sales_orders
  deferrable initially deferred for each row execute function private.zalo_on_order_confirmed();

create or replace function private.zalo_on_delivery_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
declare receiver text;
begin
  if new.execution_state <> 'VERIFIED' or old.execution_state = 'VERIFIED' or new.result_kind = 'FAILED' then return null; end if;
  select r.receiver_name into receiver from public.delivery_results r where r.delivery_id = new.id;
  perform private.enqueue_zalo(new.branch_id, 'DELIVERY_DONE', new.customer_id, jsonb_build_object(
    'delivery_code', new.delivery_number, 'site', left(coalesce(new.site_name_snapshot, new.delivery_address_snapshot, ''), 100),
    'delivered_at', private.zalo_time(coalesce(new.verified_at, now())),
    'receiver', left(coalesce(nullif(trim(receiver), ''), new.receiver_name_snapshot, 'Không ghi'), 60)),
    'DELIVERY_DONE:' || new.id);
  return null;
end $$;
create constraint trigger deliveries_zalo_verified after update of execution_state on public.deliveries
  deferrable initially deferred for each row execute function private.zalo_on_delivery_verified();

create or replace function private.zalo_on_payment_received() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  customer public.customers%rowtype;
  balance bigint;
begin
  if new.direction <> 'RECEIPT' or new.customer_id is null or new.reversal_of_payment_id is not null then return null; end if;
  if exists (select 1 from public.payments v where v.reversal_of_payment_id = new.id) then return null; end if;
  select * into customer from public.customers c where c.id = new.customer_id;
  select coalesce(sum(private.current_receivable_outstanding(o.id)), 0) into balance from public.receivable_obligations o where o.customer_id = new.customer_id;
  perform private.enqueue_zalo(new.branch_id, 'PAYMENT_RECEIVED', new.customer_id, jsonb_build_object(
    'amount', private.zalo_money(new.amount_vnd), 'customer', left(customer.display_name, 100),
    'paid_at', private.zalo_time(new.effective_at), 'balance', private.zalo_money(balance)),
    'PAYMENT_RECEIVED:' || new.id);
  return null;
end $$;
create constraint trigger payments_zalo_received after insert on public.payments
  deferrable initially deferred for each row execute function private.zalo_on_payment_received();

-- pg_cron 01:30 UTC = 08:30 in Vietnam: customers with debts due today or overdue get one reminder a day (Owner: daily,
-- inside 8:00–20:00).
create or replace function private.zalo_debt_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  row record;
  day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  made integer := 0;
begin
  for row in
    select o.branch_id, o.customer_id, c.display_name, min(o.due_date) due_date, sum(private.current_receivable_outstanding(o.id))::bigint owed
    from public.receivable_obligations o join public.customers c on c.id = o.customer_id
    where o.due_date <= day and c.active and c.zalo_notify
    group by o.branch_id, o.customer_id, c.display_name
    having sum(private.current_receivable_outstanding(o.id)) > 0
  loop
    if private.enqueue_zalo(row.branch_id, 'DEBT_REMINDER', row.customer_id, jsonb_build_object(
        'customer', left(row.display_name, 100), 'balance', private.zalo_money(row.owed), 'due_date', to_char(row.due_date, 'DD/MM/YYYY')),
        'DEBT_REMINDER:' || row.customer_id || ':' || day) is not null then
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;

-- Settings (owner, roles.manage): status, template mapping, sending mode, test message, customer opt-out.
create or replace function public.zalo_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare z private.zalo_connection%rowtype;
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into z from private.zalo_connection;
  return jsonb_build_object('state', z.state, 'app_id', z.app_id, 'oa_id', z.oa_id, 'send_mode', z.send_mode,
    'access_expires_at', z.access_expires_at, 'refresh_expires_at', z.refresh_expires_at, 'connected_at', z.connected_at,
    'daily_quota', z.daily_quota, 'remaining_quota', z.remaining_quota, 'last_error', z.last_error,
    'app_secret_set', private.automation_secret('hx_zalo_app_secret') is not null,
    'templates', (select jsonb_agg(jsonb_build_object('event_code', t.event_code, 'template_id', t.template_id, 'active', t.active, 'version', t.version,
        'params', to_jsonb(private.zalo_event_params(t.event_code))) order by array_position(array['ORDER_CONFIRMED', 'DELIVERY_DONE', 'PAYMENT_RECEIVED', 'DEBT_REMINDER'], t.event_code))
      from public.zalo_templates t),
    'last_24h', (select jsonb_build_object('sent', count(*) filter (where j.state = 'SENT'),
        'waiting', count(*) filter (where j.state in ('PENDING', 'SENDING', 'FAILED')), 'dead', count(*) filter (where j.state = 'DEAD'))
      from public.outbound_jobs j where j.channel = 'ZALO' and j.created_at > now() - interval '24 hours'));
end $$;

create or replace function public.set_zalo_template(target_event text, target_template_id text, enabled boolean, expected_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare updated integer;
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(trim(target_template_id), '') is not null and trim(target_template_id) !~ '^[0-9]{1,20}$' then raise exception 'zalo_template_invalid' using errcode = '22023'; end if;
  if enabled and nullif(trim(target_template_id), '') is null then raise exception 'zalo_template_required' using errcode = '22023'; end if;
  update public.zalo_templates set template_id = nullif(trim(target_template_id), ''), active = enabled, version = version + 1, updated_by = auth.uid(), updated_at = now()
  where event_code = target_event and version = expected_version returning version into updated;
  if updated is null then raise exception 'zalo_template_version_conflict' using errcode = 'PT409'; end if;
  return updated;
end $$;

create or replace function public.set_zalo_send_mode(target_mode text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_mode not in ('development', 'production') then raise exception 'zalo_mode_invalid' using errcode = '22023'; end if;
  update private.zalo_connection set send_mode = target_mode, updated_at = now();
  return target_mode;
end $$;

create or replace function public.disconnect_zalo() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.zalo_connection set state = 'DISCONNECTED', access_expires_at = null, oauth_state = null, oauth_verifier = null, updated_at = now();
  return 'DISCONNECTED';
end $$;

-- "Gửi thử": one message with sample values to a phone (in development mode Zalo only delivers to OA/App admins).
create or replace function public.send_zalo_test(target_event text, target_phone text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  phone text := private.zalo_phone(target_phone);
  template public.zalo_templates%rowtype;
  job uuid := extensions.gen_random_uuid();
  branch uuid;
begin
  if auth.uid() is null or not private.has_any_permission('roles.manage') or operation_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if phone is null then raise exception 'zalo_phone_invalid' using errcode = '22023'; end if;
  if (select state from private.zalo_connection) <> 'CONNECTED' then raise exception 'zalo_not_connected' using errcode = '55000'; end if;
  select * into template from public.zalo_templates t where t.event_code = target_event;
  if template.template_id is null then raise exception 'zalo_template_required' using errcode = '22023'; end if;
  select a.branch_id into branch from public.employee_branch_access a join public.employees e on e.id = a.employee_id
  where e.auth_user_id = auth.uid() and a.active order by a.branch_id limit 1;
  insert into public.outbound_jobs(id, branch_id, channel, target, payload, dedupe_key)
  values (job, branch, 'ZALO', phone, jsonb_build_object('event', target_event, 'template_id', template.template_id, 'tracking_id', job::text, 'test', true,
    'template_data', case target_event
      when 'ORDER_CONFIRMED' then jsonb_build_object('order_code', 'SO-2026-000001', 'order_date', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'), 'total', '1.500.000 ₫', 'site', 'Công trình thử')
      when 'DELIVERY_DONE' then jsonb_build_object('delivery_code', 'DL-2026-000001', 'site', 'Công trình thử', 'delivered_at', private.zalo_time(now()), 'receiver', 'Anh Nhận')
      when 'PAYMENT_RECEIVED' then jsonb_build_object('amount', '1.500.000 ₫', 'customer', 'Khách thử', 'paid_at', private.zalo_time(now()), 'balance', '0 ₫')
      else jsonb_build_object('customer', 'Khách thử', 'balance', '1.500.000 ₫', 'due_date', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')) end),
    'zalo-test:' || operation_id)
  on conflict (dedupe_key) do nothing;
  perform private.dispatch_outbound_job(job);
  return (select j.id from public.outbound_jobs j where j.dedupe_key = 'zalo-test:' || operation_id);
end $$;

-- "Nhận thông báo Zalo": staff with customers.manage, or the customer's owner / finance contact on the portal.
create or replace function public.set_customer_zalo_notify(target_customer_id uuid, enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare customer public.customers%rowtype;
begin
  select * into customer from public.customers c where c.id = target_customer_id;
  if auth.uid() is null or customer.id is null or enabled is null
    or not (private.has_permission(customer.branch_id, 'customers.manage') or private.has_customer_membership(customer.id, array['OWNER', 'FINANCE_CONTACT'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.customers set zalo_notify = enabled where id = customer.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), customer.branch_id, 'customer.zalo_notify', 'customer', customer.id, extensions.gen_random_uuid(), array['zalo_notify']);
  return enabled;
end $$;

create or replace function public.customer_zalo_notify(target_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select c.zalo_notify from public.customers c where c.id = target_customer_id
    and (private.has_permission(c.branch_id, 'customers.read') or private.has_customer_membership(c.id, array['OWNER', 'FINANCE_CONTACT']))
$$;

revoke all on function private.zalo_event_params(text), private.zalo_phone(text), private.zalo_money(bigint), private.zalo_time(timestamptz),
  private.zalo_secret_put(text, text), private.zalo_http_form(text, text, text, text), private.zalo_token_call(text), private.zalo_base64url(bytea), private.zalo_urlencode(text),
  private.zalo_alert(text, text, text), private.zalo_refresh_tokens(), private.enqueue_zalo(uuid, text, uuid, jsonb, text),
  private.settle_zalo_job(public.outbound_jobs, integer, text), private.zalo_on_order_confirmed(), private.zalo_on_delivery_verified(),
  private.zalo_on_payment_received(), private.zalo_debt_reminders() from public, anon, authenticated, service_role;
revoke all on function public.start_zalo_oauth(text, text), public.complete_zalo_oauth(text, text, text), public.zalo_status(),
  public.set_zalo_template(text, text, boolean, integer), public.set_zalo_send_mode(text), public.disconnect_zalo(),
  public.send_zalo_test(text, text, uuid), public.set_customer_zalo_notify(uuid, boolean), public.customer_zalo_notify(uuid) from public, anon;
grant execute on function public.start_zalo_oauth(text, text), public.complete_zalo_oauth(text, text, text), public.zalo_status(),
  public.set_zalo_template(text, text, boolean, integer), public.set_zalo_send_mode(text), public.disconnect_zalo(),
  public.send_zalo_test(text, text, uuid), public.set_customer_zalo_notify(uuid, boolean), public.customer_zalo_notify(uuid) to authenticated;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hx-zalo-refresh', '*/30 * * * *', 'select private.zalo_refresh_tokens()');
    perform cron.schedule('hx-zalo-debt-reminder', '30 1 * * *', 'select private.zalo_debt_reminders()');
  end if;
end
$schedule$;

notify pgrst, 'reload schema';
commit;
