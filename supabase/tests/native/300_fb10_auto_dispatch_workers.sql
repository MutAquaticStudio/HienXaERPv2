-- FB10 (6.1): "Tự chia việc" uses every free worker who can take jobs (by role or extra grant) with any truck, without a
-- default driver; office staff managing roles are not sent; a truck saved without a capacity note can be assigned.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f300000-0000-4000-8000-000000000001', 'nt_kg300', 'Kilôgam thử 300', 'kg');
insert into public.material_groups(id, code, name) values ('7f300000-0000-4000-8000-000000000002', 'NT_G300', 'Nhóm thử 300');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f300000-0000-4000-8000-000000000003', '7f300000-0000-4000-8000-000000000002', 'NT_XM300', 'Xi măng 300', '7f300000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f300000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K300', 'Kho 300');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f300000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f300000-0000-4000-8000-000000000004', 'NT-KK-300', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f300000-0000-4000-8000-000000000006', '7f300000-0000-4000-8000-000000000005', '7f300000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f300000-0000-4000-8000-000000000003', '7f300000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f300000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f300000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f300000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH300', 'Khách 300', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f300000-0000-4000-8000-000000000011', '7f300000-0000-4000-8000-000000000010', 'CT1', 'Công trình 300', 'Địa chỉ 300');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f300000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT-SO-300', '7f300000-0000-4000-8000-000000000010',
   '7f300000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 300', 'Công trình 300', 'Địa chỉ 300', 'Anh Nhận', '0901300000', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f300000-0000-4000-8000-000000000013', '7f300000-0000-4000-8000-000000000012', 1, '7f300000-0000-4000-8000-000000000003', 'Xi măng 300',
   '7f300000-0000-4000-8000-000000000001', '7f300000-0000-4000-8000-000000000001', 9000, 1, 1, 'HALF_UP', 2000, 18000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- Two workers (one by role, one by an extra grant), two trucks without a default driver or a capacity note.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000300'), ('10000000-0000-4000-8000-000000000301');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000300', '10000000-0000-4000-8000-000000000300', 'NT_TX300', 'Tài xế A'),
  ('30000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000301', 'NT_TX301', 'Tài xế B');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000300', 'nt_driver300', 'Tài xế thử 300'),
  ('40000000-0000-4000-8000-000000000301', 'nt_reader300', 'Chỉ xem việc 300');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000300', 'work.claim'), ('40000000-0000-4000-8000-000000000300', 'work.read'),
  ('40000000-0000-4000-8000-000000000301', 'work.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000300'),
  ('30000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000301');
insert into public.employee_permission_grants(employee_id, branch_id, permission_code, granted_by) values
  ('30000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-00000000000a', 'work.claim', '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id, capacity_source_note, capacity_verified_at, capacity_verified_by) values
  ('7f300000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_V1', '99C-300.01', 5000, '7f300000-0000-4000-8000-000000000001', null, now(), '10000000-0000-4000-8000-000000000001'),
  ('7f300000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_V2', '99C-300.02', 5000, '7f300000-0000-4000-8000-000000000001', null, now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);


do $test$
declare
  sale constant uuid := '7f300000-0000-4000-8000-000000000012';
  line constant uuid := '7f300000-0000-4000-8000-000000000013';
  wh constant uuid := '7f300000-0000-4000-8000-000000000004';
  day constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 2;
  nine constant timestamptz := (day + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  r1 jsonb; r2 jsonb; r3 jsonb;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  r1 := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f300000-0000-4000-8000-0000000000b1');
  r2 := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f300000-0000-4000-8000-0000000000b2');
  r3 := public.create_delivery_for_order(sale, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1000')), nine, null,
    '7f300000-0000-4000-8000-0000000000b3');
  perform pg_temp.act_as_admin();
  assert r1->'dispatch'->>'status' = 'ASSIGNED' and r2->'dispatch'->>'status' = 'ASSIGNED', format('both assigned %s / %s', r1->'dispatch', r2->'dispatch');
  assert (r1->'dispatch'->>'employee_id') <> (r2->'dispatch'->>'employee_id') and (r1->'dispatch'->>'vehicle_id') <> (r2->'dispatch'->>'vehicle_id'),
    'two workers on two trucks at 09:00';
  assert (r1->'dispatch'->>'employee_id')::uuid in ('30000000-0000-4000-8000-000000000300', '30000000-0000-4000-8000-000000000301')
    and (r2->'dispatch'->>'employee_id')::uuid in ('30000000-0000-4000-8000-000000000300', '30000000-0000-4000-8000-000000000301'), 'workers, not the owner';
  assert r3->'dispatch'->>'status' = 'ASSIGNED' and (r3->'dispatch'->>'start_at')::timestamptz >= nine + interval '1 hour', format('third after the first round %s', r3->'dispatch');
  assert (select capacity_source_note from public.vehicles where id = '7f300000-0000-4000-8000-000000000020') is not null, 'capacity note filled';
end
$test$;
