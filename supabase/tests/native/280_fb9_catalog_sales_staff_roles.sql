-- FB9: "Ngừng dùng" works for a material already used; "Nhân viên kinh doanh phụ trách" lists sales staff, not workers;
-- one role for workers and drivers.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000280'), ('10000000-0000-4000-8000-000000000281'), ('10000000-0000-4000-8000-000000000282');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000280', '10000000-0000-4000-8000-000000000280', 'NT_W280', 'Thợ thử 280'),
  ('30000000-0000-4000-8000-000000000281', '10000000-0000-4000-8000-000000000281', 'NT_S281', 'Bán hàng thử 281'),
  ('30000000-0000-4000-8000-000000000282', '10000000-0000-4000-8000-000000000282', 'NT_K282', 'Kho thử 282 có quyền bán');
insert into public.roles(id, code, name) values
  ('40000000-0000-4000-8000-000000000280', 'nt_worker280', 'Thợ thử 280'),
  ('40000000-0000-4000-8000-000000000281', 'nt_sales281', 'Bán hàng thử 281'),
  ('40000000-0000-4000-8000-000000000282', 'nt_store282', 'Kho thử 282');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000280', 'work.read'), ('40000000-0000-4000-8000-000000000280', 'work.claim'),
  ('40000000-0000-4000-8000-000000000281', 'orders.read'), ('40000000-0000-4000-8000-000000000281', 'orders.create'),
  ('40000000-0000-4000-8000-000000000282', 'inventory.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000280', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000280'),
  ('30000000-0000-4000-8000-000000000281', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000281'),
  ('30000000-0000-4000-8000-000000000282', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000282');
insert into public.employee_permission_grants(employee_id, branch_id, permission_code, granted_by) values
  ('30000000-0000-4000-8000-000000000282', '20000000-0000-4000-8000-00000000000a', 'orders.create', '10000000-0000-4000-8000-000000000001');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f280000-0000-4000-8000-000000000031', 'nt_kg280', 'Kilôgam thử 280', 'kg'),
  ('7f280000-0000-4000-8000-000000000032', 'nt_bao280', 'Bao thử 280', 'bao');
insert into public.material_groups(id, code, name) values ('7f280100-0000-4000-8000-000000000031', 'NT_G280', 'Nhóm thử 280');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f280200-0000-4000-8000-000000000031', '7f280100-0000-4000-8000-000000000031', 'NT_XM280', 'Xi măng thử 280', '7f280000-0000-4000-8000-000000000031');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f280800-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K2801', 'Kho thử 280');
-- The material already has stock (a transaction).
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f280800-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f280800-0000-4000-8000-000000000003', 'NT-KK-2801', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f280800-0000-4000-8000-000000000031', '7f280800-0000-4000-8000-000000000030', '7f280200-0000-4000-8000-000000000031', 0, 100, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f280200-0000-4000-8000-000000000031', '7f280000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f280800-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 100, 150000, 1500, '7f280800-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');
-- A customer still owned by the worker (set before FB9).
insert into public.customers(id, branch_id, code, display_name, customer_type, sales_owner_employee_id) values
  ('7f280800-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH280', 'Khách thử 280', 'BUSINESS', '30000000-0000-4000-8000-000000000280');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  material constant uuid := '7f280200-0000-4000-8000-000000000031';
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  failed text; options jsonb;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- 1. "Ngừng dùng" / "Dùng lại" send only `active`.
  perform public.save_catalog_record('materials', material, branch, '{"active": false}', '{"active": true}', 'Ngừng sử dụng', '7f280a00-0000-4000-8000-000000000001');
  perform pg_temp.act_as_admin();
  assert not (select active from public.materials where id = material), 'material stopped';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_catalog_record('materials', material, branch, '{"active": true}', '{"active": false}', 'Dùng lại', '7f280a00-0000-4000-8000-000000000002');
  perform pg_temp.act_as_admin();
  assert (select active from public.materials where id = material), 'material back in use';
  -- The base unit still cannot be changed.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin
    perform public.save_catalog_record('materials', material, branch, '{"base_uom_id": "7f280000-0000-4000-8000-000000000032"}',
      '{"base_uom_id": "7f280000-0000-4000-8000-000000000031"}', 'Đổi đơn vị gốc', '7f280a00-0000-4000-8000-000000000003');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'base_unit_immutable', format('base unit kept, got %s', failed);

  -- 2. Sales staff only; a worker kept on an old customer shows as "(ngừng)".
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select jsonb_object_agg(o.name, o.assignable) into options from public.customer_site_sales_owner_options(branch) o;
  perform pg_temp.act_as_admin();
  assert (options->>'Bán hàng thử 281')::boolean, format('sales role listed %s', options);
  assert (options->>'Kho thử 282 có quyền bán')::boolean, format('extra grant listed %s', options);
  assert (options->>'Nhân viên thử 1')::boolean, format('owner with full access listed %s', options);
  assert not options ? 'Kho thử 282' and not options ? 'Thợ thử 280', format('worker not assignable %s', options);
  assert not (options->>'Thợ thử 280 (ngừng)')::boolean, format('old owner kept as stopped %s', options);
  assert not options ? 'Nhân viên thử 3', format('read-only staff not listed %s', options);

  -- 3. One role for workers and drivers.
  assert (select name from public.roles where code = 'builtin_worker') = 'Thợ & tài xế', 'worker role renamed';
  assert not (select active from public.roles where code = 'builtin_driver'), 'driver role retired';
end
$test$;
