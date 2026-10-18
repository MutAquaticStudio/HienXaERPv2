-- FB3 F5 (Owner 17/10/2026): automation at no extra cost — no n8n/Make/Zapier, nothing new to pay for.
-- * "Quy tắc tự động": Khi [an in-app notification of a kind] · Nếu [amount ≥ / only problems] · Thì [push to the phones of the
--   people who see it, Telegram, email or a signed webhook]. Rules are data (whitelisted events and channels), never code.
-- * A matching notification writes one outbound_jobs row per send in the same transaction (SPEC-SEC-004: one background
--   mechanism, no queue service). pg_net sends it right after commit; pg_cron retries failures and settles results each minute
--   and posts the morning digests (overdue debts, low stock, purchase orders not sent to the supplier) at 07:00.
-- * Telegram and webhooks go straight from the database; email (SMTP) and web push go through the app route
--   /api/automation/deliver, which only signs/sends and never touches the database. Secrets live in Supabase Vault
--   (hx_telegram_bot_token, hx_webhook_secret, hx_app_url, hx_automation_secret) and in the app environment — never in tables.
-- Without pg_net/pg_cron (local tests) jobs simply wait as PENDING.
begin;

do $extensions$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net with schema extensions; end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then create extension if not exists pg_cron with schema pg_catalog; end if;
end
$extensions$;

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 3 and 120),
  event text not null check (event in ('order.portal_submitted', 'order.portal_cancelled', 'customer.self_registered', 'purchase.draft_ready',
    'sales_order.needs_purchase', 'sales_order.short_source', 'sales_order.needs_delivery', 'delivery.waiting_dispatch', 'delivery.dispatch_suggested',
    'delivery.result_submitted', 'work.assigned', 'work.declined', 'finance.overdue_digest', 'inventory.low_stock_digest', 'purchase.unsent_digest')),
  min_amount_vnd bigint check (min_amount_vnd is null or min_amount_vnd > 0),
  problems_only boolean not null default false,
  channel text not null check (channel in ('PUSH', 'TELEGRAM', 'EMAIL', 'WEBHOOK')),
  target text check (target is null or char_length(target) between 3 and 300),
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((channel = 'PUSH') = (target is null))
);
create index automation_rules_event_idx on public.automation_rules(branch_id, event) where active;
alter table public.automation_rules enable row level security;
revoke all on public.automation_rules from anon, authenticated;
grant select on public.automation_rules to authenticated;
create policy automation_rules_select on public.automation_rules for select to authenticated using ((select private.has_permission(branch_id, 'roles.manage')));

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth_secret text not null check (char_length(auth_secret) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions(auth_user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated using (auth_user_id = (select auth.uid()));

create table public.outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  rule_id uuid references public.automation_rules(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  channel text not null check (channel in ('PUSH', 'TELEGRAM', 'EMAIL', 'WEBHOOK')),
  target text not null check (char_length(target) between 3 and 300),
  payload jsonb not null,
  state text not null default 'PENDING' check (state in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD')),
  attempt integer not null default 0,
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  request_id bigint,
  last_error_safe text check (char_length(last_error_safe) <= 300),
  dedupe_key text not null unique check (char_length(dedupe_key) between 3 and 200),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbound_jobs_due_idx on public.outbound_jobs(next_run_at) where state in ('PENDING', 'FAILED');
create index outbound_jobs_sending_idx on public.outbound_jobs(lease_until) where state = 'SENDING';
create index outbound_jobs_branch_idx on public.outbound_jobs(branch_id, created_at desc);
alter table public.outbound_jobs enable row level security;
revoke all on public.outbound_jobs from anon, authenticated;
grant select on public.outbound_jobs to authenticated;
create policy outbound_jobs_select on public.outbound_jobs for select to authenticated using ((select private.has_permission(branch_id, 'roles.manage')));

-- has_permission for another login (who receives a push), with the same role + explicit grant rules.
create or replace function private.login_has_permission(target_auth_user_id uuid, target_branch_id uuid, requested_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    where e.auth_user_id = target_auth_user_id and e.active and a.branch_id = target_branch_id
      and (exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_code = requested_permission)
        or exists (select 1 from public.employee_permission_grants g where g.employee_id = e.id and g.branch_id = a.branch_id and g.permission_code = requested_permission)))
$$;
revoke all on function private.login_has_permission(uuid, uuid, text) from public, anon, authenticated, service_role;

-- A Vault secret by name, or null (no Vault locally, or not set yet).
create or replace function private.automation_secret(secret_name text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare value text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1' into value using secret_name;
  return nullif(trim(value), '');
end
$$;
revoke all on function private.automation_secret(text) from public, anon, authenticated, service_role;

create or replace function private.automation_amount(target_entity_type text, target_entity_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case target_entity_type
    when 'sales_order' then (select sum(l.line_total_vnd)::bigint from public.sales_order_lines l where l.sales_order_id = target_entity_id)
    when 'purchase_order' then (select sum(l.line_total_cost_vnd)::bigint from public.purchase_order_lines l where l.purchase_order_id = target_entity_id)
  end
$$;
revoke all on function private.automation_amount(text, uuid) from public, anon, authenticated, service_role;

create or replace function private.outbound_retry(job public.outbound_jobs, reason text) returns void
language sql security definer set search_path = '' as $$
  update public.outbound_jobs set state = case when job.attempt >= 6 then 'DEAD' else 'FAILED' end, request_id = null, lease_until = null,
    next_run_at = now() + least(interval '6 hours', interval '1 minute' * power(2, greatest(job.attempt, 1))), last_error_safe = left(reason, 300)
  where id = job.id
$$;
revoke all on function private.outbound_retry(public.outbound_jobs, text) from public, anon, authenticated, service_role;

-- Hands one due job to pg_net (sent right after this transaction commits). Missing setup keeps it waiting with the reason.
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
      'subscription', case when job.channel = 'PUSH' then jsonb_build_object('endpoint', sub.endpoint, 'keys', jsonb_build_object('p256dh', sub.p256dh, 'auth', sub.auth_secret)) end)::text;
    body := jsonb_build_object('data', data, 'signature', encode(extensions.hmac(data, secret, 'sha256'), 'hex'));
  end if;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 8000)' into request using url, body, headers;
  update public.outbound_jobs set state = 'SENDING', attempt = attempt + 1, request_id = request, lease_until = now() + interval '3 minutes', last_error_safe = null
  where id = job.id;
end
$function$;
revoke all on function private.dispatch_outbound_job(uuid) from public, anon, authenticated, service_role;

create or replace function private.enqueue_outbound_job(target_branch_id uuid, target_rule_id uuid, target_notification_id uuid, job_channel text,
  job_target text, job_payload jsonb, dedupe text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare created uuid;
begin
  insert into public.outbound_jobs(branch_id, rule_id, notification_id, channel, target, payload, dedupe_key)
  values (target_branch_id, target_rule_id, target_notification_id, job_channel, job_target, job_payload, left(dedupe, 200))
  on conflict (dedupe_key) do nothing returning id into created;
  if created is not null then perform private.dispatch_outbound_job(created); end if;
  return created;
end
$$;
revoke all on function private.enqueue_outbound_job(uuid, uuid, uuid, text, text, jsonb, text) from public, anon, authenticated, service_role;

-- Every new notification runs the branch's matching rules, in the same transaction.
create or replace function private.fire_automation() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  rule public.automation_rules%rowtype;
  sub public.push_subscriptions%rowtype;
  payload jsonb;
  amount bigint;
begin
  payload := jsonb_strip_nulls(jsonb_build_object('kind', new.kind, 'title', new.title, 'body', new.body, 'link', new.link,
    'entity_type', new.entity_type, 'entity_id', new.entity_id, 'notification_id', new.id, 'created_at', new.created_at));
  for rule in select * from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind order by r.id loop
    if rule.min_amount_vnd is not null then
      amount := private.automation_amount(new.entity_type, new.entity_id);
      if coalesce(amount, 0) < rule.min_amount_vnd then continue; end if;
    end if;
    if rule.problems_only and not (new.kind = 'delivery.result_submitted'
      and exists (select 1 from public.deliveries d where d.id = new.entity_id and d.result_kind in ('PARTIAL', 'FAILED'))) then continue; end if;
    if rule.channel = 'PUSH' then
      for sub in select s.* from public.push_subscriptions s
        where private.login_has_permission(s.auth_user_id, new.branch_id, new.required_permission)
          and (new.recipient_employee_id is null or exists (select 1 from public.employees e where e.id = new.recipient_employee_id and e.auth_user_id = s.auth_user_id))
        order by s.id
      loop
        perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, 'PUSH', sub.id::text, payload, 'rule:' || rule.id || ':' || new.id || ':' || sub.id);
      end loop;
    else
      perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, rule.channel, rule.target, payload, 'rule:' || rule.id || ':' || new.id);
    end if;
  end loop;
  return null;
end
$function$;
revoke all on function private.fire_automation() from public, anon, authenticated, service_role;
create trigger notifications_fire_automation after insert on public.notifications for each row execute function private.fire_automation();

-- Settles what pg_net answered, then sends what is due. Run by pg_cron each minute.
create or replace function private.process_outbound_jobs(batch_size integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  job public.outbound_jobs%rowtype;
  status integer;
  failure text;
  rows integer;
  settled integer := 0;
  dispatched integer := 0;
begin
  if to_regclass('net._http_response') is not null then
    for job in select * from public.outbound_jobs j where j.state = 'SENDING' order by j.lease_until limit 500 for update skip locked loop
      execute 'select status_code, error_msg from net._http_response where id = $1' into status, failure using job.request_id;
      get diagnostics rows = row_count;
      if rows = 0 then
        if job.lease_until < now() then perform private.outbound_retry(job, 'Không nhận được phản hồi'); settled := settled + 1; end if;
        continue;
      end if;
      settled := settled + 1;
      if status between 200 and 299 then
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
revoke all on function private.process_outbound_jobs(integer) from public, anon, authenticated, service_role;

-- 07:00 digests, one per branch and day, as notifications (so the bell and the rules see them).
create or replace function private.morning_digest() returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  branch record;
  day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  overdue_count integer;
  overdue_vnd bigint;
  low_count integer;
  unsent_count integer;
  made integer := 0;
begin
  for branch in select b.id from public.branches b where b.active order by b.id loop
    select count(*), coalesce(sum(private.current_receivable_outstanding(o.id)), 0) into overdue_count, overdue_vnd
    from public.receivable_obligations o where o.branch_id = branch.id and o.due_date < day and private.current_receivable_outstanding(o.id) > 0;
    if overdue_count > 0 then
      perform private.notify(branch.id, 'finance.overdue_digest', 'branch', branch.id, 'Nợ quá hạn: ' || overdue_count || ' khoản',
        'Tổng còn phải thu quá hạn ' || replace(to_char(overdue_vnd, 'FM999,999,999,999,990'), ',', '.') || ' ₫', '/admin/receivables', 'finance.ar.read', null,
        'finance.overdue_digest:' || day);
      made := made + 1;
    end if;
    select count(*) into low_count from public.low_stock_alert_read l where l.branch_id = branch.id;
    if low_count > 0 then
      perform private.notify(branch.id, 'inventory.low_stock_digest', 'branch', branch.id, 'Tồn dưới ngưỡng: ' || low_count || ' mặt hàng',
        'Mở danh sách tồn thấp và lập đơn mua khi cần.', '/admin/inventory?stock=low', 'inventory.read', null, 'inventory.low_stock_digest:' || day);
      made := made + 1;
    end if;
    select count(*) into unsent_count from public.purchase_orders p where p.branch_id = branch.id and p.state = 'CONFIRMED'
      and not exists (select 1 from public.purchase_order_dispatches d where d.purchase_order_id = p.id);
    if unsent_count > 0 then
      perform private.notify(branch.id, 'purchase.unsent_digest', 'branch', branch.id, 'Đơn mua chưa gửi NCC: ' || unsent_count,
        'Gửi đơn mua cho nhà cung cấp qua Zalo từ trang đơn mua.', '/admin/purchase-orders', 'purchasing.read', null, 'purchase.unsent_digest:' || day);
      made := made + 1;
    end if;
  end loop;
  return made;
end
$function$;
revoke all on function private.morning_digest() from public, anon, authenticated, service_role;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hx-outbound-jobs', '* * * * *', 'select private.process_outbound_jobs(50)');
    perform cron.schedule('hx-morning-digest', '0 0 * * *', 'select private.morning_digest()');
  end if;
end
$schedule$;

notify pgrst, 'reload schema';
commit;
