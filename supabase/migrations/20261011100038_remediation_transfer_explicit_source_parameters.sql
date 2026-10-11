begin;
CREATE OR REPLACE FUNCTION public.record_warehouse_transfer_event(target_transfer_id uuid, event_kind text, source_dispatch_id uuid, source_issue_id uuid, actual_base_quantity numeric, event_reason text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.warehouse_transfers%rowtype;lot public.warehouse_transfer_events%rowtype;issue public.warehouse_transfer_events%rowtype;r public.command_receipts%rowtype;
 h text; eid uuid;permission text; shipped numeric; settled numeric;settled_value bigint;claimed numeric;issue_settled numeric;qty numeric;reserved numeric;val bigint;portion bigint;unit_cost numeric;
begin
 permission:=case event_kind when 'DISPATCH' then 'inventory.reserve' when 'RECEIVE' then 'inventory.receive' when 'REPORT_SHORTAGE' then 'inventory.receive' when 'CLOSE_DISPATCH' then 'inventory.reserve' when 'APPROVE_LOSS' then 'inventory.adjust' end;
 select * into t from public.warehouse_transfers where id=target_transfer_id;
 if permission is null or t.id is null or not private.has_permission(t.branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'record_warehouse_transfer_event');perform pg_advisory_xact_lock(hashtextextended('warehouse_transfer:'||operation_id::text,0));
 perform private.require_exact_quantity(actual_base_quantity,event_kind='CLOSE_DISPATCH');
 if operation_id is null or event_reason is null or char_length(trim(event_reason)) not between 3 and 500 then raise exception 'invalid_transfer_event' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_transfer_id,event_kind,source_dispatch_id,source_issue_id,actual_base_quantity,trim(event_reason),expected_version));
 select * into r from public.command_receipts where command_receipts.operation_id=record_warehouse_transfer_event.operation_id;
 if found then if r.command_name<>'record_warehouse_transfer_event' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 select * into t from public.warehouse_transfers where id=target_transfer_id for update;
 if t.version is distinct from expected_version then raise exception 'transfer_version_conflict' using errcode='40001';end if;
 perform 1 from public.warehouses w where w.id in(t.from_warehouse_id,t.to_warehouse_id) and w.active order by w.id for update;
 if (select count(*) from public.warehouses w where w.id in(t.from_warehouse_id,t.to_warehouse_id) and w.active)<>2 then raise exception 'transfer_warehouse_inactive' using errcode='23514';end if;
 select coalesce(sum(e.base_quantity),0) into shipped from public.warehouse_transfer_events e where e.transfer_id=t.id and e.event_kind='DISPATCH';
 if event_kind='CLOSE_DISPATCH' then
  if t.dispatch_closed or source_dispatch_id is not null or source_issue_id is not null or actual_base_quantity<>0 then raise exception 'invalid_transfer_close' using errcode='23514';end if;portion:=0;
 elsif event_kind='DISPATCH' then
  if t.dispatch_closed or source_dispatch_id is not null or source_issue_id is not null or shipped+actual_base_quantity>t.planned_base_quantity then raise exception 'transfer_dispatch_exceeds_plan' using errcode='23514';end if;
  select coalesce(sum(m.base_quantity_delta),0),coalesce(sum(m.inventory_value_delta_vnd),0) into qty,val from public.inventory_movements m where m.warehouse_id=t.from_warehouse_id and m.material_id=t.material_id and m.location_kind='WAREHOUSE';
  select coalesce(sum(i.reserved_base_quantity),0) into reserved from public.inventory_reservations i where i.warehouse_id=t.from_warehouse_id and i.material_id=t.material_id and i.state='ACTIVE';
  if qty-reserved<actual_base_quantity or qty<=0 or val<=0 then raise exception 'insufficient_available_inventory' using errcode='23514';end if;
  portion:=round(actual_base_quantity*val/qty)::bigint;
 else
  select * into lot from public.warehouse_transfer_events e where e.id=record_warehouse_transfer_event.source_dispatch_id and e.transfer_id=t.id and e.event_kind='DISPATCH';
  if lot.id is null then raise exception 'transfer_dispatch_source_invalid' using errcode='23514';end if;
  select coalesce(sum(e.base_quantity),0),coalesce(sum(e.value_vnd),0) into settled,settled_value from public.warehouse_transfer_events e where e.source_dispatch_id=lot.id and e.event_kind in('RECEIVE','APPROVE_LOSS');
  select coalesce(sum(i.base_quantity-coalesce((select sum(e.base_quantity) from public.warehouse_transfer_events e where e.source_issue_id=i.id and e.event_kind in('RECEIVE','APPROVE_LOSS')),0)),0) into claimed from public.warehouse_transfer_events i where i.source_dispatch_id=lot.id and i.event_kind='REPORT_SHORTAGE';
  if actual_base_quantity>lot.base_quantity-settled then raise exception 'transfer_event_exceeds_transit' using errcode='23514';end if;
  if event_kind='REPORT_SHORTAGE' then
   if source_issue_id is not null or actual_base_quantity>lot.base_quantity-settled-claimed then raise exception 'transfer_issue_exceeds_unclaimed_transit' using errcode='23514';end if;portion:=0;
  else
   if source_issue_id is not null then
    select * into issue from public.warehouse_transfer_events e where e.id=record_warehouse_transfer_event.source_issue_id and e.source_dispatch_id=lot.id and e.event_kind='REPORT_SHORTAGE';
    select coalesce(sum(e.base_quantity),0) into issue_settled from public.warehouse_transfer_events e where e.source_issue_id=issue.id and e.event_kind in('RECEIVE','APPROVE_LOSS');
    if issue.id is null or actual_base_quantity>issue.base_quantity-issue_settled then raise exception 'transfer_issue_resolution_exceeds_source' using errcode='23514';end if;
   elsif event_kind='APPROVE_LOSS' or actual_base_quantity>lot.base_quantity-settled-claimed then raise exception 'transfer_open_issue_requires_source' using errcode='23514';end if;
   portion:=round((settled+actual_base_quantity)*lot.value_vnd/lot.base_quantity)::bigint-settled_value;
  end if;
 end if;
 if event_kind in('DISPATCH','RECEIVE','APPROVE_LOSS') and portion<=0 then raise exception 'transfer_portion_has_no_value' using errcode='23514';end if;
 insert into public.warehouse_transfer_events(transfer_id,event_kind,source_dispatch_id,source_issue_id,base_quantity,value_vnd,reason,recorded_by)
 values(t.id,event_kind,source_dispatch_id,source_issue_id,actual_base_quantity,portion,trim(event_reason),auth.uid()) returning id into eid;
 if event_kind in('DISPATCH','RECEIVE','APPROVE_LOSS') then
  unit_cost:=round(portion/actual_base_quantity,6);
  if event_kind='DISPATCH' then
   insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,warehouse_transfer_id,source_warehouse_transfer_event_id,occurred_at,recorded_by)
   values(t.branch_id,t.material_id,t.base_uom_id,'WAREHOUSE',t.from_warehouse_id,'WAREHOUSE_TRANSFER_DISPATCH',-actual_base_quantity,-portion,unit_cost,t.id,eid,now(),auth.uid());
  end if;
  insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,movement_type,base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,warehouse_transfer_id,source_warehouse_transfer_event_id,occurred_at,recorded_by)
  values(t.branch_id,t.material_id,t.base_uom_id,'IN_TRANSIT',case event_kind when 'DISPATCH' then 'WAREHOUSE_TRANSFER_DISPATCH' when 'RECEIVE' then 'WAREHOUSE_TRANSFER_RECEIPT' else 'WAREHOUSE_TRANSFER_LOSS' end,case when event_kind='DISPATCH' then actual_base_quantity else -actual_base_quantity end,case when event_kind='DISPATCH' then portion else -portion end,unit_cost,t.id,eid,now(),auth.uid());
  if event_kind='RECEIVE' then
   insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,warehouse_transfer_id,source_warehouse_transfer_event_id,occurred_at,recorded_by)
   values(t.branch_id,t.material_id,t.base_uom_id,'WAREHOUSE',t.to_warehouse_id,'WAREHOUSE_TRANSFER_RECEIPT',actual_base_quantity,portion,unit_cost,t.id,eid,now(),auth.uid());
  end if;
 end if;
 update public.warehouse_transfers set version=version+1,dispatch_closed=dispatch_closed or event_kind='CLOSE_DISPATCH' where id=t.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'record_warehouse_transfer_event',h,'warehouse_transfer_event',eid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),t.branch_id,'warehouse_transfer.'||lower(event_kind),'warehouse_transfer',t.id,operation_id,array['event_id','event_kind','base_quantity','source_dispatch_id','source_issue_id'],trim(event_reason));
 return eid;
end $function$
;
notify pgrst,'reload schema';
commit;
