begin;
CREATE OR REPLACE FUNCTION public.create_delivery_from_allocations(target_sales_order_id uuid, planned_lines jsonb, scheduled_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sale_order public.sales_orders%rowtype;
  allocation public.supply_allocations%rowtype;
  sale_line public.sales_order_lines%rowtype;
  item jsonb;
  allocation_id uuid;
  allocation_ids uuid[] := '{}';
  used_sales_lines uuid[] := '{}';
  quantity_base numeric;
  already_planned numeric;
  direct_source boolean;
  delivery_id uuid;
  delivery_line_id uuid;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into sale_order from public.sales_orders where id = target_sales_order_id;
  if sale_order.id is null or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'forbidden_or_order_not_found' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('sales_order_id', target_sales_order_id, 'lines', planned_lines, 'scheduled_at', scheduled_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_delivery_from_allocations.operation_id;
  if found then
    if receipt.command_name <> 'create_delivery_from_allocations' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(planned_lines,array['planned_base_quantity'],false);

  if jsonb_typeof(planned_lines) is distinct from 'array' then
    raise exception 'invalid_delivery_lines' using errcode = '22023';
  end if;
  if jsonb_array_length(planned_lines) < 1 or jsonb_array_length(planned_lines) > 50 then
    raise exception 'invalid_delivery_lines' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(planned_lines) loop
    allocation_id := (item->>'supply_allocation_id')::uuid;
    quantity_base := (item->>'planned_base_quantity')::numeric;
    if allocation_id is null or quantity_base is null or quantity_base <= 0 or quantity_base::text in ('NaN','Infinity','-Infinity')
      or allocation_id = any(allocation_ids) then
      raise exception 'invalid_delivery_line' using errcode = '22023';
    end if;
    allocation_ids := array_append(allocation_ids, allocation_id);
  end loop;
  perform 1 from public.supply_allocations where id = any(allocation_ids) order by id for update;
  if (select count(*) from public.supply_allocations where id = any(allocation_ids)) <> cardinality(allocation_ids) then
    raise exception 'allocation_not_found' using errcode = '23503';
  end if;
  if (select count(distinct warehouse_id) from public.supply_allocations where id=any(allocation_ids) and supply_mode<>'SUPPLIER_DIRECT')>1
  then raise exception 'delivery_multiple_pickups_require_split' using errcode='23514';end if;
  perform 1 from public.sales_order_lines
    where id in (select sales_order_line_id from public.supply_allocations where id = any(allocation_ids))
    order by id for update;
  select * into sale_order from public.sales_orders where id = target_sales_order_id for update;
  if sale_order.commercial_state <> 'CONFIRMED' or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'order_not_ready_for_delivery' using errcode = '42501';
  end if;
  insert into public.deliveries(branch_id, sales_order_id, delivery_number, customer_id, site_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot,
    receiver_phone_snapshot, scheduled_at, created_by)
  values (sale_order.branch_id, sale_order.id, 'DL-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.delivery_number_seq')::text, 6, '0'),
    sale_order.customer_id, sale_order.site_id, sale_order.customer_name_snapshot, sale_order.site_name_snapshot,
    sale_order.delivery_address_snapshot, sale_order.receiver_name_snapshot, sale_order.receiver_phone_snapshot,
    scheduled_at, (select auth.uid())) returning id into delivery_id;
  for item in select value from jsonb_array_elements(planned_lines) loop
    allocation_id := (item->>'supply_allocation_id')::uuid;
    quantity_base := (item->>'planned_base_quantity')::numeric;
    select * into allocation from public.supply_allocations where id = allocation_id;
    select * into sale_line from public.sales_order_lines where id = allocation.sales_order_line_id;
    if sale_line.id is null or sale_line.sales_order_id <> target_sales_order_id or sale_line.id = any(used_sales_lines) then
      raise exception 'delivery_line_source_invalid_or_duplicate' using errcode = '23514';
    end if;
    if direct_source is null then
      direct_source := allocation.supply_mode = 'SUPPLIER_DIRECT';
    elsif direct_source is distinct from (allocation.supply_mode = 'SUPPLIER_DIRECT') then
      raise exception 'delivery_mixed_source_not_supported' using errcode = '23514';
    end if;
    used_sales_lines := array_append(used_sales_lines, sale_line.id);
    already_planned := private.delivery_allocation_consumed(allocation.id);
    if already_planned + quantity_base > allocation.allocated_base_quantity then
      raise exception 'delivery_exceeds_allocation' using errcode = '23514';
    end if;
    insert into public.delivery_lines(delivery_id, sales_order_line_id, supply_allocation_id, material_id,
      base_uom_id, source_mode, warehouse_id, planned_base_quantity, conversion_numerator,
      conversion_denominator, unit_price_vnd)
    values (delivery_id, sale_line.id, allocation.id, sale_line.material_id, sale_line.base_uom_id,
      allocation.supply_mode, allocation.warehouse_id, quantity_base, sale_line.conversion_numerator,
      sale_line.conversion_denominator, sale_line.unit_price_vnd) returning id into delivery_line_id;
    if allocation.supply_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      perform private.reserve_inventory_for_line(sale_line.id, delivery_line_id, allocation.warehouse_id, quantity_base, (select auth.uid()));
    end if;
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_delivery_from_allocations', hash, 'delivery', delivery_id, now());
  return delivery_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.handoff_delivery(target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; assignment public.delivery_assignments%rowtype;
  line public.delivery_lines%rowtype; reservation public.inventory_reservations%rowtype;
  position_qty numeric; position_value bigint; unit_cost numeric; moved_value bigint;
  handoff_id uuid; handoff_line_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.handoff') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version, 'handed_off_at', handed_off_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = handoff_delivery.operation_id;
  if found then if receipt.command_name <> 'handoff_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'ASSIGNED' or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_not_handoff_ready' using errcode = 'PT409'; end if;
  if (select count(distinct warehouse_id) from public.delivery_lines where delivery_id=delivery.id and source_mode<>'SUPPLIER_DIRECT')>1
  then raise exception 'delivery_multiple_pickups_require_split' using errcode='23514';end if;
  select * into assignment from public.delivery_assignments where delivery_id = target_delivery_id and superseded_at is null;
  if assignment.id is null then raise exception 'delivery_assignment_missing' using errcode = '23514'; end if;
  insert into public.delivery_handoffs(delivery_id, assignment_id, handed_off_at, handed_off_by)
  values (target_delivery_id, assignment.id, handed_off_at, (select auth.uid())) returning id into handoff_id;
  for line in select * from public.delivery_lines where delivery_id = target_delivery_id order by id loop
    if line.source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      perform 1 from public.warehouses where id = line.warehouse_id for update;
      select * into reservation from public.inventory_reservations where delivery_line_id = line.id for update;
      if reservation.id is null or reservation.state <> 'ACTIVE' or reservation.reserved_base_quantity <> line.planned_base_quantity then raise exception 'delivery_reservation_invalid' using errcode = '23514'; end if;
      select coalesce(sum(base_quantity_delta), 0), coalesce(sum(inventory_value_delta_vnd), 0)::bigint
        into position_qty, position_value from public.inventory_movements
        where warehouse_id = line.warehouse_id and material_id = line.material_id;
      if position_qty < line.planned_base_quantity or position_qty <= 0 or position_value <= 0 then raise exception 'insufficient_inventory_for_handoff' using errcode = '23514'; end if;
      unit_cost := position_value::numeric / position_qty;
      moved_value := round(line.planned_base_quantity * unit_cost)::bigint;
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity,
        unit_cost_vnd_per_base, inventory_value_vnd)
      values (handoff_id, line.id, line.planned_base_quantity, unit_cost, moved_value) returning id into handoff_line_id;
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', line.warehouse_id,
        'DELIVERY_HANDOFF', -line.planned_base_quantity, -moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'DELIVERY_HANDOFF', line.planned_base_quantity, moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      update public.inventory_reservations set state = 'CONSUMED', version = version + 1, finalized_at = now() where id = reservation.id;
    else
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity)
      values (handoff_id, line.id, line.planned_base_quantity);
    end if;
  end loop;
  update public.deliveries set execution_state = 'DISPATCHED', version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'handoff_delivery', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.handoff_delivery_actual(target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid, loaded_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; assignment public.delivery_assignments%rowtype;
  line public.delivery_lines%rowtype; reservation public.inventory_reservations%rowtype;
  loaded numeric; position_qty numeric; position_value bigint; unit_cost numeric; moved_value bigint;
  handoff_id uuid; handoff_line_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.handoff') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version, 'handed_off_at', handed_off_at,'loaded_lines',loaded_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = handoff_delivery_actual.operation_id;
  if found then if receipt.command_name <> 'handoff_delivery_actual' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'ASSIGNED' or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_not_handoff_ready' using errcode = 'PT409'; end if;
  perform private.require_quantity_lines(loaded_lines,array['loaded_base_quantity'],true);
  if handed_off_at is null or not isfinite(handed_off_at) then raise exception 'handoff_time_required' using errcode='22023';end if;
  if jsonb_array_length(loaded_lines)<>(select count(*) from public.delivery_lines where delivery_id=delivery.id)
   or (select count(distinct (i->>'delivery_line_id')::uuid) from jsonb_array_elements(loaded_lines) i)<>jsonb_array_length(loaded_lines)
   or exists(select 1 from jsonb_array_elements(loaded_lines) i where not exists(select 1 from public.delivery_lines l
     where l.id=(i->>'delivery_line_id')::uuid and l.delivery_id=delivery.id))
  then raise exception 'delivery_loading_line_missing_or_duplicate' using errcode='22023';end if;
  if not exists(select 1 from jsonb_array_elements(loaded_lines) i where (i->>'loaded_base_quantity')::numeric>0)
  then raise exception 'delivery_loading_empty' using errcode='22023';end if;
  -- Lock every warehouse and source in stable order before changing custody.
  perform 1 from public.supply_allocations where id in(select supply_allocation_id from public.delivery_lines where delivery_id=delivery.id) order by id for update;
  perform 1 from public.warehouses where id in(select warehouse_id from public.delivery_lines where delivery_id=delivery.id) order by id for update;
  if (select count(distinct warehouse_id) from public.delivery_lines where delivery_id=delivery.id and source_mode<>'SUPPLIER_DIRECT')>1
  then raise exception 'delivery_multiple_pickups_require_split' using errcode='23514';end if;
  select * into assignment from public.delivery_assignments where delivery_id = target_delivery_id and superseded_at is null;
  if assignment.id is null then raise exception 'delivery_assignment_missing' using errcode = '23514'; end if;
  if assignment.employee_id is not null then
    perform private.assert_delivery_resources(delivery.id,assignment.employee_id,assignment.vehicle_id,delivery.scheduled_at,delivery.scheduled_end_at);
  end if;
  insert into public.delivery_handoffs(delivery_id, assignment_id, handed_off_at, handed_off_by)
  values (target_delivery_id, assignment.id, handed_off_at, (select auth.uid())) returning id into handoff_id;
  for line in select * from public.delivery_lines where delivery_id = target_delivery_id order by id loop
    select (i->>'loaded_base_quantity')::numeric into loaded from jsonb_array_elements(loaded_lines) i where (i->>'delivery_line_id')::uuid=line.id;
    if loaded is null or loaded>line.planned_base_quantity then raise exception 'delivery_loaded_quantity_exceeds_plan' using errcode='22023';end if;
    if line.source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      perform 1 from public.warehouses where id = line.warehouse_id for update;
      select * into reservation from public.inventory_reservations where delivery_line_id = line.id for update;
      if reservation.id is null or reservation.state <> 'ACTIVE' or reservation.reserved_base_quantity <> line.planned_base_quantity then raise exception 'delivery_reservation_invalid' using errcode = '23514'; end if;
      if loaded=0 then
       insert into public.delivery_handoff_lines(delivery_handoff_id,delivery_line_id,moved_base_quantity,unit_cost_vnd_per_base,inventory_value_vnd)
        values(handoff_id,line.id,0,null,null);
       update public.inventory_reservations set state='RELEASED',version=version+1,finalized_at=now() where id=reservation.id;
       continue;
      end if;
      select coalesce(sum(base_quantity_delta), 0), coalesce(sum(inventory_value_delta_vnd), 0)::bigint
        into position_qty, position_value from public.inventory_movements
        where warehouse_id = line.warehouse_id and material_id = line.material_id;
      if position_qty < loaded or position_qty <= 0 or position_value <= 0 then raise exception 'insufficient_inventory_for_handoff' using errcode = '23514'; end if;
      unit_cost := position_value::numeric / position_qty;
      moved_value := case when loaded=position_qty then position_value else round(loaded*unit_cost)::bigint end;
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity,
        unit_cost_vnd_per_base, inventory_value_vnd)
      values (handoff_id, line.id, loaded, unit_cost, moved_value) returning id into handoff_line_id;
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', line.warehouse_id,
        'DELIVERY_HANDOFF', -loaded, -moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'DELIVERY_HANDOFF', loaded, moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      update public.inventory_reservations set state = 'CONSUMED', version = version + 1, finalized_at = now() where id = reservation.id;
    else
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity)
      values (handoff_id, line.id, loaded);
    end if;
  end loop;
  update public.deliveries set execution_state = 'DISPATCHED', version = version + 1 where id = target_delivery_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
   values((select auth.uid()),delivery.branch_id,'delivery.loaded','delivery_handoff',handoff_id,operation_id,
    array['planned_base_quantity','moved_base_quantity','reservation','inventory_custody'], 'Ghi lượng thực lấy; phần chưa lấy được giải phóng giữ chỗ');
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'handoff_delivery_actual', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$
;
notify pgrst,'reload schema';
commit;
