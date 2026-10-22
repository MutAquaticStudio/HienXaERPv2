-- FB8 item 2: a sales order's credit exception names people (name, code, role), never a login id: who approved it, and
-- while it waits, who in the branch may approve it (orders.confirm + finance.ar.adjust, by role or extra grant).
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
-- A cashier who may approve only through an extra grant, and an inactive employee who would have the rights.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000265'), ('10000000-0000-4000-8000-000000000266');
insert into public.employees(id, auth_user_id, code, display_name, active) values
  ('30000000-0000-4000-8000-000000000265', '10000000-0000-4000-8000-000000000265', 'NT_KT265', 'Kế toán thử 265', true),
  ('30000000-0000-4000-8000-000000000266', '10000000-0000-4000-8000-000000000266', 'NT_NV266', 'Nhân viên nghỉ 266', true);
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000265', 'nt_sales265', 'Bán hàng thử 265');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000265', 'orders.read'), ('40000000-0000-4000-8000-000000000265', 'orders.confirm');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000265', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000265'),
  ('30000000-0000-4000-8000-000000000266', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001');
insert into public.employee_permission_grants(employee_id, branch_id, permission_code, granted_by) values
  ('30000000-0000-4000-8000-000000000265', '20000000-0000-4000-8000-00000000000a', 'finance.ar.adjust', '10000000-0000-4000-8000-000000000001');
update public.employees set active = false, deactivated_at = now() where id = '30000000-0000-4000-8000-000000000266';
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f265000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH265', 'Khách thử 265', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f265000-0000-4000-8000-000000000002', '7f265000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 265', 'Địa chỉ thử');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by, confirmed_at) values
  ('7f265000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2651', '7f265000-0000-4000-8000-000000000001',
   '7f265000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 265', 'Công trình thử 265', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', now());
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f265000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', '7f265000-0000-4000-8000-000000000001', 'SALES_ORDER',
   '7f265000-0000-4000-8000-000000000010', 900000, '10000000-0000-4000-8000-000000000001', '7f265000-0000-4000-8000-000000000010');

do $test$
declare
  sales_order constant uuid := '7f265000-0000-4000-8000-000000000010';
  op constant uuid := '7f265000-0000-4000-8000-000000000060';
  people jsonb; failed text;
begin
  -- Before any approval: no approver yet; the people who may approve are named with their roles (role or extra grant),
  -- the inactive employee is not.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  people := public.sales_order_credit_people(sales_order);
  assert people->'approved' = 'null'::jsonb, format('nobody approved yet %s', people);
  assert people->'approvers' @> '[{"name": "Nhân viên thử 1", "roles": "Toàn quyền thử"}]'::jsonb, format('full role may approve %s', people);
  assert people->'approvers' @> '[{"name": "Kế toán thử 265", "roles": "Bán hàng thử 265"}]'::jsonb, format('grant counts %s', people);
  assert not (people->'approvers')::text like '%Nhân viên nghỉ 266%', 'inactive employee is not listed';
  assert not (people->'approvers')::text like '%Nhân viên thử 3%', 'a reader may not approve';
  assert (people::text) not like '%10000000-0000-4000-8000%', 'no login id is returned';

  -- After an approval the approver is named with the role held in the branch.
  perform pg_temp.act_as_admin();
  insert into public.command_receipts values (op, '10000000-0000-4000-8000-000000000265', 'confirm_sales_order_with_credit_override',
    repeat('a', 64), 'sales_order', sales_order, now());
  insert into public.sales_order_credit_overrides(sales_order_id, branch_id, customer_id, commitment_id, operation_id, actor_auth_user_id, reason,
    approved_limit_vnd, exposure_before_vnd, order_amount_vnd, exposure_after_vnd, overdue_vnd, snapshot_hash)
  values (sales_order, '20000000-0000-4000-8000-00000000000a', '7f265000-0000-4000-8000-000000000001', '7f265000-0000-4000-8000-000000000050', op,
    '10000000-0000-4000-8000-000000000265', 'Vượt hạn mức tín dụng', 500000, 0, 900000, 900000, 0, repeat('b', 64));
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  people := public.sales_order_credit_people(sales_order);
  assert people->'approved'->>'name' = 'Kế toán thử 265' and people->'approved'->>'code' = 'NT_KT265'
    and people->'approved'->>'roles' = 'Bán hàng thử 265' and people->'approved' ? 'at', format('approver named %s', people);

  -- Another branch and anon cannot read it.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.sales_order_credit_people(sales_order); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch refused, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.sales_order_credit_people(uuid)', 'execute'), 'anon cannot execute';
end
$test$;
