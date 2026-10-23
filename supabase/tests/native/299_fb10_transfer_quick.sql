-- FB10 (5.2): several materials moved in one transfer form, quantities in bao, shipped at once; one tap "Nhận đủ".
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f299000-0000-4000-8000-000000000001', 'nt_kg299', 'Kilôgam thử 299', 'kg'),
  ('7f299000-0000-4000-8000-000000000002', 'nt_bao299', 'Bao thử 299', 'bao'),
  ('7f299000-0000-4000-8000-000000000003', 'nt_vien299', 'Viên thử 299', 'viên'),
  ('7f299000-0000-4000-8000-000000000004', 'nt_m3299', 'Khối thử 299', 'm³');
insert into public.material_groups(id, code, name) values ('7f299000-0000-4000-8000-000000000005', 'NT_G299', 'Nhóm thử 299');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f299000-0000-4000-8000-000000000010', '7f299000-0000-4000-8000-000000000005', 'NT_XM299', 'Xi măng 299', '7f299000-0000-4000-8000-000000000001'),
  ('7f299000-0000-4000-8000-000000000011', '7f299000-0000-4000-8000-000000000005', 'NT_GA299', 'Gạch 299', '7f299000-0000-4000-8000-000000000003'),
  ('7f299000-0000-4000-8000-000000000012', '7f299000-0000-4000-8000-000000000005', 'NT_CA299', 'Cát 299', '7f299000-0000-4000-8000-000000000004');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f299000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_K2991', 'Kho chính 299'),
  ('7f299000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_K2992', 'Kho phụ 299');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f299000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', '7f299000-0000-4000-8000-000000000020', 'NT-KK-2991', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001'),
  ('7f299000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f299000-0000-4000-8000-000000000021', 'NT-KK-2992', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f299000-0000-4000-8000-000000000072', '7f299000-0000-4000-8000-000000000070', '7f299000-0000-4000-8000-000000000010', 0, 1000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f299000-0000-4000-8000-000000000073', '7f299000-0000-4000-8000-000000000070', '7f299000-0000-4000-8000-000000000011', 0, 300, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f299000-0000-4000-8000-000000000074', '7f299000-0000-4000-8000-000000000071', '7f299000-0000-4000-8000-000000000011', 0, 2000, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f299000-0000-4000-8000-000000000010', '7f299000-0000-4000-8000-000000000001', 'WAREHOUSE', '7f299000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 1000, 1500000, 1500, '7f299000-0000-4000-8000-000000000072', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f299000-0000-4000-8000-000000000011', '7f299000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f299000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 300, 270000, 900, '7f299000-0000-4000-8000-000000000073', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f299000-0000-4000-8000-000000000011', '7f299000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f299000-0000-4000-8000-000000000021', 'STOCK_ADJUSTMENT', 2000, 1800000, 900, '7f299000-0000-4000-8000-000000000074', now(), '10000000-0000-4000-8000-000000000001');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type) values
  ('7f299000-0000-4000-8000-000000000010', '7f299000-0000-4000-8000-000000000002', '7f299000-0000-4000-8000-000000000001', 50, 1, 'PACKAGING');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  main constant uuid := '7f299000-0000-4000-8000-000000000020';
  second constant uuid := '7f299000-0000-4000-8000-000000000021';
  cement constant uuid := '7f299000-0000-4000-8000-000000000010';
  brick constant uuid := '7f299000-0000-4000-8000-000000000011';
  first_id uuid; again uuid; cement_transfer uuid; brick_transfer uuid; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  first_id := public.create_warehouse_transfers('20000000-0000-4000-8000-00000000000a', main, second, jsonb_build_array(
    jsonb_build_object('material_id', cement, 'quantity', '4', 'uom_id', '7f299000-0000-4000-8000-000000000002'),
    jsonb_build_object('material_id', brick, 'quantity', '100')), true, '', '7f299000-0000-4000-8000-0000000000b1');
  again := public.create_warehouse_transfers('20000000-0000-4000-8000-00000000000a', main, second, jsonb_build_array(
    jsonb_build_object('material_id', cement, 'quantity', '4', 'uom_id', '7f299000-0000-4000-8000-000000000002'),
    jsonb_build_object('material_id', brick, 'quantity', '100')), true, '', '7f299000-0000-4000-8000-0000000000b1');
  perform pg_temp.act_as_admin();
  assert again = first_id, 'retry replays';
  select id into cement_transfer from public.warehouse_transfers where material_id = cement and from_warehouse_id = main;
  select id into brick_transfer from public.warehouse_transfers where material_id = brick and from_warehouse_id = main;
  assert (select planned_base_quantity from public.warehouse_transfers where id = cement_transfer) = 200, '4 bao = 200 kg';
  assert (select count(*) from public.warehouse_transfer_events where transfer_id in (cement_transfer, brick_transfer) and event_kind = 'DISPATCH') = 2, 'shipped at once';
  assert (select sum(base_quantity_delta) from public.inventory_movements where warehouse_id = main and material_id = cement and location_kind = 'WAREHOUSE') = 800, 'left the main warehouse';

  -- "Nhận đủ" receives everything on the way.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.quick_warehouse_transfer_step(cement_transfer, 'RECEIVE_ALL', '7f299000-0000-4000-8000-0000000000c1');
  perform pg_temp.act_as_admin();
  assert (select coalesce(sum(base_quantity_delta), 0) from public.inventory_movements where warehouse_id = second and material_id = cement and location_kind = 'WAREHOUSE') = 200,
    'arrived in the second warehouse';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin perform public.quick_warehouse_transfer_step(cement_transfer, 'RECEIVE_ALL', '7f299000-0000-4000-8000-0000000000c2');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'transfer_nothing_to_receive', format('nothing left, got %s', failed);

  -- A transfer opened without shipping: one tap "Xuất kho".
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  first_id := public.create_warehouse_transfers('20000000-0000-4000-8000-00000000000a', main, second, jsonb_build_array(
    jsonb_build_object('material_id', brick, 'quantity', '50')), false, 'Bổ sung kho phụ', '7f299000-0000-4000-8000-0000000000b2');
  perform public.quick_warehouse_transfer_step(first_id, 'DISPATCH_ALL', '7f299000-0000-4000-8000-0000000000c3');
  perform pg_temp.act_as_admin();
  assert (select sum(base_quantity) from public.warehouse_transfer_events where transfer_id = first_id and event_kind = 'DISPATCH') = 50, 'shipped the plan';

  -- Read-only staff cannot.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.quick_warehouse_transfer_step(brick_transfer, 'RECEIVE_ALL', '7f299000-0000-4000-8000-0000000000c4');
  exception when others then failed := sqlstate; end;
  perform pg_temp.act_as_admin();
  assert failed = '42501', 'reader cannot receive';
end
$test$;
