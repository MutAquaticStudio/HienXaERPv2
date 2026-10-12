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
    if allocation.supply_mode='SUPPLIER_DIRECT' and private.direct_source_retired_quantity(allocation.purchase_order_line_id,sale_line.id,now())>0 and already_planned-private.direct_source_retired_quantity(allocation.purchase_order_line_id,sale_line.id,now(),'CUSTOMER_RETURN')+quantity_base
     >least(allocation.allocated_base_quantity,(select pl.quantity*pl.conversion_numerator/pl.conversion_denominator from public.purchase_order_lines pl where pl.id=allocation.purchase_order_line_id)
       -private.direct_source_retired_quantity(allocation.purchase_order_line_id,sale_line.id,now()))
    then raise exception 'direct_source_retired_requires_replacement' using errcode='23514';end if;
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
create index if not exists return_cases_direct_source_cutoff_idx on public.return_cases(delivery_line_id,state,resolved_at);
notify pgrst,'reload schema';
commit;
