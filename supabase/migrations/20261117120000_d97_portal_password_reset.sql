-- D97 (Owner 16/11/2026: "Ok giờ hãy fix các điểm chú ý"; security review TB-1). A customer login's password is reset only
-- by someone who manages EVERY customer that login belongs to:
-- * authorize_portal_password_reset (new): the database decides before the app sets the new temporary password with the
--   service key — customers.manage in the customer's branch, the membership active and of that customer, the login not an
--   employee's, and each active membership of the login in a branch where the caller has customers.manage. Returns the
--   login (auth user) to reset.
-- * grant_customer_portal_access (latest: 20261018190000) also refuses a login that already has an active membership in a
--   branch the caller does not manage, so a login of another branch cannot be attached and then reset. Everything else is
--   unchanged.
begin;

create or replace function public.authorize_portal_password_reset(target_customer_id uuid, target_membership_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $function$
declare
  customer public.customers%rowtype;
  membership public.customer_portal_memberships%rowtype;
begin
  select * into customer from public.customers c where c.id = target_customer_id;
  if customer.id is null or (select auth.uid()) is null or not private.has_permission(customer.branch_id, 'customers.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into membership from public.customer_portal_memberships m
  where m.id = target_membership_id and m.customer_id = customer.id and m.active;
  if membership.id is null then raise exception 'portal_account_missing' using errcode = 'P0002'; end if;
  if private.is_employee_login(membership.auth_user_id) then raise exception 'portal_user_is_employee' using errcode = '42501'; end if;
  if exists (select 1 from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id
    where m.auth_user_id = membership.auth_user_id and m.active and not private.has_permission(c.branch_id, 'customers.manage')) then
    raise exception 'portal_user_other_branch' using errcode = '42501';
  end if;
  return membership.auth_user_id;
end
$function$;
revoke all on function public.authorize_portal_password_reset(uuid, uuid) from public, anon;
grant execute on function public.authorize_portal_password_reset(uuid, uuid) to authenticated;

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
  -- D97: a login of a customer in a branch the caller does not manage stays out of reach.
  if exists (select 1 from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id
    where m.auth_user_id = target_auth_user_id and m.active and not private.has_permission(c.branch_id, 'customers.manage')) then
    raise exception 'portal_user_other_branch' using errcode = '42501';
  end if;
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

notify pgrst, 'reload schema';
commit;
