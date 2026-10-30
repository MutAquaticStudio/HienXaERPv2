-- D43: the built-in accountant keeps finance and supplier reading, without deliveries or purchase orders.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000316');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000316', '10000000-0000-4000-8000-000000000316', 'NT_E316', 'Kế toán 316');
insert into public.employee_branch_access(employee_id, branch_id, role_id)
  select '30000000-0000-4000-8000-000000000316', '20000000-0000-4000-8000-00000000000a', id from public.roles where code = 'builtin_accountant';

do $test$
declare accountant uuid := (select id from public.roles where code = 'builtin_accountant');
begin
  assert accountant is not null, 'built-in accountant exists';
  assert not exists (select 1 from public.role_permissions where role_id = accountant
    and permission_code in ('delivery.read', 'purchasing.read', 'purchasing.price.read')), 'accountant has no delivery / purchasing read';
  assert (select count(*) = 4 from public.role_permissions where role_id = accountant
    and permission_code in ('finance.ar.read', 'finance.ap.read', 'finance.payment.post', 'suppliers.read')), 'accountant keeps money and supplier reading';
  -- Other built-in roles are untouched.
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
    where r.code = 'builtin_purchasing' and rp.permission_code = 'purchasing.read'), 'purchasing role keeps purchasing.read';
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
    where r.code = 'builtin_sales' and rp.permission_code = 'delivery.read'), 'sales role keeps delivery.read';

  -- Seen from the accountant's session.
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000316', true);
  assert not private.has_permission('20000000-0000-4000-8000-00000000000a', 'delivery.read'), 'accountant session: no delivery.read';
  assert not private.has_permission('20000000-0000-4000-8000-00000000000a', 'purchasing.read'), 'accountant session: no purchasing.read';
  assert private.has_permission('20000000-0000-4000-8000-00000000000a', 'finance.payment.post'), 'accountant session: posts payments';
  assert private.has_permission('20000000-0000-4000-8000-00000000000a', 'suppliers.read'), 'accountant session: reads suppliers';
  perform set_config('request.jwt.claim.sub', '', true);
end
$test$;
