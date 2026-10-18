-- FB3 F5: commands behind Cài đặt → "Quy tắc tự động" (roles.manage) and "Bật thông báo trên máy này" (any signed-in login).
begin;

create or replace function private.automation_target_valid(rule_channel text, rule_target text) returns boolean
language sql immutable set search_path = '' as $$
  select case rule_channel
    when 'PUSH' then rule_target is null
    when 'TELEGRAM' then rule_target ~ '^(-?[0-9]{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$'
    when 'EMAIL' then rule_target ~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[A-Za-z]{2,}$'
    -- Only public https endpoints: no credentials in the URL, no local or private addresses.
    when 'WEBHOOK' then rule_target ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?(/[^[:space:]]*)?$'
      and lower(substring(rule_target from '^https://([^/:]+)')) !~ '^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.|\[)'
    else false end
$$;
revoke all on function private.automation_target_valid(text, text) from public, anon, authenticated, service_role;

create or replace function public.automation_overview(target_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if (select auth.uid()) is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'event', r.event, 'min_amount_vnd', r.min_amount_vnd::text,
      'problems_only', r.problems_only, 'channel', r.channel, 'target', r.target, 'active', r.active, 'version', r.version, 'updated_at', r.updated_at)
      order by r.active desc, r.name, r.id) from public.automation_rules r where r.branch_id = target_branch_id), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(j order by j->>'created_at' desc) from (
      select jsonb_build_object('id', o.id, 'channel', o.channel, 'title', o.payload->>'title', 'state', o.state, 'attempt', o.attempt,
        'last_error', o.last_error_safe, 'created_at', o.created_at, 'sent_at', o.sent_at, 'rule_name', r.name) j
      from public.outbound_jobs o left join public.automation_rules r on r.id = o.rule_id
      where o.branch_id = target_branch_id order by o.created_at desc limit 30) recent), '[]'::jsonb),
    'setup', jsonb_build_object(
      'pg_net', exists (select 1 from pg_extension where extname = 'pg_net'),
      'pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron'),
      'telegram', private.automation_secret('hx_telegram_bot_token') is not null,
      'webhook_secret', private.automation_secret('hx_webhook_secret') is not null,
      'app_delivery', private.automation_secret('hx_app_url') is not null and private.automation_secret('hx_automation_secret') is not null),
    'push_devices', (select count(*) from public.push_subscriptions s where private.login_has_permission(s.auth_user_id, target_branch_id, 'dashboard.read')
      or private.login_has_permission(s.auth_user_id, target_branch_id, 'work.read')));
end
$function$;
revoke all on function public.automation_overview(uuid) from public, anon;
grant execute on function public.automation_overview(uuid) to authenticated;

create or replace function public.save_automation_rule(target_rule_id uuid, target_branch_id uuid, rule jsonb, expected_version integer, operation_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  existing public.automation_rules%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  saved uuid;
  rule_channel text := rule->>'channel';
  rule_target text := nullif(trim(coalesce(rule->>'target', '')), '');
  amount bigint;
begin
  if me is null or save_automation_rule.operation_id is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('rule_id', target_rule_id, 'branch', target_branch_id, 'rule', rule, 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(save_automation_rule.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_automation_rule.operation_id;
  if found then
    if receipt.command_name <> 'save_automation_rule' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if rule_channel = 'PUSH' then rule_target := null; end if;
  if rule_channel = 'EMAIL' then rule_target := lower(rule_target); end if;
  if jsonb_typeof(rule) is distinct from 'object' or not private.automation_target_valid(rule_channel, rule_target)
    or coalesce(rule->>'min_amount_vnd', '') !~ '^([1-9][0-9]{0,15})?$' then
    raise exception 'automation_rule_invalid' using errcode = '22023';
  end if;
  amount := nullif(rule->>'min_amount_vnd', '')::bigint;
  if target_rule_id is null then
    insert into public.automation_rules(branch_id, name, event, min_amount_vnd, problems_only, channel, target, active, created_by)
    values (target_branch_id, trim(rule->>'name'), rule->>'event', amount, coalesce((rule->>'problems_only')::boolean, false), rule_channel, rule_target,
      coalesce((rule->>'active')::boolean, true), me)
    returning id into saved;
  else
    select * into existing from public.automation_rules r where r.id = target_rule_id and r.branch_id = target_branch_id for update;
    if existing.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
    if existing.version is distinct from expected_version then raise exception 'automation_rule_version_conflict' using errcode = 'PT409'; end if;
    update public.automation_rules set name = trim(rule->>'name'), event = rule->>'event', min_amount_vnd = amount,
      problems_only = coalesce((rule->>'problems_only')::boolean, false), channel = rule_channel, target = rule_target,
      active = coalesce((rule->>'active')::boolean, true), version = version + 1, updated_at = now()
    where id = existing.id returning id into saved;
  end if;
  insert into public.command_receipts values (save_automation_rule.operation_id, me, 'save_automation_rule', hash, 'automation_rule', saved, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, case when target_rule_id is null then 'automation_rule.create' else 'automation_rule.update' end, 'automation_rule', saved,
    save_automation_rule.operation_id, array['event', 'conditions', 'channel', 'active'], left(trim(rule->>'name'), 120));
  return saved;
exception when check_violation or invalid_text_representation then
  raise exception 'automation_rule_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.save_automation_rule(uuid, uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_automation_rule(uuid, uuid, jsonb, integer, uuid) to authenticated;

create or replace function public.delete_automation_rule(target_rule_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare existing public.automation_rules%rowtype;
begin
  select * into existing from public.automation_rules r where r.id = target_rule_id for update;
  if existing.id is null then return target_rule_id; end if;
  if (select auth.uid()) is null or delete_automation_rule.operation_id is null or not private.has_permission(existing.branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.automation_rules where id = existing.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), existing.branch_id, 'automation_rule.delete', 'automation_rule', existing.id, delete_automation_rule.operation_id,
    array['rule'], left(existing.name, 120));
  return existing.id;
end
$function$;
revoke all on function public.delete_automation_rule(uuid, uuid) from public, anon;
grant execute on function public.delete_automation_rule(uuid, uuid) to authenticated;

-- "Gửi thử": one message through the rule's channel now (push: only to the caller's own devices).
create or replace function public.test_automation_rule(target_rule_id uuid, operation_id uuid) returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  rule public.automation_rules%rowtype;
  sub public.push_subscriptions%rowtype;
  payload jsonb;
  made integer := 0;
begin
  select * into rule from public.automation_rules r where r.id = target_rule_id;
  if me is null or rule.id is null or test_automation_rule.operation_id is null or not private.has_permission(rule.branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload := jsonb_build_object('kind', 'automation.test', 'title', 'Thử quy tắc: ' || rule.name, 'body', 'Tin nhắn thử từ Hiền Xa ERP. Quy tắc đang hoạt động.',
    'link', '/admin/settings/automation');
  if rule.channel = 'PUSH' then
    for sub in select s.* from public.push_subscriptions s where s.auth_user_id = me order by s.id loop
      if private.enqueue_outbound_job(rule.branch_id, rule.id, null, 'PUSH', sub.id::text, payload, 'test:' || test_automation_rule.operation_id || ':' || sub.id) is not null then
        made := made + 1;
      end if;
    end loop;
  elsif private.enqueue_outbound_job(rule.branch_id, rule.id, null, rule.channel, rule.target, payload, 'test:' || test_automation_rule.operation_id) is not null then
    made := 1;
  end if;
  return made;
end
$function$;
revoke all on function public.test_automation_rule(uuid, uuid) from public, anon;
grant execute on function public.test_automation_rule(uuid, uuid) to authenticated;

-- "Bật thông báo trên máy này": one row per browser; a device signed in by someone else now belongs to this login.
create or replace function public.save_push_subscription(endpoint text, p256dh text, auth_secret text, user_agent text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare me uuid := (select auth.uid()); saved uuid;
begin
  if me is null or not private.auth_actor_active() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.push_subscriptions(auth_user_id, endpoint, p256dh, auth_secret, user_agent)
  values (me, save_push_subscription.endpoint, save_push_subscription.p256dh, save_push_subscription.auth_secret, left(save_push_subscription.user_agent, 300))
  on conflict on constraint push_subscriptions_endpoint_key do update set auth_user_id = excluded.auth_user_id, p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret, user_agent = excluded.user_agent, created_at = now()
  returning id into saved;
  return saved;
exception when check_violation then
  raise exception 'push_subscription_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.delete_push_subscription(endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions s where s.endpoint = delete_push_subscription.endpoint and s.auth_user_id = (select auth.uid())
$$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Starter rules (Owner 17/10): push to the phones of the people who handle it. They only send once someone turns
-- notifications on for a device; the Owner adds Telegram / email / webhook rules on the settings page.
insert into public.automation_rules(branch_id, name, event, problems_only, channel)
select b.id, rule.name, rule.event, rule.problems_only, 'PUSH'
from public.branches b cross join (values
  ('Đơn khách mới → báo người duyệt', 'order.portal_submitted', false),
  ('Đơn mua nháp cần duyệt → báo mua hàng', 'purchase.draft_ready', false),
  ('Giao thiếu / không giao được → báo người xác minh', 'delivery.result_submitted', true),
  ('Việc mới → báo thợ được giao', 'work.assigned', false),
  ('Thợ từ chối việc → báo điều phối', 'work.declined', false)) as rule(name, event, problems_only)
where b.active;

notify pgrst, 'reload schema';
commit;
