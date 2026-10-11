begin;
create function private.return_cost_portion(target_case_id uuid) returns bigint
language plpgsql security definer set search_path='' as $fn$
declare c public.return_cases%rowtype;l public.delivery_lines%rowtype;v public.delivery_verification_lines%rowtype;
 source_quantity numeric;source_value bigint;prior_quantity numeric;prior_value bigint;portion bigint;purchase_line uuid;
begin
 select * into c from public.return_cases where id=target_case_id;
 select * into l from public.delivery_lines where id=c.delivery_line_id;
 select * into v from public.delivery_verification_lines where id=c.delivery_verification_line_id;
 if c.id is null or c.state<>'OPEN' or c.case_kind not in('CUSTOMER_RETURN','TRANSIT_REMAINDER') then raise exception 'return_cost_source_invalid' using errcode='23514';end if;
 if l.source_mode='SUPPLIER_DIRECT' then
  select purchase_order_line_id into purchase_line from public.supply_allocations where id=l.supply_allocation_id;
  -- All retirements from this purchase line share its original, recorded cost pool.
  -- Callers already lock their case/delivery; take this lock only afterwards.
  perform 1 from public.purchase_order_lines where id=purchase_line for update;
  select coalesce(sum(f.supplier_base_quantity),0),coalesce(sum(f.payable_amount_vnd),0)::bigint into source_quantity,source_value
   from public.supplier_fulfillment_lines f where f.purchase_order_line_id=purchase_line and f.sales_order_line_id=l.sales_order_line_id;
  select coalesce(sum(r.base_quantity),0) into prior_quantity from public.return_cases r
   join public.delivery_lines dl on dl.id=r.delivery_line_id join public.supply_allocations sa on sa.id=dl.supply_allocation_id
   where sa.purchase_order_line_id=purchase_line and dl.sales_order_line_id=l.sales_order_line_id and dl.source_mode='SUPPLIER_DIRECT'
    and r.state='RETURNED' and r.case_kind in('CUSTOMER_RETURN','TRANSIT_REMAINDER');
  select coalesce(-sum(d.amount_delta_vnd),0)::bigint into prior_value from public.direct_cost_entries d
   join public.return_cases r on r.id=d.return_case_id join public.delivery_lines dl on dl.id=r.delivery_line_id
   join public.supply_allocations sa on sa.id=dl.supply_allocation_id
   where sa.purchase_order_line_id=purchase_line and dl.sales_order_line_id=l.sales_order_line_id and dl.source_mode='SUPPLIER_DIRECT'
    and r.state='RETURNED' and r.case_kind in('CUSTOMER_RETURN','TRANSIT_REMAINDER') and d.cost_kind='RETURN_REVERSAL';
 else
  if c.case_kind<>'CUSTOMER_RETURN' then raise exception 'return_cost_source_invalid' using errcode='23514';end if;
  source_quantity:=v.accepted_base_quantity;source_value:=v.inventory_cost_vnd;
  select coalesce(sum(r.base_quantity),0) into prior_quantity from public.return_cases r
   where r.delivery_verification_line_id=v.id and r.case_kind='CUSTOMER_RETURN' and r.state='RETURNED';
  select coalesce(sum(m.inventory_value_delta_vnd),0)::bigint into prior_value from public.inventory_movements m
   join public.return_cases r on r.id=m.source_return_case_id where r.delivery_verification_line_id=v.id
    and r.case_kind='CUSTOMER_RETURN' and r.state='RETURNED' and m.location_kind='WAREHOUSE' and m.movement_type='CUSTOMER_RETURN';
 end if;
 if source_quantity is null or source_quantity<=0 or source_value is null or source_value<=0 or prior_quantity+c.base_quantity>source_quantity
 then raise exception 'return_cost_source_missing_or_quantity_exceeded' using errcode='23514';end if;
 portion:=round((prior_quantity+c.base_quantity)*source_value/source_quantity)::bigint-prior_value;
 if portion<0 or prior_value>source_value then raise exception 'return_cost_source_reconciliation_required' using errcode='23514';end if;
 return portion;
end $fn$;
revoke all on function private.return_cost_portion(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.resolve_return_case(target_return_case_id uuid, resolution text, target_warehouse_id uuid, resolution_reason text, target_evidence_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare case_row public.return_cases%rowtype; line public.delivery_lines%rowtype; delivery public.deliveries%rowtype;
  verified_line public.delivery_verification_lines%rowtype; handoff_line public.delivery_handoff_lines%rowtype;
  unit_cost numeric; value_amount bigint; hash text; receipt public.command_receipts%rowtype;
begin
  select * into case_row from public.return_cases where id = target_return_case_id for update;
  select * into line from public.delivery_lines where id = case_row.delivery_line_id;
  select * into delivery from public.deliveries where id = line.delivery_id for update;
  select * into verified_line from public.delivery_verification_lines where id = case_row.delivery_verification_line_id;
  if case_row.id is null or not private.has_permission(case_row.branch_id, 'delivery.exception') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('return_case_id', target_return_case_id, 'resolution', resolution, 'warehouse_id', target_warehouse_id, 'reason', trim(resolution_reason), 'evidence_id', target_evidence_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = resolve_return_case.operation_id;
  if found then if receipt.command_name <> 'resolve_return_case' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if case_row.state <> 'OPEN' or case_row.version  IS DISTINCT FROM expected_version or char_length(trim(resolution_reason)) < 3 then raise exception 'return_case_version_conflict' using errcode = 'PT409'; end if;
  perform private.assert_verified_evidence(target_evidence_id, case_row.branch_id);
  select hl.* into handoff_line from public.delivery_handoff_lines hl join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
    where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
  if line.source_mode = 'SUPPLIER_DIRECT' then
    select sum(sfl.payable_amount_vnd)::numeric / nullif(sum(sfl.supplier_base_quantity), 0)
      into unit_cost
    from public.supply_allocations sa
    join public.supplier_fulfillment_lines sfl
      on sfl.purchase_order_line_id = sa.purchase_order_line_id
      and sfl.sales_order_line_id = line.sales_order_line_id
    join public.supplier_fulfillments sf on sf.id = sfl.supplier_fulfillment_id
    where sa.id = line.supply_allocation_id and sf.branch_id = case_row.branch_id;
  else
    unit_cost := coalesce(verified_line.inventory_unit_cost_vnd_per_base, handoff_line.unit_cost_vnd_per_base);
  end if;
  if unit_cost is null or unit_cost <= 0 then raise exception 'return_cost_basis_missing' using errcode = '23514'; end if;
  value_amount := case when case_row.case_kind='CUSTOMER_RETURN'
    or(line.source_mode='SUPPLIER_DIRECT' and case_row.case_kind='TRANSIT_REMAINDER')
    then private.return_cost_portion(case_row.id) else round(case_row.base_quantity * unit_cost)::bigint end;
  if case_row.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') then
    if line.source_mode='SUPPLIER_DIRECT' then
      if case_row.base_quantity>handoff_line.moved_base_quantity-verified_line.accepted_base_quantity
        -coalesce((select sum(r.base_quantity) from public.return_cases r where r.delivery_line_id=line.id
          and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state in('RETURNED','LOSS_APPROVED')),0)
      then raise exception 'return_exceeds_transit_position' using errcode='23514';end if;
      if value_amount<=0 then raise exception 'return_cost_below_currency_precision' using errcode='23514';end if;
    else
    if case_row.base_quantity > (select p.base_quantity from private.delivery_line_transit_position(line.id) p) then
      raise exception 'return_exceeds_transit_position' using errcode = '23514';
    end if;
    select case when case_row.base_quantity = p.base_quantity then p.inventory_value_vnd
      else value_amount end into value_amount from private.delivery_line_transit_position(line.id) p;
    if value_amount <= 0 then raise exception 'return_cost_below_currency_precision' using errcode = '23514'; end if;
    end if;
  end if;
  if case_row.case_kind in ('CUSTOMER_RETURN','TRANSIT_REMAINDER') then
    if resolution <> 'RETURNED' or not exists (select 1 from public.warehouses where id = target_warehouse_id and branch_id = case_row.branch_id and active) then raise exception 'invalid_return_resolution' using errcode = '22023'; end if;
    perform 1 from public.warehouses where id = target_warehouse_id for update;
    if case_row.case_kind = 'TRANSIT_REMAINDER' and line.source_mode<>'SUPPLIER_DIRECT' then
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_return_case_id, occurred_at, recorded_by)
      values (case_row.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'RETURN_TRANSFER', -case_row.base_quantity, -value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    end if;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_return_case_id, occurred_at, recorded_by)
    values (case_row.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', target_warehouse_id,
      case when case_row.case_kind = 'CUSTOMER_RETURN' then 'CUSTOMER_RETURN' else 'RETURN_TRANSFER' end,
      case_row.base_quantity, value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    if case_row.case_kind = 'CUSTOMER_RETURN' or(line.source_mode='SUPPLIER_DIRECT' and case_row.case_kind='TRANSIT_REMAINDER') then
      insert into public.direct_cost_entries(branch_id, sales_order_id, return_case_id, amount_delta_vnd, cost_kind, recorded_by)
      values (case_row.branch_id, delivery.sales_order_id, case_row.id, -value_amount, 'RETURN_REVERSAL', (select auth.uid()));
    end if;
    update public.return_cases set state = 'RETURNED', resolution_warehouse_id = target_warehouse_id,
      resolution_reason = trim(resolve_return_case.resolution_reason), evidence_object_id = coalesce(target_evidence_id, evidence_object_id),
      version = version + 1, resolved_by = (select auth.uid()), resolved_at = now() where id = case_row.id;
  elsif case_row.case_kind = 'TRANSIT_LOSS' then
    if resolution <> 'LOSS_APPROVED' then raise exception 'invalid_loss_resolution' using errcode = '22023'; end if;
    if line.source_mode<>'SUPPLIER_DIRECT' then
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_return_case_id, occurred_at, recorded_by)
    values (case_row.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
      'TRANSIT_LOSS', -case_row.base_quantity, -value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    insert into public.direct_cost_entries(branch_id, sales_order_id, return_case_id, amount_delta_vnd, cost_kind, recorded_by)
    values (case_row.branch_id, delivery.sales_order_id, case_row.id, value_amount, 'LOSS', (select auth.uid()));
    end if; -- Supplier-direct source cost already includes the lost units; do not post it twice.
    update public.return_cases set state = 'LOSS_APPROVED', resolution_reason = trim(resolve_return_case.resolution_reason),
      evidence_object_id = coalesce(target_evidence_id, evidence_object_id), version = version + 1,
      resolved_by = (select auth.uid()), resolved_at = now() where id = case_row.id;
  else raise exception 'invalid_return_resolution' using errcode = '22023'; end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
   values((select auth.uid()),case_row.branch_id,'delivery.return_resolved','return_case',case_row.id,operation_id,
    array['state','resolution_warehouse_id','physical_custody','source_cost'],trim(resolution_reason));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'resolve_return_case', hash, 'return_case', case_row.id, now());
  return case_row.id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.record_supplier_return_event(target_case_id uuid, target_event_kind text, actual_base_quantity numeric, target_supplier_reference text, event_reason text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.supplier_return_cases%rowtype;rc public.return_cases%rowtype;r public.command_receipts%rowtype;h text;eid uuid;permission text;returned numeric;accepted numeric;prior_qty numeric;portion bigint;on_hand numeric;reserved numeric;stock_value bigint;inventory_portion bigint;accepted_inventory bigint:=0;lot record;lot_before numeric;lot_after numeric;prior_lot_qty numeric:=0;source_line public.delivery_lines%rowtype;vl public.delivery_verification_lines%rowtype;hl public.delivery_handoff_lines%rowtype;
begin
 select * into c from public.supplier_return_cases where id=target_case_id;
 permission:=case target_event_kind when 'PHYSICAL_RETURN' then 'inventory.reserve' when 'SUPPLIER_ACCEPTANCE' then 'purchasing.confirm' when 'CLOSE_DISPATCH' then 'purchasing.cancel' end;
 if c.id is null or permission is null or not private.has_permission(c.branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'record_supplier_return_event');perform pg_advisory_xact_lock(hashtextextended('supplier_return:'||operation_id::text,0));
 perform private.require_exact_quantity(actual_base_quantity,target_event_kind='CLOSE_DISPATCH');
 if operation_id is null or event_reason is null or char_length(trim(event_reason)) not between 3 and 500 then raise exception 'invalid_supplier_return_event' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_case_id,target_event_kind,actual_base_quantity,nullif(trim(target_supplier_reference),''),trim(event_reason),expected_version));
 select * into r from public.command_receipts where command_receipts.operation_id=record_supplier_return_event.operation_id;
 if found then if r.command_name<>'record_supplier_return_event' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 -- Serialize all cases of the same original source before their case/version checks.
 if c.source_receipt_line_id is not null then perform 1 from public.purchase_receipt_lines where id=c.source_receipt_line_id for update;
 else perform 1 from public.supplier_fulfillment_lines where id=c.source_fulfillment_line_id for update;end if;
 select * into c from public.supplier_return_cases where id=target_case_id for update;
 if c.version is distinct from expected_version then raise exception 'supplier_return_version_conflict' using errcode='PT409';end if;
 select coalesce(sum(e.base_quantity)filter(where e.event_kind='PHYSICAL_RETURN'),0),coalesce(sum(e.base_quantity)filter(where e.event_kind='SUPPLIER_ACCEPTANCE'),0) into returned,accepted from public.supplier_return_events e where e.case_id=c.id;
 if target_event_kind='CLOSE_DISPATCH' then
  if c.dispatch_closed or actual_base_quantity<>0 or nullif(trim(target_supplier_reference),'') is not null then raise exception 'invalid_supplier_return_close' using errcode='23514';end if;portion:=0;
 else
  if target_event_kind='PHYSICAL_RETURN' and(c.dispatch_closed or returned+actual_base_quantity>c.requested_base_quantity) then raise exception 'supplier_return_exceeds_requested' using errcode='23514';end if;
  if target_event_kind='SUPPLIER_ACCEPTANCE' and(accepted+actual_base_quantity>returned or target_supplier_reference is null or char_length(trim(target_supplier_reference)) not between 3 and 100) then raise exception 'supplier_acceptance_exceeds_physical_return_or_reference_missing' using errcode='23514';end if;
  if target_event_kind='PHYSICAL_RETURN' and nullif(trim(target_supplier_reference),'') is not null then raise exception 'physical_return_has_no_supplier_acceptance_reference' using errcode='23514';end if;
  select coalesce(sum(e.base_quantity),0) into prior_qty from public.supplier_return_events e join public.supplier_return_cases other on other.id=e.case_id
   where e.event_kind=target_event_kind and((c.source_receipt_line_id is not null and other.source_receipt_line_id=c.source_receipt_line_id) or(c.source_fulfillment_line_id is not null and other.source_fulfillment_line_id=c.source_fulfillment_line_id));
  if prior_qty+actual_base_quantity>c.source_base_quantity then raise exception 'supplier_return_exceeds_source_quantity' using errcode='23514';end if;
  portion:=round((prior_qty+actual_base_quantity)*c.source_value_vnd/c.source_base_quantity)::bigint-round(prior_qty*c.source_value_vnd/c.source_base_quantity)::bigint;
  if portion<=0 then raise exception 'supplier_return_portion_has_no_value' using errcode='23514';end if;
 end if;
 if target_event_kind='PHYSICAL_RETURN' then
  if c.warehouse_id is not null then
   if c.source_fulfillment_line_id is not null then
    select * into rc from public.return_cases where id=c.source_return_case_id for update;
    if rc.state<>'RETURNED' or rc.resolution_warehouse_id is distinct from c.warehouse_id then raise exception 'recorded_return_warehouse_custody_changed' using errcode='PT409';end if;
   end if;
   perform 1 from public.warehouses where id=c.warehouse_id and branch_id=c.branch_id and active for update;
   if not found then raise exception 'supplier_return_warehouse_invalid' using errcode='23514';end if;
   select coalesce(sum(m.base_quantity_delta),0),coalesce(sum(m.inventory_value_delta_vnd),0) into on_hand,stock_value from public.inventory_movements m where m.material_id=c.material_id and m.warehouse_id=c.warehouse_id and m.location_kind='WAREHOUSE';
   select coalesce(sum(i.reserved_base_quantity),0) into reserved from public.inventory_reservations i where i.material_id=c.material_id and i.warehouse_id=c.warehouse_id and i.state='ACTIVE';
   if on_hand-reserved<actual_base_quantity or on_hand<=0 or stock_value<=0 then raise exception 'insufficient_available_inventory_for_supplier_return' using errcode='23514';end if;
   inventory_portion:=case when actual_base_quantity=on_hand then stock_value else round(actual_base_quantity*stock_value/on_hand)::bigint end;
   if inventory_portion<=0 then raise exception 'supplier_return_inventory_portion_has_no_value' using errcode='23514';end if;
  else
   select * into rc from public.return_cases where id=c.source_return_case_id for update;
   select * into source_line from public.delivery_lines where id=rc.delivery_line_id;
   perform 1 from public.deliveries where id=source_line.delivery_id for update;
   select * into vl from public.delivery_verification_lines where id=rc.delivery_verification_line_id;
   select h.* into hl from public.delivery_handoff_lines h where h.delivery_line_id=source_line.id;
   if rc.state<>'OPEN' or actual_base_quantity<>rc.base_quantity or returned<>0 or source_line.source_mode<>'SUPPLIER_DIRECT'
   then raise exception 'direct_supplier_return_custody_changed' using errcode='PT409';end if;
   if rc.case_kind='TRANSIT_REMAINDER' and rc.base_quantity>hl.moved_base_quantity-vl.accepted_base_quantity-coalesce((select sum(x.base_quantity) from public.return_cases x where x.delivery_line_id=source_line.id and x.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and x.state in('RETURNED','LOSS_APPROVED')),0) then raise exception 'return_exceeds_transit_position' using errcode='23514';end if;
  end if;
 end if;
 if target_event_kind='PHYSICAL_RETURN' and c.warehouse_id is null then inventory_portion:=private.return_cost_portion(rc.id);end if;
 if target_event_kind='SUPPLIER_ACCEPTANCE' and c.warehouse_id is not null then
  for lot in select e.* from public.supplier_return_events e where e.case_id=c.id and e.event_kind='PHYSICAL_RETURN' order by e.source_case_version nulls first,e.recorded_at,e.id loop
   lot_before:=least(lot.base_quantity,greatest(0,accepted-prior_lot_qty));
   lot_after:=least(lot.base_quantity,greatest(0,accepted+actual_base_quantity-prior_lot_qty));
   accepted_inventory:=accepted_inventory+round(lot_after*coalesce(lot.inventory_value_vnd,lot.source_value_vnd)/lot.base_quantity)::bigint-round(lot_before*coalesce(lot.inventory_value_vnd,lot.source_value_vnd)/lot.base_quantity)::bigint;
   prior_lot_qty:=prior_lot_qty+lot.base_quantity;
  end loop;
  inventory_portion:=accepted_inventory;
 end if;
 insert into public.supplier_return_events(case_id,branch_id,supplier_id,event_kind,base_quantity,source_value_vnd,supplier_reference,reason,recorded_by,inventory_value_vnd,source_case_version)
 values(c.id,c.branch_id,c.supplier_id,target_event_kind,actual_base_quantity,portion,case when target_event_kind='SUPPLIER_ACCEPTANCE' then trim(target_supplier_reference) else null end,trim(event_reason),auth.uid(),inventory_portion,c.version) returning id into eid;
 if target_event_kind='PHYSICAL_RETURN' then
  if c.warehouse_id is not null then
   insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,source_supplier_return_event_id,occurred_at,recorded_by)
   values(c.branch_id,c.material_id,c.base_uom_id,'WAREHOUSE',c.warehouse_id,'SUPPLIER_RETURN',-actual_base_quantity,-inventory_portion,round(inventory_portion/actual_base_quantity,6),eid,now(),auth.uid());
  else
   update public.return_cases set state='RETURNED',resolution_warehouse_id=null,resolution_destination='SUPPLIER',resolution_reason=trim(event_reason),resolved_by=auth.uid(),resolved_at=now(),version=version+1 where id=rc.id;
   insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values(auth.uid(),c.branch_id,'delivery.returned_to_supplier','return_case',rc.id,operation_id,array['state','resolution_destination','physical_custody'],trim(event_reason));
   insert into public.direct_cost_entries(branch_id,sales_order_id,return_case_id,amount_delta_vnd,cost_kind,recorded_by)
   select c.branch_id,d.sales_order_id,rc.id,-inventory_portion,'RETURN_REVERSAL',auth.uid() from public.deliveries d where d.id=source_line.delivery_id;
  end if;
 end if;
 update public.supplier_return_cases set version=version+1,dispatch_closed=dispatch_closed or target_event_kind='CLOSE_DISPATCH' where id=c.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'record_supplier_return_event',h,'supplier_return_event',eid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),c.branch_id,'supplier_return.'||lower(target_event_kind),'supplier_return_case',c.id,operation_id,array['source_event','event_kind','base_quantity','supplier_reference','physical_destination'],trim(event_reason));
 return eid;
end $function$
;
commit;
