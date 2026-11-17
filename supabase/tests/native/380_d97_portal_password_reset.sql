-- D97 (TB-1): resetting a customer login's password needs customers.manage over every customer that login belongs to; a
-- manager of branch A who may only read branch B can neither reset a branch-B login nor attach it to a branch-A customer.
-- User ...001 manages A (full role) and is given read-only customers.read in B here; ...002 manages B.
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000380', 'nt_customer_reader_380', 'Xem khách thử');
insert into public.role_permissions(role_id, permission_code) values ('40000000-0000-4000-8000-000000000380', 'customers.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000b', '40000000-0000-4000-8000-000000000380');
insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-0000000003a1', 'khach-a@example.test'),
  ('10000000-0000-4000-8000-0000000003b1', 'khach-b@example.test'),
  ('10000000-0000-4000-8000-0000000003c1', 'tu-dang-ky@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('76000000-0000-4000-8000-0000000003a0', '20000000-0000-4000-8000-00000000000a', 'NT_KH_380A', 'Khách A 380', 'INDIVIDUAL'),
  ('76000000-0000-4000-8000-0000000003a2', '20000000-0000-4000-8000-00000000000a', 'NT_KH_380A2', 'Khách A2 380', 'INDIVIDUAL'),
  ('76000000-0000-4000-8000-0000000003b0', '20000000-0000-4000-8000-00000000000b', 'NT_KH_380B', 'Khách B 380', 'INDIVIDUAL');
insert into public.customer_portal_memberships(id, auth_user_id, customer_id, membership_role) values
  ('77000000-0000-4000-8000-0000000003a0', '10000000-0000-4000-8000-0000000003a1', '76000000-0000-4000-8000-0000000003a0', 'OWNER'),
  ('77000000-0000-4000-8000-0000000003b0', '10000000-0000-4000-8000-0000000003b1', '76000000-0000-4000-8000-0000000003b0', 'OWNER'),
  -- An employee login that still has an old customer membership.
  ('77000000-0000-4000-8000-0000000003e0', '10000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-0000000003a2', 'OWNER');

do $test$
declare
  manager_a constant uuid := '10000000-0000-4000-8000-000000000001';
  manager_b constant uuid := '10000000-0000-4000-8000-000000000002';
  customer_a constant uuid := '76000000-0000-4000-8000-0000000003a0';
  customer_a2 constant uuid := '76000000-0000-4000-8000-0000000003a2';
  customer_b constant uuid := '76000000-0000-4000-8000-0000000003b0';
  failed text;
  granted uuid;
begin
  -- Own branch: allowed, returns the login to reset.
  perform pg_temp.act_as(manager_a);
  assert public.authorize_portal_password_reset(customer_a, '77000000-0000-4000-8000-0000000003a0') = '10000000-0000-4000-8000-0000000003a1',
    'a manager resets a login of a customer of the branch they manage';

  -- A branch-B customer: manager A only reads B (the list of logins is visible, the reset is not).
  assert (select count(*) from public.customer_portal_accounts(customer_b)) = 1, 'reading the logins of B stays as before';
  failed := null;
  begin perform public.authorize_portal_password_reset(customer_b, '77000000-0000-4000-8000-0000000003b0');
  exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reset of another branch refused, got %s', failed);

  -- A membership that is not this customer's, or revoked.
  failed := null;
  begin perform public.authorize_portal_password_reset(customer_a, '77000000-0000-4000-8000-0000000003b0');
  exception when others then failed := sqlerrm; end;
  assert failed = 'portal_account_missing', format('a membership of another customer is refused, got %s', failed);

  -- An employee login keeps out of the customer reset path.
  failed := null;
  begin perform public.authorize_portal_password_reset(customer_a2, '77000000-0000-4000-8000-0000000003e0');
  exception when others then failed := sqlerrm; end;
  assert failed = 'portal_user_is_employee', format('an employee login is never reset as a customer, got %s', failed);

  -- Attaching the branch-B login to a branch-A customer is refused, so it cannot be reset through A either.
  failed := null;
  begin perform public.grant_customer_portal_access(customer_a2, '10000000-0000-4000-8000-0000000003b1', 'OWNER', gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'portal_user_other_branch', format('a login of another branch is not attached, got %s', failed);

  -- A login without any membership (or only memberships in managed branches) is still attached as before.
  granted := public.grant_customer_portal_access(customer_a2, '10000000-0000-4000-8000-0000000003c1', 'OWNER', gen_random_uuid());
  assert granted is not null, 'a free login is attached';
  granted := public.grant_customer_portal_access(customer_a2, '10000000-0000-4000-8000-0000000003a1', 'RECEIVER', gen_random_uuid());
  assert granted is not null, 'a login of another customer of the same branch is attached';
  perform pg_temp.act_as_admin();

  -- A login that belongs to customers of A and B: only someone who manages both may reset it.
  insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role)
  values ('10000000-0000-4000-8000-0000000003b1', customer_a2, 'RECEIVER');
  perform pg_temp.act_as(manager_b);
  failed := null;
  begin perform public.authorize_portal_password_reset(customer_b, '77000000-0000-4000-8000-0000000003b0');
  exception when others then failed := sqlerrm; end;
  assert failed = 'portal_user_other_branch', format('a login shared with an unmanaged branch is refused, got %s', failed);
  perform pg_temp.act_as_admin();

  -- Anonymous callers cannot reach it.
  assert not has_function_privilege('anon', 'public.authorize_portal_password_reset(uuid, uuid)', 'EXECUTE'), 'anon cannot execute';
end
$test$;
