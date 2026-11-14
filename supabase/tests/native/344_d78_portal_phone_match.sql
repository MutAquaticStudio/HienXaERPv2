-- D78: a self-registration whose phone number belongs to an active customer waits for the office (no duplicate customer,
-- no automatic access to that customer's orders and debts); the office links it, makes a new customer, or refuses it.
insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000781', 'vang@example.test'),
  ('10000000-0000-4000-8000-000000000782', 'nguoikhac@example.test'),
  ('10000000-0000-4000-8000-000000000783', 'lala@example.test'),
  ('10000000-0000-4000-8000-000000000784', 'moi@example.test');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.customers(id, branch_id, code, display_name, customer_type, phone) values
  ('7f780000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH781', 'Vang 132', 'INDIVIDUAL', '0972 964 332'),
  ('7f780000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000b', 'NT_KH782', 'Khách chi nhánh B', 'INDIVIDUAL', '0905000782');
select set_config('request.jwt.claim.sub', '', true);
insert into public.company_profile(legal_name, updated_by, portal_branch_id) values ('Công ty thử', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a');

do $test$
declare
  vang constant uuid := '7f780000-0000-4000-8000-000000000001';
  login constant uuid := '10000000-0000-4000-8000-000000000781';
  other constant uuid := '10000000-0000-4000-8000-000000000782';
  stranger constant uuid := '10000000-0000-4000-8000-000000000783';
  newcomer constant uuid := '10000000-0000-4000-8000-000000000784';
  customers_before bigint;
  request uuid;
  result uuid;
  failed text;
begin
  assert private.phone_key('+84 972 964 332') = '0972964332' and private.phone_key('0972.964.332') = '0972964332', 'one number, written several ways';
  select count(*) into customers_before from public.customers;

  -- The number of "Vang 132", written with +84: no new customer, a waiting request, the office told.
  perform pg_temp.act_as(login);
  result := public.register_portal_customer('Vang', '+84972964332', 'Vang con bà Hiền, Khoang', '7f780000-0000-4000-8000-0000000000a1');
  assert result is null, 'waiting, no customer yet';
  assert public.register_portal_customer('Vang', '+84972964332', 'Vang con bà Hiền, Khoang', '7f780000-0000-4000-8000-0000000000a1') is null, 'signing in again still waits';
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.customers) = customers_before, 'no duplicate customer';
  assert not exists (select 1 from public.customer_portal_memberships where auth_user_id = login), 'no access by itself';
  select id into request from public.portal_link_requests where auth_user_id = login;
  assert (select state || ':' || matched_customer_id::text || ':' || email from public.portal_link_requests where id = request) = 'PENDING:' || vang || ':vang@example.test', 'request kept';
  assert exists (select 1 from public.notifications where kind = 'customer.portal_link_requested' and entity_id = vang and required_permission = 'customers.manage'), 'office told';

  -- Only customers.manage of that branch sees and decides it.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.portal_link_requests) = 0, 'a reader does not see it';
  failed := null;
  begin perform public.decide_portal_link_request(request, 'LINK', 'OWNER', null, '7f780000-0000-4000-8000-0000000000b0'); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'a reader cannot decide';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.decide_portal_link_request(request, 'LINK', 'OWNER', null, '7f780000-0000-4000-8000-0000000000b1'); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'another branch cannot decide';
  perform pg_temp.act_as(login);
  failed := null;
  begin perform public.decide_portal_link_request(request, 'LINK', 'OWNER', null, '7f780000-0000-4000-8000-0000000000b2'); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'the customer cannot approve itself';

  -- Linked: the login now belongs to "Vang 132"; signing in again finds it; deciding twice is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert (select count(*) from public.portal_link_requests where state = 'PENDING') = 1, 'the manager sees it';
  assert public.decide_portal_link_request(request, 'LINK', 'OWNER', null, '7f780000-0000-4000-8000-0000000000b3') = vang, 'linked';
  assert public.decide_portal_link_request(request, 'LINK', 'OWNER', null, '7f780000-0000-4000-8000-0000000000b3') = vang, 'replay';
  failed := null;
  begin perform public.decide_portal_link_request(request, 'REJECT', null, null, '7f780000-0000-4000-8000-0000000000b4'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_link_request_decided', 'decided once';
  perform pg_temp.act_as(login);
  assert public.register_portal_customer('Vang', '+84972964332', 'Vang con bà Hiền, Khoang', '7f780000-0000-4000-8000-0000000000a1') = vang, 'the next sign-in has the customer';
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.customer_portal_memberships where auth_user_id = login and customer_id = vang and membership_role = 'OWNER' and active), 'access granted';
  assert exists (select 1 from public.audit_events where action = 'customer.portal_link_decided' and entity_id = vang), 'audited';

  -- Someone else sharing the number: the office makes a new customer for them.
  perform pg_temp.act_as(other);
  assert public.register_portal_customer('Chị Lan', '0972964332', 'Xóm Đông, Hiền Xa', '7f780000-0000-4000-8000-0000000000a2') is null, 'waits';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select id into request from public.portal_link_requests where auth_user_id = other;
  result := public.decide_portal_link_request(request, 'NEW_CUSTOMER', null, 'Người nhà, khác khách', '7f780000-0000-4000-8000-0000000000b5');
  perform pg_temp.act_as_admin();
  assert (select display_name || ':' || source || ':' || phone || ':' || email from public.customers where id = result) = 'Chị Lan:SELF_REGISTERED:0972964332:nguoikhac@example.test', 'new customer';
  assert exists (select 1 from public.customer_sites where customer_id = result and address_text = 'Xóm Đông, Hiền Xa'), 'main address';
  assert exists (select 1 from public.customer_portal_memberships where auth_user_id = other and customer_id = result and membership_role = 'OWNER' and active), 'owner of the new customer';

  -- Refused: no customer; the next sign-in says so.
  perform pg_temp.act_as(stranger);
  assert public.register_portal_customer('Người lạ', '0972964332', 'Không rõ địa chỉ', '7f780000-0000-4000-8000-0000000000a3') is null, 'waits';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select id into request from public.portal_link_requests where auth_user_id = stranger;
  assert public.decide_portal_link_request(request, 'REJECT', null, 'Không phải khách', '7f780000-0000-4000-8000-0000000000b6') is null, 'refused';
  perform pg_temp.act_as(stranger);
  failed := null;
  begin perform public.register_portal_customer('Người lạ', '0972964332', 'Không rõ địa chỉ', '7f780000-0000-4000-8000-0000000000a3'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_link_rejected', format('told it was refused, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.customer_portal_memberships where auth_user_id = stranger), 'no access';

  -- A number known only in another branch, or a new number: a new self-registered customer as before.
  perform pg_temp.act_as(newcomer);
  result := public.register_portal_customer('Anh Mới', '0905000782', 'Thôn Tây, Hiền Xa', '7f780000-0000-4000-8000-0000000000a4');
  assert result is not null, 'the match is looked for in the portal branch only';
  perform pg_temp.act_as_admin();
  assert (select source from public.customers where id = result) = 'SELF_REGISTERED', 'self-registered';
  assert not exists (select 1 from public.portal_link_requests where auth_user_id = newcomer), 'no request';

  -- Bad input.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.decide_portal_link_request(request, 'MERGE', null, null, '7f780000-0000-4000-8000-0000000000b7'); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_input', 'unknown decision';
  perform pg_temp.act_as_admin();
end
$test$;

do $$ begin
  assert not has_function_privilege('anon', 'public.decide_portal_link_request(uuid, text, text, text, uuid)', 'EXECUTE'), 'anon cannot decide';
  assert not has_table_privilege('anon', 'public.portal_link_requests', 'SELECT'), 'anon cannot read';
  assert not has_table_privilege('authenticated', 'public.portal_link_requests', 'INSERT'), 'written only through the commands';
end $$;
