begin;
create function private.direct_source_retired_quantity(target_purchase_line_id uuid,target_sales_line_id uuid,known_at timestamptz,target_kind text default null) returns numeric
 language sql stable security definer set search_path='' as $fn$
 select coalesce(sum(r.base_quantity),0) from public.return_cases r join public.delivery_lines l on l.id=r.delivery_line_id join public.supply_allocations a on a.id=l.supply_allocation_id
 where a.purchase_order_line_id=target_purchase_line_id and l.sales_order_line_id=target_sales_line_id and l.source_mode='SUPPLIER_DIRECT'
 and r.state in('RETURNED','LOSS_APPROVED') and r.resolved_at<=known_at and(target_kind is null or r.case_kind=target_kind)
$fn$;
revoke all on function private.direct_source_retired_quantity(uuid,uuid,timestamptz,text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.delivery_allocation_consumed(target_allocation_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(case
    when d.execution_state = 'VERIFIED' then coalesce(v.accepted_base_quantity, 0)
      + case when l.source_mode = 'SUPPLIER_DIRECT' then greatest(coalesce(private.delivery_loaded_quantity(l.id),l.planned_base_quantity)-coalesce(v.accepted_base_quantity,0)-coalesce((select sum(r.base_quantity) from public.return_cases r where r.delivery_line_id=l.id and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state in('RETURNED','LOSS_APPROVED')),0),0) else greatest(p.base_quantity, 0) end
    when d.execution_state in('DISPATCHED','ARRIVED','RESULT_SUBMITTED') then coalesce(private.delivery_loaded_quantity(l.id),l.planned_base_quantity)
    else l.planned_base_quantity end), 0)
  from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
  left join public.delivery_verification_lines v on v.delivery_line_id = l.id
  left join lateral private.delivery_line_transit_position(l.id) p on true
  where l.supply_allocation_id = target_allocation_id and d.execution_state <> 'CANCELLED'
$function$
;
CREATE OR REPLACE FUNCTION private.delivery_cost_sources_complete(target_verification_id uuid, cutoff timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare verification_line record; confirmed_quantity numeric; required_quantity numeric; confirmed_cost bigint;
begin
 for verification_line in select v.*,l.source_mode,l.sales_order_line_id,l.supply_allocation_id
  from public.delivery_verification_lines v join public.delivery_lines l on l.id=v.delivery_line_id where v.delivery_verification_id=target_verification_id
 loop
  if verification_line.accepted_base_quantity=0 and verification_line.billable_base_quantity=0 then continue;end if;
  if verification_line.source_mode<>'SUPPLIER_DIRECT' then
   if verification_line.inventory_cost_vnd is null or(verification_line.accepted_base_quantity>0 and verification_line.inventory_cost_vnd<=0)
    or(verification_line.accepted_base_quantity>0 and verification_line.inventory_unit_cost_vnd_per_base is null)
   then return false;end if;
  else
   select coalesce(sum(fl.supplier_base_quantity),0),coalesce(sum(fl.payable_amount_vnd),0)::bigint into confirmed_quantity,confirmed_cost
    from public.supply_allocations sa join public.supplier_fulfillment_lines fl on fl.purchase_order_line_id=sa.purchase_order_line_id
     and fl.sales_order_line_id=verification_line.sales_order_line_id
    join public.supplier_fulfillments f on f.id=fl.supplier_fulfillment_id
    where sa.id=verification_line.supply_allocation_id and f.verified_at<=cutoff
     and exists(select 1 from public.direct_cost_entries dc where dc.supplier_fulfillment_id=f.id and dc.recorded_at<=cutoff);
   select coalesce(sum(greatest(v.accepted_base_quantity,v.billable_base_quantity)),0) into required_quantity
    from public.delivery_verification_lines v join public.delivery_verifications dv on dv.id=v.delivery_verification_id
    join public.delivery_lines l on l.id=v.delivery_line_id join public.supply_allocations other_sa on other_sa.id=l.supply_allocation_id
    where l.sales_order_line_id=verification_line.sales_order_line_id and dv.verified_at<=cutoff and l.source_mode='SUPPLIER_DIRECT'
     and other_sa.purchase_order_line_id=(select sa.purchase_order_line_id from public.supply_allocations sa where sa.id=verification_line.supply_allocation_id);
   confirmed_quantity:=confirmed_quantity-private.direct_source_retired_quantity((select sa.purchase_order_line_id from public.supply_allocations sa where sa.id=verification_line.supply_allocation_id),verification_line.sales_order_line_id,cutoff);
   required_quantity:=greatest(0,required_quantity-private.direct_source_retired_quantity((select sa.purchase_order_line_id from public.supply_allocations sa where sa.id=verification_line.supply_allocation_id),verification_line.sales_order_line_id,cutoff,'CUSTOMER_RETURN'));
   if confirmed_quantity<required_quantity or confirmed_cost<=0 then return false;end if;
  end if;
 end loop;
 return true;
end $function$
;
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
    if allocation.supply_mode='SUPPLIER_DIRECT' and already_planned-private.direct_source_retired_quantity(allocation.purchase_order_line_id,sale_line.id,now(),'CUSTOMER_RETURN')+quantity_base
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
notify pgrst,'reload schema';
commit;
