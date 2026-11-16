-- D93 (Owner 16/11/2026) "Luồng cài quy tắc gửi thông báo": one place for every notification the system sends.
-- Owner's answers to the concept "Quy tắc gửi thông báo":
-- (1) "Gửi cho ai": besides "Người phụ trách theo quyền" (default, unchanged) a rule can send to chosen roles or chosen people.
--     Whoever is chosen still only receives a notification he may see (its required permission in the branch, and a personal
--     notification only reaches its own recipient), so choosing never leaks anything.
-- (2) Built-in pushes (worker "Việc mới", "Phiếu giao chờ người nhận", the lead's dispatch pushes, price / pay-rate / composed
--     announcements, and the new customer pushes below) can each be turned off by the Owner per branch. Default on. Off stops
--     only the push: the in-app notification / popup stays.
-- (3) One rule can send to several channels at once (`channels`).
-- (4) Quiet hours per branch (on/off, start, end): pushes are held and sent as ONE combined push per device when they end.
--     Exceptions (still immediate) are configurable; default: the workers' own jobs and "giao có vấn đề". Webhooks are not held.
-- (6) "Gửi thử" goes only to the current user's own devices. Telegram and Email leave automation rules (Supabase Auth emails and
--     app emails such as the customer welcome email are not touched). Webhook stays, secondary.
-- (7) In-app-only notification kinds can get a push rule ("+ Báo về điện thoại"): every notification kind is now a rule event.
-- Scope addition (Owner: "được. Tất cả gợi ý kia ok"): push notifications for customers (portal logins + Android app), each one a
-- built-in the Owner can turn off: order approved, truck on its way, delivered, short / failed delivery, payment received
-- (money: Chủ tài khoản + Kế toán only), debt reminder (money, daily), order cancelled. Only the customer's own data.
--
-- Migration of existing data: TELEGRAM / EMAIL rules (none on Production, which has PUSH rules only) are kept but converted to
-- inactive PUSH rules (the Owner can turn them on or delete them); their unsent jobs are closed as DEAD. The outbound queue's
-- channel check drops TELEGRAM and EMAIL (NOT VALID while old rows remain, until the queue's 60-day cleanup).
-- The queue functions private.dispatch_outbound_job / private.process_outbound_jobs are NOT redefined here: held pushes use two
-- new job states, HELD (waiting for the end of quiet hours; the sender ignores them) and MERGED (folded into the combined push),
-- and the new cron job hx-quiet-pushes releases them.
begin;

-- ===== 1. Channels: PUSH and WEBHOOK only, several per rule =====
update public.outbound_jobs set state = 'DEAD', request_id = null, lease_until = null, last_error_safe = 'Đã bỏ kênh Telegram / Email (D93)'
where channel in ('TELEGRAM', 'EMAIL') and state in ('PENDING', 'FAILED', 'SENDING');
alter table public.outbound_jobs drop constraint if exists outbound_jobs_channel_check;
do $channel$
declare allowed text[] := array['PUSH', 'WEBHOOK'];
begin
  -- D47 Zalo OA is removed by another migration (D91); while it is still installed its channel stays allowed.
  if to_regclass('private.zalo_connection') is not null then allowed := allowed || 'ZALO'::text; end if;
  if exists (select 1 from public.outbound_jobs j where not (j.channel = any(allowed))) then
    execute format('alter table public.outbound_jobs add constraint outbound_jobs_channel_check check (channel = any(%L::text[])) not valid', allowed);
  else
    execute format('alter table public.outbound_jobs add constraint outbound_jobs_channel_check check (channel = any(%L::text[]))', allowed);
  end if;
end
$channel$;
-- HELD: a push waiting for the end of quiet hours (next_run_at = when they end). MERGED: folded into the combined push.
alter table public.outbound_jobs drop constraint outbound_jobs_state_check;
alter table public.outbound_jobs add constraint outbound_jobs_state_check check (state in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD', 'HELD', 'MERGED'));
create index outbound_jobs_held_idx on public.outbound_jobs(next_run_at) where state = 'HELD';

create or replace function private.automation_channels_valid(rule_channels text[]) returns boolean
language sql immutable set search_path = '' as $$
  select rule_channels is not null and cardinality(rule_channels) between 1 and 2 and rule_channels <@ array['PUSH', 'WEBHOOK']
    and cardinality(rule_channels) = (select count(distinct c) from unnest(rule_channels) c)
    and rule_channels = array(select c from unnest(array['PUSH', 'WEBHOOK']) c where c = any(rule_channels))
$$;
revoke all on function private.automation_channels_valid(text[]) from public, anon, authenticated, service_role;

alter table public.automation_rules add column channels text[];
update public.automation_rules set channel = 'PUSH', target = null, active = false, version = version + 1, updated_at = now(),
  name = left(name, 104) || ' (đã tắt, D93)'
where channel in ('TELEGRAM', 'EMAIL');
update public.automation_rules set channels = array[channel];
alter table public.automation_rules drop constraint automation_rules_check;
alter table public.automation_rules drop constraint automation_rules_channel_check;
alter table public.automation_rules alter column channels set not null;
-- `channel` stays as the rule's first channel (older writers name one channel; the trigger below keeps both in step).
alter table public.automation_rules add constraint automation_rules_channel_check check (channel in ('PUSH', 'WEBHOOK') and channel = channels[1]);
alter table public.automation_rules add constraint automation_rules_channels_check check (private.automation_channels_valid(channels));
alter table public.automation_rules add constraint automation_rules_target_channel_check check (('WEBHOOK' = any(channels)) = (target is not null));
alter table public.automation_rules add column recipient_mode text not null default 'PERMISSION' check (recipient_mode in ('PERMISSION', 'ROLES', 'PEOPLE'));

create or replace function private.automation_rule_channels() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.channels is null then
    new.channels := array[new.channel];
  elsif tg_op = 'UPDATE' and new.channels is not distinct from old.channels and new.channel is distinct from old.channel then
    new.channels := array[new.channel];
  end if;
  if private.automation_channels_valid(array(select c from unnest(array['PUSH', 'WEBHOOK']) c where c = any(new.channels))) then
    new.channels := array(select c from unnest(array['PUSH', 'WEBHOOK']) c where c = any(new.channels));
  end if;
  new.channel := new.channels[1];
  return new;
end $$;
revoke all on function private.automation_rule_channels() from public, anon, authenticated, service_role;
create trigger automation_rules_channels before insert or update on public.automation_rules for each row execute function private.automation_rule_channels();

-- Every notification kind can drive a rule ("+ Báo về điện thoại" for the kinds that were only in the app).
alter table public.automation_rules drop constraint automation_rules_event_check;
alter table public.automation_rules add constraint automation_rules_event_check check (event in ('order.portal_submitted', 'order.portal_cancelled',
  'customer.self_registered', 'customer.portal_link_requested', 'purchase.draft_ready', 'sales_order.needs_purchase', 'sales_order.short_source',
  'sales_order.needs_delivery', 'delivery.waiting_dispatch', 'delivery.dispatch_suggested', 'delivery.result_submitted', 'delivery.claimed',
  'delivery.field_assigned', 'work.field_assigned', 'work.assigned', 'work.declined', 'work.delivery_split', 'payment.bank_received',
  'payment.bank_needs_review', 'service_request.submitted', 'service_request.cancelled', 'finance.overdue_digest', 'inventory.low_stock_digest',
  'purchase.unsent_digest'));

-- ===== 2. Recipients chosen by role or by person =====
create table public.automation_rule_recipients (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  check (num_nonnulls(role_id, employee_id) = 1)
);
create unique index automation_rule_recipients_role_key on public.automation_rule_recipients(rule_id, role_id) where role_id is not null;
create unique index automation_rule_recipients_employee_key on public.automation_rule_recipients(rule_id, employee_id) where employee_id is not null;
alter table public.automation_rule_recipients enable row level security;
revoke all on public.automation_rule_recipients from anon, authenticated;
grant select on public.automation_rule_recipients to authenticated;
create policy automation_rule_recipients_select on public.automation_rule_recipients for select to authenticated
  using (exists (select 1 from public.automation_rules r where r.id = rule_id and (select private.has_permission(r.branch_id, 'roles.manage'))));

-- The devices a rule's push reaches for one notification: permission first (never leak), the notification's own recipient
-- (a personal notification never reaches anyone else), then the rule's choice.
create or replace function private.rule_push_devices(target_rule_id uuid, target_branch_id uuid, required_permission text, recipient uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.automation_rules r
  join public.push_subscriptions s on true
  where r.id = target_rule_id
    and private.login_has_permission(s.auth_user_id, target_branch_id, required_permission)
    and (recipient is null or exists (select 1 from public.employees e where e.id = recipient and e.auth_user_id = s.auth_user_id))
    and (r.recipient_mode = 'PERMISSION'
      or (r.recipient_mode = 'ROLES' and exists (select 1 from public.employees e
        join public.employee_branch_access a on a.employee_id = e.id and a.active and a.branch_id = target_branch_id
        join public.automation_rule_recipients x on x.rule_id = r.id and x.role_id = a.role_id
        where e.auth_user_id = s.auth_user_id and e.active))
      or (r.recipient_mode = 'PEOPLE' and exists (select 1 from public.employees e
        join public.automation_rule_recipients x on x.rule_id = r.id and x.employee_id = e.id
        where e.auth_user_id = s.auth_user_id and e.active)))
  order by s.id
$$;
revoke all on function private.rule_push_devices(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

-- ===== 3. Built-in pushes the Owner can turn off =====
create table public.notification_builtin_settings (
  branch_id uuid not null references public.branches(id) on delete restrict,
  builtin_key text not null check (builtin_key in ('work.assigned', 'delivery.pool_open', 'field_dispatch', 'announcement.customer_price',
    'announcement.office_price', 'announcement.pay_rate', 'announcement.manual', 'customer.order_confirmed', 'customer.delivery_dispatched',
    'customer.delivery_done', 'customer.delivery_problem', 'customer.payment_received', 'customer.debt_reminder', 'customer.order_cancelled')),
  push_enabled boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (branch_id, builtin_key)
);
alter table public.notification_builtin_settings enable row level security;
revoke all on public.notification_builtin_settings from anon, authenticated;
grant select on public.notification_builtin_settings to authenticated;
create policy notification_builtin_settings_select on public.notification_builtin_settings for select to authenticated
  using ((select private.has_permission(branch_id, 'roles.manage')));

create or replace function private.builtin_push_on(target_branch_id uuid, key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.push_enabled from public.notification_builtin_settings s where s.branch_id = target_branch_id and s.builtin_key = key), true)
$$;
revoke all on function private.builtin_push_on(uuid, text) from public, anon, authenticated, service_role;

-- ===== 4. Quiet hours =====
create table public.notification_quiet_hours (
  branch_id uuid primary key references public.branches(id) on delete restrict,
  enabled boolean not null default false,
  -- minutes after local midnight (Asia/Ho_Chi_Minh); start > end runs over midnight
  start_minute smallint not null default 1260 check (start_minute between 0 and 1439),
  end_minute smallint not null default 390 check (end_minute between 0 and 1439),
  -- still sent at once: worker_jobs (a worker's / lead's own jobs), delivery_problems (short / failed delivery results),
  -- order.portal_submitted (a customer's new order)
  exempt_keys text[] not null default array['worker_jobs', 'delivery_problems']
    check (exempt_keys <@ array['worker_jobs', 'delivery_problems', 'order.portal_submitted']),
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (start_minute <> end_minute)
);
alter table public.notification_quiet_hours enable row level security;
revoke all on public.notification_quiet_hours from anon, authenticated;
grant select on public.notification_quiet_hours to authenticated;
create policy notification_quiet_hours_select on public.notification_quiet_hours for select to authenticated
  using ((select private.has_permission(branch_id, 'roles.manage')));

-- When the branch's quiet hours end, if at_time falls inside them; null otherwise.
create or replace function private.quiet_until(target_branch_id uuid, at_time timestamptz default now()) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  q public.notification_quiet_hours%rowtype;
  local timestamp := at_time at time zone 'Asia/Ho_Chi_Minh';
  minute_of_day integer;
  ends timestamptz;
begin
  select * into q from public.notification_quiet_hours h where h.branch_id = target_branch_id;
  if q.branch_id is null or not q.enabled then return null; end if;
  minute_of_day := extract(hour from local)::integer * 60 + extract(minute from local)::integer;
  if not (case when q.start_minute < q.end_minute then minute_of_day >= q.start_minute and minute_of_day < q.end_minute
    else minute_of_day >= q.start_minute or minute_of_day < q.end_minute end) then
    return null;
  end if;
  ends := (local::date + make_interval(mins => q.end_minute)) at time zone 'Asia/Ho_Chi_Minh';
  if ends <= at_time then ends := ends + interval '1 day'; end if;
  return ends;
end $$;
revoke all on function private.quiet_until(uuid, timestamptz) from public, anon, authenticated, service_role;

-- One push to one device, held during quiet hours unless its class is an exception of the branch.
create or replace function private.enqueue_push(target_branch_id uuid, target_rule_id uuid, target_notification_id uuid, target_device uuid,
  job_payload jsonb, dedupe text, quiet_class text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  until_at timestamptz := private.quiet_until(target_branch_id);
  created uuid;
begin
  if until_at is not null and (quiet_class is null or not exists (select 1 from public.notification_quiet_hours h
      where h.branch_id = target_branch_id and quiet_class = any(h.exempt_keys))) then
    insert into public.outbound_jobs(branch_id, rule_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at)
    values (target_branch_id, target_rule_id, target_notification_id, 'PUSH', target_device::text, job_payload, left(dedupe, 200), 'HELD', until_at)
    on conflict (dedupe_key) do nothing returning id into created;
    return created;
  end if;
  return private.enqueue_outbound_job(target_branch_id, target_rule_id, target_notification_id, 'PUSH', target_device::text, job_payload, dedupe);
end $$;
revoke all on function private.enqueue_push(uuid, uuid, uuid, uuid, jsonb, text, text) from public, anon, authenticated, service_role;

-- Run each minute: pushes whose quiet hours ended go out, one per device and branch ("Trong giờ yên lặng có N thông báo").
create or replace function private.release_quiet_pushes(at_time timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  grp record;
  payload jsonb;
  total integer;
  released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('hx_release_quiet_pushes', 0));
  for grp in
    select j.branch_id, j.target, array_agg(j.id order by j.created_at, j.id) ids,
      array_agg(coalesce(j.payload->>'title', 'Thông báo') order by j.created_at, j.id) titles,
      count(distinct coalesce(j.payload->>'link', '')) links, min(j.payload->>'link') link
    from public.outbound_jobs j where j.state = 'HELD' and j.next_run_at <= at_time
    group by j.branch_id, j.target order by min(j.created_at)
  loop
    total := cardinality(grp.ids);
    if total = 1 then
      update public.outbound_jobs set state = 'PENDING', next_run_at = now() where id = grp.ids[1] and state = 'HELD';
      perform private.dispatch_outbound_job(grp.ids[1]);
    else
      payload := jsonb_strip_nulls(jsonb_build_object('kind', 'quiet.digest', 'title', 'Trong giờ yên lặng có ' || total || ' thông báo',
        'body', left(array_to_string(grp.titles[1:3], ' · ') || case when total > 3 then ' · và ' || (total - 3) || ' thông báo khác' else '' end, 1000),
        'link', case when grp.links = 1 then grp.link end));
      perform private.enqueue_outbound_job(grp.branch_id, null, null, 'PUSH', grp.target, payload, 'quiet:' || grp.target || ':' || grp.ids[1]);
      update public.outbound_jobs set state = 'MERGED', last_error_safe = 'Đã gộp vào một thông báo lúc hết giờ yên lặng'
      where id = any(grp.ids) and state = 'HELD';
    end if;
    released := released + 1;
  end loop;
  delete from public.outbound_jobs j where j.state = 'MERGED' and j.created_at < now() - interval '60 days';
  return released;
end $$;
revoke all on function private.release_quiet_pushes(timestamptz) from public, anon, authenticated, service_role;

-- ===== 5. Rules and built-in worker pushes (D80/D85 version + recipients, several channels, built-in switches, quiet hours) =====
create or replace function private.fire_automation() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  rule public.automation_rules%rowtype;
  device uuid;
  payload jsonb;
  amount bigint;
  problem boolean;
  quiet_class text;
  builtin text;
begin
  payload := jsonb_strip_nulls(jsonb_build_object('kind', new.kind, 'title', new.title, 'body', new.body, 'link', new.link,
    'entity_type', new.entity_type, 'entity_id', new.entity_id, 'notification_id', new.id, 'created_at', new.created_at));
  problem := new.kind = 'delivery.result_submitted'
    and exists (select 1 from public.deliveries d where d.id = new.entity_id and d.result_kind in ('PARTIAL', 'FAILED'));
  quiet_class := case when new.kind in ('work.assigned', 'delivery.pool_open', 'work.pool_open', 'work.field_declined') then 'worker_jobs'
    when problem then 'delivery_problems' when new.kind = 'order.portal_submitted' then 'order.portal_submitted' end;
  for rule in select * from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind order by r.id loop
    if rule.min_amount_vnd is not null then
      amount := private.automation_amount(new.entity_type, new.entity_id);
      if coalesce(amount, 0) < rule.min_amount_vnd then continue; end if;
    end if;
    if rule.problems_only and not problem then continue; end if;
    if 'PUSH' = any(rule.channels) then
      for device in select x from private.rule_push_devices(rule.id, new.branch_id, new.required_permission, new.recipient_employee_id) x loop
        perform private.enqueue_push(new.branch_id, rule.id, new.id, device, payload, 'rule:' || rule.id || ':' || new.id || ':' || device, quiet_class);
      end loop;
    end if;
    if 'WEBHOOK' = any(rule.channels) then
      perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, 'WEBHOOK', rule.target, payload, 'rule:' || rule.id || ':' || new.id);
    end if;
  end loop;
  -- D80/D85 built-in: a worker's / lead's own jobs reach his phone without a rule, unless a PUSH rule for the event takes over
  -- or the Owner turned the built-in off (D93).
  if new.recipient_employee_id is not null and new.kind in ('work.assigned', 'delivery.pool_open', 'work.pool_open', 'work.field_declined')
    and not exists (select 1 from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind and 'PUSH' = any(r.channels)) then
    builtin := case when new.kind = 'work.assigned' then 'work.assigned'
      when new.kind = 'delivery.pool_open' and new.required_permission = 'work.claim' then 'delivery.pool_open' else 'field_dispatch' end;
    if private.builtin_push_on(new.branch_id, builtin) then
      for device in select s.id from public.push_subscriptions s join public.employees e on e.auth_user_id = s.auth_user_id
        where e.id = new.recipient_employee_id and e.active order by s.id
      loop
        perform private.enqueue_push(new.branch_id, null, new.id, device, payload, 'worker:' || new.id || ':' || device, 'worker_jobs');
      end loop;
    end if;
  end if;
  return null;
end
$function$;
revoke all on function private.fire_automation() from public, anon, authenticated, service_role;

-- ===== 6. D83 announcements: switchable, held in quiet hours =====
create or replace function private.announcement_push(target_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.announcements%rowtype; sub public.push_subscriptions%rowtype; payload jsonb; lines integer; short text; sent integer := 0;
begin
  select * into a from public.announcements x where x.id = target_id;
  if a.id is null then return 0; end if;
  if not private.builtin_push_on(a.branch_id, case when a.kind = 'PRICE' and a.audience = 'CUSTOMER' then 'announcement.customer_price'
      when a.kind = 'PRICE' then 'announcement.office_price' when a.kind = 'PAY_RATE' then 'announcement.pay_rate' else 'announcement.manual' end) then
    return 0;
  end if;
  select count(*) into lines from public.announcement_lines l where l.announcement_id = a.id;
  short := case
    when a.kind = 'PRICE' then lines || ' mặt hàng đổi giá từ ' || to_char(a.effective_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
    when a.kind = 'PAY_RATE' then lines || ' đơn giá công đổi lúc ' || to_char(a.updated_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI, DD/MM/YYYY')
    else left(coalesce(a.body, ''), 140) end;
  payload := jsonb_strip_nulls(jsonb_build_object('kind', 'announcement', 'title', left(a.title, 200), 'body', nullif(short, ''),
    'link', case a.audience when 'CUSTOMER' then '/customer' when 'WORKER' then '/work' else '/' end, 'announcement_id', a.id));
  for sub in select s.* from public.push_subscriptions s where s.auth_user_id in (select private.announcement_recipients(a.id)) order by s.id loop
    if private.enqueue_push(a.branch_id, null, null, sub.id, payload, 'announcement:' || a.id || ':' || sub.id, null) is not null then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke all on function private.announcement_push(uuid) from public, anon, authenticated, service_role;

create or replace function private.announcement_cancel_push(target_id uuid, target_branch uuid, made_at timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare cancelled integer;
begin
  update public.outbound_jobs j set state = 'DEAD', lease_until = null, request_id = null, last_error_safe = 'Thông báo đã thu hồi trước khi gửi'
  where j.branch_id = target_branch and j.created_at >= made_at and j.channel = 'PUSH' and j.state in ('PENDING', 'FAILED', 'HELD')
    and j.dedupe_key like 'announcement:' || target_id || ':%';
  get diagnostics cancelled = row_count;
  return cancelled;
end $$;
revoke all on function private.announcement_cancel_push(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- ===== 7. Customer pushes =====
create or replace function private.vnd_text(amount bigint) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(coalesce(amount, 0), 'FM999,999,999,999,990'), ',', '.') || ' ₫'
$$;
revoke all on function private.vnd_text(bigint) from public, anon, authenticated, service_role;

-- To every device of the customer's active portal members; money items only to "Chủ tài khoản" and "Kế toán".
create or replace function private.customer_push(target_customer_id uuid, push_key text, push_title text, push_body text, push_link text,
  money boolean, ref text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers%rowtype;
  device uuid;
  payload jsonb;
  sent integer := 0;
begin
  select * into c from public.customers x where x.id = target_customer_id;
  if c.id is null or not c.active or not private.builtin_push_on(c.branch_id, push_key) then return 0; end if;
  payload := jsonb_strip_nulls(jsonb_build_object('kind', push_key, 'title', left(push_title, 200), 'body', nullif(left(coalesce(push_body, ''), 300), ''),
    'link', push_link));
  for device in select distinct s.id from public.push_subscriptions s
      join public.customer_portal_memberships m on m.auth_user_id = s.auth_user_id
    where m.customer_id = c.id and m.active and (not money or m.membership_role in ('OWNER', 'FINANCE_CONTACT'))
    order by s.id
  loop
    if private.enqueue_push(c.branch_id, null, null, device, payload, 'customer:' || push_key || ':' || ref || ':' || device, null) is not null then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke all on function private.customer_push(uuid, text, text, text, text, boolean, text) from public, anon, authenticated, service_role;

-- Order approved (incl. D79 auto-approve) / cancelled by the store. Checked at commit, when its deliveries exist.
create or replace function private.customer_push_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  eta timestamptz;
  reason text;
begin
  begin
    if new.commercial_state = 'CONFIRMED' and old.commercial_state is distinct from 'CONFIRMED' then
      select min(d.scheduled_at) into eta from public.deliveries d where d.sales_order_id = new.id and d.execution_state <> 'CANCELLED';
      eta := coalesce(eta, new.requested_delivery_at);
      perform private.customer_push(new.customer_id, 'customer.order_confirmed',
        new.order_number || ' đã duyệt' || coalesce(', dự kiến giao ' || to_char(eta at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), ''),
        new.site_name_snapshot, '/customer/orders/' || new.id, false, new.id::text);
    elsif new.commercial_state = 'CANCELLED' and old.commercial_state is distinct from 'CANCELLED'
      and (old.commercial_state = 'CONFIRMED' or new.order_channel = 'CUSTOMER_PORTAL')
      -- the customer who cancelled it himself is not told
      and not exists (select 1 from public.customer_portal_memberships m where m.customer_id = new.customer_id and m.active
        and m.auth_user_id = (select auth.uid())) then
      select e.reason into reason from public.audit_events e
      where e.entity_type = 'sales_order' and e.entity_id = new.id and e.action = 'sales_order.cancel' order by e.occurred_at desc, e.id desc limit 1;
      perform private.customer_push(new.customer_id, 'customer.order_cancelled', 'Đơn ' || new.order_number || ' đã hủy',
        'Lý do: ' || nullif(trim(reason), ''), '/customer/orders/' || new.id, false, new.id::text);
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_order() from public, anon, authenticated, service_role;
create constraint trigger sales_orders_customer_push after update of commercial_state on public.sales_orders
  deferrable initially deferred for each row execute function private.customer_push_order();

-- Truck on its way / delivered / short or failed (after the office verified the result).
create or replace function private.customer_push_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  plate text;
  result public.delivery_results%rowtype;
  link text := '/customer/orders/' || new.sales_order_id;
begin
  begin
    if new.execution_state = 'DISPATCHED' and old.execution_state in ('PLANNED', 'ASSIGNED') then
      select v.plate_number into plate from public.delivery_assignments a join public.vehicles v on v.id = a.vehicle_id
      where a.delivery_id = new.id and a.superseded_at is null;
      perform private.customer_push(new.customer_id, 'customer.delivery_dispatched',
        coalesce('Xe ' || plate, 'Xe') || ' đang chở hàng tới ' || new.site_name_snapshot, new.delivery_number, link, false, new.id::text);
    elsif new.execution_state = 'VERIFIED' and old.execution_state is distinct from 'VERIFIED' then
      select * into result from public.delivery_results r where r.delivery_id = new.id;
      if new.result_kind = 'FULL' then
        perform private.customer_push(new.customer_id, 'customer.delivery_done', 'Đã giao xong ' || new.delivery_number,
          concat_ws(' · ', new.site_name_snapshot, case when result.evidence_object_id is not null then 'Có ảnh xác nhận' end), link, false, new.id::text);
      elsif new.result_kind in ('PARTIAL', 'FAILED') then
        perform private.customer_push(new.customer_id, 'customer.delivery_problem',
          case when new.result_kind = 'PARTIAL' then 'Giao thiếu ' else 'Chưa giao được ' end || new.delivery_number,
          concat_ws(' · ', new.site_name_snapshot, nullif(trim(coalesce(nullif(trim(result.missing_arrival_reason), ''), result.note)), '')),
          link, false, new.id::text);
      end if;
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_delivery() from public, anon, authenticated, service_role;
create constraint trigger deliveries_customer_push after update of execution_state on public.deliveries
  deferrable initially deferred for each row execute function private.customer_push_delivery();

-- Payment received: amount and what is still owed (money roles only).
create or replace function private.customer_push_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owed bigint;
begin
  begin
    if new.direction = 'RECEIPT' and new.customer_id is not null and new.reversal_of_payment_id is null
      and not exists (select 1 from public.payments v where v.reversal_of_payment_id = new.id) then
      select coalesce(sum(private.current_receivable_outstanding(o.id)), 0) into owed from public.receivable_obligations o where o.customer_id = new.customer_id;
      perform private.customer_push(new.customer_id, 'customer.payment_received', 'Cửa hàng đã nhận ' || private.vnd_text(new.amount_vnd),
        case when owed > 0 then 'Còn nợ ' || private.vnd_text(owed) else 'Đã hết nợ' end, '/customer/debts', true, new.id::text);
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_payment() from public, anon, authenticated, service_role;
create constraint trigger payments_customer_push after insert on public.payments
  deferrable initially deferred for each row execute function private.customer_push_payment();

-- Daily (08:31): customers with money due within 3 days, due today or overdue: one combined push per customer per day.
create or replace function private.customer_debt_reminders(at_day date default (now() at time zone 'Asia/Ho_Chi_Minh')::date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  row record;
  made integer := 0;
begin
  for row in
    select o.customer_id, min(o.due_date) due_date, sum(o.owed)::bigint owed
    from (select x.customer_id, x.due_date, private.current_receivable_outstanding(x.id) owed
      from public.receivable_obligations x join public.customers c on c.id = x.customer_id and c.active
      where x.due_date <= at_day + 3) o
    where o.owed > 0
    group by o.customer_id order by o.customer_id
  loop
    if private.customer_push(row.customer_id, 'customer.debt_reminder', 'Nhắc thanh toán: ' || private.vnd_text(row.owed),
        case when row.due_date < at_day then 'Quá hạn từ ' || to_char(row.due_date, 'DD/MM/YYYY')
          when row.due_date = at_day then 'Đến hạn hôm nay' else 'Đến hạn ' || to_char(row.due_date, 'DD/MM/YYYY') end,
        '/customer/debts', true, row.customer_id || ':' || at_day) > 0 then
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;
revoke all on function private.customer_debt_reminders(date) from public, anon, authenticated, service_role;

-- ===== 8. Commands behind Cài đặt › Quy tắc tự động =====
create or replace function private.automation_target_valid(rule_channel text, rule_target text) returns boolean
language sql immutable set search_path = '' as $$
  select case rule_channel
    when 'PUSH' then rule_target is null
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
      'problems_only', r.problems_only, 'channels', to_jsonb(r.channels), 'target', r.target, 'active', r.active, 'version', r.version,
      'updated_at', r.updated_at, 'recipient_mode', r.recipient_mode,
      'role_ids', coalesce((select jsonb_agg(x.role_id order by x.role_id) from public.automation_rule_recipients x where x.rule_id = r.id and x.role_id is not null), '[]'::jsonb),
      'employee_ids', coalesce((select jsonb_agg(x.employee_id order by x.employee_id) from public.automation_rule_recipients x where x.rule_id = r.id and x.employee_id is not null), '[]'::jsonb))
      order by r.active desc, r.name, r.id) from public.automation_rules r where r.branch_id = target_branch_id), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(j order by j->>'created_at' desc) from (
      select jsonb_build_object('id', o.id, 'channel', o.channel, 'title', o.payload->>'title', 'state', o.state, 'attempt', o.attempt,
        'last_error', o.last_error_safe, 'created_at', o.created_at, 'sent_at', o.sent_at, 'rule_name', r.name) j
      from public.outbound_jobs o left join public.automation_rules r on r.id = o.rule_id
      where o.branch_id = target_branch_id order by o.created_at desc limit 30) recent), '[]'::jsonb),
    'setup', jsonb_build_object(
      'pg_net', exists (select 1 from pg_extension where extname = 'pg_net'),
      'pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron'),
      'webhook_secret', private.automation_secret('hx_webhook_secret') is not null,
      'app_delivery', private.automation_secret('hx_app_url') is not null and private.automation_secret('hx_automation_secret') is not null),
    'push_devices', (select count(*) from public.push_subscriptions s where private.login_has_permission(s.auth_user_id, target_branch_id, 'dashboard.read')
      or private.login_has_permission(s.auth_user_id, target_branch_id, 'work.read')),
    'my_devices', (select count(*) from public.push_subscriptions s where s.auth_user_id = (select auth.uid())),
    'builtins', coalesce((select jsonb_object_agg(s.builtin_key, s.push_enabled) from public.notification_builtin_settings s
      where s.branch_id = target_branch_id), '{}'::jsonb),
    'quiet_hours', (select jsonb_build_object('enabled', q.enabled, 'start_minute', q.start_minute, 'end_minute', q.end_minute,
      'exempt_keys', to_jsonb(q.exempt_keys), 'version', q.version) from public.notification_quiet_hours q where q.branch_id = target_branch_id),
    -- Who can receive: each person of the branch, his role, the permissions he holds here and how many devices he switched on.
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'role_id', p.role_id, 'role_name', p.role_name,
        'devices', p.devices, 'permissions', p.permissions) order by p.display_name, p.id)
      from (select distinct on (e.id) e.id, e.display_name, a.role_id, ro.name role_name,
          (select count(*) from public.push_subscriptions s where s.auth_user_id = e.auth_user_id) devices,
          coalesce((select jsonb_agg(distinct x.code) from (
            select rp.permission_code code from public.role_permissions rp where rp.role_id = a.role_id and ro.active
            union select g.permission_code from public.employee_permission_grants g where g.employee_id = e.id and g.branch_id = target_branch_id) x), '[]'::jsonb) permissions
        from public.employees e
        join public.employee_branch_access a on a.employee_id = e.id and a.active and a.branch_id = target_branch_id
        join public.roles ro on ro.id = a.role_id
        where e.active order by e.id, ro.active desc, a.granted_at) p), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', ro.id, 'name', ro.name) order by ro.name, ro.id) from public.roles ro
      where ro.active and exists (select 1 from public.employee_branch_access a join public.employees e on e.id = a.employee_id and e.active
        where a.role_id = ro.id and a.active and a.branch_id = target_branch_id)), '[]'::jsonb),
    'customers', (select jsonb_build_object('people', count(distinct m.auth_user_id),
        'devices', (select count(*) from public.push_subscriptions s where s.auth_user_id in (select m2.auth_user_id
          from public.customer_portal_memberships m2 join public.customers c2 on c2.id = m2.customer_id and c2.active
          where m2.active and c2.branch_id = target_branch_id)))
      from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id and c.active
      where m.active and c.branch_id = target_branch_id));
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
  rule_channels text[];
  rule_target text := nullif(trim(coalesce(rule->>'target', '')), '');
  mode text := coalesce(nullif(rule->>'recipient_mode', ''), 'PERMISSION');
  role_ids uuid[];
  employee_ids uuid[];
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
  if jsonb_typeof(rule) is distinct from 'object' then raise exception 'automation_rule_invalid' using errcode = '22023'; end if;
  -- channels: a list (D93) or one channel (older callers); listed in a fixed order.
  rule_channels := case when jsonb_typeof(rule->'channels') = 'array' then array(select jsonb_array_elements_text(rule->'channels'))
    else array[rule->>'channel'] end;
  rule_channels := case when rule_channels <@ array['PUSH', 'WEBHOOK'] then array(select c from unnest(array['PUSH', 'WEBHOOK']) c where c = any(rule_channels))
    else rule_channels end;
  if not 'WEBHOOK' = any(rule_channels) then rule_target := null; end if;
  role_ids := case when mode = 'ROLES' and jsonb_typeof(rule->'role_ids') = 'array' then array(select distinct x::uuid from jsonb_array_elements_text(rule->'role_ids') x) end;
  employee_ids := case when mode = 'PEOPLE' and jsonb_typeof(rule->'employee_ids') = 'array' then array(select distinct x::uuid from jsonb_array_elements_text(rule->'employee_ids') x) end;
  if not private.automation_channels_valid(rule_channels)
    or ('WEBHOOK' = any(rule_channels) and not private.automation_target_valid('WEBHOOK', rule_target))
    or coalesce(rule->>'min_amount_vnd', '') !~ '^([1-9][0-9]{0,15})?$'
    or mode not in ('PERMISSION', 'ROLES', 'PEOPLE')
    or (mode = 'ROLES' and (coalesce(cardinality(role_ids), 0) not between 1 and 50
      or exists (select 1 from unnest(role_ids) x where not exists (select 1 from public.roles ro where ro.id = x and ro.active))))
    or (mode = 'PEOPLE' and (coalesce(cardinality(employee_ids), 0) not between 1 and 200
      or exists (select 1 from unnest(employee_ids) x where not exists (select 1 from public.employees e
        join public.employee_branch_access a on a.employee_id = e.id and a.active and a.branch_id = target_branch_id where e.id = x and e.active)))) then
    raise exception 'automation_rule_invalid' using errcode = '22023';
  end if;
  amount := nullif(rule->>'min_amount_vnd', '')::bigint;
  if target_rule_id is null then
    insert into public.automation_rules(branch_id, name, event, min_amount_vnd, problems_only, channel, channels, target, active, created_by, recipient_mode)
    values (target_branch_id, trim(rule->>'name'), rule->>'event', amount, coalesce((rule->>'problems_only')::boolean, false), rule_channels[1], rule_channels,
      rule_target, coalesce((rule->>'active')::boolean, true), me, mode)
    returning id into saved;
  else
    select * into existing from public.automation_rules r where r.id = target_rule_id and r.branch_id = target_branch_id for update;
    if existing.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
    if existing.version is distinct from expected_version then raise exception 'automation_rule_version_conflict' using errcode = 'PT409'; end if;
    update public.automation_rules set name = trim(rule->>'name'), event = rule->>'event', min_amount_vnd = amount,
      problems_only = coalesce((rule->>'problems_only')::boolean, false), channel = rule_channels[1], channels = rule_channels, target = rule_target,
      active = coalesce((rule->>'active')::boolean, true), recipient_mode = mode, version = version + 1, updated_at = now()
    where id = existing.id returning id into saved;
    delete from public.automation_rule_recipients x where x.rule_id = saved;
  end if;
  insert into public.automation_rule_recipients(rule_id, role_id) select saved, x from unnest(role_ids) x;
  insert into public.automation_rule_recipients(rule_id, employee_id) select saved, x from unnest(employee_ids) x;
  insert into public.command_receipts values (save_automation_rule.operation_id, me, 'save_automation_rule', hash, 'automation_rule', saved, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, case when target_rule_id is null then 'automation_rule.create' else 'automation_rule.update' end, 'automation_rule', saved,
    save_automation_rule.operation_id, array['event', 'conditions', 'recipients', 'channels', 'active'], left(trim(rule->>'name'), 120));
  return saved;
exception when check_violation or invalid_text_representation or not_null_violation then
  raise exception 'automation_rule_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.save_automation_rule(uuid, uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_automation_rule(uuid, uuid, jsonb, integer, uuid) to authenticated;

-- "Gửi thử": only to the caller's own devices, at once (never to the rule's people, never to a webhook, not held).
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
  for sub in select s.* from public.push_subscriptions s where s.auth_user_id = me order by s.id loop
    if private.enqueue_outbound_job(rule.branch_id, rule.id, null, 'PUSH', sub.id::text, payload, 'test:' || test_automation_rule.operation_id || ':' || sub.id) is not null then
      made := made + 1;
    end if;
  end loop;
  return made;
end
$function$;
revoke all on function public.test_automation_rule(uuid, uuid) from public, anon;
grant execute on function public.test_automation_rule(uuid, uuid) to authenticated;

-- "Gửi thử cho tôi" in the rule editor (before saving): the preview text, to the caller's own devices only.
create or replace function public.send_test_push(target_branch_id uuid, push_title text, push_body text, operation_id uuid) returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  sub public.push_subscriptions%rowtype;
  payload jsonb;
  made integer := 0;
begin
  if me is null or send_test_push.operation_id is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(push_title, ''))) not between 3 and 200 or char_length(coalesce(push_body, '')) > 300 then
    raise exception 'automation_rule_invalid' using errcode = '22023';
  end if;
  payload := jsonb_strip_nulls(jsonb_build_object('kind', 'automation.test', 'title', 'Thử: ' || btrim(push_title), 'body', nullif(btrim(coalesce(push_body, '')), ''),
    'link', '/admin/settings/automation'));
  for sub in select s.* from public.push_subscriptions s where s.auth_user_id = me order by s.id loop
    if private.enqueue_outbound_job(target_branch_id, null, null, 'PUSH', sub.id::text, payload, 'test:' || send_test_push.operation_id || ':' || sub.id) is not null then
      made := made + 1;
    end if;
  end loop;
  return made;
end
$function$;
revoke all on function public.send_test_push(uuid, text, text, uuid) from public, anon;
grant execute on function public.send_test_push(uuid, text, text, uuid) to authenticated;

-- Turn a built-in push on or off for the branch (the in-app notification / popup is not affected).
create or replace function public.set_builtin_push(target_branch_id uuid, target_key text, enabled boolean, operation_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $function$
declare me uuid := (select auth.uid());
begin
  if me is null or set_builtin_push.operation_id is null or set_builtin_push.enabled is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.notification_builtin_settings(branch_id, builtin_key, push_enabled, updated_by)
  values (target_branch_id, set_builtin_push.target_key, set_builtin_push.enabled, me)
  on conflict (branch_id, builtin_key) do update set push_enabled = excluded.push_enabled, updated_by = me, updated_at = now();
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, 'notification_builtin.' || case when set_builtin_push.enabled then 'enable' else 'disable' end, 'branch', target_branch_id,
    set_builtin_push.operation_id, array['push_enabled'], set_builtin_push.target_key);
  return set_builtin_push.enabled;
exception when check_violation then
  raise exception 'automation_rule_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.set_builtin_push(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.set_builtin_push(uuid, text, boolean, uuid) to authenticated;

-- Quiet hours of the branch (expected_version null = not saved yet).
create or replace function public.save_quiet_hours(target_branch_id uuid, settings jsonb, expected_version integer, operation_id uuid) returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  existing public.notification_quiet_hours%rowtype;
  saved integer;
  keys text[];
begin
  if me is null or save_quiet_hours.operation_id is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(settings) is distinct from 'object' or jsonb_typeof(settings->'exempt_keys') is distinct from 'array'
    or jsonb_typeof(settings->'enabled') is distinct from 'boolean' then
    raise exception 'quiet_hours_invalid' using errcode = '22023';
  end if;
  keys := array(select distinct x from jsonb_array_elements_text(settings->'exempt_keys') x order by x);
  select * into existing from public.notification_quiet_hours q where q.branch_id = target_branch_id for update;
  if existing.version is distinct from expected_version then raise exception 'quiet_hours_version_conflict' using errcode = 'PT409'; end if;
  if existing.branch_id is null then
    insert into public.notification_quiet_hours(branch_id, enabled, start_minute, end_minute, exempt_keys, updated_by)
    values (target_branch_id, (settings->>'enabled')::boolean, (settings->>'start_minute')::smallint, (settings->>'end_minute')::smallint, keys, me)
    returning version into saved;
  else
    update public.notification_quiet_hours set enabled = (settings->>'enabled')::boolean, start_minute = (settings->>'start_minute')::smallint,
      end_minute = (settings->>'end_minute')::smallint, exempt_keys = keys, version = version + 1, updated_by = me, updated_at = now()
    where branch_id = target_branch_id returning version into saved;
  end if;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, 'notification_quiet_hours.update', 'branch', target_branch_id, save_quiet_hours.operation_id,
    array['enabled', 'start_minute', 'end_minute', 'exempt_keys'], case when (settings->>'enabled')::boolean then 'Bật giờ yên lặng' else 'Tắt giờ yên lặng' end);
  return saved;
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception 'quiet_hours_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.save_quiet_hours(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_quiet_hours(uuid, jsonb, integer, uuid) to authenticated;

-- ===== 9. Schedules =====
do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hx-quiet-pushes', '* * * * *', 'select private.release_quiet_pushes()');
    perform cron.schedule('hx-customer-debt-push', '31 1 * * *', 'select private.customer_debt_reminders()');
  end if;
end
$schedule$;

notify pgrst, 'reload schema';
commit;
