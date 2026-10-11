begin;
CREATE OR REPLACE FUNCTION public.create_supplier_return(target_branch_id uuid, target_receipt_line_id uuid, target_fulfillment_line_id uuid, target_custody_case_id uuid, requested_base_quantity numeric, return_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare src record;rc public.return_cases%rowtype;r public.command_receipts%rowtype;h text;case_id uuid;used numeric;
begin
 if not private.has_permission(target_branch_id,'purchasing.create') then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'create_supplier_return');perform pg_advisory_xact_lock(hashtextextended('supplier_return:'||operation_id::text,0));
 perform private.require_exact_quantity(requested_base_quantity);
 if operation_id is null or num_nonnulls(target_receipt_line_id,target_fulfillment_line_id)<>1 or return_reason is null or char_length(trim(return_reason)) not between 3 and 500 then raise exception 'invalid_supplier_return' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_branch_id,target_receipt_line_id,target_fulfillment_line_id,target_custody_case_id,requested_base_quantity,trim(return_reason)));
 select * into r from public.command_receipts where command_receipts.operation_id=create_supplier_return.operation_id;
 if found then if r.command_name<>'create_supplier_return' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 if target_receipt_line_id is not null then
  perform 1 from public.purchase_receipt_lines l where l.id=target_receipt_line_id for update;
  select p.supplier_id,l.material_id,pl.base_uom_id,l.warehouse_id,l.received_base_quantity qty,l.inventory_value_vnd val,o.id payable_id into src
   from public.purchase_receipt_lines l join public.purchase_receipts pr on pr.id=l.purchase_receipt_id
   join public.purchase_orders p on p.id=pr.purchase_order_id join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id
   join public.payable_obligations o on o.purchase_receipt_id=pr.id
   where l.id=target_receipt_line_id and p.branch_id=target_branch_id and pr.branch_id=target_branch_id and o.branch_id=target_branch_id;
  if target_custody_case_id is not null then raise exception 'warehouse_supplier_return_custody_source_invalid' using errcode='23514';end if;
 else
  perform 1 from public.supplier_fulfillment_lines l where l.id=target_fulfillment_line_id for update;
  select p.supplier_id,pl.material_id,pl.base_uom_id,null::uuid warehouse_id,l.supplier_base_quantity qty,l.payable_amount_vnd val,o.id payable_id into src
   from public.supplier_fulfillment_lines l join public.supplier_fulfillments sf on sf.id=l.supplier_fulfillment_id
   join public.purchase_orders p on p.id=sf.purchase_order_id join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id
   join public.materials m on m.id=pl.material_id join public.payable_obligations o on o.supplier_fulfillment_id=sf.id
   where l.id=target_fulfillment_line_id and p.branch_id=target_branch_id and sf.branch_id=target_branch_id and o.branch_id=target_branch_id;
  select * into rc from public.return_cases where id=target_custody_case_id for update;
  if rc.id is null or rc.branch_id<>target_branch_id or rc.state<>'OPEN' or rc.case_kind not in('CUSTOMER_RETURN','TRANSIT_REMAINDER')
   or rc.base_quantity<>requested_base_quantity or not exists(select 1 from public.delivery_lines dl join public.supply_allocations sa on sa.id=dl.supply_allocation_id
    join public.supplier_fulfillment_lines fl on fl.purchase_order_line_id=sa.purchase_order_line_id and fl.sales_order_line_id=dl.sales_order_line_id
    where dl.id=rc.delivery_line_id and dl.source_mode='SUPPLIER_DIRECT' and fl.id=target_fulfillment_line_id)
   or exists(select 1 from public.supplier_return_cases c where c.source_return_case_id=rc.id and not c.dispatch_closed)
  then raise exception 'direct_supplier_return_requires_open_custody_source' using errcode='23514';end if;
 end if;
 if src is null or src.payable_id is null then raise exception 'supplier_return_source_missing_or_scope_mismatch' using errcode='23514';end if;
 select coalesce(sum(case when c.dispatch_closed then coalesce((select sum(e.base_quantity) from public.supplier_return_events e where e.case_id=c.id and e.event_kind='PHYSICAL_RETURN'),0) else c.requested_base_quantity end),0) into used
 from public.supplier_return_cases c where (target_receipt_line_id is not null and c.source_receipt_line_id=target_receipt_line_id) or(target_fulfillment_line_id is not null and c.source_fulfillment_line_id=target_fulfillment_line_id);
 if requested_base_quantity+used>src.qty then raise exception 'supplier_return_exceeds_source_quantity' using errcode='23514';end if;
 insert into public.supplier_return_cases(branch_id,supplier_id,return_number,source_receipt_line_id,source_fulfillment_line_id,source_return_case_id,source_payable_id,material_id,base_uom_id,warehouse_id,requested_base_quantity,source_base_quantity,source_value_vnd,reason,created_by)
 values(target_branch_id,src.supplier_id,'SR-'||lpad(nextval('public.supplier_return_number_seq')::text,8,'0'),target_receipt_line_id,target_fulfillment_line_id,target_custody_case_id,src.payable_id,src.material_id,src.base_uom_id,src.warehouse_id,requested_base_quantity,src.qty,src.val,trim(return_reason),auth.uid()) returning id into case_id;
 insert into public.command_receipts values(operation_id,auth.uid(),'create_supplier_return',h,'supplier_return_case',case_id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
 values(auth.uid(),target_branch_id,'supplier_return.created','supplier_return_case',case_id,operation_id,array['source_receipt_line_id','source_fulfillment_line_id','source_return_case_id','requested_base_quantity']);
 return case_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.record_supplier_return_event(target_case_id uuid, target_event_kind text, actual_base_quantity numeric, target_supplier_reference text, event_reason text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.supplier_return_cases%rowtype;rc public.return_cases%rowtype;r public.command_receipts%rowtype;h text;eid uuid;permission text;returned numeric;accepted numeric;prior_qty numeric;portion bigint;on_hand numeric;reserved numeric;stock_value bigint;source_line public.delivery_lines%rowtype;vl public.delivery_verification_lines%rowtype;hl public.delivery_handoff_lines%rowtype;
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
   perform 1 from public.warehouses where id=c.warehouse_id and branch_id=c.branch_id and active for update;
   if not found then raise exception 'supplier_return_warehouse_invalid' using errcode='23514';end if;
   select coalesce(sum(m.base_quantity_delta),0),coalesce(sum(m.inventory_value_delta_vnd),0) into on_hand,stock_value from public.inventory_movements m where m.material_id=c.material_id and m.warehouse_id=c.warehouse_id and m.location_kind='WAREHOUSE';
   select coalesce(sum(i.reserved_base_quantity),0) into reserved from public.inventory_reservations i where i.material_id=c.material_id and i.warehouse_id=c.warehouse_id and i.state='ACTIVE';
   if on_hand-reserved<actual_base_quantity or stock_value<portion then raise exception 'insufficient_available_inventory_for_supplier_return' using errcode='23514';end if;
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
 insert into public.supplier_return_events(case_id,branch_id,supplier_id,event_kind,base_quantity,source_value_vnd,supplier_reference,reason,recorded_by)
 values(c.id,c.branch_id,c.supplier_id,target_event_kind,actual_base_quantity,portion,case when target_event_kind='SUPPLIER_ACCEPTANCE' then trim(target_supplier_reference) else null end,trim(event_reason),auth.uid()) returning id into eid;
 if target_event_kind='PHYSICAL_RETURN' then
  if c.warehouse_id is not null then
   insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,source_supplier_return_event_id,occurred_at,recorded_by)
   values(c.branch_id,c.material_id,c.base_uom_id,'WAREHOUSE',c.warehouse_id,'SUPPLIER_RETURN',-actual_base_quantity,-portion,round(portion/actual_base_quantity,6),eid,now(),auth.uid());
  else
   update public.return_cases set state='RETURNED',resolution_warehouse_id=null,resolution_destination='SUPPLIER',resolution_reason=trim(event_reason),resolved_by=auth.uid(),resolved_at=now(),version=version+1 where id=rc.id;
   insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values(auth.uid(),c.branch_id,'delivery.returned_to_supplier','return_case',rc.id,operation_id,array['state','resolution_destination','physical_custody'],trim(event_reason));
   insert into public.direct_cost_entries(branch_id,sales_order_id,return_case_id,amount_delta_vnd,cost_kind,recorded_by)
   select c.branch_id,d.sales_order_id,rc.id,-portion,'RETURN_REVERSAL',auth.uid() from public.deliveries d where d.id=source_line.delivery_id;
  end if;
 end if;
 update public.supplier_return_cases set version=version+1,dispatch_closed=dispatch_closed or target_event_kind='CLOSE_DISPATCH' where id=c.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'record_supplier_return_event',h,'supplier_return_event',eid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),c.branch_id,'supplier_return.'||lower(target_event_kind),'supplier_return_case',c.id,operation_id,array['source_event','event_kind','base_quantity','supplier_reference','physical_destination'],trim(event_reason));
 return eid;
end $function$
;
notify pgrst,'reload schema';
commit;
