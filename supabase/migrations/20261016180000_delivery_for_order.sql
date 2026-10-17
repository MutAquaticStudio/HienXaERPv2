-- One-step delivery from a confirmed sales order (FB2 Đợt 3, 2026-10-16). Today a delivery needs a warehouse source per
-- line (upsert_supply_allocation), then the delivery (create_delivery_from_allocations), then the vehicle and driver
-- (assign_delivery_scheduled), each typed in base units. create_delivery_for_order runs the same three commands in one
-- transaction from one popup, with quantities in the unit the order was sold in; the existing commands keep every rule
-- (permissions, allocation capacity, stock reservation, resource and capacity checks). order_delivery_plan reads what is
-- left to deliver per line so the popup can pre-fill it.
begin;

-- What is left to deliver per order line, and the sources already allocated (with what each still covers).
create or replace function public.order_delivery_plan(target_sales_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  sale_order public.sales_orders%rowtype;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null or auth.uid() is null or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object('sales_order_id', sale_order.id, 'commercial_state', sale_order.commercial_state, 'lines', coalesce((
    select jsonb_agg(jsonb_build_object(
      'sales_order_line_id', l.id, 'line_number', l.line_number, 'material_id', l.material_id, 'ordered_uom_id', l.ordered_uom_id,
      'base_uom_id', l.base_uom_id, 'quantity', l.quantity, 'conversion_numerator', l.conversion_numerator, 'conversion_denominator', l.conversion_denominator,
      'required_base_quantity', trim_scale(l.quantity * l.conversion_numerator / l.conversion_denominator),
      'allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'supply_mode', a.supply_mode, 'warehouse_id', a.warehouse_id,
          'version', a.version, 'allocated_base_quantity', a.allocated_base_quantity,
          'consumed_base_quantity', private.delivery_allocation_consumed(a.id)) order by a.id)
        from public.supply_allocations a where a.sales_order_line_id = l.id), '[]')
    ) order by l.line_number)
    from public.sales_order_lines l where l.sales_order_id = sale_order.id), '[]'));
end
$function$;

revoke all on function public.order_delivery_plan(uuid) from public, anon;
grant execute on function public.order_delivery_plan(uuid) to authenticated;

-- Allocate from one warehouse (topping up an existing allocation of that warehouse when it no longer covers the
-- quantity), create the delivery, and optionally assign driver and vehicle. All or nothing.
create or replace function public.create_delivery_for_order(
  target_sales_order_id uuid,
  target_warehouse_id uuid,
  delivery_lines jsonb,
  scheduled_at timestamptz,
  assignment jsonb,
  operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  sale_order public.sales_orders%rowtype;
  sale_line public.sales_order_lines%rowtype;
  allocation public.supply_allocations%rowtype;
  item jsonb;
  item_no integer;
  line_ids uuid[] := '{}';
  base_quantity numeric;
  covered numeric;
  allocation_id uuid;
  planned jsonb := '[]';
  delivery_id uuid;
  assignment_id uuid;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null or auth.uid() is null or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if operation_id is null or target_warehouse_id is null or scheduled_at is null or jsonb_typeof(delivery_lines) is distinct from 'array'
    or jsonb_array_length(delivery_lines) not between 1 and 50 or (assignment is not null and jsonb_typeof(assignment) <> 'object') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('order', target_sales_order_id, 'warehouse', target_warehouse_id,
    'lines', delivery_lines, 'scheduled_at', scheduled_at, 'assignment', assignment));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = create_delivery_for_order.operation_id;
  if found then
    if receipt.command_name <> 'create_delivery_for_order' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('delivery_id', receipt.result_entity_id, 'replayed', true);
  end if;

  for item in select value from jsonb_array_elements(delivery_lines) loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['sales_order_line_id', 'quantity']))
      or (item->>'sales_order_line_id') is null or (item->>'sales_order_line_id')::uuid = any(line_ids)
      or coalesce(item->>'quantity', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'invalid_delivery_line' using errcode = '22023';
    end if;
    line_ids := line_ids || (item->>'sales_order_line_id')::uuid;
  end loop;
  -- Same lock order as create_delivery_from_allocations: allocations, sales lines, then the order.
  perform 1 from public.supply_allocations a where a.sales_order_line_id = any(line_ids) order by a.id for update;
  perform 1 from public.sales_order_lines l where l.id = any(line_ids) order by l.id for update;
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id for update;
  if sale_order.commercial_state <> 'CONFIRMED' then raise exception 'order_not_ready_for_delivery' using errcode = '42501'; end if;

  for item, item_no in select value, ordinality from jsonb_array_elements(delivery_lines) with ordinality loop
    select * into sale_line from public.sales_order_lines l where l.id = (item->>'sales_order_line_id')::uuid;
    if sale_line.id is null or sale_line.sales_order_id <> sale_order.id then raise exception 'delivery_line_source_invalid_or_duplicate' using errcode = '23514'; end if;
    -- The quantity is typed in the unit the order was sold in; the delivery keeps base units, which must stay exact.
    perform private.require_exact_quantity((item->>'quantity')::numeric, false);
    base_quantity := trim_scale((item->>'quantity')::numeric * sale_line.conversion_numerator / sale_line.conversion_denominator);
    perform private.require_exact_quantity(base_quantity, false);

    select * into allocation from public.supply_allocations a
      where a.sales_order_line_id = sale_line.id and a.supply_mode = 'WAREHOUSE' and a.warehouse_id = target_warehouse_id
      order by a.id limit 1;
    if allocation.id is null then
      allocation_id := public.upsert_supply_allocation(sale_line.id, 'WAREHOUSE', null, target_warehouse_id, base_quantity, null, null,
        md5(operation_id::text || ':allocate:' || item_no)::uuid);
    else
      covered := allocation.allocated_base_quantity - private.delivery_allocation_consumed(allocation.id);
      allocation_id := allocation.id;
      if covered < base_quantity then
        perform public.upsert_supply_allocation(sale_line.id, 'WAREHOUSE', null, target_warehouse_id,
          allocation.allocated_base_quantity + (base_quantity - covered), allocation.id, allocation.version,
          md5(operation_id::text || ':allocate:' || item_no)::uuid);
      end if;
    end if;
    planned := planned || jsonb_build_array(jsonb_build_object('supply_allocation_id', allocation_id, 'planned_base_quantity', base_quantity));
  end loop;

  delivery_id := public.create_delivery_from_allocations(sale_order.id, planned, scheduled_at, md5(operation_id::text || ':delivery')::uuid);
  if assignment is not null then
    if exists (select 1 from jsonb_object_keys(assignment) key where key <> all(array['employee_id', 'vehicle_id', 'scheduled_start', 'scheduled_end'])) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    assignment_id := public.assign_delivery_scheduled(delivery_id, (assignment->>'employee_id')::uuid, (assignment->>'vehicle_id')::uuid, null, null,
      (select d.version from public.deliveries d where d.id = delivery_id), md5(operation_id::text || ':assign')::uuid,
      coalesce((assignment->>'scheduled_start')::timestamptz, scheduled_at),
      coalesce((assignment->>'scheduled_end')::timestamptz, coalesce((assignment->>'scheduled_start')::timestamptz, scheduled_at) + interval '4 hours'));
  end if;

  insert into public.command_receipts values (operation_id, auth.uid(), 'create_delivery_for_order', payload_hash, 'delivery', delivery_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), sale_order.branch_id, 'delivery.create_for_order', 'deliveries', delivery_id, operation_id,
    array_remove(array['supply_allocations', 'delivery_lines', case when assignment is not null then 'assignment' end], null), null);
  return jsonb_build_object('delivery_id', delivery_id, 'assignment_id', assignment_id, 'replayed', false);
end
$function$;

revoke all on function public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid) from public, anon;
grant execute on function public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
