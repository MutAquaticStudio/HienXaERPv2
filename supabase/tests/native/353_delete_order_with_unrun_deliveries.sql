-- D90: "Xóa đơn bán" deletes the order's deliveries that never ran (planned, assigned, cancelled) with everything that only planned
-- them: lines, stock reservations, assignments, the unstarted job, dispatch proposals / exclusions, route stops, notifications and
-- unsent pushes. A delivery that happened (loaded, stock moved, verified, job started) keeps refusing with its number.
-- The delivery-line and job-assignment guards stay append-only outside this command.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000353');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000353', '10000000-0000-4000-8000-000000000353', 'NT_W353', 'Thợ thử 353');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000353', 'nt_worker353', 'Thợ thử 353');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000353', 'work.read'), ('40000000-0000-4000-8000-000000000353', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000353', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000353');
insert into public.units_of_measure(id, code, name, symbol) values ('7f353000-0000-4000-8000-000000000001', 'nt_kg353', 'Kilôgam thử 353', 'kg');
insert into public.material_groups(id, code, name) values ('7f353000-0000-4000-8000-000000000002', 'NT_G353', 'Nhóm thử 353');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f353000-0000-4000-8000-000000000003', '7f353000-0000-4000-8000-000000000002', 'NT_XM353', 'Xi măng 353', '7f353000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f353000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K353', 'Kho 353');
-- 10 000 kg on hand.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f353000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f353000-0000-4000-8000-000000000004', 'NT-KK-353', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f353000-0000-4000-8000-000000000006', '7f353000-0000-4000-8000-000000000005', '7f353000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
-- A second count line, the source of a stock movement on a delivery (order 4).
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f353000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-00000000000a', '7f353000-0000-4000-8000-000000000004', 'NT-KK-3532', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f353000-0000-4000-8000-000000000008', '7f353000-0000-4000-8000-000000000007', '7f353000-0000-4000-8000-000000000003', 0, 1, 1500, 'Hàng trên xe thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f353000-0000-4000-8000-000000000003', '7f353000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f353000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f353000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f353000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH353', 'Khách 353', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f353000-0000-4000-8000-000000000011', '7f353000-0000-4000-8000-000000000010', 'CT1', 'Công trình 353', 'Địa chỉ 353', 'Anh Nhận', '0901353000');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f353000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_XE353', '99C-353.01', 5000, '7f353000-0000-4000-8000-000000000001');
-- Orders 1..6 (id ...00000000002n), one line each (...00000000003n) of 100 kg, with the credit their confirmation held.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at)
select ('7f353000-0000-4000-8000-00000000002' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-SO-353' || n,
  '7f353000-0000-4000-8000-000000000010', '7f353000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 353', 'Công trình 353', 'Địa chỉ 353', 'Anh Nhận', '0901353000',
  '10000000-0000-4000-8000-000000000001', now()
from generate_series(1, 6) as n;
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
select ('7f353000-0000-4000-8000-00000000003' || n)::uuid, ('7f353000-0000-4000-8000-00000000002' || n)::uuid, 1, '7f353000-0000-4000-8000-000000000003', 'Xi măng 353',
  '7f353000-0000-4000-8000-000000000001', '7f353000-0000-4000-8000-000000000001', 100, 1, 1, 'HALF_UP', 2000, 200000, 'MANUAL_APPROVED',
  '10000000-0000-4000-8000-000000000001', 'Giá thử'
from generate_series(1, 6) as n;
insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id)
select '20000000-0000-4000-8000-00000000000a', '7f353000-0000-4000-8000-000000000010', 'SALES_ORDER', ('7f353000-0000-4000-8000-00000000002' || n),
  200000, '10000000-0000-4000-8000-000000000001', ('7f353000-0000-4000-8000-00000000002' || n)::uuid
from generate_series(1, 6) as n;
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.available353() returns numeric language sql as $$
  select available_base_quantity::numeric from public.warehouse_inventory_read
  where warehouse_id = '7f353000-0000-4000-8000-000000000004' and material_id = '7f353000-0000-4000-8000-000000000003';
$$;
-- Every row that points at the given deliveries (directly or through their lines / jobs).
create function pg_temp.left353(ids uuid[]) returns text language sql as $$
  select concat_ws(' ',
    nullif('deliveries=' || (select count(*) from public.deliveries where id = any(ids)), 'deliveries=0'),
    nullif('lines=' || (select count(*) from public.delivery_lines where delivery_id = any(ids)), 'lines=0'),
    nullif('assignments=' || (select count(*) from public.delivery_assignments where delivery_id = any(ids)), 'assignments=0'),
    nullif('work=' || (select count(*) from public.work_items where delivery_id = any(ids)), 'work=0'),
    nullif('proposals=' || (select count(*) from public.delivery_dispatch_proposals where delivery_id = any(ids)), 'proposals=0'),
    nullif('exclusions=' || (select count(*) from public.delivery_dispatch_exclusions where delivery_id = any(ids)), 'exclusions=0'),
    nullif('stops=' || (select count(*) from public.route_plan_stops where delivery_id = any(ids)), 'stops=0'),
    nullif('notifications=' || (select count(*) from public.notifications where entity_type = 'delivery' and entity_id = any(ids)), 'notifications=0'));
$$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  wh constant uuid := '7f353000-0000-4000-8000-000000000004';
  worker constant uuid := '30000000-0000-4000-8000-000000000353';
  truck constant uuid := '7f353000-0000-4000-8000-000000000012';
  o1 constant uuid := '7f353000-0000-4000-8000-000000000021';
  o2 constant uuid := '7f353000-0000-4000-8000-000000000022';
  o3 constant uuid := '7f353000-0000-4000-8000-000000000023';
  o4 constant uuid := '7f353000-0000-4000-8000-000000000024';
  o5 constant uuid := '7f353000-0000-4000-8000-000000000025';
  o6 constant uuid := '7f353000-0000-4000-8000-000000000026';
  op1 constant uuid := '7f353000-0000-4000-8000-0000000009a1';
  start_at constant timestamptz := now() + interval '1 day';
  assign constant jsonb := jsonb_build_object('employee_id', '30000000-0000-4000-8000-000000000353', 'vehicle_id', '7f353000-0000-4000-8000-000000000012', 'schedule_mode', 'NOW');
  d_planned uuid; d_assigned uuid; d_cancelled uuid; d_loaded uuid; d_moved uuid; d_verified uuid; d_started uuid;
  work_assigned uuid;
  plan uuid := '7f353000-0000-4000-8000-000000000040';
  note uuid;
  before_create numeric; before_delete numeric;
  numbers text;
  failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', null, '7f353000-0000-4000-8000-0000000000a0');
  before_create := pg_temp.available353();
  assert before_create = 10000, format('stock on hand %s', before_create);

  -- Order 1: a planned delivery (40 kg) and an assigned one with its job (30 kg).
  d_planned := (public.create_delivery_for_order(o1, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f353000-0000-4000-8000-000000000031', 'quantity', '40')),
    start_at, null, '7f353000-0000-4000-8000-0000000000b1')->>'delivery_id')::uuid;
  d_assigned := (public.create_delivery_for_order(o1, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f353000-0000-4000-8000-000000000031', 'quantity', '30')),
    start_at, assign, '7f353000-0000-4000-8000-0000000000b2')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_planned) = 'PLANNED', 'first delivery planned';
  assert (select execution_state from public.deliveries where id = d_assigned) = 'ASSIGNED', 'second delivery assigned';
  select id into work_assigned from public.work_items where delivery_id = d_assigned;
  assert work_assigned is not null and exists (select 1 from public.work_item_assignments where work_item_id = work_assigned), 'job with its worker';
  assert exists (select 1 from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id where l.delivery_id = d_planned and r.state = 'ACTIVE'),
    'the planned delivery holds stock';
  -- What dispatching leaves around a delivery that has not run yet.
  insert into public.delivery_dispatch_proposals(delivery_id, employee_id, vehicle_id, scheduled_start, scheduled_end, reason, created_by)
  values (d_planned, worker, truck, start_at, start_at + interval '1 hour', 'Gợi ý thử', '10000000-0000-4000-8000-000000000001');
  insert into public.delivery_dispatch_exclusions(delivery_id, employee_id, reason, created_by)
  values (d_planned, worker, 'Thợ từ chối thử', '10000000-0000-4000-8000-000000000001');
  insert into public.route_plans(id, branch_id, departure_at, vehicle_id, driver_employee_id, provider_state, created_by, operation_id)
  values (plan, branch, start_at, truck, worker, 'MANUAL_FALLBACK', '10000000-0000-4000-8000-000000000001', '7f353000-0000-4000-8000-000000000041');
  insert into public.route_plan_stops(route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version, address_snapshot)
  values (plan, 1, d_planned, 1, 0, 'Địa chỉ 353');
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'delivery.waiting_dispatch', 'delivery', d_planned, 'Phiếu chờ điều phối thử', '/admin/deliveries/' || d_planned, 'delivery.assign')
  returning id into note;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state)
  values (branch, note, 'PUSH', 'thiết bị thử', '{}', 'nt353-pending', 'PENDING'),
         (branch, note, 'PUSH', 'thiết bị thử', '{}', 'nt353-sent', 'SENT');
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, required_permission)
  values (branch, 'work.assigned', 'work_item', work_assigned, 'Việc mới thử', 'work.read');
  -- Outside the command, delivery lines and job assignments stay append-only.
  failed := null;
  begin delete from public.delivery_lines where delivery_id = d_planned; exception when others then failed := sqlerrm; end;
  assert failed = 'posted operational rows are append-only', format('delivery lines append-only, got %s', failed);
  failed := null;
  begin delete from public.work_item_assignments where work_item_id = work_assigned; exception when others then failed := sqlerrm; end;
  assert failed = 'work_assignment_history_immutable', format('job assignments append-only, got %s', failed);
  select string_agg(delivery_number, ', ' order by delivery_number) into numbers from public.deliveries where sales_order_id = o1;

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  before_delete := pg_temp.available353();
  assert before_delete = before_create - 70, format('70 kg held by the deliveries, available %s', before_delete);
  assert public.delete_sales_order(o1, 'Xác nhận nhầm', op1) = o1, 'order with unrun deliveries deleted';
  assert pg_temp.available353() = before_delete + 70, format('the stock comes back, available %s', pg_temp.available353());
  assert coalesce(current_setting('hx.delete_sales_order', true), '') = '', 'the delete permission does not outlive the command';
  perform pg_temp.act_as_admin();
  assert pg_temp.left353(array[d_planned, d_assigned]) = '', format('nothing points at the deleted deliveries: %s', pg_temp.left353(array[d_planned, d_assigned]));
  assert not exists (select 1 from public.work_item_assignments where work_item_id = work_assigned)
    and not exists (select 1 from public.notifications where entity_type = 'work_item' and entity_id = work_assigned), 'the job, its worker and its notice are gone';
  assert not exists (select 1 from public.sales_orders where id = o1) and not exists (select 1 from public.sales_order_lines where sales_order_id = o1)
    and not exists (select 1 from public.credit_commitments where sales_order_id = o1)
    and not exists (select 1 from public.supply_allocations where sales_order_line_id = '7f353000-0000-4000-8000-000000000031')
    and not exists (select 1 from public.inventory_reservations where sales_order_line_id = '7f353000-0000-4000-8000-000000000031'), 'the order and what it held are gone';
  assert not exists (select 1 from public.outbound_jobs where dedupe_key = 'nt353-pending'), 'an unsent push about the delivery is dropped';
  assert (select notification_id from public.outbound_jobs where dedupe_key = 'nt353-sent') is null, 'a sent push stays as history, unlinked';
  assert exists (select 1 from public.route_plans where id = plan), 'the route plan itself stays';
  assert exists (select 1 from public.audit_events where action = 'sales_order.delete' and entity_id = o1 and trace_id = op1
    and reason like 'Xóa đơn NT-SO-3531 · Khách 353 · 1 dòng · 200000 đ · xóa 2 phiếu giao chưa chạy: ' || numbers || ' · lý do: Xác nhận nhầm'
    and 'deliveries' = any(changed_fields)), format('the audit lists the deleted deliveries %s: %s', numbers,
      (select reason from public.audit_events where action = 'sales_order.delete' and entity_id = o1));
  -- Replay answers the same.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.delete_sales_order(o1, 'Xác nhận nhầm', op1) = o1, 'replay returns the same id';

  -- Order 2: a cancelled delivery goes with the order.
  d_cancelled := (public.create_delivery_for_order(o2, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f353000-0000-4000-8000-000000000032', 'quantity', '20')),
    start_at, null, '7f353000-0000-4000-8000-0000000000b3')->>'delivery_id')::uuid;
  perform public.cancel_planned_delivery(d_cancelled, (select version from public.deliveries where id = d_cancelled), 'Lập nhầm', '7f353000-0000-4000-8000-0000000000b4');
  assert (select execution_state from public.deliveries where id = d_cancelled) = 'CANCELLED', 'delivery cancelled';
  assert public.delete_sales_order(o2, 'Xác nhận nhầm', '7f353000-0000-4000-8000-0000000009a2') = o2, 'order with a cancelled delivery deleted';
  perform pg_temp.act_as_admin();
  assert pg_temp.left353(array[d_cancelled]) = '' and not exists (select 1 from public.sales_orders where id = o2), 'cancelled delivery gone with the order';

  -- Order 3: the truck was loaded (handoff, stock left the warehouse): refused, naming the delivery.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  d_loaded := (public.create_delivery_for_order(o3, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f353000-0000-4000-8000-000000000033', 'quantity', '10')),
    start_at, assign, '7f353000-0000-4000-8000-0000000000b5')->>'delivery_id')::uuid;
  perform public.handoff_delivery_actual(d_loaded, (select version from public.deliveries where id = d_loaded), now(), '7f353000-0000-4000-8000-0000000000b6',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = d_loaded), 'loaded_base_quantity', '10')));
  failed := null;
  begin perform public.delete_sales_order(o3, 'Xác nhận nhầm', '7f353000-0000-4000-8000-0000000009b1'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_delivery_started: ' || (select delivery_number from public.deliveries where id = d_loaded), format('loaded delivery blocks, got %s', failed);
  -- Even with the command's setting forged, a delivery that ran keeps its lines.
  perform pg_temp.act_as_admin();
  perform set_config('hx.delete_sales_order', o3::text, true);
  failed := null;
  begin delete from public.delivery_lines where delivery_id = d_loaded; exception when others then failed := sqlerrm; end;
  assert failed = 'posted operational rows are append-only', format('a loaded delivery keeps its lines, got %s', failed);
  perform set_config('hx.delete_sales_order', '', true);

  -- Order 4: a cancelled delivery whose stock moved (in transit) is history: refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  d_moved := (public.create_delivery_for_order(o4, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f353000-0000-4000-8000-000000000034', 'quantity', '10')),
    start_at, null, '7f353000-0000-4000-8000-0000000000b7')->>'delivery_id')::uuid;
  perform public.cancel_planned_delivery(d_moved, (select version from public.deliveries where id = d_moved), 'Lập nhầm', '7f353000-0000-4000-8000-0000000000b8');
  perform pg_temp.act_as_admin();
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id, movement_type, base_quantity_delta,
    inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
    (branch, '7f353000-0000-4000-8000-000000000003', '7f353000-0000-4000-8000-000000000001', 'IN_TRANSIT', d_moved, 'STOCK_ADJUSTMENT', 1, 1500, 1500,
     '7f353000-0000-4000-8000-000000000008', now(), '10000000-0000-4000-8000-000000000001');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.delete_sales_order(o4, 'Xác nhận nhầm', '7f353000-0000-4000-8000-0000000009b2'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_delivery_started: ' || (select delivery_number from public.deliveries where id = d_moved), format('stock movement blocks, got %s', failed);

  -- Order 5: a verified delivery: refused.
  perform pg_temp.act_as_admin();
  insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, execution_state, result_kind, verified_at, customer_id, site_id, customer_name_snapshot,
    site_name_snapshot, delivery_address_snapshot, created_by) values
    ('7f353000-0000-4000-8000-000000000055', branch, o5, 'NT-GH-3535', 'VERIFIED', 'FULL', now(), '7f353000-0000-4000-8000-000000000010',
     '7f353000-0000-4000-8000-000000000011', 'Khách 353', 'Công trình 353', 'Địa chỉ 353', '10000000-0000-4000-8000-000000000001');
  d_verified := '7f353000-0000-4000-8000-000000000055';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.delete_sales_order(o5, 'Xác nhận nhầm', '7f353000-0000-4000-8000-0000000009b3'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_delivery_started: NT-GH-3535', format('verified delivery blocks, got %s', failed);

  -- Order 6: still assigned, but the worker started the job: refused.
  d_started := (public.create_delivery_for_order(o6, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f353000-0000-4000-8000-000000000036', 'quantity', '10')),
    start_at, assign, '7f353000-0000-4000-8000-0000000000b9')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  update public.work_items set execution_state = 'IN_PROGRESS', started_at = now() where delivery_id = d_started;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.delete_sales_order(o6, 'Xác nhận nhầm', '7f353000-0000-4000-8000-0000000009b4'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_delivery_started: ' || (select delivery_number from public.deliveries where id = d_started), format('started job blocks, got %s', failed);

  perform pg_temp.act_as_admin();
  assert (select count(*) from public.sales_orders where id in (o3, o4, o5, o6)) = 4
    and (select count(*) from public.deliveries where id in (d_loaded, d_moved, d_verified, d_started)) = 4
    and (select count(*) from public.delivery_lines where delivery_id in (d_loaded, d_moved, d_started)) = 3, 'refused deletes keep the orders and their deliveries';
  assert not exists (select 1 from public.command_receipts where operation_id in ('7f353000-0000-4000-8000-0000000009b1', '7f353000-0000-4000-8000-0000000009b2',
    '7f353000-0000-4000-8000-0000000009b3', '7f353000-0000-4000-8000-0000000009b4')), 'a refused delete leaves no receipt';
end
$test$;
