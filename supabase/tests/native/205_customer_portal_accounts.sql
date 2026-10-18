-- D14: the business links logins to customers (customers.manage, not employees), lists and revokes them; a new customer
-- registers alone once, in the portal branch, and the business is told.
insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000205', 'khach205@example.test'),
  ('10000000-0000-4000-8000-000000000206', 'khachmoi206@example.test');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.customers(id, branch_id, code, display_name, customer_type, phone) values
  ('7f205000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH205', 'Khách 205', 'BUSINESS', '0901205000');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  customer constant uuid := '7f205000-0000-4000-8000-000000000001';
  login constant uuid := '10000000-0000-4000-8000-000000000205';
  newcomer constant uuid := '10000000-0000-4000-8000-000000000206';
  membership uuid;
  registered uuid;
  failed text;
  row_data record;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.grant_customer_portal_access(customer, login, 'OWNER', '7f205000-0000-4000-8000-0000000000a0'); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a reader cannot create portal access';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  membership := public.grant_customer_portal_access(customer, login, 'OWNER', '7f205000-0000-4000-8000-0000000000a1');
  assert public.grant_customer_portal_access(customer, login, 'OWNER', '7f205000-0000-4000-8000-0000000000a1') = membership, 'replay';
  failed := null;
  begin perform public.grant_customer_portal_access(customer, login, 'OWNER', '7f205000-0000-4000-8000-0000000000a2'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_access_exists', 'one active access per login and customer';
  failed := null;
  begin perform public.grant_customer_portal_access(customer, '10000000-0000-4000-8000-000000000003', 'OWNER', '7f205000-0000-4000-8000-0000000000a3'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_user_is_employee', 'an employee login is not a customer login';
  select * into row_data from public.customer_portal_accounts(customer);
  assert row_data.email = 'khach205@example.test' and row_data.active and row_data.membership_role = 'OWNER' and not row_data.must_change_password, format('listed %s', to_jsonb(row_data));
  perform public.revoke_customer_portal_access(membership, 'Khách đổi người phụ trách', '7f205000-0000-4000-8000-0000000000a4');
  assert not (select active from public.customer_portal_memberships where id = membership), 'revoked';
  assert exists (select 1 from public.audit_events where entity_id = customer and action = 'customer_portal.access_revoked'), 'revocation audited';

  -- Self-registration: an employee cannot; two active branches need the portal branch set first.
  failed := null;
  begin perform public.register_portal_customer('Nhân viên', '0901000000', 'Địa chỉ nhân viên', '7f205000-0000-4000-8000-0000000000b0'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_user_is_employee', 'employee cannot register';
  perform pg_temp.act_as(newcomer);
  failed := null;
  begin perform public.register_portal_customer('Anh Tư', '0901 206 000', 'Thôn Bắc, xã Hiền Xa', '7f205000-0000-4000-8000-0000000000b1'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_branch_not_configured', format('two branches need a portal branch, got %s', failed);
  failed := null;
  begin perform public.register_portal_customer('A', '12', 'x', '7f205000-0000-4000-8000-0000000000b2'); exception when others then failed := sqlerrm; end;
  assert failed = 'registration_invalid', 'name, phone and address are checked';
  perform pg_temp.act_as_admin();
  insert into public.company_profile(legal_name, updated_by, portal_branch_id) values ('Công ty thử', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a');
  perform pg_temp.act_as(newcomer);
  registered := public.register_portal_customer('Anh Tư', '0901 206 000', 'Thôn Bắc, xã Hiền Xa', '7f205000-0000-4000-8000-0000000000b3');
  assert public.register_portal_customer('Anh Tư', '0901 206 000', 'Thôn Bắc, xã Hiền Xa', '7f205000-0000-4000-8000-0000000000b3') = registered, 'replay';
  failed := null;
  begin perform public.register_portal_customer('Anh Tư 2', '0901206001', 'Thôn Nam, xã Hiền Xa', '7f205000-0000-4000-8000-0000000000b4'); exception when others then failed := sqlerrm; end;
  assert failed = 'portal_already_registered', 'one customer per login';
  perform pg_temp.act_as_admin();
  assert (select source || ':' || customer_type || ':' || phone || ':' || email || ':' || (code ~ '^KH-\d{6}$')::text from public.customers where id = registered)
    = 'SELF_REGISTERED:INDIVIDUAL:0901206000:khachmoi206@example.test:true', 'self-registered customer';
  assert (select name || ':' || address_text || ':' || receiver_phone from public.customer_sites where customer_id = registered) = 'Địa chỉ giao chính:Thôn Bắc, xã Hiền Xa:0901206000', 'main address';
  assert exists (select 1 from public.customer_portal_memberships where customer_id = registered and auth_user_id = newcomer and membership_role = 'OWNER' and active), 'owner access';
  assert exists (select 1 from public.notifications where kind = 'customer.self_registered' and entity_id = registered and required_permission = 'customers.manage'), 'business told';
end
$test$;
