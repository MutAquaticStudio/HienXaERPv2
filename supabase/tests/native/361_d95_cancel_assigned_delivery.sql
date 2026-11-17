-- D95 part 2: "Hủy kế hoạch giao" also cancels an ASSIGNED delivery that has not run and whose job has not started: the
-- assignment (person + truck, or an external vehicle) and the job assignment are closed (history kept), the job cancelled, the
-- reservation released, unsent pushes (held ones too) stopped, its stop leaves draft route plans. A started job refuses
-- (delivery_cancel_work_started), a loaded delivery refuses; a planned delivery is cancelled as before. split_delivery does the
-- same follow-up for the original note and still tells the former worker.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000361');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000361', '10000000-0000-4000-8000-000000000361', 'NT_W361', 'Thợ thử 361');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000361', 'nt_worker361', 'Thợ thử 361');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000361', 'work.read'), ('40000000-0000-4000-8000-000000000361', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000361', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000361');
insert into public.units_of_measure(id, code, name, symbol) values ('7f361000-0000-4000-8000-000000000001', 'nt_kg361', 'Kilôgam thử 361', 'kg');
insert into public.material_groups(id, code, name) values ('7f361000-0000-4000-8000-000000000002', 'NT_G361', 'Nhóm thử 361');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f361000-0000-4000-8000-000000000003', '7f361000-0000-4000-8000-000000000002', 'NT_XM361', 'Xi măng 361', '7f361000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f361000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K361', 'Kho 361');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f361000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f361000-0000-4000-8000-000000000004', 'NT-KK-361', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f361000-0000-4000-8000-000000000006', '7f361000-0000-4000-8000-000000000005', '7f361000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f361000-0000-4000-8000-000000000003', '7f361000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f361000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f361000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f361000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH361', 'Khách 361', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f361000-0000-4000-8000-000000000011', '7f361000-0000-4000-8000-000000000010', 'CT1', 'Công trình 361', 'Địa chỉ 361', 'Anh Nhận', '0901361000');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f361000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_XE361', '99C-361.01', 5000, '7f361000-0000-4000-8000-000000000001');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f361000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT-SO-3611', '7f361000-0000-4000-8000-000000000010',
   '7f361000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 361', 'Công trình 361', 'Địa chỉ 361', 'Anh Nhận', '0901361000', '10000000-0000-4000-8000-000000000001', now());
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f361000-0000-4000-8000-000000000031', '7f361000-0000-4000-8000-000000000021', 1, '7f361000-0000-4000-8000-000000000003', 'Xi măng 361',
   '7f361000-0000-4000-8000-000000000001', '7f361000-0000-4000-8000-000000000001', 1000, 1, 1, 'HALF_UP', 2000, 2000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('20000000-0000-4000-8000-00000000000a', '7f361000-0000-4000-8000-000000000010', 'SALES_ORDER', '7f361000-0000-4000-8000-000000000021',
   2000000, '10000000-0000-4000-8000-000000000001', '7f361000-0000-4000-8000-000000000021');
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.available361() returns numeric language sql as $$
  select available_base_quantity::numeric from public.warehouse_inventory_read
  where warehouse_id = '7f361000-0000-4000-8000-000000000004' and material_id = '7f361000-0000-4000-8000-000000000003';
$$;
create function pg_temp.cancel361(target uuid, op text) returns uuid language sql as $$
  select public.cancel_planned_delivery(target, (select version from public.deliveries where id = target), 'Khách không cần nữa', op::uuid);
$$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  wh constant uuid := '7f361000-0000-4000-8000-000000000004';
  worker constant uuid := '30000000-0000-4000-8000-000000000361';
  truck constant uuid := '7f361000-0000-4000-8000-000000000012';
  me constant uuid := '10000000-0000-4000-8000-000000000001';
  o1 constant uuid := '7f361000-0000-4000-8000-000000000021';
  start_at constant timestamptz := now() + interval '1 day';
  assign constant jsonb := jsonb_build_object('employee_id', '30000000-0000-4000-8000-000000000361', 'vehicle_id', '7f361000-0000-4000-8000-000000000012', 'schedule_mode', 'NOW');
  line_of jsonb;
  d_assigned uuid; d_external uuid; d_started uuid; d_loaded uuid; d_planned uuid; d_split uuid;
  work_assigned uuid; note_work uuid; note_delivery uuid;
  plan constant uuid := '7f361000-0000-4000-8000-000000000071';
  before_cancel numeric;
  version_assigned integer;
  audits integer;
  failed text;
begin
  perform pg_temp.act_as(me);
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', null, '7f361000-0000-4000-8000-0000000000a0');
  line_of := jsonb_build_object('sales_order_line_id', '7f361000-0000-4000-8000-000000000031', 'quantity', '50');
  d_assigned := (public.create_delivery_for_order(o1, wh, jsonb_build_array(line_of), start_at, assign, '7f361000-0000-4000-8000-0000000000b1')->>'delivery_id')::uuid;
  d_external := (public.create_delivery_for_order(o1, wh, jsonb_build_array(line_of), start_at, null, '7f361000-0000-4000-8000-0000000000b2')->>'delivery_id')::uuid;
  perform public.assign_delivery(d_external, null, null, 'Xe ngoài anh Ba', '0909361361', (select version from public.deliveries where id = d_external),
    '7f361000-0000-4000-8000-0000000000b3');
  d_started := (public.create_delivery_for_order(o1, wh, jsonb_build_array(line_of), start_at, assign, '7f361000-0000-4000-8000-0000000000b4')->>'delivery_id')::uuid;
  d_loaded := (public.create_delivery_for_order(o1, wh, jsonb_build_array(line_of), start_at, assign, '7f361000-0000-4000-8000-0000000000b5')->>'delivery_id')::uuid;
  d_planned := (public.create_delivery_for_order(o1, wh, jsonb_build_array(line_of), start_at, null, '7f361000-0000-4000-8000-0000000000b6')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_assigned) = 'ASSIGNED'
    and (select execution_state from public.deliveries where id = d_external) = 'ASSIGNED', 'deliveries assigned';
  select id into work_assigned from public.work_items where delivery_id = d_assigned;
  assert (select execution_state from public.work_items where id = work_assigned) = 'CLAIMED', 'the job is with its worker';
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'work.assigned', 'work_item', work_assigned, 'Việc mới thử', '/work', 'work.read') returning id into note_work;
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'delivery.waiting_dispatch', 'delivery', d_assigned, 'Phiếu chờ người', '/admin/deliveries', 'delivery.assign') returning id into note_delivery;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at) values
    (branch, note_work, 'PUSH', 'máy 361', '{}', 'nt361-work-held', 'HELD', now() + interval '1 hour'),
    (branch, note_delivery, 'PUSH', 'máy 361', '{}', 'nt361-delivery-pending', 'PENDING', now()),
    (branch, note_delivery, 'PUSH', 'máy 361', '{}', 'nt361-delivery-sent', 'SENT', now());
  insert into public.route_plans(id, branch_id, departure_at, vehicle_id, driver_employee_id, provider_state, status, created_by, operation_id) values
    (plan, branch, start_at, truck, worker, 'MANUAL_FALLBACK', 'DRAFT', me, '7f361000-0000-4000-8000-000000000073');
  insert into public.route_plan_stops(route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version, address_snapshot) values
    (plan, 1, d_assigned, (select version from public.deliveries where id = d_assigned), 1, 'Địa chỉ 361');

  -- The assigned delivery with its not-started job is cancelled.
  perform pg_temp.act_as(me);
  before_cancel := pg_temp.available361();
  select version into version_assigned from public.deliveries where id = d_assigned;
  assert pg_temp.cancel361(d_assigned, '7f361000-0000-4000-8000-0000000009a1') = d_assigned, 'assigned delivery cancelled';
  assert pg_temp.available361() = before_cancel + 50, format('its stock is available again, %s', pg_temp.available361());
  assert coalesce(current_setting('hx.cancel_delivery', true), '') = '', 'the cancel permission does not outlive the command';
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_assigned) = 'CANCELLED', 'delivery cancelled, kept';
  assert (select execution_state = 'CANCELLED' and started_at is null from public.work_items where id = work_assigned), 'the job is cancelled, never started';
  assert not exists (select 1 from public.work_item_assignments where work_item_id = work_assigned and superseded_at is null)
    and exists (select 1 from public.work_item_assignments where work_item_id = work_assigned), 'the worker no longer holds the job; history stays';
  assert not exists (select 1 from public.delivery_assignments where delivery_id = d_assigned and superseded_at is null)
    and exists (select 1 from public.delivery_assignments where delivery_id = d_assigned), 'the delivery assignment is closed, kept';
  assert not exists (select 1 from private.worker_pool_deliveries(worker) p where p = d_assigned), 'nothing left for the worker';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt361-work-held') = 'DEAD'
    and (select state from public.outbound_jobs where dedupe_key = 'nt361-delivery-pending') = 'DEAD'
    and (select state from public.outbound_jobs where dedupe_key = 'nt361-delivery-sent') = 'SENT', 'held / waiting pushes stopped, sent ones kept';
  assert not exists (select 1 from public.route_plan_stops where delivery_id = d_assigned) and (select version from public.route_plans where id = plan) = 2,
    'the stop leaves the draft route plan';
  assert exists (select 1 from public.audit_events where action = 'delivery.cancel' and entity_id = d_assigned and reason = 'Khách không cần nữa'
    and changed_fields = array['execution_state', 'inventory_reservations', 'delivery_assignment', 'work_items']), 'audited';
  select count(*) into audits from public.audit_events where trace_id = '7f361000-0000-4000-8000-0000000009a1';
  perform pg_temp.act_as(me);
  assert public.cancel_planned_delivery(d_assigned, version_assigned, 'Khách không cần nữa', '7f361000-0000-4000-8000-0000000009a1') = d_assigned, 'replay returns the same id';
  failed := null;
  begin perform public.cancel_planned_delivery(d_assigned, 99, 'Khách không cần nữa', '7f361000-0000-4000-8000-0000000009a1'); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', format('same operation, other payload, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.audit_events where trace_id = '7f361000-0000-4000-8000-0000000009a1') = audits, 'replay adds no audit';

  -- An external vehicle assignment (no job) is cancelled too.
  perform pg_temp.act_as(me);
  assert pg_temp.cancel361(d_external, '7f361000-0000-4000-8000-0000000009a2') = d_external, 'external-vehicle delivery cancelled';
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_external) = 'CANCELLED'
    and not exists (select 1 from public.delivery_assignments where delivery_id = d_external and superseded_at is null), 'external assignment closed';

  -- The worker started the job: refused, nothing changes.
  update public.work_items set execution_state = 'IN_PROGRESS', started_at = now() where delivery_id = d_started;
  perform pg_temp.act_as(me);
  failed := null;
  begin perform pg_temp.cancel361(d_started, '7f361000-0000-4000-8000-0000000009a3'); exception when others then failed := sqlerrm; end;
  assert failed = 'delivery_cancel_work_started', format('started job blocks, got %s', failed);
  -- The truck was loaded: refused.
  perform public.handoff_delivery_actual(d_loaded, (select version from public.deliveries where id = d_loaded), now(), '7f361000-0000-4000-8000-0000000000b7',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = d_loaded), 'loaded_base_quantity', '50')));
  failed := null;
  begin perform pg_temp.cancel361(d_loaded, '7f361000-0000-4000-8000-0000000009a4'); exception when others then failed := sqlerrm; end;
  assert failed in ('delivery_cancel_version_conflict', 'delivery_cancel_not_safe'), format('loaded delivery blocks, got %s', failed);
  -- A reader cannot cancel.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform pg_temp.cancel361(d_planned, '7f361000-0000-4000-8000-0000000009a5'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reader forbidden, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_started) = 'ASSIGNED'
    and (select execution_state from public.work_items where delivery_id = d_started) = 'IN_PROGRESS'
    and exists (select 1 from public.delivery_assignments where delivery_id = d_started and superseded_at is null)
    and exists (select 1 from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id where l.delivery_id = d_started and r.state = 'ACTIVE'),
    'the refused delivery keeps its job, assignment and reservation';

  -- A planned delivery as before.
  perform pg_temp.act_as(me);
  assert pg_temp.cancel361(d_planned, '7f361000-0000-4000-8000-0000000009a6') = d_planned, 'planned delivery cancelled';
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.audit_events where action = 'delivery.cancel' and entity_id = d_planned
    and changed_fields = array['execution_state', 'inventory_reservations']), 'planned cancel audited as before';

  -- "Tách phiếu": the original note's held push is stopped, its draft route stop dropped; the former worker is told.
  perform pg_temp.act_as(me);
  d_split := (public.create_delivery_for_order(o1, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f361000-0000-4000-8000-000000000031', 'quantity', '100')),
    start_at, assign, '7f361000-0000-4000-8000-0000000000c1')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'delivery.waiting_dispatch', 'delivery', d_split, 'Phiếu chờ người', '/admin/deliveries', 'delivery.assign') returning id into note_delivery;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state, next_run_at) values
    (branch, note_delivery, 'PUSH', 'máy 361', '{}', 'nt361-split-held', 'HELD', now() + interval '1 hour');
  insert into public.route_plan_stops(route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version, address_snapshot) values
    (plan, 2, d_split, (select version from public.deliveries where id = d_split), 1, 'Địa chỉ 361');
  perform pg_temp.act_as(me);
  perform public.split_delivery(d_split, (select version from public.deliveries where id = d_split), jsonb_build_array(
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = d_split), 'base_quantity', '60')),
      'employee_id', worker, 'vehicle_id', truck, 'scheduled_start', start_at),
    jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = d_split), 'base_quantity', '40')))),
    '7f361000-0000-4000-8000-0000000009c1');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_split) = 'CANCELLED', 'the original is cancelled';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt361-split-held') = 'DEAD', 'its held push is stopped';
  assert not exists (select 1 from public.route_plan_stops where delivery_id = d_split) and (select version from public.route_plans where id = plan) = 3,
    'its stop leaves the draft route plan';
  assert exists (select 1 from public.notifications where kind = 'work.delivery_split' and entity_id = d_split and recipient_employee_id = worker),
    'the former worker is told the note was split';
end
$test$;
