-- FB3/FB4 R3 (Owner 17/10/2026): in-app notifications (the bell). A notification belongs to a branch and is seen by everyone
-- who holds its permission there (or by one employee when it names a recipient). Rows are written only inside the command
-- that causes them (private.notify, same transaction); the app reads them through notification_feed and Realtime only tells
-- the bell to reload (PLAN-025: no queue, no event bus). Read state is per login.
-- First events: a delivery reported by the worker waits for verification (short or failed deliveries say so), and a worker
-- gets a new job. Later commands (auto-sourcing, auto-dispatch, customer orders) call private.notify themselves.
begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{2,60}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{1,40}$'),
  entity_id uuid,
  title text not null check (char_length(trim(title)) between 3 and 200),
  body text check (body is null or char_length(body) <= 1000),
  link text check (link is null or link ~ '^/(admin|work)(/[A-Za-z0-9_./?=&%-]*)?$'),
  required_permission text not null references public.permissions(code) on delete restrict,
  recipient_employee_id uuid references public.employees(id) on delete restrict,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) between 3 and 200),
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe_unique on public.notifications(branch_id, dedupe_key) where dedupe_key is not null;
create index notifications_branch_created_idx on public.notifications(branch_id, created_at desc);
create index notifications_recipient_idx on public.notifications(recipient_employee_id, created_at desc) where recipient_employee_id is not null;

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, auth_user_id)
);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
revoke all on public.notifications, public.notification_reads from anon, authenticated;
-- Select is granted so Realtime can tell a signed-in user that a notification they may see arrived.
grant select on public.notifications to authenticated;
grant select on public.notification_reads to authenticated;

create or replace function private.can_see_notification(target public.notifications) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and private.has_permission(target.branch_id, target.required_permission)
    and (target.recipient_employee_id is null or target.recipient_employee_id = private.current_employee_id())
$$;
revoke all on function private.can_see_notification(public.notifications) from public, anon, authenticated, service_role;
grant execute on function private.can_see_notification(public.notifications) to authenticated;

create policy notifications_select on public.notifications for select to authenticated using (private.can_see_notification(notifications));
create policy notification_reads_select on public.notification_reads for select to authenticated using (auth_user_id = (select auth.uid()));

-- The only writer. Same dedupe key in a branch = one notification (a replayed command does not ring twice).
create or replace function private.notify(target_branch_id uuid, notification_kind text, target_entity_type text, target_entity_id uuid,
  notification_title text, notification_body text, notification_link text, permission_code text, recipient uuid, dedupe text)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare created uuid;
begin
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, body, link, required_permission, recipient_employee_id, dedupe_key)
  values (target_branch_id, notification_kind, target_entity_type, target_entity_id, left(trim(notification_title), 200),
    nullif(left(trim(coalesce(notification_body, '')), 1000), ''), notification_link, permission_code, recipient, dedupe)
  on conflict (branch_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into created;
  return created;
end
$function$;
revoke all on function private.notify(uuid, text, text, uuid, text, text, text, text, uuid, text) from public, anon, authenticated, service_role;

-- The bell: newest visible notifications of the branch and how many are unread for this login.
create or replace function public.notification_feed(target_branch_id uuid, page_limit integer default 20, before_at timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  result jsonb;
begin
  if me is null or not private.has_branch_access(target_branch_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  with visible as (
    select n.* from public.notifications n
    where n.branch_id = target_branch_id and private.can_see_notification(n)
  )
  select jsonb_build_object(
    'unread', (select count(*) from visible v where not exists (select 1 from public.notification_reads r where r.notification_id = v.id and r.auth_user_id = me)),
    'items', coalesce((select jsonb_agg(item order by item->>'created_at' desc, item->>'id' desc) from (
      select jsonb_build_object('id', v.id, 'kind', v.kind, 'title', v.title, 'body', v.body, 'link', v.link, 'created_at', v.created_at,
        'read', exists (select 1 from public.notification_reads r where r.notification_id = v.id and r.auth_user_id = me)) as item
      from visible v
      where before_at is null or v.created_at < before_at
      order by v.created_at desc, v.id desc
      limit least(greatest(coalesce(page_limit, 20), 1), 100)) page), '[]'::jsonb))
  into result;
  return result;
end
$function$;
revoke all on function public.notification_feed(uuid, integer, timestamptz) from public, anon;
grant execute on function public.notification_feed(uuid, integer, timestamptz) to authenticated;

-- Marks the given notifications (or every visible one of the branch when ids is null) as read for this login.
create or replace function public.mark_notifications_read(target_branch_id uuid, notification_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  marked integer;
begin
  if me is null or not private.has_branch_access(target_branch_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if notification_ids is not null and cardinality(notification_ids) > 200 then raise exception 'invalid_input' using errcode = '22023'; end if;
  insert into public.notification_reads(notification_id, auth_user_id)
  select n.id, me from public.notifications n
  where n.branch_id = target_branch_id and private.can_see_notification(n)
    and (notification_ids is null or n.id = any(notification_ids))
  on conflict do nothing;
  get diagnostics marked = row_count;
  return marked;
end
$function$;
revoke all on function public.mark_notifications_read(uuid, uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid, uuid[]) to authenticated;

-- A delivery result reaches the office: whoever verifies deliveries is told, with short or failed deliveries named.
create or replace function private.notify_delivery_result() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if new.execution_state = 'RESULT_SUBMITTED' and old.execution_state is distinct from 'RESULT_SUBMITTED' then
    perform private.notify(new.branch_id, 'delivery.result_submitted', 'delivery', new.id,
      case new.result_kind when 'FAILED' then 'Không giao được ' || new.delivery_number
        when 'PARTIAL' then 'Giao thiếu ' || new.delivery_number else new.delivery_number || ' đã giao — chờ xác minh' end,
      new.customer_name_snapshot || ' · ' || new.site_name_snapshot, '/admin/deliveries/' || new.id, 'delivery.verify', null,
      'delivery.result:' || new.id || ':' || new.version);
  end if;
  return new;
end
$function$;
revoke all on function private.notify_delivery_result() from public, anon, authenticated, service_role;
create trigger deliveries_notify_result after update of execution_state on public.deliveries
  for each row execute function private.notify_delivery_result();

-- A job handed to a worker by someone else lands on that worker's phone list.
create or replace function private.notify_work_assignment() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare item public.work_items%rowtype;
begin
  if new.superseded_at is null and new.assignment_kind = 'DIRECT' then
    select * into item from public.work_items w where w.id = new.work_item_id;
    if exists (select 1 from public.employees e where e.id = new.employee_id and e.auth_user_id is distinct from new.assigned_by) then
      perform private.notify(item.branch_id, 'work.assigned', 'work_item', item.id, 'Việc mới: ' || item.title,
        to_char(item.scheduled_start at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), '/work/jobs/' || item.id, 'work.claim', new.employee_id,
        'work.assigned:' || new.id);
    end if;
  end if;
  return new;
end
$function$;
revoke all on function private.notify_work_assignment() from public, anon, authenticated, service_role;
create trigger work_item_assignments_notify after insert on public.work_item_assignments
  for each row execute function private.notify_work_assignment();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end
$$;

comment on table public.notifications is 'In-app notifications written by the command that causes them; Realtime only signals the bell to reload.';
notify pgrst, 'reload schema';
commit;
