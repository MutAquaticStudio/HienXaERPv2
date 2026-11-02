-- D46: split a delivery note into several notes before loading — one line shared by quantity, the driver of the
-- original withdrawn and told, reservations moved exactly, one part assigned on the spot; refusals leave nothing behind.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000321');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000321', '10000000-0000-4000-8000-000000000321', 'NT_W321', 'Thợ thử 321');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000321', 'nt_worker321', 'Thợ thử 321');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000321', 'work.read'), ('40000000-0000-4000-8000-000000000321', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000321', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000321');
-- Dispatch by hand in this branch, so parts without a driver stay waiting.
insert into public.branch_operation_settings(branch_id, dispatch_mode, updated_by) values ('20000000-0000-4000-8000-00000000000a', 'OFF', '10000000-0000-4000-8000-000000000001');
insert into public.units_of_measure(id, code, name, symbol) values ('7f46a000-0000-4000-8000-000000000001', 'nt_kg321', 'Kilôgam thử 321', 'kg');
insert into public.material_groups(id, code, name) values ('7f46a000-0000-4000-8000-000000000002', 'NT_G321', 'Nhóm thử 321');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f46a000-0000-4000-8000-000000000011', '7f46a000-0000-4000-8000-000000000002', 'NT_XM321', 'Xi măng thử 321', '7f46a000-0000-4000-8000-000000000001'),
  ('7f46a000-0000-4000-8000-000000000012', '7f46a000-0000-4000-8000-000000000002', 'NT_CAT321', 'Cát thử 321', '7f46a000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f46a000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_KH321', 'Khách thử 321', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f46a000-0000-4000-8000-000000000022', '7f46a000-0000-4000-8000-000000000021', 'CT1', 'Công trình thử 321', 'Địa chỉ thử', 'Anh Nhận', '0901000321');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f46a000-0000-4000-8000-000000000023', '20000000-0000-4000-8000-00000000000a', 'NT_K321', 'Kho thử 321');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f46a000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', 'NT-SO-3211', '7f46a000-0000-4000-8000-000000000021',
   '7f46a000-0000-4000-8000-000000000022', 'CONFIRMED', 'Khách thử 321', 'Công trình thử 321', 'Địa chỉ thử', 'Anh Nhận', '0901000321',
   '10000000-0000-4000-8000-000000000001', now());
-- 200 kg cement at 2 000 ₫/kg and 300 kg sand at 500 ₫/kg.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f46a000-0000-4000-8000-000000000031', '7f46a000-0000-4000-8000-000000000030', 1, '7f46a000-0000-4000-8000-000000000011', 'Xi măng thử 321',
   '7f46a000-0000-4000-8000-000000000001', '7f46a000-0000-4000-8000-000000000001', 200, 1, 1, 'HALF_UP', 2000, 400000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f46a000-0000-4000-8000-000000000032', '7f46a000-0000-4000-8000-000000000030', 2, '7f46a000-0000-4000-8000-000000000012', 'Cát thử 321',
   '7f46a000-0000-4000-8000-000000000001', '7f46a000-0000-4000-8000-000000000001', 300, 1, 1, 'HALF_UP', 500, 150000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f46a000-0000-4000-8000-000000000033', '20000000-0000-4000-8000-00000000000a', '7f46a000-0000-4000-8000-000000000021', 'SALES_ORDER',
   '7f46a000-0000-4000-8000-000000000030', 550000, '10000000-0000-4000-8000-000000000001', '7f46a000-0000-4000-8000-000000000030');
-- 1 000 kg of each on hand.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f46a000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', '7f46a000-0000-4000-8000-000000000023', 'NT-KK-3211', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f46a000-0000-4000-8000-000000000041', '7f46a000-0000-4000-8000-000000000040', '7f46a000-0000-4000-8000-000000000011', 0, 1000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f46a000-0000-4000-8000-000000000042', '7f46a000-0000-4000-8000-000000000040', '7f46a000-0000-4000-8000-000000000012', 0, 1000, 300, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f46a000-0000-4000-8000-000000000011', '7f46a000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f46a000-0000-4000-8000-000000000023', 'STOCK_ADJUSTMENT', 1000, 1500000, 1500, '7f46a000-0000-4000-8000-000000000041', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f46a000-0000-4000-8000-000000000012', '7f46a000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f46a000-0000-4000-8000-000000000023', 'STOCK_ADJUSTMENT', 1000, 300000, 300, '7f46a000-0000-4000-8000-000000000042', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f46a000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', 'NT_XE321A', '99C-321.01', 2000, '7f46a000-0000-4000-8000-000000000001'),
  ('7f46a000-0000-4000-8000-000000000051', '20000000-0000-4000-8000-00000000000a', 'NT_XE321B', '99C-321.02', 50, '7f46a000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.reserved321(target_material uuid) returns numeric language sql as $$
  select coalesce(sum(reserved_base_quantity), 0) from public.inventory_reservations
  where material_id = target_material and state = 'ACTIVE';
$$;

do $test$
declare
  orders constant uuid := '7f46a000-0000-4000-8000-000000000030';
  cement constant uuid := '7f46a000-0000-4000-8000-000000000011';
  sand constant uuid := '7f46a000-0000-4000-8000-000000000012';
  w1 constant uuid := '7f46a000-0000-4000-8000-000000000023';
  worker constant uuid := '30000000-0000-4000-8000-000000000321';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  big_truck constant uuid := '7f46a000-0000-4000-8000-000000000050';
  small_truck constant uuid := '7f46a000-0000-4000-8000-000000000051';
  result jsonb; source uuid; work uuid; cement_line uuid; sand_line uuid; failed text; parts jsonb; answer jsonb; again jsonb;
  start_at timestamptz := date_trunc('hour', now()) + interval '26 hours';
  part1 uuid; part2 uuid; part3 uuid;
begin
  perform pg_temp.act_as(owner_login);
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(
      jsonb_build_object('sales_order_line_id', '7f46a000-0000-4000-8000-000000000031', 'quantity', '200'),
      jsonb_build_object('sales_order_line_id', '7f46a000-0000-4000-8000-000000000032', 'quantity', '300')), start_at,
    jsonb_build_object('employee_id', worker, 'vehicle_id', big_truck, 'scheduled_start', start_at), '7f46b000-0000-4000-8000-000000000001');
  source := (result->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = source) = 'ASSIGNED', 'the original is assigned';
  select id into work from public.work_items where delivery_id = source;
  assert work is not null, 'the driver has the job';
  select id into cement_line from public.delivery_lines where delivery_id = source and material_id = cement;
  select id into sand_line from public.delivery_lines where delivery_id = source and material_id = sand;
  assert pg_temp.reserved321(cement) = 200 and pg_temp.reserved321(sand) = 300, 'reserved before the split';

  -- Refusals: one part, quantities not adding up, a stale version, someone without dispatch rights.
  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.split_delivery(source, (select version from public.deliveries where id = source),
    jsonb_build_array(jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', cement_line, 'base_quantity', '200')))),
    '7f46b000-0000-4000-8000-000000000002');
  exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_split_parts_invalid', format('one part is not a split, got %s', failed);
  parts := jsonb_build_array(
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', cement_line, 'base_quantity', '100'),
      jsonb_build_object('delivery_line_id', sand_line, 'base_quantity', '300'))),
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', cement_line, 'base_quantity', '50'))));
  failed := null;
  begin perform public.split_delivery(source, (select version from public.deliveries where id = source), parts, '7f46b000-0000-4000-8000-000000000003');
  exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_split_quantity_mismatch', format('150 of 200 kg is refused, got %s', failed);
  parts := jsonb_build_array(
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', cement_line, 'base_quantity', '100'),
      jsonb_build_object('delivery_line_id', sand_line, 'base_quantity', '300'))),
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', cement_line, 'base_quantity', '60'))),
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', cement_line, 'base_quantity', '40'))));
  failed := null;
  begin perform public.split_delivery(source, 999, parts, '7f46b000-0000-4000-8000-000000000004');
  exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_split_version_conflict', format('stale version refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.split_delivery(source, (select version from public.deliveries where id = source), parts, '7f46b000-0000-4000-8000-000000000005');
  exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('a reader cannot split, got %s', failed);
  -- A chosen truck too small for its part: the whole split is refused, nothing changes.
  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.split_delivery(source, (select version from public.deliveries where id = source),
    jsonb_set(parts, '{1}', (parts->1) || jsonb_build_object('employee_id', worker, 'vehicle_id', small_truck, 'scheduled_start', start_at + interval '3 hours')),
    '7f46b000-0000-4000-8000-000000000006');
  exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_split_assignment_refused', format('a part that does not fit its truck is refused, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = source) = 'ASSIGNED', 'still assigned after the refusals';
  assert not exists (select 1 from public.deliveries where split_from_delivery_id = source), 'no part left behind';
  assert pg_temp.reserved321(cement) = 200, 'reservations untouched by the refusals';

  -- 3 notes: 100 kg cement + all the sand (waiting), 60 kg cement on the big truck at a set time, 40 kg (waiting).
  parts := jsonb_set(parts, '{1}', (parts->1) || jsonb_build_object('employee_id', worker, 'vehicle_id', big_truck, 'scheduled_start', start_at + interval '3 hours'));
  perform pg_temp.act_as(owner_login);
  answer := public.split_delivery(source, (select version from public.deliveries where id = source), parts, '7f46b000-0000-4000-8000-000000000007');
  again := public.split_delivery(source, (select version from public.deliveries where id = source) - 1, parts, '7f46b000-0000-4000-8000-000000000007');
  perform pg_temp.act_as_admin();
  assert answer = again, 'the same click again returns the same notes';
  assert jsonb_array_length(answer->'deliveries') = 3, format('three notes, got %s', answer);
  assert (select execution_state from public.deliveries where id = source) = 'CANCELLED', 'the original is cancelled';
  assert (select execution_state from public.work_items where id = work) = 'CANCELLED', 'its job is withdrawn';
  assert not exists (select 1 from public.delivery_assignments where delivery_id = source and superseded_at is null), 'its assignment is withdrawn';
  assert not exists (select 1 from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id
    where l.delivery_id = source and r.state = 'ACTIVE'), 'its reservations are released';
  assert pg_temp.reserved321(cement) = 200 and pg_temp.reserved321(sand) = 300, 'the same quantities are reserved again on the new notes';
  select d.id into part1 from public.deliveries d join public.delivery_lines l on l.delivery_id = d.id
    where d.split_from_delivery_id = source and l.material_id = sand;
  select d.id into part2 from public.deliveries d join public.delivery_lines l on l.delivery_id = d.id
    where d.split_from_delivery_id = source and l.material_id = cement and l.planned_base_quantity = 60;
  select d.id into part3 from public.deliveries d join public.delivery_lines l on l.delivery_id = d.id
    where d.split_from_delivery_id = source and l.material_id = cement and l.planned_base_quantity = 40;
  assert part1 is not null and part2 is not null and part3 is not null, 'each part has its lines';
  assert (select count(*) from public.delivery_lines where delivery_id = part1) = 2, 'part 1 carries cement and sand';
  assert (select execution_state from public.deliveries where id = part1) = 'PLANNED', 'part 1 waits for dispatch';
  assert (select execution_state from public.deliveries where id = part3) = 'PLANNED', 'part 3 waits for dispatch';
  assert (select execution_state from public.deliveries where id = part2) = 'ASSIGNED', 'part 2 is assigned as chosen';
  assert (select scheduled_at from public.deliveries where id = part2) = start_at + interval '3 hours', 'part 2 at its own time';
  assert exists (select 1 from public.work_items where delivery_id = part2 and execution_state = 'CLAIMED'), 'the driver has the new job';
  assert (select delivery_address_snapshot || receiver_phone_snapshot from public.deliveries where id = part3) = 'Địa chỉ thử0901000321', 'same address and receiver';
  assert (select sum(planned_base_quantity) from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
    where d.split_from_delivery_id = source and l.material_id = cement) = 200, 'cement shared out exactly';
  assert private.delivery_allocation_consumed((select supply_allocation_id from public.delivery_lines where id = cement_line)) = 200,
    'the order still plans 200 kg cement, not 400';
  assert exists (select 1 from public.notifications where recipient_employee_id = worker and kind = 'work.delivery_split'), 'the driver is told';
  assert exists (select 1 from public.audit_events where entity_id = source and action = 'delivery.split'), 'the split is audited';

  -- Once loaded, a note cannot be split any more.
  perform pg_temp.act_as(owner_login);
  perform public.handoff_delivery_actual(part2, (select version from public.deliveries where id = part2), now(), '7f46b000-0000-4000-8000-000000000008',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = part2), 'loaded_base_quantity', '60')));
  failed := null;
  begin perform public.split_delivery(part2, (select version from public.deliveries where id = part2),
    jsonb_build_array(
      jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = part2), 'base_quantity', '30'))),
      jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = part2), 'base_quantity', '30')))),
    '7f46b000-0000-4000-8000-000000000009');
  exception when others then failed := sqlerrm; end;
  assert failed in ('delivery_split_version_conflict', 'delivery_split_already_loaded'), format('a loaded note is not split, got %s', failed);
  -- A waiting part can be split again.
  answer := public.split_delivery(part3, (select version from public.deliveries where id = part3),
    jsonb_build_array(
      jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = part3), 'base_quantity', '15.5'))),
      jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = part3), 'base_quantity', '24.5')))),
    '7f46b000-0000-4000-8000-00000000000a');
  perform pg_temp.act_as_admin();
  assert jsonb_array_length(answer->'deliveries') = 2, 'a part splits again with decimals';
  assert pg_temp.reserved321(cement) = 140, format('60 kg left the warehouse, 140 kg still reserved, got %s', pg_temp.reserved321(cement));
end
$test$;
