-- FB16 (D38): an order belongs to the salesperson who creates it; only the owner (roles.manage) names another seller,
-- audited, and not once the order's revenue is in a closed payroll.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f000000-0000-4000-8000-000000000001', 'nt_kg311', 'Kilôgam thử 311', 'kg');
insert into public.material_groups(id, code, name) values ('7f000000-0000-4000-8000-000000000002', 'NT_G311', 'Nhóm thử 311');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f000000-0000-4000-8000-000000000003', '7f000000-0000-4000-8000-000000000002', 'NT_SL1', 'Xi măng thử 311', '7f000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7f000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_KH311', 'Khách thử 311', 'BUSINESS', 10000000);
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f000000-0000-4000-8000-000000000005', '7f000000-0000-4000-8000-000000000004', 'CT1', 'Công trình 311', 'Địa chỉ thử');
insert into public.pricing_rules(id, branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('7f000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7f000000-0000-4000-8000-000000000003',
   '7f000000-0000-4000-8000-000000000001', 100000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
-- Employee 3 sells (orders.create) but is not the owner.
insert into public.role_permissions(role_id, permission_code) values ('40000000-0000-4000-8000-000000000002', 'orders.create');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  sale_login constant uuid := '10000000-0000-4000-8000-000000000003';
  owner_employee constant uuid := '30000000-0000-4000-8000-000000000001';
  sale_employee constant uuid := '30000000-0000-4000-8000-000000000003';
  other_branch_employee constant uuid := '30000000-0000-4000-8000-000000000002';
  line constant jsonb := jsonb_build_array(jsonb_build_object('material_id', '7f000000-0000-4000-8000-000000000003', 'ordered_uom_id', '7f000000-0000-4000-8000-000000000001',
    'quantity', '1', 'conversion_numerator', '1', 'conversion_denominator', '1', 'rounding_mode', 'HALF_UP', 'unit_price_vnd', '100000',
    'pricing_rule_id', '7f000000-0000-4000-8000-000000000006', 'pricing_rule_version', 1, 'price_source_type', 'LIST', 'override_reason', null));
  sale_order uuid; owner_order uuid; failed text; op uuid := gen_random_uuid();
begin
  -- The salesperson's order is theirs, and they cannot move it (or the owner's) to anyone.
  perform pg_temp.act_as(sale_login);
  sale_order := public.create_sales_order_draft(branch, '7f000000-0000-4000-8000-000000000004', '7f000000-0000-4000-8000-000000000005', null, null, line, gen_random_uuid());
  assert (select sales_owner_employee_id = sale_employee from public.sales_orders where id = sale_order), 'own order';
  assert exists (select 1 from public.sales_seller_options(branch) o where o.id = sale_employee and o.assignable), 'sellers listed';
  failed := null;
  begin perform public.set_sales_order_seller(sale_order, owner_employee, gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a salesperson cannot change the seller';

  -- The owner creates an order for the salesperson; the change is audited and a repeated press replays.
  perform pg_temp.act_as(owner_login);
  owner_order := public.create_sales_order_draft(branch, '7f000000-0000-4000-8000-000000000004', '7f000000-0000-4000-8000-000000000005', null, null, line, gen_random_uuid());
  assert (select sales_owner_employee_id = owner_employee from public.sales_orders where id = owner_order), 'created as the owner';
  assert public.set_sales_order_seller(owner_order, sale_employee, op) = owner_order, 'named the seller';
  assert public.set_sales_order_seller(owner_order, sale_employee, op) = owner_order, 'replay';
  assert (select sales_owner_employee_id = sale_employee from public.sales_orders where id = owner_order), 'now the salesperson''s';
  assert (select count(*) = 1 from public.audit_events where entity_id = owner_order and action = 'sales_order.seller_changed'
    and reason = 'Người bán: Nhân viên thử 1 → Nhân viên thử 3'), 'audited once';
  failed := null;
  begin perform public.set_sales_order_seller(owner_order, owner_employee, op); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', 'same operation, other seller';
  failed := null;
  begin perform public.set_sales_order_seller(owner_order, other_branch_employee, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_seller_not_assignable', 'only people selling in the branch';

  -- Revenue in a closed payroll locks the seller.
  -- (A verified delivery is long to build here: the revenue row is inserted with foreign keys off for this transaction.)
  perform pg_temp.act_as_admin();
  perform set_config('session_replication_role', 'replica', true);
  insert into public.revenue_entries(branch_id, sales_order_id, delivery_verification_id, amount_vnd, recorded_by, recorded_at)
    values (branch, owner_order, gen_random_uuid(), 100000, owner_login, now());
  perform set_config('session_replication_role', 'origin', true);
  insert into public.payroll_periods(branch_id, code, name, period_start, period_end, state, created_by)
    values (branch, 'NT311', 'Kỳ thử 311', current_date - 1, current_date + 1, 'DRAFT', owner_login);
  perform pg_temp.act_as(owner_login);
  assert public.set_sales_order_seller(owner_order, owner_employee, gen_random_uuid()) = owner_order, 'open payroll: still changeable';
  perform pg_temp.act_as_admin();
  update public.payroll_periods set state = 'CLOSED', closed_at = now(), closed_by = owner_login where code = 'NT311' and branch_id = branch;
  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.set_sales_order_seller(owner_order, sale_employee, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_seller_locked_by_payroll', 'closed payroll locks the seller';
  perform pg_temp.act_as_admin();
end
$test$;
