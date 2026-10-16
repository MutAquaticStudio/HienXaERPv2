-- Shared fixtures, prepended to every native test and rolled back afterwards.
-- Users: ...001 full access in branch A, ...002 full access in branch B, ...003 read-only in branch A.
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into public.branches(id, code, name) values
  ('20000000-0000-4000-8000-00000000000a', 'NT_A', 'Chi nhánh thử A'),
  ('20000000-0000-4000-8000-00000000000b', 'NT_B', 'Chi nhánh thử B');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'NT_E1', 'Nhân viên thử 1'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'NT_E2', 'Nhân viên thử 2'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'NT_E3', 'Nhân viên thử 3');
insert into public.roles(id, code, name) values
  ('40000000-0000-4000-8000-000000000001', 'nt_full', 'Toàn quyền thử'),
  ('40000000-0000-4000-8000-000000000002', 'nt_reader', 'Chỉ xem thử');
insert into public.role_permissions(role_id, permission_code)
  select '40000000-0000-4000-8000-000000000001', code from public.permissions;
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000002', 'dashboard.read'),
  ('40000000-0000-4000-8000-000000000002', 'orders.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000b', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002');

-- Switch the session to an authenticated API caller (transaction-local).
create function pg_temp.act_as(actor uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', actor::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true);
$$;
create function pg_temp.act_as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claim.sub', '', true);
$$;
