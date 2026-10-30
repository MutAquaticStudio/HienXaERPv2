-- FB14 (D36): "Tin nhan" like Messenger: a contact list and one direct (1-1) conversation per pair of people. Who may write
-- to whom is decided here: a person of the business sees every colleague of the branch; the business owner (roles.manage)
-- also sees the customers' portal accounts; a customer sees only the owner(s) and the staff in charge of them (sales owner).
-- Older conversations with a subject stay readable as they are.
begin;

alter table public.conversations add column direct_key text;
alter table public.conversations alter column entity_type drop not null, alter column entity_id drop not null;
create unique index conversations_direct_key on public.conversations(direct_key) where direct_key is not null;

-- has_permission for another person (same rule: active employee, active access, active role, role or extra grant).
create or replace function private.user_has_permission(target_auth_user_id uuid, target_branch_id uuid, requested_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    where e.auth_user_id = target_auth_user_id and e.active and a.branch_id = target_branch_id
      and (exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_code = requested_permission)
        or exists (select 1 from public.employee_permission_grants g where g.employee_id = e.id and g.branch_id = a.branch_id
          and g.permission_code = requested_permission)))
$$;
revoke all on function private.user_has_permission(uuid, uuid, text) from public, anon, authenticated;

-- One key per pair of people in a branch (and per customer when a customer takes part).
create or replace function private.direct_key(target_branch_id uuid, target_customer_id uuid, first_user uuid, second_user uuid)
returns text language sql immutable set search_path = '' as $$
  select target_branch_id::text || ':' || coalesce(target_customer_id::text, '-') || ':'
    || least(first_user, second_user)::text || ':' || greatest(first_user, second_user)::text
$$;
revoke all on function private.direct_key(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- The caller's messenger: an internal branch (branch given) or their customer account (customer given).
create or replace function private.messenger_scope(target_branch_id uuid, target_customer_id uuid, out scope_branch uuid, out is_owner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or (target_branch_id is null) = (target_customer_id is null) then
    raise exception 'conversation_scope_invalid' using errcode = '22023'; end if;
  if target_branch_id is not null then
    if not private.has_branch_access(target_branch_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    scope_branch := target_branch_id;
    is_owner := private.has_permission(target_branch_id, 'roles.manage');
  else
    select c.branch_id into scope_branch from public.customer_portal_memberships m
      join public.customers c on c.id = m.customer_id and c.active
      where m.customer_id = target_customer_id and m.auth_user_id = auth.uid() and m.active limit 1;
    if scope_branch is null then raise exception 'forbidden' using errcode = '42501'; end if;
    is_owner := false;
  end if;
end $$;
revoke all on function private.messenger_scope(uuid, uuid) from public, anon, authenticated;

create or replace function public.messenger_contacts(target_branch_id uuid, target_customer_id uuid)
returns table(auth_user_id uuid, contact_kind text, display_name text, subtitle text, customer_id uuid,
  conversation_id uuid, last_message_preview text, last_message_at timestamptz, unread_count integer)
language plpgsql stable security definer set search_path = '' as $$
declare s record; me uuid := auth.uid();
begin
  select * into s from private.messenger_scope(target_branch_id, target_customer_id);
  return query
  select p.auth_user_id, p.kind, p.name, p.sub, p.cust, c.id, c.last_message_preview, c.last_message_at, coalesce(cp.unread_count, 0)
  from (
    select distinct on (x.auth_user_id, x.cust) x.* from (
      -- Staff: every colleague of the branch.
      select e.auth_user_id, 'EMPLOYEE'::text kind, e.display_name::text name, r.name::text sub, null::uuid cust
      from public.employees e
      join public.employee_branch_access a on a.employee_id = e.id and a.active
      join public.roles r on r.id = a.role_id
      where target_customer_id is null and a.branch_id = s.scope_branch and e.active and e.auth_user_id is not null and e.auth_user_id <> me
      union all
      -- The owner: also the customers' portal accounts.
      select m.auth_user_id, 'CUSTOMER', c.display_name::text,
        case m.membership_role when 'OWNER' then 'Khách hàng · chủ tài khoản' when 'FINANCE_CONTACT' then 'Khách hàng · kế toán'
          else 'Khách hàng · người nhận hàng' end, c.id
      from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id and c.active
      where target_customer_id is null and s.is_owner and c.branch_id = s.scope_branch and m.active and m.auth_user_id <> me
      union all
      -- A customer: the owner(s) and the staff in charge of them.
      select e.auth_user_id, 'EMPLOYEE', e.display_name::text,
        case when private.user_has_permission(e.auth_user_id, s.scope_branch, 'roles.manage') then 'Chủ doanh nghiệp' else 'Nhân viên phụ trách' end,
        target_customer_id
      from public.employees e join public.employee_branch_access a on a.employee_id = e.id and a.active
      where target_customer_id is not null and a.branch_id = s.scope_branch and e.active and e.auth_user_id is not null
        and (private.user_has_permission(e.auth_user_id, s.scope_branch, 'roles.manage')
          or e.id = (select c.sales_owner_employee_id from public.customers c where c.id = target_customer_id))
    ) x order by x.auth_user_id, x.cust, x.name
  ) p
  left join public.conversations c on c.direct_key = private.direct_key(s.scope_branch, p.cust, me, p.auth_user_id)
  left join public.conversation_participants cp on cp.conversation_id = c.id and cp.auth_user_id = me and cp.active
  order by c.last_message_at desc nulls last, p.name;
end $$;

-- Opens (or finds) the direct conversation with a contact the caller may write to.
create or replace function public.open_direct_conversation(target_branch_id uuid, target_customer_id uuid,
  contact_auth_user_id uuid, contact_customer_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s record; me uuid := auth.uid(); contact record; key text; found_id uuid; my_name text;
begin
  select * into s from private.messenger_scope(target_branch_id, target_customer_id);
  select * into contact from public.messenger_contacts(target_branch_id, target_customer_id) x
    where x.auth_user_id = contact_auth_user_id and x.customer_id is not distinct from contact_customer_id;
  if contact.auth_user_id is null then raise exception 'conversation_participant_forbidden' using errcode = '42501'; end if;
  key := private.direct_key(s.scope_branch, contact.customer_id, me, contact.auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('direct:' || key, 0));
  select c.id into found_id from public.conversations c where c.direct_key = key;
  if found_id is not null then return found_id; end if;
  if target_customer_id is null then
    select e.display_name into my_name from public.employees e where e.auth_user_id = me and e.active limit 1;
  else
    select c.display_name || ' (khách hàng)' into my_name from public.customers c where c.id = target_customer_id;
  end if;
  insert into public.conversations(branch_id, audience, customer_id, subject, entity_type, entity_id, participant_summary,
    created_by, operation_id, direct_key)
  values (s.scope_branch, case when contact.customer_id is null then 'INTERNAL' else 'CUSTOMER' end, contact.customer_id,
    'Tin nhắn trực tiếp', null, null, coalesce(my_name, 'Người dùng') || ', ' || contact.display_name, me, gen_random_uuid(), key)
  returning id into found_id;
  insert into public.conversation_participants(conversation_id, auth_user_id, participant_kind, display_name_snapshot, last_read_at)
  values (found_id, me, case when target_customer_id is null then 'EMPLOYEE' else 'CUSTOMER' end, coalesce(my_name, 'Người dùng'), now()),
    (found_id, contact.auth_user_id, contact.contact_kind,
      case when contact.contact_kind = 'CUSTOMER' then contact.display_name || ' (khách hàng)' else contact.display_name end, null);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (me, s.scope_branch, 'conversation.direct_opened', 'conversation', found_id, found_id, array['participants']);
  return found_id;
end $$;

revoke all on function public.messenger_contacts(uuid, uuid), public.open_direct_conversation(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.messenger_contacts(uuid, uuid), public.open_direct_conversation(uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
