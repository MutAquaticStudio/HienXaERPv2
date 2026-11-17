-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý", audit A2): the outbound queue (private.dispatch_outbound_job, latest
-- body 20261116160000) no longer retries forever when the sending setup is missing.
-- * Missing pg_net, hx_app_url / hx_automation_secret or the Telegram token now counts as an attempt
--   (private.outbound_setup_retry), with the same backoff and the same DEAD after attempt 6 as an HTTP failure
--   (private.outbound_retry, unchanged; dispatch already counts the attempt of a real send).
-- * Age limit (private.outbound_job_expired): a PUSH job still not sent 12 hours after it was queued is closed
--   DEAD with "Quá hạn, không gửi nữa" — pushes about work, deliveries, orders, payments are only useful when fresh;
--   announcements (kind 'announcement') and debt reminders (kind 'customer.debt_reminder') keep 24 hours. EMAIL and WEBHOOK
--   keep the attempt-based rule only (an integration may still want the event; Telegram / Email are no longer rule channels, D93).
begin;

create or replace function private.outbound_job_expired(job public.outbound_jobs) returns boolean
language sql stable set search_path = '' as $$
  select job.channel = 'PUSH'
    and job.created_at < now() - case when job.payload->>'kind' in ('announcement', 'customer.debt_reminder')
      then interval '24 hours' else interval '12 hours' end
$$;
revoke all on function private.outbound_job_expired(public.outbound_jobs) from public, anon, authenticated, service_role;

-- A setup problem before anything was sent: count the attempt, then retry (or DEAD) like a failed send.
create or replace function private.outbound_setup_retry(job public.outbound_jobs, reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  job.attempt := job.attempt + 1;
  update public.outbound_jobs set attempt = job.attempt where id = job.id;
  perform private.outbound_retry(job, reason);
end
$$;
revoke all on function private.outbound_setup_retry(public.outbound_jobs, text) from public, anon, authenticated, service_role;

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
begin
  select * into job from public.outbound_jobs j where j.id = target_job_id and j.state in ('PENDING', 'FAILED') for update skip locked;
  if job.id is null then return; end if;
  -- D96 (A2): a message about work, deliveries or orders that could not go out for 12 hours (announcements and debt
  -- reminders: 24 hours) is no longer sent, so a fixed setup never floods phones with old news.
  if private.outbound_job_expired(job) then
    update public.outbound_jobs set state = 'DEAD', last_error_safe = 'Quá hạn, không gửi nữa', request_id = null, lease_until = null where id = job.id;
    return;
  end if;
  -- D96 (A2): every setup failure counts as an attempt, so the job ends DEAD after the usual attempts.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform private.outbound_setup_retry(job, 'Chưa bật pg_net trên cơ sở dữ liệu');
    return;
  end if;
  app := rtrim(private.automation_secret('hx_app_url'), '/');
  message := job.payload->>'title' || coalesce(E'\n' || nullif(job.payload->>'body', ''), '')
    || case when app is not null and job.payload->>'link' is not null then E'\n' || app || (job.payload->>'link') else '' end;
  if job.channel = 'TELEGRAM' then
    secret := private.automation_secret('hx_telegram_bot_token');
    if secret is null then perform private.outbound_setup_retry(job, 'Chưa cấu hình Telegram (hx_telegram_bot_token)'); return; end if;
    url := 'https://api.telegram.org/bot' || secret || '/sendMessage';
    body := jsonb_build_object('chat_id', job.target, 'text', left(message, 4000), 'disable_web_page_preview', true);
  elsif job.channel = 'WEBHOOK' then
    url := job.target;
    data := (job.payload || jsonb_build_object('delivery_id', job.id, 'sent_at', now()))::text;
    secret := private.automation_secret('hx_webhook_secret');
    body := jsonb_build_object('data', data, 'signature', case when secret is null then null else encode(extensions.hmac(data, secret, 'sha256'), 'hex') end);
  else
    secret := private.automation_secret('hx_automation_secret');
    if secret is null or app is null then perform private.outbound_setup_retry(job, 'Chưa cấu hình gửi qua ứng dụng (hx_app_url, hx_automation_secret)'); return; end if;
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

notify pgrst, 'reload schema';
commit;
