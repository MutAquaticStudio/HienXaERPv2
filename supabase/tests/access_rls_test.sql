begin;
select plan(19);

select has_table('public', 'branches', 'branches table exists');
select has_table('public', 'employees', 'employees table exists');
select has_table('public', 'roles', 'roles table exists');
select has_table('public', 'permissions', 'permissions table exists');
select has_table('public', 'employee_branch_access', 'branch access table exists');
select has_table('public', 'customers', 'customer identity exists');
select has_table('public', 'customer_portal_memberships', 'customer memberships exist');
select has_table('public', 'audit_events', 'audit ledger exists');

select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array['branches','employees','roles','permissions','role_permissions','employee_branch_access','customers','customer_portal_memberships','audit_events'])),
  'RLS is enabled on every R2 table'
);
select has_index('public', 'employee_branch_access', 'employee_branch_one_active_role', 'one active role per employee and branch');
select ok((select count(*) >= 9 from public.permissions), 'specific action permissions are seeded');
select ok(not has_function_privilege('anon', 'public.assign_employee_role(uuid,uuid,uuid,text,uuid)', 'EXECUTE'), 'anon cannot execute role assignment');
select ok(has_function_privilege('authenticated', 'public.assign_employee_role(uuid,uuid,uuid,text,uuid)', 'EXECUTE'), 'authenticated may reach the self-authorizing command');

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer@example.test', '', now(), '{}', '{}', now(), now());

insert into public.branches(id, code, name) values
  ('20000000-0000-0000-0000-000000000001', 'BRANCH_A', 'Chi nhánh A'),
  ('20000000-0000-0000-0000-000000000002', 'BRANCH_B', 'Chi nhánh B');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'EMP_A', 'Nhân viên A'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'EMP_B', 'Nhân viên B');
insert into public.roles(id, code, name) values
  ('40000000-0000-0000-0000-000000000001', 'sales', 'Bán hàng');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-0000-0000-000000000001', 'orders.read'),
  ('40000000-0000-0000-0000-000000000001', 'customers.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');
insert into public.customers(id, branch_id, code, display_name) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'CUS_A', 'Khách A'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'CUS_B', 'Khách B');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'RECEIVER');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select results_eq('select code from public.branches order by code', array['BRANCH_A']::text[], 'internal user sees only assigned branch');
select results_eq('select code from public.customers order by code', array['CUS_A']::text[], 'internal customer read stays in assigned branch');
select ok(private.has_permission('20000000-0000-0000-0000-000000000001', 'orders.read'), 'permission is allowed in assigned branch');
select ok(not private.has_permission('20000000-0000-0000-0000-000000000002', 'orders.read'), 'permission is denied cross branch');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select results_eq('select code from public.customers order by code', array['CUS_A']::text[], 'customer portal membership is isolated');

reset role;
select throws_ok(
  $$insert into public.employee_branch_access(employee_id, branch_id, role_id) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$,
  '23505',
  null,
  'a second active role in the same branch is rejected'
);

select * from finish();
rollback;
