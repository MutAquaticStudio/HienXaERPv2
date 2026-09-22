create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  audience text not null check (audience in ('INTERNAL','CUSTOMER')),
  customer_id uuid references public.customers(id) on delete restrict,
  subject text not null check (char_length(subject) between 3 and 160),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid not null,
  participant_summary text not null,
  last_message_id uuid,
  last_message_preview text,
  last_message_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  operation_id uuid not null unique,
  check ((audience = 'CUSTOMER' and customer_id is not null) or (audience = 'INTERNAL' and customer_id is null))
);

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  participant_kind text not null check (participant_kind in ('EMPLOYEE','CUSTOMER')),
  display_name_snapshot text not null,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_read_at timestamptz,
  active boolean not null default true,
  added_at timestamptz not null default now(),
  unique (conversation_id, auth_user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_auth_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  operation_id uuid not null,
  unique (conversation_id, sender_auth_user_id, operation_id)
);

alter table public.conversations
  add constraint conversations_last_message_fk foreign key (last_message_id) references public.messages(id) on delete restrict;

create index conversations_branch_updated_idx on public.conversations(branch_id, updated_at desc, id desc);
create index conversation_participants_user_idx on public.conversation_participants(auth_user_id, active, conversation_id);
create index messages_conversation_page_idx on public.messages(conversation_id, created_at desc, id desc);

create or replace function private.can_access_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = target_conversation_id
      and p.auth_user_id = (select auth.uid())
      and p.active
  )
$$;

revoke all on function private.can_access_conversation(uuid) from public;
grant execute on function private.can_access_conversation(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations, public.conversation_participants, public.messages from anon, authenticated;
grant select on public.conversations, public.conversation_participants, public.messages to authenticated;

create policy conversations_select on public.conversations for select to authenticated
  using ((select private.can_access_conversation(id)));
create policy conversation_participants_select on public.conversation_participants for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));
create policy messages_select on public.messages for select to authenticated
  using ((select private.can_access_conversation(conversation_id)));

create or replace function public.create_conversation(
  target_branch_id uuid,
  target_audience text,
  target_customer_id uuid,
  target_subject text,
  target_entity_type text,
  target_entity_id uuid,
  target_participant_auth_user_ids uuid[],
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  participant_auth_user_id uuid;
  participant_kind text;
  participant_display text;
  participant_ids uuid[];
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  if (select auth.uid()) is null or not private.has_branch_access(target_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_audience not in ('INTERNAL','CUSTOMER') or char_length(trim(target_subject)) not between 3 and 160
    or char_length(trim(target_entity_type)) not between 2 and 80 or target_entity_id is null then
    raise exception 'invalid_conversation' using errcode = '22023';
  end if;
  if target_audience = 'CUSTOMER' then
    if not private.has_permission(target_branch_id, 'customers.read') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if target_customer_id is null or not exists (
      select 1 from public.customers c where c.id = target_customer_id and c.branch_id = target_branch_id and c.active
    ) then raise exception 'conversation_customer_invalid' using errcode = '23503'; end if;
  elsif target_customer_id is not null then
    raise exception 'internal_conversation_customer_forbidden' using errcode = '22023';
  end if;
  select array_agg(distinct participant order by participant) into participant_ids
  from unnest(array_append(coalesce(target_participant_auth_user_ids, '{}'::uuid[]), (select auth.uid()))) participant;
  if coalesce(cardinality(participant_ids), 0) not between 2 and 50 then
    raise exception 'conversation_participants_invalid' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'branch_id', target_branch_id,
    'audience', target_audience,
    'customer_id', target_customer_id,
    'subject', trim(target_subject),
    'entity_type', trim(target_entity_type),
    'entity_id', target_entity_id,
    'participants', participant_ids
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_conversation.operation_id;
  if found then
    if receipt.command_name <> 'create_conversation' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;

  insert into public.conversations(
    branch_id, audience, customer_id, subject, entity_type, entity_id,
    participant_summary, created_by, operation_id
  ) values (
    target_branch_id, target_audience, target_customer_id, trim(target_subject), trim(target_entity_type), target_entity_id,
    'Đang cập nhật người tham gia', (select auth.uid()), operation_id
  ) returning id into conversation_id;

  foreach participant_auth_user_id in array participant_ids loop
    participant_kind := null;
    participant_display := null;
    select 'EMPLOYEE', e.display_name into participant_kind, participant_display
      from public.employees e
      join public.employee_branch_access a on a.employee_id = e.id and a.active
      where e.auth_user_id = participant_auth_user_id and e.active and a.branch_id = target_branch_id
      limit 1;
    if participant_display is null and target_audience = 'CUSTOMER' then
      select 'CUSTOMER', c.display_name || ' (khách hàng)' into participant_kind, participant_display
      from public.customer_portal_memberships m
      join public.customers c on c.id = m.customer_id and c.active
      where m.auth_user_id = participant_auth_user_id and m.customer_id = target_customer_id and m.active
      limit 1;
    end if;
    if participant_display is null or (target_audience = 'INTERNAL' and participant_kind <> 'EMPLOYEE') then
      raise exception 'conversation_participant_forbidden' using errcode = '42501';
    end if;
    insert into public.conversation_participants(
      conversation_id, auth_user_id, participant_kind, display_name_snapshot, last_read_at
    ) values (
      conversation_id, participant_auth_user_id, participant_kind, participant_display,
      case when participant_auth_user_id = (select auth.uid()) then now() else null end
    );
  end loop;

  update public.conversations c set participant_summary = (
    select string_agg(p.display_name_snapshot, ', ' order by p.display_name_snapshot)
    from public.conversation_participants p where p.conversation_id = c.id
  ) where c.id = conversation_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_conversation', payload_hash, 'conversation', conversation_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'conversation.created', 'conversation', conversation_id, operation_id,
    array['audience','participants','entity']);
  return conversation_id;
end
$$;

create or replace function public.send_message(
  target_conversation_id uuid,
  target_body text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.conversations%rowtype;
  message_id uuid;
  normalized_body text;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into conversation from public.conversations c where c.id = target_conversation_id for update;
  if conversation.id is null or not private.can_access_conversation(conversation.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  normalized_body := trim(target_body);
  if char_length(normalized_body) not between 1 and 4000 then
    raise exception 'message_body_invalid' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('conversation_id', target_conversation_id, 'body', normalized_body));
  select * into receipt from public.command_receipts where command_receipts.operation_id = send_message.operation_id;
  if found then
    if receipt.command_name <> 'send_message' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  insert into public.messages(conversation_id, sender_auth_user_id, body, operation_id)
  values (conversation.id, (select auth.uid()), normalized_body, operation_id)
  returning id into message_id;
  update public.conversations
    set last_message_id = message_id,
        last_message_preview = left(normalized_body, 240),
        last_message_at = now(),
        updated_at = now()
    where id = conversation.id;
  update public.conversation_participants
    set unread_count = case when auth_user_id = (select auth.uid()) then 0 else unread_count + 1 end,
        last_read_at = case when auth_user_id = (select auth.uid()) then now() else last_read_at end
    where conversation_id = conversation.id and active;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'send_message', payload_hash, 'message', message_id, now());
  return message_id;
end
$$;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants
    set unread_count = 0, last_read_at = now()
    where conversation_id = target_conversation_id and auth_user_id = (select auth.uid()) and active;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  return target_conversation_id;
end
$$;

create or replace function public.conversation_list_snapshot(page_size integer)
returns table(
  conversation_id uuid,
  branch_id uuid,
  audience text,
  customer_id uuid,
  subject text,
  entity_type text,
  entity_id uuid,
  participant_summary text,
  last_message_preview text,
  last_message_at timestamptz,
  updated_at timestamptz,
  unread_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare bounded_size integer;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  bounded_size := least(100, greatest(1, coalesce(page_size, 50)));
  return query
    select c.id, c.branch_id, c.audience, c.customer_id, c.subject, c.entity_type, c.entity_id,
      c.participant_summary, c.last_message_preview, c.last_message_at, c.updated_at, p.unread_count
    from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id
    where p.auth_user_id = (select auth.uid()) and p.active
    order by c.updated_at desc, c.id desc
    limit bounded_size;
end
$$;

create or replace function public.conversation_message_page(
  target_conversation_id uuid,
  before_created_at timestamptz,
  before_id uuid,
  page_size integer
)
returns setof public.messages
language plpgsql
stable
security definer
set search_path = ''
as $$
declare bounded_size integer;
begin
  if not private.can_access_conversation(target_conversation_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  bounded_size := least(100, greatest(1, coalesce(page_size, 50)));
  return query
    select m.* from public.messages m
    where m.conversation_id = target_conversation_id
      and (before_created_at is null or (m.created_at, m.id) < (before_created_at, before_id))
    order by m.created_at desc, m.id desc
    limit bounded_size;
end
$$;

create or replace function public.messaging_participant_options(target_branch_id uuid, result_limit integer)
returns table(auth_user_id uuid, participant_kind text, display_name text, customer_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare bounded_size integer;
begin
  if not private.has_branch_access(target_branch_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  bounded_size := least(200, greatest(1, coalesce(result_limit, 200)));
  return query
    select options.auth_user_id, options.participant_kind, options.display_name, options.customer_id
    from (
      select distinct e.auth_user_id, 'EMPLOYEE'::text participant_kind, e.display_name, null::uuid customer_id
      from public.employees e
      join public.employee_branch_access a on a.employee_id = e.id and a.active
      where a.branch_id = target_branch_id and e.active
      union all
      select distinct m.auth_user_id, 'CUSTOMER'::text, c.display_name || ' (khách hàng)', c.id
      from public.customer_portal_memberships m
      join public.customers c on c.id = m.customer_id and c.active
      where c.branch_id = target_branch_id and m.active and private.has_permission(target_branch_id, 'customers.read')
    ) options
    order by options.participant_kind, options.display_name, options.auth_user_id
    limit bounded_size;
end
$$;

revoke all on function public.create_conversation(uuid,text,uuid,text,text,uuid,uuid[],uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.conversation_list_snapshot(integer) from public, anon, authenticated;
revoke all on function public.conversation_message_page(uuid,timestamptz,uuid,integer) from public, anon, authenticated;
revoke all on function public.messaging_participant_options(uuid,integer) from public, anon, authenticated;
grant execute on function public.create_conversation(uuid,text,uuid,text,text,uuid,uuid[],uuid) to authenticated;
grant execute on function public.send_message(uuid,text,uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.conversation_list_snapshot(integer) to authenticated;
grant execute on function public.conversation_message_page(uuid,timestamptz,uuid,integer) to authenticated;
grant execute on function public.messaging_participant_options(uuid,integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.messages;
    exception when duplicate_object then null;
    end;
  end if;
end
$$;

comment on table public.messages is 'Database-authoritative conversation messages; realtime is refresh transport only.';
