-- D91 (Owner 16/11/2026: "Clean code phần … zalo OA. Trước khi xoá … kiểm tra có conflict với module nào không" → "Xóa hẳn
-- Zalo OA"): the automatic Zalo OA notifications of D47 are removed. On Production they never sent a message (0 ZALO jobs,
-- connection "Chưa kết nối").
-- * Removed: the two pg_cron jobs (hx-zalo-refresh, hx-zalo-debt-reminder), the three triggers that queued a Zalo message
--   (order confirmed, delivery verified, payment received), every Zalo OA function (public RPCs of Cài đặt → Zalo OA and the
--   customer's "Nhận thông báo qua Zalo" switch, the private token/HTTP/queue helpers), public.zalo_templates,
--   private.zalo_connection, customers.zalo_notify, and the ZALO branch of the shared outbound queue.
-- * Kept: the shared outbound queue (PUSH Web Push + FCM, TELEGRAM, EMAIL, WEBHOOK) exactly as D86 left it, automation rules,
--   and every manual "Gửi qua Zalo" record (purchase_order_dispatches channel 'ZALO', quotation acceptance channel 'ZALO'): those
--   are the history of buttons that only open Zalo on the person's device.
-- * outbound_jobs: a ZALO job still waiting (none on Production) is closed as DEAD, never handed to another channel. The channel
--   check drops 'ZALO'; when old ZALO rows remain it is added NOT VALID (new ZALO rows refused, old rows kept until the queue's
--   60-day cleanup). provider_message_id is kept: nullable, unused, harmless, and dropping it would lose any id already stored.
-- * Vault secrets hx_zalo_access_token, hx_zalo_refresh_token, hx_zalo_app_secret are not touched here: the Owner removes them
--   in Supabase → Vault. The "http" extension D47 enabled is left as is.
begin;

-- 1. The schedules (guarded like D47's schedule: only where pg_cron exists, only jobs that exist).
do $unschedule$
declare
  job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for job_id in select j.jobid from cron.job j where j.jobname in ('hx-zalo-refresh', 'hx-zalo-debt-reminder') loop
      perform cron.unschedule(job_id);
    end loop;
  end if;
end
$unschedule$;

-- 2. The triggers that queued a Zalo message, and their functions.
drop trigger if exists sales_orders_zalo_confirmed on public.sales_orders;
drop trigger if exists deliveries_zalo_verified on public.deliveries;
drop trigger if exists payments_zalo_received on public.payments;
drop function if exists private.zalo_on_order_confirmed();
drop function if exists private.zalo_on_delivery_verified();
drop function if exists private.zalo_on_payment_received();

-- 3. The shared queue without the ZALO branch.
-- 3a. The queue's sender: the D86 version without the ZALO branch (Zalo connection, token, ZBS template call). Everything
-- else byte-for-byte the same.
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
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    update public.outbound_jobs set last_error_safe = 'Chưa bật pg_net trên cơ sở dữ liệu', next_run_at = now() + interval '15 minutes' where id = job.id;
    return;
  end if;
  app := rtrim(private.automation_secret('hx_app_url'), '/');
  message := job.payload->>'title' || coalesce(E'\n' || nullif(job.payload->>'body', ''), '')
    || case when app is not null and job.payload->>'link' is not null then E'\n' || app || (job.payload->>'link') else '' end;
  if job.channel = 'TELEGRAM' then
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

-- 3b. The queue's settler: the D86 version without the ZALO branch (settle_zalo_job). Everything else byte-for-byte the same.
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
      if status between 200 and 299 then
        update public.outbound_jobs set state = 'SENT', sent_at = now(), request_id = null, lease_until = null where id = job.id;
        if job.channel = 'PUSH' then update public.push_subscriptions set last_success_at = now() where id::text = job.target; end if;
      -- Only 410 removes a device: the route answers 410 for a web subscription or app token that is really gone. A 404 here
      -- means the route itself was not found (wrong hx_app_url, missing deployment) and must not wipe every device.
      elsif job.channel = 'PUSH' and status = 410 then
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

-- 4. Zalo jobs still waiting are closed (none on Production), then the channel check forgets ZALO.
update public.outbound_jobs set state = 'DEAD', last_error_safe = 'Đã gỡ Zalo OA (D91)', request_id = null, lease_until = null
where channel = 'ZALO' and state in ('PENDING', 'FAILED', 'SENDING');
alter table public.outbound_jobs drop constraint if exists outbound_jobs_channel_check;
do $channel$
begin
  if exists (select 1 from public.outbound_jobs where channel = 'ZALO') then
    alter table public.outbound_jobs add constraint outbound_jobs_channel_check check (channel in ('PUSH', 'TELEGRAM', 'EMAIL', 'WEBHOOK')) not valid;
  else
    alter table public.outbound_jobs add constraint outbound_jobs_channel_check check (channel in ('PUSH', 'TELEGRAM', 'EMAIL', 'WEBHOOK'));
  end if;
end
$channel$;

-- 5. The Zalo OA functions.
drop function if exists public.start_zalo_oauth(text, text);
drop function if exists public.complete_zalo_oauth(text, text, text);
drop function if exists public.zalo_status();
drop function if exists public.set_zalo_template(text, text, boolean, integer);
drop function if exists public.set_zalo_send_mode(text);
drop function if exists public.disconnect_zalo();
drop function if exists public.send_zalo_test(text, text, uuid);
drop function if exists public.set_customer_zalo_notify(uuid, boolean);
drop function if exists public.customer_zalo_notify(uuid);
drop function if exists private.zalo_debt_reminders();
drop function if exists private.zalo_refresh_tokens();
drop function if exists private.enqueue_zalo(uuid, text, uuid, jsonb, text);
drop function if exists private.settle_zalo_job(public.outbound_jobs, integer, text);
drop function if exists private.zalo_token_call(text);
drop function if exists private.zalo_http_form(text, text, text, text);
drop function if exists private.zalo_secret_put(text, text);
drop function if exists private.zalo_alert(text, text, text);
drop function if exists private.zalo_event_params(text);
drop function if exists private.zalo_phone(text);
drop function if exists private.zalo_money(bigint);
drop function if exists private.zalo_time(timestamptz);
drop function if exists private.zalo_urlencode(text);
drop function if exists private.zalo_base64url(bytea);

-- 6. The Zalo OA tables and the customer's switch.
drop table if exists public.zalo_templates;
drop table if exists private.zalo_connection;
alter table public.customers drop column if exists zalo_notify;

notify pgrst, 'reload schema';
commit;
