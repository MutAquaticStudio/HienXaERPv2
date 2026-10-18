-- FB3 A1: a dispatcher (delivery.create, no purchasing.create) makes a delivery from stock in one step; the warehouse
-- source is taken inside create_delivery_for_order. Choosing sources directly still needs purchasing.create.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f700000-0000-4000-8000-000000000031', 'nt_kg17', 'Kilôgam thử 4', 'kg'),
  ('7f700000-0000-4000-8000-000000000032', 'nt_bao17', 'Bao thử 4', 'bao');
insert into public.material_groups(id, code, name) values ('7f710000-0000-4000-8000-000000000031', 'NT_G17', 'Nhóm thử 4');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f720000-0000-4000-8000-000000000031', '7f710000-0000-4000-8000-000000000031', 'NT_XM17', 'Xi măng thử 4', '7f700000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f780000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH17', 'Khách thử 4', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f780000-0000-4000-8000-000000000002', '7f780000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử', 'Địa chỉ thử');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f780000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K171', 'Kho thử 1'),
  ('7f780000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K172', 'Kho thử 2');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by, confirmed_at) values
  ('7f780000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-171', '7f780000-0000-4000-8000-000000000001',
   '7f780000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 4', 'Công trình thử', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', now()),
  ('7f780000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT-SO-172', '7f780000-0000-4000-8000-000000000001',
   '7f780000-0000-4000-8000-000000000002', 'DRAFT', 'Khách thử 4', 'Công trình thử', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', null);
-- 10 bao of 50 kg (= 500 kg) sold, plus one line on the draft order.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f780000-0000-4000-8000-000000000020', '7f780000-0000-4000-8000-000000000010', 1, '7f720000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '7f700000-0000-4000-8000-000000000032', '7f700000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f780000-0000-4000-8000-000000000021', '7f780000-0000-4000-8000-000000000011', 1, '7f720000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '7f700000-0000-4000-8000-000000000032', '7f700000-0000-4000-8000-000000000031', 1, 50, 1, 'HALF_UP', 90000, 90000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- 400 kg on hand in warehouse 1 (from an approved count), nothing in warehouse 2.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f780000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f780000-0000-4000-8000-000000000003', 'NT-KK-171', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f780000-0000-4000-8000-000000000031', '7f780000-0000-4000-8000-000000000030', '7f720000-0000-4000-8000-000000000031', 0, 400, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f720000-0000-4000-8000-000000000031', '7f700000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f780000-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 400, 600000, 1500, '7f780000-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');

-- User 4: dispatcher of branch A without purchasing permissions.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000004');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'NT_E4', 'Điều phối thử');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000004', 'nt_dispatch', 'Điều phối thử');
insert into public.role_permissions(role_id, permission_code)
  select '40000000-0000-4000-8000-000000000004', code from public.permissions
  where code in ('dashboard.read', 'orders.read', 'delivery.read', 'delivery.create', 'delivery.assign', 'inventory.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000004');

do $test$
declare
  orders constant uuid := '7f780000-0000-4000-8000-000000000010';
  line constant uuid := '7f780000-0000-4000-8000-000000000020';
  w1 constant uuid := '7f780000-0000-4000-8000-000000000003';
  result jsonb;
  failed text;
begin
  assert not exists (select 1 from public.role_permissions where role_id = '40000000-0000-4000-8000-000000000004' and permission_code like 'purchasing.%'),
    'fixture: dispatcher has no purchasing permission';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000004');

  -- Choosing a source on its own still needs purchasing.create, and the internal allocator is not callable.
  failed := null;
  begin perform public.upsert_supply_allocation(line, 'WAREHOUSE', null, w1, 100, null, null, '7f790000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('dispatcher must not choose sources directly, got %s', failed);
  failed := null;
  begin perform private.allocate_warehouse_source(line, w1, 100, null, null);
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('internal allocator must not be callable, got %s', failed);

  -- "Lập phiếu giao" from stock works: source, delivery and reservation in one command.
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now(), null,
    '7f790000-0000-4000-8000-000000000001');
  assert (result->>'delivery_id') is not null, format('dispatcher delivery %s', result);
  perform pg_temp.act_as_admin();
  assert (select supply_mode || ':' || trim_scale(allocated_base_quantity) from public.supply_allocations where sales_order_line_id = line) = 'WAREHOUSE:100',
    'warehouse source of 100 kg';
  assert (select reserved_base_quantity from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id
    where l.delivery_id = (result->>'delivery_id')::uuid and r.state = 'ACTIVE') = 100, 'stock reserved';

  -- A second delivery tops up the same source; the stock limit still holds.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000004');
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '4')), now(), null,
    '7f790000-0000-4000-8000-000000000002');
  perform pg_temp.act_as_admin();
  assert (select count(*) || ':' || trim_scale(max(allocated_base_quantity)) from public.supply_allocations where sales_order_line_id = line) = '1:300', 'topped up to 300 kg';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000004');
  failed := null;
  begin perform public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '3')), now(), null,
      '7f790000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlstate; end;
  assert failed = '23514', format('more than the 400 kg on hand must fail, got %s', failed);
end
$test$;
