-- FB3 D14 (Owner 17/10/2026): customer portal accounts, both ways.
-- * The business creates an account from the customer's page (email + a temporary password the owner sets; the first login
--   must change it). The app creates the login with the secret key in its existing auth module, then
--   grant_customer_portal_access links it to the customer (customers.manage). Revoking keeps the history.
-- * A new customer registers alone: register_portal_customer creates the customer ("Tự đăng ký", individual, general prices,
--   no credit limit), its main delivery address and the OWNER membership, and tells the business. One customer per login; an
--   employee login cannot register. Customers with the same phone are not merged (the business checks the hint).
-- The branch receiving self-registered customers is company_profile.portal_branch_id, or the only active branch.
begin;

alter table public.customers add column source text not null default 'INTERNAL' check (source in ('INTERNAL', 'SELF_REGISTERED'));
alter table public.company_profile add column portal_branch_id uuid references public.branches(id) on delete set null;
create sequence public.customer_self_code_seq;
revoke all on sequence public.customer_self_code_seq from public, anon, authenticated;
create index customer_portal_memberships_customer_idx on public.customer_portal_memberships(customer_id) where active;

create or replace function private.is_employee_login(target_auth_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees e where e.auth_user_id = target_auth_user_id)
$$;
revoke all on function private.is_employee_login(uuid) from public, anon, authenticated, service_role;

create or replace function public.grant_customer_portal_access(target_customer_id uuid, target_auth_user_id uuid, membership_role text, operation_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  customer public.customers%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  created uuid;
begin
  select * into customer from public.customers c where c.id = target_customer_id;
  if customer.id is null or auth.uid() is null or not private.has_permission(customer.branch_id, 'customers.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if grant_customer_portal_access.membership_role not in ('OWNER', 'FINANCE_CONTACT', 'RECEIVER') or grant_customer_portal_access.operation_id is null
    or target_auth_user_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('customer', target_customer_id, 'user', target_auth_user_id, 'role', grant_customer_portal_access.membership_role));
  perform pg_advisory_xact_lock(hashtextextended(grant_customer_portal_access.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = grant_customer_portal_access.operation_id;
  if found then
    if receipt.command_name <> 'grant_customer_portal_access' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if not customer.active then raise exception 'customer_inactive' using errcode = '23514'; end if;
  if not exists (select 1 from auth.users u where u.id = target_auth_user_id) then raise exception 'portal_user_missing' using errcode = '23503'; end if;
  if private.is_employee_login(target_auth_user_id) then raise exception 'portal_user_is_employee' using errcode = '23514'; end if;
  select m.id into created from public.customer_portal_memberships m
  where m.customer_id = customer.id and m.auth_user_id = target_auth_user_id and m.active;
  if created is not null then raise exception 'portal_access_exists' using errcode = '23505'; end if;
  insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values (target_auth_user_id, customer.id, grant_customer_portal_access.membership_role)
  returning id into created;
  insert into public.command_receipts values (grant_customer_portal_access.operation_id, auth.uid(), 'grant_customer_portal_access', hash, 'customer_portal_membership', created, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), customer.branch_id, 'customer_portal.access_granted', 'customer', customer.id, grant_customer_portal_access.operation_id,
    array['portal_membership'], 'Tạo tài khoản cổng khách (' || grant_customer_portal_access.membership_role || ')');
  return created;
end
$function$;
revoke all on function public.grant_customer_portal_access(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.grant_customer_portal_access(uuid, uuid, text, uuid) to authenticated;

create or replace function public.revoke_customer_portal_access(target_membership_id uuid, reason text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  membership public.customer_portal_memberships%rowtype;
  branch uuid;
begin
  select * into membership from public.customer_portal_memberships m where m.id = target_membership_id for update;
  select c.branch_id into branch from public.customers c where c.id = membership.customer_id;
  if membership.id is null or auth.uid() is null or not private.has_permission(branch, 'customers.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(reason, ''))) not between 3 and 300 or revoke_customer_portal_access.operation_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not membership.active then return membership.id; end if;
  update public.customer_portal_memberships set active = false, revoked_at = now() where id = membership.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), branch, 'customer_portal.access_revoked', 'customer', membership.customer_id, revoke_customer_portal_access.operation_id,
    array['portal_membership'], left(trim(reason), 500));
  return membership.id;
end
$function$;
revoke all on function public.revoke_customer_portal_access(uuid, text, uuid) from public, anon;
grant execute on function public.revoke_customer_portal_access(uuid, text, uuid) to authenticated;

-- The customer page lists its logins (email from the auth store, which the app cannot read otherwise).
create or replace function public.customer_portal_accounts(target_customer_id uuid)
returns table(membership_id uuid, auth_user_id uuid, email text, membership_role text, active boolean, granted_at timestamptz,
  last_sign_in_at timestamptz, must_change_password boolean)
language plpgsql stable security definer set search_path = '' as $function$
declare branch uuid;
begin
  select c.branch_id into branch from public.customers c where c.id = target_customer_id;
  if branch is null or auth.uid() is null or not private.has_permission(branch, 'customers.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.id, m.auth_user_id, u.email::text, m.membership_role, m.active, m.granted_at, u.last_sign_in_at,
      coalesce((u.raw_app_meta_data->>'hx_must_change_password')::boolean, false)
    from public.customer_portal_memberships m join auth.users u on u.id = m.auth_user_id
    where m.customer_id = target_customer_id
    order by m.active desc, m.granted_at desc;
end
$function$;
revoke all on function public.customer_portal_accounts(uuid) from public, anon;
grant execute on function public.customer_portal_accounts(uuid) to authenticated;

-- Self-registration of a new customer by the signed-in login.
create or replace function public.register_portal_customer(display_name text, phone text, address_text text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  branch uuid;
  hash text;
  receipt public.command_receipts%rowtype;
  customer_id uuid;
  clean_phone text := regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g');
begin
  if me is null or register_portal_customer.operation_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.is_employee_login(me) then raise exception 'portal_user_is_employee' using errcode = '23514'; end if;
  if char_length(trim(coalesce(display_name, ''))) not between 2 and 160 or clean_phone !~ '^(\+84|0)[0-9]{8,10}$'
    or char_length(trim(coalesce(address_text, ''))) not between 5 and 300 then
    raise exception 'registration_invalid' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('name', trim(display_name), 'phone', clean_phone, 'address', trim(address_text)));
  perform pg_advisory_xact_lock(hashtextextended('register_portal_customer:' || me::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = register_portal_customer.operation_id;
  if found then
    if receipt.command_name <> 'register_portal_customer' or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if exists (select 1 from public.customer_portal_memberships m where m.auth_user_id = me and m.active) then
    raise exception 'portal_already_registered' using errcode = '23505';
  end if;
  select coalesce((select p.portal_branch_id from public.company_profile p where p.portal_branch_id is not null limit 1),
    (select b.id from public.branches b where b.active and (select count(*) from public.branches x where x.active) = 1))
  into branch;
  if branch is null then raise exception 'portal_branch_not_configured' using errcode = '23514'; end if;
  insert into public.customers(branch_id, code, display_name, customer_type, phone, email, address_text, source)
  values (branch, 'KH-' || lpad(nextval('public.customer_self_code_seq')::text, 6, '0'), trim(display_name), 'INDIVIDUAL', clean_phone,
    (select u.email from auth.users u where u.id = me), trim(address_text), 'SELF_REGISTERED')
  returning id into customer_id;
  insert into public.customer_sites(customer_id, code, name, address_text, receiver_name, receiver_phone)
  values (customer_id, 'CHINH', 'Địa chỉ giao chính', trim(address_text), trim(display_name), clean_phone);
  insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values (me, customer_id, 'OWNER');
  insert into public.command_receipts values (register_portal_customer.operation_id, me, 'register_portal_customer', hash, 'customer', customer_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, branch, 'customer.self_registered', 'customer', customer_id, register_portal_customer.operation_id, array['customer', 'site', 'portal_membership'],
    'Khách tự đăng ký trên cổng khách');
  perform private.notify(branch, 'customer.self_registered', 'customer', customer_id, 'Khách mới tự đăng ký: ' || trim(display_name),
    clean_phone || ' · ' || trim(address_text) || case when exists (select 1 from public.customers c where c.branch_id = branch and c.id <> customer_id
      and regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g') = clean_phone) then ' · Có khách cùng số điện thoại, kiểm tra trùng.' else '' end,
    '/admin/customers/' || customer_id, 'customers.manage', null, 'customer.self_registered:' || customer_id);
  return customer_id;
end
$function$;
revoke all on function public.register_portal_customer(text, text, text, uuid) from public, anon;
grant execute on function public.register_portal_customer(text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
