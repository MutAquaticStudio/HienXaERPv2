-- D94: "Hủy đơn" cancels an order whose deliveries never ran, and cancels those deliveries with it: their stock reservations are
-- released, assignments closed, the unstarted job cancelled (gone from the worker), dispatch proposals dropped and unsent pushes
-- stopped. The order and the deliveries stay as history (CANCELLED). A delivery that happened (loaded, job started) refuses with its
-- number. The other cancel rules (state, credit release, receipt, audit) are unchanged; the guard still holds outside the command.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000357');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000357', '10000000-0000-4000-8000-000000000357', 'NT_W357', 'Thợ thử 357');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000357', 'nt_worker357', 'Thợ thử 357');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000357', 'work.read'), ('40000000-0000-4000-8000-000000000357', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000357', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000357');
insert into public.units_of_measure(id, code, name, symbol) values ('7f357000-0000-4000-8000-000000000001', 'nt_kg357', 'Kilôgam thử 357', 'kg');
insert into public.material_groups(id, code, name) values ('7f357000-0000-4000-8000-000000000002', 'NT_G357', 'Nhóm thử 357');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f357000-0000-4000-8000-000000000003', '7f357000-0000-4000-8000-000000000002', 'NT_XM357', 'Xi măng 357', '7f357000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values ('7f357000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K357', 'Kho 357');
-- 10 000 kg on hand.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f357000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', '7f357000-0000-4000-8000-000000000004', 'NT-KK-357', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f357000-0000-4000-8000-000000000006', '7f357000-0000-4000-8000-000000000005', '7f357000-0000-4000-8000-000000000003', 0, 10000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f357000-0000-4000-8000-000000000003', '7f357000-0000-4000-8000-000000000001', 'WAREHOUSE',
   '7f357000-0000-4000-8000-000000000004', 'STOCK_ADJUSTMENT', 10000, 15000000, 1500, '7f357000-0000-4000-8000-000000000006', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f357000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_KH357', 'Khách 357', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f357000-0000-4000-8000-000000000011', '7f357000-0000-4000-8000-000000000010', 'CT1', 'Công trình 357', 'Địa chỉ 357', 'Anh Nhận', '0901357000');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f357000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT_XE357', '99C-357.01', 5000, '7f357000-0000-4000-8000-000000000001');
-- Orders 1..5 (id ...00000000002n), one line each (...00000000003n) of 100 kg, with the credit their confirmation held.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at)
select ('7f357000-0000-4000-8000-00000000002' || n)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT-SO-357' || n,
  '7f357000-0000-4000-8000-000000000010', '7f357000-0000-4000-8000-000000000011', 'CONFIRMED', 'Khách 357', 'Công trình 357', 'Địa chỉ 357', 'Anh Nhận', '0901357000',
  '10000000-0000-4000-8000-000000000001', now()
from generate_series(1, 5) as n;
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
select ('7f357000-0000-4000-8000-00000000003' || n)::uuid, ('7f357000-0000-4000-8000-00000000002' || n)::uuid, 1, '7f357000-0000-4000-8000-000000000003', 'Xi măng 357',
  '7f357000-0000-4000-8000-000000000001', '7f357000-0000-4000-8000-000000000001', 100, 1, 1, 'HALF_UP', 2000, 200000, 'MANUAL_APPROVED',
  '10000000-0000-4000-8000-000000000001', 'Giá thử'
from generate_series(1, 5) as n;
insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id)
select '20000000-0000-4000-8000-00000000000a', '7f357000-0000-4000-8000-000000000010', 'SALES_ORDER', ('7f357000-0000-4000-8000-00000000002' || n),
  200000, '10000000-0000-4000-8000-000000000001', ('7f357000-0000-4000-8000-00000000002' || n)::uuid
from generate_series(1, 5) as n;
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.available357() returns numeric language sql as $$
  select available_base_quantity::numeric from public.warehouse_inventory_read
  where warehouse_id = '7f357000-0000-4000-8000-000000000004' and material_id = '7f357000-0000-4000-8000-000000000003';
$$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  wh constant uuid := '7f357000-0000-4000-8000-000000000004';
  worker constant uuid := '30000000-0000-4000-8000-000000000357';
  truck constant uuid := '7f357000-0000-4000-8000-000000000012';
  o1 constant uuid := '7f357000-0000-4000-8000-000000000021';
  o2 constant uuid := '7f357000-0000-4000-8000-000000000022';
  o3 constant uuid := '7f357000-0000-4000-8000-000000000023';
  o4 constant uuid := '7f357000-0000-4000-8000-000000000024';
  o5 constant uuid := '7f357000-0000-4000-8000-000000000025';
  op1 constant uuid := '7f357000-0000-4000-8000-0000000009a1';
  start_at constant timestamptz := now() + interval '1 day';
  assign constant jsonb := jsonb_build_object('employee_id', '30000000-0000-4000-8000-000000000357', 'vehicle_id', '7f357000-0000-4000-8000-000000000012', 'schedule_mode', 'NOW');
  d_planned uuid; d_assigned uuid; d_cancelled uuid; d_loaded uuid; d_started uuid;
  work_assigned uuid;
  note uuid;
  before_create numeric; before_cancel numeric;
  numbers text;
  audits integer;
  failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_branch_operation_settings(branch, '{"dispatch_mode":"OFF"}', null, '7f357000-0000-4000-8000-0000000000a0');
  before_create := pg_temp.available357();
  assert before_create = 10000, format('stock on hand %s', before_create);

  -- Order 1: a planned delivery (40 kg) with a dispatch proposal, and an assigned one with its not-started job (30 kg).
  d_planned := (public.create_delivery_for_order(o1, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f357000-0000-4000-8000-000000000031', 'quantity', '40')),
    start_at, null, '7f357000-0000-4000-8000-0000000000b1')->>'delivery_id')::uuid;
  d_assigned := (public.create_delivery_for_order(o1, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f357000-0000-4000-8000-000000000031', 'quantity', '30')),
    start_at, assign, '7f357000-0000-4000-8000-0000000000b2')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = d_planned) = 'PLANNED', 'first delivery planned';
  assert (select execution_state from public.deliveries where id = d_assigned) = 'ASSIGNED', 'second delivery assigned';
  select id into work_assigned from public.work_items where delivery_id = d_assigned;
  assert work_assigned is not null and (select execution_state from public.work_items where id = work_assigned) = 'CLAIMED'
    and exists (select 1 from public.work_item_assignments where work_item_id = work_assigned and employee_id = worker and superseded_at is null),
    'the job is with its worker';
  insert into public.delivery_dispatch_proposals(delivery_id, employee_id, vehicle_id, scheduled_start, scheduled_end, reason, created_by)
  values (d_planned, worker, truck, start_at, start_at + interval '1 hour', 'Gợi ý thử', '10000000-0000-4000-8000-000000000001');
  insert into public.notifications(branch_id, kind, entity_type, entity_id, title, link, required_permission)
  values (branch, 'work.assigned', 'work_item', work_assigned, 'Việc mới thử', '/work', 'work.read') returning id into note;
  insert into public.outbound_jobs(branch_id, notification_id, channel, target, payload, dedupe_key, state)
  values (branch, note, 'PUSH', 'thiết bị thử', '{}', 'nt357-pending', 'PENDING'),
         (branch, note, 'PUSH', 'thiết bị thử', '{}', 'nt357-sent', 'SENT');
  select string_agg(delivery_number, ', ' order by delivery_number) into numbers from public.deliveries where sales_order_id = o1;
  -- Outside the command the order still cannot be moved to CANCELLED while a delivery is open.
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  failed := null;
  begin update public.sales_orders set commercial_state = 'CANCELLED' where id = o1; exception when others then failed := sqlerrm; end;
  perform set_config('request.jwt.claim.sub', '', true);
  assert failed = 'Sales order with delivery history cannot be cancelled', format('the guard holds outside the command, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  before_cancel := pg_temp.available357();
  assert before_cancel = before_create - 70, format('70 kg held by the deliveries, available %s', before_cancel);
  assert public.cancel_sales_order(o1, 'Khách đổi ý', op1) = o1, 'order with unrun deliveries cancelled';
  assert pg_temp.available357() = before_cancel + 70, format('the stock comes back, available %s', pg_temp.available357());
  assert coalesce(current_setting('hx.cancel_sales_order', true), '') = '', 'the cancel permission does not outlive the command';
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = o1) = 'CANCELLED', 'order cancelled, kept';
  assert (select count(*) from public.deliveries where sales_order_id = o1 and execution_state = 'CANCELLED') = 2, 'both deliveries cancelled, kept';
  assert (select count(*) from public.delivery_lines where delivery_id in (d_planned, d_assigned)) = 2, 'delivery lines kept as history';
  assert not exists (select 1 from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id
      where l.delivery_id in (d_planned, d_assigned) and r.state <> 'RELEASED'), 'every reservation of the deliveries released';
  assert (select version from public.deliveries where id = d_planned) = 2, 'delivery version moves';
  assert (select execution_state from public.work_items where id = work_assigned) = 'CANCELLED', 'the job is cancelled';
  assert not exists (select 1 from public.work_item_assignments where work_item_id = work_assigned and superseded_at is null)
    and exists (select 1 from public.work_item_assignments where work_item_id = work_assigned), 'the worker no longer holds the job; its history stays';
  assert not exists (select 1 from public.delivery_assignments where delivery_id = d_assigned and superseded_at is null)
    and exists (select 1 from public.delivery_assignments where delivery_id = d_assigned), 'the delivery assignment is closed, kept';
  assert not private.delivery_pool_open(d_planned) and not exists (select 1 from private.worker_pool_deliveries(worker) p where p in (d_planned, d_assigned)),
    'nothing left in the worker pool';
  assert not exists (select 1 from public.delivery_dispatch_proposals where delivery_id = d_planned), 'dispatch proposal dropped';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt357-pending') = 'DEAD', 'an unsent push is stopped';
  assert (select state from public.outbound_jobs where dedupe_key = 'nt357-sent') = 'SENT', 'a sent push stays';
  assert (select released_vnd from public.credit_commitments where sales_order_id = o1) = 200000, 'credit released as before';
  assert exists (select 1 from public.audit_events where action = 'sales_order.cancel' and entity_id = o1 and trace_id = op1
      and reason = 'Khách đổi ý' and 'deliveries' = any(changed_fields))
    -- D93/D94 follow-up (20261116200000): the cancel reason stays plain; the list is its own internal audit event.
    and exists (select 1 from public.audit_events where action = 'sales_order.cancel_deliveries' and entity_id = o1 and trace_id = op1
      and reason = 'Hủy kèm 2 phiếu giao chưa chạy: ' || numbers),
    format('the audit lists the cancelled deliveries %s: %s', numbers, (select reason from public.audit_events where action = 'sales_order.cancel_deliveries' and entity_id = o1));
  assert (select count(*) from public.audit_events where action = 'delivery.cancel' and entity_id in (d_planned, d_assigned) and trace_id = op1
      and reason = 'Hủy theo đơn NT-SO-3571: Khách đổi ý') = 2, 'each delivery has its cancel event';
  select count(*) into audits from public.audit_events where trace_id = op1;

  -- Replay answers the same and writes nothing more.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.cancel_sales_order(o1, 'Khách đổi ý', op1) = o1, 'replay returns the same id';
  failed := null;
  begin perform public.cancel_sales_order(o1, 'Lý do khác', op1); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', format('same operation, other payload, got %s', failed);
  failed := null;
  begin perform public.cancel_sales_order(o1, 'Khách đổi ý', '7f357000-0000-4000-8000-0000000009a9'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_not_cancellable', format('a cancelled order is not cancelled twice, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.audit_events where trace_id = op1) = audits, 'replay adds no audit';

  -- Order 2: a delivery already cancelled is fine.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  d_cancelled := (public.create_delivery_for_order(o2, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f357000-0000-4000-8000-000000000032', 'quantity', '20')),
    start_at, null, '7f357000-0000-4000-8000-0000000000b3')->>'delivery_id')::uuid;
  perform public.cancel_planned_delivery(d_cancelled, (select version from public.deliveries where id = d_cancelled), 'Lập nhầm', '7f357000-0000-4000-8000-0000000000b4');
  assert public.cancel_sales_order(o2, 'Khách đổi ý', '7f357000-0000-4000-8000-0000000009a2') = o2, 'order with a cancelled delivery cancelled';
  perform pg_temp.act_as_admin();
  assert (select commercial_state from public.sales_orders where id = o2) = 'CANCELLED', 'order 2 cancelled';
  assert (select reason from public.audit_events where action = 'sales_order.cancel' and entity_id = o2) = 'Khách đổi ý',
    'nothing more to cancel: the audit reason stays plain';

  -- Order 3: the truck was loaded: refused, naming the delivery; nothing changes.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  d_loaded := (public.create_delivery_for_order(o3, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f357000-0000-4000-8000-000000000033', 'quantity', '10')),
    start_at, assign, '7f357000-0000-4000-8000-0000000000b5')->>'delivery_id')::uuid;
  perform public.handoff_delivery_actual(d_loaded, (select version from public.deliveries where id = d_loaded), now(), '7f357000-0000-4000-8000-0000000000b6',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = d_loaded), 'loaded_base_quantity', '10')));
  failed := null;
  begin perform public.cancel_sales_order(o3, 'Khách đổi ý', '7f357000-0000-4000-8000-0000000009b1'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_cancel_delivery_started: ' || (select delivery_number from public.deliveries where id = d_loaded), format('loaded delivery blocks, got %s', failed);

  -- Order 4: assigned, but the worker started the job: refused.
  d_started := (public.create_delivery_for_order(o4, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f357000-0000-4000-8000-000000000034', 'quantity', '10')),
    start_at, assign, '7f357000-0000-4000-8000-0000000000b7')->>'delivery_id')::uuid;
  perform pg_temp.act_as_admin();
  update public.work_items set execution_state = 'IN_PROGRESS', started_at = now() where delivery_id = d_started;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.cancel_sales_order(o4, 'Khách đổi ý', '7f357000-0000-4000-8000-0000000009b2'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_cancel_delivery_started: ' || (select delivery_number from public.deliveries where id = d_started), format('started job blocks, got %s', failed);
  -- "Xóa đơn bán" keeps its own refusal (D90), from the same shared check.
  failed := null;
  begin perform public.delete_sales_order(o4, 'Xác nhận nhầm', '7f357000-0000-4000-8000-0000000009b3'); exception when others then failed := sqlerrm; end;
  assert failed = 'sales_order_delivery_started: ' || (select delivery_number from public.deliveries where id = d_started), format('delete refusal unchanged, got %s', failed);

  perform pg_temp.act_as_admin();
  assert (select count(*) from public.sales_orders where id in (o3, o4) and commercial_state = 'CONFIRMED') = 2, 'refused orders stay confirmed';
  assert (select execution_state from public.deliveries where id = d_started) = 'ASSIGNED'
    and (select execution_state from public.work_items where delivery_id = d_started) = 'IN_PROGRESS', 'the refused order keeps its delivery and job';
  assert exists (select 1 from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id where l.delivery_id = d_started and r.state = 'ACTIVE'),
    'the refused order keeps its reservation';
  assert (select released_vnd from public.credit_commitments where sales_order_id = o4) = 0, 'the refused order keeps its credit';
  assert not exists (select 1 from public.command_receipts where operation_id in ('7f357000-0000-4000-8000-0000000009b1', '7f357000-0000-4000-8000-0000000009b2')),
    'a refused cancel leaves no receipt';
  -- Even forging the command's setting, a direct update cannot cancel an order whose delivery ran.
  perform set_config('hx.cancel_sales_order', o3::text, true);
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  failed := null;
  begin update public.sales_orders set commercial_state = 'CANCELLED' where id = o3; exception when others then failed := sqlerrm; end;
  perform set_config('request.jwt.claim.sub', '', true);
  assert failed = 'Sales order with delivery history cannot be cancelled', format('the guard holds for a loaded delivery, got %s', failed);
  perform set_config('hx.cancel_sales_order', '', true);

  -- Order 5: no delivery: as before.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.cancel_sales_order(o5, 'x', '7f357000-0000-4000-8000-0000000009c0'); exception when others then failed := sqlerrm; end;
  assert failed = 'cancel_reason_required', format('a reason is still required, got %s', failed);
  assert public.cancel_sales_order(o5, 'Khách đổi ý', '7f357000-0000-4000-8000-0000000009c1') = o5, 'order without deliveries cancelled';
  perform pg_temp.act_as_admin();
  assert (select released_vnd from public.credit_commitments where sales_order_id = o5) = 200000, 'credit released';
  assert exists (select 1 from public.audit_events where action = 'sales_order.cancel' and entity_id = o5 and reason = 'Khách đổi ý'
    and changed_fields = array['commercial_state', 'credit_commitment']), 'audit as before';
  -- A reader cannot cancel.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.cancel_sales_order(o3, 'Khách đổi ý', '7f357000-0000-4000-8000-0000000009c2'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reader forbidden, got %s', failed);
  perform pg_temp.act_as_admin();
end
$test$;
