-- D86 (Owner 16/11/2026: "Ok tôi đã có firebase rồi, hướng dẫn tôi setup push notify nhé"): push notifications inside the
-- Android app "Hiền Xa" (2.3.0+) through Firebase Cloud Messaging.
-- * push_subscriptions now holds two kinds of device: WEB (a browser's Web Push address, as before) and FCM (the app's
--   Firebase token on one phone). Every path that pushes already loops over push_subscriptions (automation rules, the D80/D85
--   built-in worker push, D83 announcements, "Gửi thử"), so the app's phones are reached without touching those paths.
-- * A token belongs to one login only: saved by another login (the phone was signed in by someone else) it is taken away from
--   the first one — a new row, so a push still queued for the first login (it targets the old row) is dropped, never shown to
--   the next person. Signing out of the app deletes the phone's token (delete_app_push_token, called by /auth/logout).
-- * The outbound queue hands an FCM row to the app route /api/automation/deliver with its token instead of the Web Push keys,
--   plus the notification's kind and id for the app. A token Firebase no longer knows comes back as 410, which already removes
--   the device. The route's "not configured" answers (FIREBASE_SERVICE_ACCOUNT missing…) are kept as a readable reason on the
--   job (Cài đặt → Quy tắc tự động), with the usual retries.

begin;

-- 1. Devices: WEB (endpoint + keys) or FCM (token, platform ANDROID).
alter table public.push_subscriptions
  add column kind text not null default 'WEB',
  add column token text,
  add column platform text;
alter table public.push_subscriptions alter column endpoint drop not null, alter column p256dh drop not null, alter column auth_secret drop not null;
alter table public.push_subscriptions add constraint push_subscriptions_kind_check check (
  (kind = 'WEB' and endpoint is not null and p256dh is not null and auth_secret is not null and token is null and platform is null)
  or (kind = 'FCM' and token is not null and platform = 'ANDROID' and endpoint is null and p256dh is null and auth_secret is null));
alter table public.push_subscriptions add constraint push_subscriptions_token_check
  check (token is null or (char_length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:.-]+$'));
alter table public.push_subscriptions add constraint push_subscriptions_token_key unique (token);

-- 2. "Bật thông báo trên máy này" in the app, and the silent registration when the app already may notify.
create or replace function public.save_app_push_token(token text, platform text, user_agent text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare me uuid := (select auth.uid()); saved uuid;
begin
  if me is null or not private.auth_actor_active() then raise exception 'forbidden' using errcode = '42501'; end if;
  if save_app_push_token.platform is distinct from 'ANDROID' then raise exception 'push_subscription_invalid' using errcode = '22023'; end if;
  -- Taken away from another login first: never shared, and nothing queued for that login follows the token to this one.
  delete from public.push_subscriptions s where s.token = save_app_push_token.token and s.auth_user_id <> me;
  insert into public.push_subscriptions(auth_user_id, kind, token, platform, user_agent)
  values (me, 'FCM', save_app_push_token.token, 'ANDROID', left(save_app_push_token.user_agent, 300))
  on conflict on constraint push_subscriptions_token_key do update set auth_user_id = excluded.auth_user_id, user_agent = excluded.user_agent
  returning id into saved;
  return saved;
exception when check_violation or not_null_violation then
  raise exception 'push_subscription_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.save_app_push_token(text, text, text) from public, anon;
grant execute on function public.save_app_push_token(text, text, text) to authenticated;

-- Signing out of the app: this phone stops receiving the login's notifications. Only the caller's own token.
create or replace function public.delete_app_push_token(token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions s
  where s.kind = 'FCM' and s.token = delete_app_push_token.token and s.auth_user_id = (select auth.uid())
$$;
revoke all on function public.delete_app_push_token(text) from public, anon;
grant execute on function public.delete_app_push_token(text) to authenticated;

-- 3. What the app route answered when it could not send (its JSON "error"), as the reason shown on the job.
create or replace function private.app_delivery_failure(status integer, content text) returns text
language plpgsql immutable set search_path = '' as $$
declare code text;
begin
  begin code := content::jsonb->>'error'; exception when others then code := null; end;
  return case code
    when 'fcm_not_configured' then 'Chưa cấu hình Firebase cho app Android (FIREBASE_SERVICE_ACCOUNT)'
    when 'fcm_auth_failed' then 'Firebase không nhận khóa FIREBASE_SERVICE_ACCOUNT'
    when 'push_not_configured' then 'Chưa cấu hình khóa VAPID cho thông báo web'
    else case when status is null then 'Lỗi kết nối khi gửi' else 'Nơi nhận trả lỗi HTTP ' || status end
  end;
end $$;
revoke all on function private.app_delivery_failure(integer, text) from public, anon, authenticated, service_role;

-- 4. The queue's sender (D47 version): an FCM device is handed over with its token (no Web Push keys) and the notification's
-- kind and id. Other channels unchanged.
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
      'subscription', case when job.channel = 'PUSH' and sub.kind = 'WEB' then
        jsonb_build_object('endpoint', sub.endpoint, 'keys', jsonb_build_object('p256dh', sub.p256dh, 'auth', sub.auth_secret)) end,
      'fcm', case when job.channel = 'PUSH' and sub.kind = 'FCM' then jsonb_build_object('token', sub.token) end,
      'kind', case when job.channel = 'PUSH' then left(job.payload->>'kind', 100) end,
      'id', case when job.channel = 'PUSH' then coalesce(job.payload->>'notification_id', job.payload->>'announcement_id') end)::text;
    body := jsonb_build_object('data', data, 'signature', encode(extensions.hmac(data, secret, 'sha256'), 'hex'));
  end if;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 8000)' into request using url, body, headers;
  update public.outbound_jobs set state = 'SENDING', attempt = attempt + 1, request_id = request, lease_until = now() + interval '3 minutes', last_error_safe = null
  where id = job.id;
end
$function$;
revoke all on function private.dispatch_outbound_job(uuid) from public, anon, authenticated, service_role;

-- 5. The queue's settler (D47 version): a failed hand-over to the app route keeps the route's reason. Otherwise unchanged
-- (404 / 410 for a push still removes the device: a web subscription gone or an app token Firebase no longer knows).
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
      elsif job.channel in ('PUSH', 'EMAIL') then
        perform private.outbound_retry(job, private.app_delivery_failure(status, answer));
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
revoke all on function private.process_outbound_jobs(integer) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
