-- D78 (Owner 14/11/2026): a customer who registers on the portal with a phone number the store already has for an active
-- customer is NOT given a new customer record (it made duplicates, e.g. "Vang" next to "Vang 132"), and is NOT linked to
-- that customer by itself either (anyone could type someone else's number and read their orders and debts). The login
-- waits; the office is told and decides on the matched customer's page:
--   * LINK          — the login joins the matched customer (OWNER, FINANCE_CONTACT or RECEIVER);
--   * NEW_CUSTOMER  — it really is someone else sharing the number: a new self-registered customer is made, as before;
--   * REJECT        — not a customer of the store: the login stays without a customer.
-- Phone numbers compare by digits, +84 read as 0. Forward-only; registrations made before stay as they are.
begin;

create table public.portal_link_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  auth_user_id uuid not null,
  matched_customer_id uuid not null references public.customers(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 2 and 160),
  phone text not null,
  address_text text not null,
  email text,
  state text not null default 'PENDING' check (state in ('PENDING', 'LINKED', 'NEW_CUSTOMER', 'REJECTED')),
  result_customer_id uuid references public.customers(id) on delete restrict,
  decision_note text check (decision_note is null or char_length(decision_note) between 3 and 500),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state = 'PENDING') = (decided_at is null))
);
create unique index portal_link_requests_open_unique on public.portal_link_requests(auth_user_id) where state = 'PENDING';
create index portal_link_requests_customer_idx on public.portal_link_requests(matched_customer_id, state);
alter table public.portal_link_requests enable row level security;
revoke all on public.portal_link_requests from anon, public, authenticated;
grant select on public.portal_link_requests to authenticated;
create policy portal_link_requests_read on public.portal_link_requests for select to authenticated
  using (private.has_permission(branch_id, 'customers.manage'));

-- Digits only, an international +84 read as a leading 0: "0912 345 678", "+84912345678" and "84912345678" are one number.
create or replace function private.phone_key(value text) returns text
language sql immutable set search_path = '' as $function$
  select case when d ~ '^84[0-9]{9,10}$' then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as d) x
$function$;

-- The 20261018190000 command, plus the phone check before a customer is made.
create or replace function public.register_portal_customer(display_name text, phone text, address_text text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  branch uuid;
  hash text;
  receipt public.command_receipts%rowtype;
  customer_id uuid;
  matched public.customers%rowtype;
  request_id uuid;
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
    -- D78: a registration that matched an existing customer answers "still waiting" (null) until the office decides;
    -- refused, it says so; linked or given a new customer, the login now has its customer.
    if receipt.result_type = 'portal_link_request' then
      if exists (select 1 from public.customer_portal_memberships m where m.auth_user_id = me and m.active) then
        return (select m.customer_id from public.customer_portal_memberships m where m.auth_user_id = me and m.active order by m.granted_at limit 1);
      end if;
      if exists (select 1 from public.portal_link_requests q where q.id = receipt.result_entity_id and q.state = 'REJECTED') then
        raise exception 'portal_link_rejected' using errcode = '23514';
      end if;
      return null;
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

  -- D78: the number already belongs to an active customer of the branch: wait for the office.
  select c.* into matched from public.customers c
  where c.branch_id = branch and c.active and private.phone_key(c.phone) = private.phone_key(clean_phone)
  order by c.created_at limit 1;
  if matched.id is not null then
    select q.id into request_id from public.portal_link_requests q where q.auth_user_id = me and q.state = 'PENDING';
    if request_id is null then
      insert into public.portal_link_requests(branch_id, auth_user_id, matched_customer_id, display_name, phone, address_text, email)
      values (branch, me, matched.id, trim(display_name), clean_phone, trim(address_text), (select u.email from auth.users u where u.id = me))
      returning id into request_id;
    end if;
    insert into public.command_receipts values (register_portal_customer.operation_id, me, 'register_portal_customer', hash, 'portal_link_request', request_id, now());
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (me, branch, 'customer.portal_link_requested', 'customer', matched.id, register_portal_customer.operation_id, array['portal_link_request'],
      'Khách tự đăng ký trùng số điện thoại với ' || matched.code || ' — chờ văn phòng duyệt');
    perform private.notify(branch, 'customer.portal_link_requested', 'customer', matched.id,
      'Đăng ký cổng khách trùng số điện thoại: ' || trim(display_name),
      clean_phone || ' trùng ' || matched.code || ' ' || matched.display_name || '. Duyệt gắn tài khoản, tạo khách mới hoặc từ chối.',
      '/admin/customers/' || matched.id, 'customers.manage', null, 'customer.portal_link_requested:' || request_id);
    return null;
  end if;

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
    clean_phone || ' · ' || trim(address_text), '/admin/customers/' || customer_id, 'customers.manage', null, 'customer.self_registered:' || customer_id);
  return customer_id;
end
$function$;
revoke all on function public.register_portal_customer(text, text, text, uuid) from public, anon;
grant execute on function public.register_portal_customer(text, text, text, uuid) to authenticated;

-- The office's answer to a waiting registration (customers.manage in the request's branch). Returns the customer the
-- login now belongs to, or null when refused.
create or replace function public.decide_portal_link_request(target_request_id uuid, decision text, membership_role text, note text, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  req public.portal_link_requests%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  customer_id uuid;
  role_name text := coalesce(nullif(decide_portal_link_request.membership_role, ''), 'OWNER');
begin
  select * into req from public.portal_link_requests q where q.id = target_request_id;
  if req.id is null or auth.uid() is null or not private.has_permission(req.branch_id, 'customers.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if decision not in ('LINK', 'NEW_CUSTOMER', 'REJECT') or role_name not in ('OWNER', 'FINANCE_CONTACT', 'RECEIVER')
    or (nullif(trim(note), '') is not null and char_length(trim(note)) not between 3 and 500) or decide_portal_link_request.operation_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('request', target_request_id, 'decision', decision, 'role', role_name, 'note', nullif(trim(note), '')));
  perform pg_advisory_xact_lock(hashtextextended(decide_portal_link_request.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = decide_portal_link_request.operation_id;
  if found then
    if receipt.command_name <> 'decide_portal_link_request' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return (select q.result_customer_id from public.portal_link_requests q where q.id = target_request_id);
  end if;
  select * into req from public.portal_link_requests q where q.id = target_request_id for update;
  if req.state <> 'PENDING' then raise exception 'portal_link_request_decided' using errcode = '55000'; end if;
  if decision <> 'REJECT' and exists (select 1 from public.customer_portal_memberships m where m.auth_user_id = req.auth_user_id and m.active) then
    raise exception 'portal_already_registered' using errcode = '23505';
  end if;
  if decision <> 'REJECT' and not exists (select 1 from auth.users u where u.id = req.auth_user_id) then
    raise exception 'portal_user_missing' using errcode = '23503';
  end if;

  if decision = 'LINK' then
    if not exists (select 1 from public.customers c where c.id = req.matched_customer_id and c.active) then
      raise exception 'customer_inactive' using errcode = '23514';
    end if;
    customer_id := req.matched_customer_id;
    insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values (req.auth_user_id, customer_id, role_name);
  elsif decision = 'NEW_CUSTOMER' then
    insert into public.customers(branch_id, code, display_name, customer_type, phone, email, address_text, source)
    values (req.branch_id, 'KH-' || lpad(nextval('public.customer_self_code_seq')::text, 6, '0'), req.display_name, 'INDIVIDUAL', req.phone,
      req.email, req.address_text, 'SELF_REGISTERED')
    returning id into customer_id;
    insert into public.customer_sites(customer_id, code, name, address_text, receiver_name, receiver_phone)
    values (customer_id, 'CHINH', 'Địa chỉ giao chính', req.address_text, req.display_name, req.phone);
    insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values (req.auth_user_id, customer_id, 'OWNER');
  end if;

  update public.portal_link_requests set state = case decision when 'LINK' then 'LINKED' when 'NEW_CUSTOMER' then 'NEW_CUSTOMER' else 'REJECTED' end,
    result_customer_id = customer_id, decision_note = nullif(trim(note), ''), decided_by = auth.uid(), decided_at = now()
  where id = req.id;
  insert into public.command_receipts values (decide_portal_link_request.operation_id, auth.uid(), 'decide_portal_link_request', hash, 'portal_link_request', req.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), req.branch_id, 'customer.portal_link_decided', 'customer', coalesce(customer_id, req.matched_customer_id), decide_portal_link_request.operation_id,
    array['portal_link_request'] || case when customer_id is null then array[]::text[] else array['portal_membership'] end,
    left(case decision when 'LINK' then 'Gắn tài khoản cổng khách vào khách có cùng số điện thoại (' || role_name || ')'
      when 'NEW_CUSTOMER' then 'Tạo khách mới cho đăng ký trùng số điện thoại' else 'Từ chối đăng ký cổng khách trùng số điện thoại' end
      || coalesce(': ' || nullif(trim(note), ''), ''), 500));
  return customer_id;
end
$function$;
revoke all on function public.decide_portal_link_request(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.decide_portal_link_request(uuid, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
