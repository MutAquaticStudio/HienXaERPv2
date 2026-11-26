-- D99: the per-transaction caches behind private.auth_actor_active() / private.has_permission() decide exactly as before,
-- follow the signed-in user, and drop at once when roles, grants, branches or the account change inside the same transaction.
-- Users: 001 full access in A (nt_full), 003 read-only in A (nt_reader), 002 full access in B.
do $test$
declare a uuid := '20000000-0000-4000-8000-00000000000a'; b uuid := '20000000-0000-4000-8000-00000000000b';
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert private.has_permission(a, 'orders.read'), 'reader reads orders in A';
  assert not private.has_permission(a, 'finance.profit.read'), 'reader has no profit permission';
  assert not private.has_permission(b, 'orders.read'), 'reader has no access to B';
  assert not private.has_permission(null, 'orders.read') and not private.has_permission(a, null), 'null arguments deny';

  -- Another user in the same transaction must not inherit the cached answers.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert private.has_permission(a, 'finance.profit.read'), 'full role reads profit in A';
  assert not private.has_permission(b, 'orders.read'), 'full role in A has nothing in B';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'finance.profit.read'), 'switching back does not leak the full role';

  -- An individual grant takes effect at once (cache cleared by the write), and a revoke too.
  perform pg_temp.act_as_admin();
  insert into public.employee_permission_grants(employee_id, branch_id, permission_code, granted_by) values ('30000000-0000-4000-8000-000000000003', a, 'finance.profit.read', '10000000-0000-4000-8000-000000000001');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert private.has_permission(a, 'finance.profit.read'), 'grant is visible in the same transaction';
  perform pg_temp.act_as_admin();
  delete from public.employee_permission_grants where employee_id = '30000000-0000-4000-8000-000000000003';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'finance.profit.read'), 'revoke is visible in the same transaction';

  -- Role permission changes.
  perform pg_temp.act_as_admin();
  delete from public.role_permissions where role_id = '40000000-0000-4000-8000-000000000002' and permission_code = 'orders.read';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'orders.read'), 'role permission removed';
  perform pg_temp.act_as_admin();
  insert into public.role_permissions(role_id, permission_code) values ('40000000-0000-4000-8000-000000000002', 'orders.read');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert private.has_permission(a, 'orders.read'), 'role permission restored';

  -- Inactive role / access / branch / employee each deny.
  perform pg_temp.act_as_admin();
  update public.roles set active = false where id = '40000000-0000-4000-8000-000000000002';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'orders.read'), 'inactive role denies';
  perform pg_temp.act_as_admin();
  update public.roles set active = true where id = '40000000-0000-4000-8000-000000000002';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  update public.employee_branch_access set active = false, revoked_at = now() where employee_id = '30000000-0000-4000-8000-000000000003';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'orders.read'), 'inactive access denies';
  perform pg_temp.act_as_admin();
  update public.employee_branch_access set active = true, revoked_at = null where employee_id = '30000000-0000-4000-8000-000000000003';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  update public.branches set active = false where id = a;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'orders.read'), 'inactive branch denies';
  perform pg_temp.act_as_admin();
  update public.branches set active = true where id = a;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  update public.employees set active = false, deactivated_at = now() where id = '30000000-0000-4000-8000-000000000003';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'orders.read'), 'inactive employee denies';
  perform pg_temp.act_as_admin();
  update public.employees set active = true, deactivated_at = null where id = '30000000-0000-4000-8000-000000000003';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert private.has_permission(a, 'orders.read'), 'everything restored';

  -- Account state: a removed auth user is inactive at once.
  assert private.auth_actor_active(), 'signed-in active user';
  perform pg_temp.act_as_admin();
  delete from public.employee_branch_access where employee_id = '30000000-0000-4000-8000-000000000003';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not private.has_permission(a, 'orders.read'), 'deleted access denies';

  -- Signed out: nothing.
  perform set_config('request.jwt.claim.sub', '', true);
  assert not private.auth_actor_active() and not private.has_permission(a, 'orders.read'), 'no signed-in user, no permission';
end
$test$;
