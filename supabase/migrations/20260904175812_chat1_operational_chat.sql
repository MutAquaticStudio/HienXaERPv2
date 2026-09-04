-- HIỀN XA ERP CHAT1 — durable, context-bound operational conversation.
-- A message is communication only. It never invokes or transitions Sales,
-- Delivery, Finance, Work, Service, or Route-plan business records.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in (
    'DELIVERY', 'SALES_ORDER', 'SERVICE_JOB', 'PORTAL_ISSUE', 'CUSTOMER_SUPPORT'
  )),
  context_id uuid not null,
  customer_id uuid references public.customers(id) on delete restrict,
  subject_snapshot text not null check (char_length(trim(subject_snapshot)) between 2 and 200),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete restrict,
  closed_at timestamptz,
  close_reason text check (close_reason is null or char_length(trim(close_reason)) between 10 and 500),
  constraint conversations_context_once unique (context_type, context_id),
  constraint conversations_closed_shape check (
    (status = 'OPEN' and closed_by is null and closed_at is null and close_reason is null)
    or (status = 'CLOSED' and closed_by is not null and closed_at is not null and close_reason is not null)
  )
);

create index conversations_customer_idx
  on public.conversations(customer_id, created_at desc) where customer_id is not null;

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('EMPLOYEE', 'CUSTOMER')),
  display_name_snapshot text not null check (char_length(trim(display_name_snapshot)) between 2 and 160),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, actor_user_id)
);

create index conversation_participants_actor_idx
  on public.conversation_participants(actor_user_id, conversation_id);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  sender_kind text not null check (sender_kind in ('EMPLOYEE', 'CUSTOMER')),
  sender_display_name_snapshot text not null check (char_length(trim(sender_display_name_snapshot)) between 2 and 160),
  message_type text not null default 'TEXT' check (message_type = 'TEXT'),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  evidence_id uuid references public.evidence(id) on delete restrict,
  client_idempotency_key text not null check (client_idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  created_at timestamptz not null default now(),
  unique (conversation_id, sender_user_id, client_idempotency_key)
);

create index conversation_messages_conversation_idx
  on public.conversation_messages(conversation_id, created_at, id);
create index conversation_messages_evidence_idx
  on public.conversation_messages(evidence_id) where evidence_id is not null;

create or replace function app_private.prevent_chat_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'CHAT_HISTORY_IMMUTABLE' using errcode = '22000';
end;
$$;

create or replace function app_private.guard_chat_participant_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.conversation_id is distinct from old.conversation_id
    or new.actor_user_id is distinct from old.actor_user_id
    or new.actor_kind is distinct from old.actor_kind
    or new.display_name_snapshot is distinct from old.display_name_snapshot
    or new.joined_at is distinct from old.joined_at
    or new.last_read_at < old.last_read_at
  then
    raise exception 'CHAT_PARTICIPANT_IMMUTABLE' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger conversations_no_delete before delete on public.conversations
for each row execute function app_private.prevent_chat_history_mutation();
create trigger conversation_participants_no_delete before delete on public.conversation_participants
for each row execute function app_private.prevent_chat_history_mutation();
create trigger conversation_participants_guard before update on public.conversation_participants
for each row execute function app_private.guard_chat_participant_update();
create trigger conversation_messages_immutable before update or delete on public.conversation_messages
for each row execute function app_private.prevent_chat_history_mutation();

create or replace function app_private.chat_context_customer_id(
  p_context_type text, p_context_id uuid
) returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare resolved_customer_id uuid;
begin
  if p_context_type = 'DELIVERY' then
    select delivery.customer_id into resolved_customer_id from public.deliveries delivery where delivery.id = p_context_id;
  elsif p_context_type = 'SALES_ORDER' then
    select sales_order.customer_id into resolved_customer_id from public.sales_orders sales_order where sales_order.id = p_context_id;
  elsif p_context_type = 'SERVICE_JOB' then
    select service_job.customer_id into resolved_customer_id from public.service_jobs service_job where service_job.id = p_context_id;
  elsif p_context_type = 'CUSTOMER_SUPPORT' and exists (
    select 1 from public.customers customer where customer.id = p_context_id and customer.is_active
  ) then
    resolved_customer_id := p_context_id;
  end if;
  return resolved_customer_id;
end;
$$;

create or replace function app_private.chat_context_subject(
  p_context_type text, p_context_id uuid
) returns text
language plpgsql stable security invoker set search_path = '' as $$
declare subject text;
begin
  if p_context_type = 'DELIVERY' then
    select 'Chuyến giao ' || delivery.delivery_number into subject from public.deliveries delivery where delivery.id = p_context_id;
  elsif p_context_type = 'SALES_ORDER' then
    select 'Đơn hàng ' || sales_order.sales_order_number into subject from public.sales_orders sales_order where sales_order.id = p_context_id;
  elsif p_context_type = 'SERVICE_JOB' then
    select 'Công việc dịch vụ ' || service_job.job_number into subject from public.service_jobs service_job where service_job.id = p_context_id;
  elsif p_context_type = 'PORTAL_ISSUE' then
    select 'Sự cố ' || issue.issue_number into subject from public.portal_issues issue where issue.id = p_context_id;
  elsif p_context_type = 'CUSTOMER_SUPPORT' then
    select 'Hỗ trợ ' || customer.name_vi into subject from public.customers customer where customer.id = p_context_id and customer.is_active;
  end if;
  return subject;
end;
$$;

create or replace function app_private.chat_context_authorized(
  p_actor_id uuid, p_context_type text, p_context_id uuid
) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare membership_customer_id uuid;
begin
  if p_actor_id is null or p_context_id is null or p_context_type not in (
    'DELIVERY', 'SALES_ORDER', 'SERVICE_JOB', 'PORTAL_ISSUE', 'CUSTOMER_SUPPORT'
  ) then return false; end if;

  if app_private.is_active_user(p_actor_id) then
    if not app_private.actor_has_permission(p_actor_id, 'chat.read') then return false; end if;
    if p_context_type = 'DELIVERY' then return
      app_private.actor_has_permission(p_actor_id, 'delivery.read') or exists (
        select 1 from public.delivery_assignments assignment
        where assignment.delivery_id = p_context_id and assignment.driver_user_id = p_actor_id
          and assignment.status in ('ASSIGNED', 'ACCEPTED')
      );
    elsif p_context_type = 'SALES_ORDER' then return app_private.actor_has_permission(p_actor_id, 'sales_order.read');
    elsif p_context_type = 'SERVICE_JOB' then return
      app_private.actor_has_permission(p_actor_id, 'service_job.read') or exists (
        select 1 from public.service_job_assignments assignment
        where assignment.service_job_id = p_context_id and assignment.operator_user_id = p_actor_id
          and assignment.status = 'ACTIVE'
      );
    elsif p_context_type = 'PORTAL_ISSUE' then return exists (
      select 1 from public.portal_issues issue
      where issue.id = p_context_id and (
        issue.reported_by = p_actor_id
        or app_private.actor_has_permission(p_actor_id, 'work_item.verify')
        or app_private.actor_has_permission(p_actor_id, 'delivery.read')
        or app_private.actor_has_permission(p_actor_id, 'service_job.read')
        or app_private.actor_has_permission(p_actor_id, 'audit.view')
      )
    );
    else return app_private.actor_has_permission(p_actor_id, 'customer.read')
      and app_private.chat_context_customer_id(p_context_type, p_context_id) is not null;
    end if;
  end if;

  select membership.customer_id into membership_customer_id
  from public.customer_portal_memberships membership
  where membership.auth_user_id = p_actor_id and membership.active
  limit 1;
  if membership_customer_id is null or p_context_type = 'PORTAL_ISSUE' then return false; end if;
  return app_private.chat_context_customer_id(p_context_type, p_context_id) = membership_customer_id;
end;
$$;

create or replace function app_private.chat_actor_kind(p_actor_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select case when app_private.is_active_user(p_actor_id) then 'EMPLOYEE' else 'CUSTOMER' end
$$;

-- RLS and Realtime run as the browser database role, which intentionally has
-- no broad access to Delivery/Sales/Service tables. This narrow definer helper
-- reads the JWT actor only (never a caller-supplied actor) and answers a
-- boolean, so an ended assignment also ends CHAT1 read access immediately.
create or replace function app_private.authenticated_chat_context_authorized(
  p_context_type text, p_context_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.chat_context_authorized((select auth.uid()), p_context_type, p_context_id)
$$;

create or replace function app_private.chat_actor_display_name(p_actor_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select profile.display_name from public.user_profiles profile where profile.user_id = p_actor_id),
    'Khách hàng'
  )
$$;

create or replace function app_private.chat_responsible_staff(
  p_context_type text, p_context_id uuid
) returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare selected_staff_id uuid;
begin
  if p_context_type = 'DELIVERY' then
    select candidate.user_id into selected_staff_id from (
      (select assignment.assigned_by as user_id, 1 as priority from public.delivery_assignments assignment
      where assignment.delivery_id = p_context_id order by assignment.assigned_at desc limit 1)
      union all
      select delivery.created_by, 2 from public.deliveries delivery where delivery.id = p_context_id
    ) candidate where app_private.chat_context_authorized(candidate.user_id, p_context_type, p_context_id)
      and app_private.actor_has_permission(candidate.user_id, 'chat.send') order by candidate.priority limit 1;
  elsif p_context_type = 'SALES_ORDER' then
    select candidate.user_id into selected_staff_id from (
      select sales_order.created_by as user_id, 1 as priority from public.sales_orders sales_order where sales_order.id = p_context_id
      union all select sales_order.confirmed_by, 2 from public.sales_orders sales_order where sales_order.id = p_context_id and sales_order.confirmed_by is not null
    ) candidate where app_private.chat_context_authorized(candidate.user_id, p_context_type, p_context_id)
      and app_private.actor_has_permission(candidate.user_id, 'chat.send') order by candidate.priority limit 1;
  elsif p_context_type = 'SERVICE_JOB' then
    select candidate.user_id into selected_staff_id from (
      (select assignment.assigned_by as user_id, 1 as priority from public.service_job_assignments assignment
      where assignment.service_job_id = p_context_id order by assignment.assigned_at desc limit 1)
      union all select service_job.created_by, 2 from public.service_jobs service_job where service_job.id = p_context_id
    ) candidate where app_private.chat_context_authorized(candidate.user_id, p_context_type, p_context_id)
      and app_private.actor_has_permission(candidate.user_id, 'chat.send') order by candidate.priority limit 1;
  end if;

  if selected_staff_id is null then
    select profile.user_id into selected_staff_id
    from public.user_profiles profile
    join public.user_roles user_role on user_role.user_id = profile.user_id
    join public.roles role on role.id = user_role.role_id
    where profile.status = 'ACTIVE'
      and role.code in ('DISPATCHER', 'SUPERVISOR', 'SALES', 'FINANCE', 'OWNER_ADMIN')
      and app_private.actor_has_permission(profile.user_id, 'chat.send')
      and app_private.chat_context_authorized(profile.user_id, p_context_type, p_context_id)
    order by case role.code when 'DISPATCHER' then 1 when 'SUPERVISOR' then 2
      when 'SALES' then 3 when 'FINANCE' then 4 else 5 end, profile.user_id
    limit 1;
  end if;
  return selected_staff_id;
end;
$$;

create or replace function app_private.ensure_operational_conversation(
  p_context_type text, p_context_id uuid, p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare conversation_id uuid; context_customer_id uuid; context_subject text; staff_id uuid;
begin
  if not app_private.chat_context_authorized(p_actor_id, p_context_type, p_context_id) then
    raise exception 'CHAT_CONTEXT_ACCESS_DENIED' using errcode = '42501';
  end if;
  context_customer_id := app_private.chat_context_customer_id(p_context_type, p_context_id);
  context_subject := app_private.chat_context_subject(p_context_type, p_context_id);
  if context_subject is null then raise exception 'CHAT_CONTEXT_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.conversations(context_type, context_id, customer_id, subject_snapshot, created_by)
  values (p_context_type, p_context_id, context_customer_id, context_subject, p_actor_id)
  on conflict (context_type, context_id) do nothing returning id into conversation_id;
  if conversation_id is null then
    select conversation.id into conversation_id from public.conversations conversation
    where conversation.context_type = p_context_type and conversation.context_id = p_context_id for update;
  end if;

  insert into public.conversation_participants(conversation_id, actor_user_id, actor_kind, display_name_snapshot)
  values (conversation_id, p_actor_id, app_private.chat_actor_kind(p_actor_id), app_private.chat_actor_display_name(p_actor_id))
  on conflict on constraint conversation_participants_pkey do nothing;

  staff_id := app_private.chat_responsible_staff(p_context_type, p_context_id);
  if staff_id is not null and staff_id <> p_actor_id then
    insert into public.conversation_participants(conversation_id, actor_user_id, actor_kind, display_name_snapshot)
    values (conversation_id, staff_id, 'EMPLOYEE', app_private.chat_actor_display_name(staff_id))
    on conflict on constraint conversation_participants_pkey do nothing;
  end if;
  return conversation_id;
end;
$$;

create or replace function app_private.send_operational_message(
  p_conversation_id uuid, p_body text, p_evidence_id uuid,
  p_client_idempotency_key text, p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare conversation public.conversations%rowtype; message_id uuid;
begin
  if coalesce(p_client_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$' then
    raise exception 'CHAT_IDEMPOTENCY_INVALID' using errcode = '22000';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'CHAT_MESSAGE_BODY_INVALID' using errcode = '22000';
  end if;
  select * into conversation from public.conversations where id = p_conversation_id for update;
  if not found then raise exception 'CHAT_CONVERSATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if conversation.status <> 'OPEN' then raise exception 'CHAT_CONVERSATION_CLOSED' using errcode = '23514'; end if;
  if not app_private.chat_context_authorized(p_actor_id, conversation.context_type, conversation.context_id)
    or not exists (select 1 from public.conversation_participants participant
      where participant.conversation_id = conversation.id and participant.actor_user_id = p_actor_id)
  then raise exception 'CHAT_PARTICIPANT_REQUIRED' using errcode = '42501'; end if;
  if app_private.is_active_user(p_actor_id) and not app_private.actor_has_permission(p_actor_id, 'chat.send') then
    raise exception 'CHAT_SEND_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_evidence_id is not null and not exists (
    select 1 from public.evidence evidence
    where evidence.id = p_evidence_id and evidence.owner_user_id = p_actor_id
  ) then raise exception 'CHAT_EVIDENCE_ACCESS_DENIED' using errcode = '42501'; end if;

  insert into public.conversation_messages(
    conversation_id, sender_user_id, sender_kind, sender_display_name_snapshot,
    body, evidence_id, client_idempotency_key
  ) values (
    conversation.id, p_actor_id, app_private.chat_actor_kind(p_actor_id),
    app_private.chat_actor_display_name(p_actor_id), trim(p_body), p_evidence_id,
    p_client_idempotency_key
  ) on conflict (conversation_id, sender_user_id, client_idempotency_key) do nothing
  returning id into message_id;
  if message_id is null then
    select message.id into message_id from public.conversation_messages message
    where message.conversation_id = conversation.id and message.sender_user_id = p_actor_id
      and message.client_idempotency_key = p_client_idempotency_key;
  end if;
  update public.conversation_participants set last_read_at = now()
  where conversation_id = conversation.id and actor_user_id = p_actor_id;
  return message_id;
end;
$$;

create or replace function app_private.mark_operational_conversation_read(
  p_conversation_id uuid, p_actor_id uuid
) returns void
language plpgsql security invoker set search_path = '' as $$
declare conversation public.conversations%rowtype;
begin
  select * into conversation from public.conversations where id = p_conversation_id;
  if not found or not app_private.chat_context_authorized(p_actor_id, conversation.context_type, conversation.context_id) then
    raise exception 'CHAT_PARTICIPANT_REQUIRED' using errcode = '42501';
  end if;
  update public.conversation_participants set last_read_at = now()
  where conversation_id = p_conversation_id and actor_user_id = p_actor_id;
  if not found then raise exception 'CHAT_PARTICIPANT_REQUIRED' using errcode = '42501'; end if;
end;
$$;

create or replace function app_private.close_operational_conversation(
  p_conversation_id uuid, p_reason text, p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare conversation public.conversations%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'chat.manage');
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'CHAT_CLOSE_REASON_INVALID' using errcode = '22000';
  end if;
  select * into conversation from public.conversations where id = p_conversation_id for update;
  if not found then raise exception 'CHAT_CONVERSATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if not app_private.chat_context_authorized(p_actor_id, conversation.context_type, conversation.context_id)
    or not exists (select 1 from public.conversation_participants participant
      where participant.conversation_id = conversation.id and participant.actor_user_id = p_actor_id)
  then raise exception 'CHAT_PARTICIPANT_REQUIRED' using errcode = '42501'; end if;
  if conversation.status = 'CLOSED' then return conversation.id; end if;
  update public.conversations set status = 'CLOSED', closed_by = p_actor_id,
    closed_at = now(), close_reason = trim(p_reason) where id = conversation.id;
  return conversation.id;
end;
$$;

revoke all on function app_private.prevent_chat_history_mutation(),
  app_private.guard_chat_participant_update(), app_private.chat_context_customer_id(text, uuid),
  app_private.chat_context_subject(text, uuid), app_private.chat_context_authorized(uuid, text, uuid),
  app_private.authenticated_chat_context_authorized(text, uuid),
  app_private.chat_actor_kind(uuid), app_private.chat_actor_display_name(uuid),
  app_private.chat_responsible_staff(text, uuid), app_private.ensure_operational_conversation(text, uuid, uuid),
  app_private.send_operational_message(uuid, text, uuid, text, uuid),
  app_private.mark_operational_conversation_read(uuid, uuid),
  app_private.close_operational_conversation(uuid, text, uuid)
from public, anon, authenticated;
grant execute on function app_private.authenticated_chat_context_authorized(text, uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages enable row level security;
revoke all on public.conversations, public.conversation_participants, public.conversation_messages from anon, authenticated;
grant select on public.conversations, public.conversation_participants, public.conversation_messages to authenticated;

create policy conversations_read_participant
on public.conversations for select to authenticated using (
  exists (select 1 from public.conversation_participants participant
    where participant.conversation_id = conversations.id
      and participant.actor_user_id = (select auth.uid()))
  and app_private.authenticated_chat_context_authorized(conversations.context_type, conversations.context_id)
);
create policy conversation_participants_read_self
on public.conversation_participants for select to authenticated using (
  actor_user_id = (select auth.uid())
);
create policy conversation_messages_read_participant
on public.conversation_messages for select to authenticated using (
  exists (select 1 from public.conversation_participants participant
    where participant.conversation_id = conversation_messages.conversation_id
      and participant.actor_user_id = (select auth.uid()))
  and exists (select 1 from public.conversations conversation
    where conversation.id = conversation_messages.conversation_id
      and app_private.authenticated_chat_context_authorized(conversation.context_type, conversation.context_id))
);

-- Evidence stays private, but an attachment can be read by the exact chat
-- participants. This policy deliberately does not grant any list access.
create policy evidence_read_chat_participant
on public.evidence for select to authenticated using (
  exists (
    select 1 from public.conversation_messages message
    join public.conversation_participants participant
      on participant.conversation_id = message.conversation_id
    join public.conversations conversation on conversation.id = message.conversation_id
    where message.evidence_id = evidence.id
      and participant.actor_user_id = (select auth.uid())
      and app_private.authenticated_chat_context_authorized(conversation.context_type, conversation.context_id)
  )
);
create policy evidence_objects_read_chat_participant
on storage.objects for select to authenticated using (
  bucket_id = 'evidence' and exists (
    select 1 from public.evidence evidence
    join public.conversation_messages message on message.evidence_id = evidence.id
    join public.conversation_participants participant on participant.conversation_id = message.conversation_id
    join public.conversations conversation on conversation.id = message.conversation_id
    where evidence.bucket_id = storage.objects.bucket_id and evidence.storage_path = storage.objects.name
      and participant.actor_user_id = (select auth.uid())
      and app_private.authenticated_chat_context_authorized(conversation.context_type, conversation.context_id)
  )
);

insert into public.permissions(code, description_vi) values
  ('chat.read', 'Đọc hội thoại vận hành theo ngữ cảnh được phép'),
  ('chat.send', 'Gửi hội thoại vận hành theo ngữ cảnh được phép'),
  ('chat.manage', 'Đóng hội thoại vận hành sau khi xử lý')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role join public.permissions permission
  on permission.code in ('chat.read', 'chat.send')
where role.code in ('OWNER_ADMIN', 'SALES', 'DISPATCHER', 'SUPERVISOR', 'FINANCE', 'DRIVER', 'OPERATOR_WORKER')
on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role join public.permissions permission on permission.code = 'chat.manage'
where role.code in ('OWNER_ADMIN', 'SALES', 'DISPATCHER', 'SUPERVISOR', 'FINANCE')
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_messages'
    ) then
    alter publication supabase_realtime add table public.conversation_messages;
  end if;
exception when duplicate_object then null;
end;
$$;
