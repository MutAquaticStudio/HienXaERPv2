-- Warehouse transfers preserve each dispatched lot's quantity and value; no count adjustments.
begin;
create sequence public.warehouse_transfer_number_seq;
create table public.warehouse_transfers(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id),
 transfer_number text not null unique,from_warehouse_id uuid not null references public.warehouses(id),to_warehouse_id uuid not null references public.warehouses(id),
 material_id uuid not null references public.materials(id),base_uom_id uuid not null references public.units_of_measure(id),
 planned_base_quantity numeric(20,6) not null check(planned_base_quantity>0),dispatch_closed boolean not null default false,
 version integer not null default 1 check(version>0),reason text not null check(char_length(trim(reason)) between 3 and 500),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),check(from_warehouse_id<>to_warehouse_id)
);
create table public.warehouse_transfer_events(
 id uuid primary key default gen_random_uuid(),transfer_id uuid not null references public.warehouse_transfers(id),
 event_kind text not null check(event_kind in('DISPATCH','RECEIVE','REPORT_SHORTAGE','APPROVE_LOSS','CLOSE_DISPATCH')),
 source_dispatch_id uuid references public.warehouse_transfer_events(id),source_issue_id uuid references public.warehouse_transfer_events(id),
 base_quantity numeric(20,6) not null check(base_quantity>=0),value_vnd bigint not null check(value_vnd>=0),
 reason text not null check(char_length(trim(reason)) between 3 and 500),recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 check((event_kind='CLOSE_DISPATCH' and base_quantity=0 and value_vnd=0) or (event_kind='REPORT_SHORTAGE' and base_quantity>0 and value_vnd=0)
 or(event_kind in('DISPATCH','RECEIVE','APPROVE_LOSS') and base_quantity>0 and value_vnd>0))
);
alter table public.warehouse_transfers enable row level security;
alter table public.warehouse_transfer_events enable row level security;
create policy warehouse_transfer_read on public.warehouse_transfers for select to authenticated using(private.has_permission(branch_id,'inventory.read'));
create policy warehouse_transfer_event_read on public.warehouse_transfer_events for select to authenticated using(exists(select 1 from public.warehouse_transfers t where t.id=transfer_id and private.has_permission(t.branch_id,'inventory.read')));
grant select on public.warehouse_transfers to authenticated;
grant select(id,transfer_id,event_kind,source_dispatch_id,source_issue_id,base_quantity,reason,recorded_by,recorded_at) on public.warehouse_transfer_events to authenticated;
revoke insert,update,delete on public.warehouse_transfers,public.warehouse_transfer_events from authenticated,anon;
create trigger warehouse_transfer_event_immutable before update or delete on public.warehouse_transfer_events for each row execute function private.reject_r7_posted_mutation();

alter table public.inventory_movements add column warehouse_transfer_id uuid references public.warehouse_transfers(id),
 add column source_warehouse_transfer_event_id uuid references public.warehouse_transfer_events(id);
alter table public.inventory_movements drop constraint inventory_movements_check,drop constraint inventory_movements_check2,drop constraint inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_location_source_check check(
 (location_kind='WAREHOUSE' and warehouse_id is not null and delivery_id is null)
 or(location_kind='IN_TRANSIT' and warehouse_id is null and num_nonnulls(delivery_id,source_inventory_opening_id,warehouse_transfer_id)=1));
alter table public.inventory_movements add constraint inventory_movements_source_check check(num_nonnulls(source_purchase_receipt_line_id,source_delivery_handoff_line_id,source_delivery_verification_line_id,source_stock_count_line_id,source_return_case_id,source_inventory_opening_id,source_warehouse_transfer_event_id)=1);
alter table public.inventory_movements add constraint inventory_movements_transfer_source_check check((warehouse_transfer_id is not null)=(source_warehouse_transfer_event_id is not null));
alter table public.inventory_movements add constraint inventory_movements_movement_type_check check(movement_type in('PURCHASE_RECEIPT','DELIVERY_HANDOFF','DELIVERY_VERIFIED','STOCK_ADJUSTMENT','RETURN_TRANSFER','CUSTOMER_RETURN','TRANSIT_LOSS','OPENING','WAREHOUSE_TRANSFER_DISPATCH','WAREHOUSE_TRANSFER_RECEIPT','WAREHOUSE_TRANSFER_LOSS'));
create unique index inventory_transfer_event_location_unique on public.inventory_movements(source_warehouse_transfer_event_id,location_kind) where source_warehouse_transfer_event_id is not null;

create function public.create_warehouse_transfer(target_branch_id uuid,from_warehouse_id uuid,to_warehouse_id uuid,target_material_id uuid,planned_base_quantity numeric,transfer_reason text,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare r public.command_receipts%rowtype;h text;tid uuid;u uuid;
begin
 if not private.has_permission(target_branch_id,'inventory.reserve') then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'create_warehouse_transfer');perform pg_advisory_xact_lock(hashtextextended('warehouse_transfer:'||operation_id::text,0));
 perform private.require_exact_quantity(planned_base_quantity);
 if operation_id is null or transfer_reason is null or char_length(trim(transfer_reason)) not between 3 and 500 then raise exception 'invalid_transfer' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_branch_id,from_warehouse_id,to_warehouse_id,target_material_id,planned_base_quantity,trim(transfer_reason)));
 select * into r from public.command_receipts where command_receipts.operation_id=create_warehouse_transfer.operation_id;
 if found then if r.command_name<>'create_warehouse_transfer' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 if from_warehouse_id is null or to_warehouse_id is null or from_warehouse_id=to_warehouse_id or (select count(*) from public.warehouses w where w.id in(from_warehouse_id,to_warehouse_id) and w.branch_id=target_branch_id and w.active)<>2 then raise exception 'transfer_warehouse_scope_mismatch' using errcode='23514';end if;
 select base_uom_id into u from public.materials where id=target_material_id and active;if u is null then raise exception 'material_not_found' using errcode='23503';end if;
 insert into public.warehouse_transfers(branch_id,transfer_number,from_warehouse_id,to_warehouse_id,material_id,base_uom_id,planned_base_quantity,reason,created_by)
 values(target_branch_id,'WT-'||lpad(nextval('public.warehouse_transfer_number_seq')::text,8,'0'),from_warehouse_id,to_warehouse_id,target_material_id,u,planned_base_quantity,trim(transfer_reason),auth.uid()) returning id into tid;
 insert into public.command_receipts values(operation_id,auth.uid(),'create_warehouse_transfer',h,'warehouse_transfer',tid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values(auth.uid(),target_branch_id,'warehouse_transfer.created','warehouse_transfer',tid,operation_id,array['from_warehouse_id','to_warehouse_id','material_id','planned_base_quantity']);
 return tid;
end $fn$;

create function public.record_warehouse_transfer_event(target_transfer_id uuid,event_kind text,source_dispatch_id uuid,source_issue_id uuid,actual_base_quantity numeric,event_reason text,expected_version integer,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
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
  select * into lot from public.warehouse_transfer_events e where e.id=source_dispatch_id and e.transfer_id=t.id and e.event_kind='DISPATCH';
  if lot.id is null then raise exception 'transfer_dispatch_source_invalid' using errcode='23514';end if;
  select coalesce(sum(e.base_quantity),0),coalesce(sum(e.value_vnd),0) into settled,settled_value from public.warehouse_transfer_events e where e.source_dispatch_id=lot.id and e.event_kind in('RECEIVE','APPROVE_LOSS');
  select coalesce(sum(i.base_quantity-coalesce((select sum(e.base_quantity) from public.warehouse_transfer_events e where e.source_issue_id=i.id and e.event_kind in('RECEIVE','APPROVE_LOSS')),0)),0) into claimed from public.warehouse_transfer_events i where i.source_dispatch_id=lot.id and i.event_kind='REPORT_SHORTAGE';
  if actual_base_quantity>lot.base_quantity-settled then raise exception 'transfer_event_exceeds_transit' using errcode='23514';end if;
  if event_kind='REPORT_SHORTAGE' then
   if source_issue_id is not null or actual_base_quantity>lot.base_quantity-settled-claimed then raise exception 'transfer_issue_exceeds_unclaimed_transit' using errcode='23514';end if;portion:=0;
  else
   if source_issue_id is not null then
    select * into issue from public.warehouse_transfer_events e where e.id=source_issue_id and e.source_dispatch_id=lot.id and e.event_kind='REPORT_SHORTAGE';
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
end $fn$;
revoke all on function public.create_warehouse_transfer(uuid,uuid,uuid,uuid,numeric,text,uuid),public.record_warehouse_transfer_event(uuid,text,uuid,uuid,numeric,text,integer,uuid) from public,anon;
grant execute on function public.create_warehouse_transfer(uuid,uuid,uuid,uuid,numeric,text,uuid),public.record_warehouse_transfer_event(uuid,text,uuid,uuid,numeric,text,integer,uuid) to authenticated;

create view public.warehouse_transfer_event_read with(security_barrier=true) as
 select e.id,e.transfer_id,e.event_kind,e.source_dispatch_id,e.source_issue_id,e.base_quantity::text,
 case when private.has_permission(t.branch_id,'inventory.cost.read') then e.value_vnd::text else null end value_vnd,
 e.reason,e.recorded_by,e.recorded_at from public.warehouse_transfer_events e join public.warehouse_transfers t on t.id=e.transfer_id where private.has_permission(t.branch_id,'inventory.read');
create view public.warehouse_transfer_read with(security_barrier=true) as
 select t.*,w1.name from_warehouse_name,w2.name to_warehouse_name,m.code material_code,m.name material_name,
 coalesce(x.shipped,0)::text shipped_base_quantity,coalesce(x.received,0)::text received_base_quantity,coalesce(x.lost,0)::text loss_base_quantity,
 (coalesce(x.shipped,0)-coalesce(x.received,0)-coalesce(x.lost,0))::text in_transit_base_quantity,
 case when coalesce(x.shipped,0)=0 and not t.dispatch_closed then 'OPEN'
 when (t.dispatch_closed or coalesce(x.shipped,0)=t.planned_base_quantity) and coalesce(x.shipped,0)=coalesce(x.received,0)+coalesce(x.lost,0) then 'CLOSED' else 'IN_PROGRESS' end transfer_state,
 case when private.has_permission(t.branch_id,'inventory.cost.read') then (coalesce(x.shipped_value,0)-coalesce(x.received_value,0)-coalesce(x.lost_value,0))::text else null end in_transit_value_vnd
 from public.warehouse_transfers t join public.warehouses w1 on w1.id=t.from_warehouse_id join public.warehouses w2 on w2.id=t.to_warehouse_id join public.materials m on m.id=t.material_id
 left join lateral(select sum(e.base_quantity)filter(where e.event_kind='DISPATCH') shipped,sum(e.base_quantity)filter(where e.event_kind='RECEIVE') received,sum(e.base_quantity)filter(where e.event_kind='APPROVE_LOSS') lost,
 sum(e.value_vnd)filter(where e.event_kind='DISPATCH') shipped_value,sum(e.value_vnd)filter(where e.event_kind='RECEIVE') received_value,sum(e.value_vnd)filter(where e.event_kind='APPROVE_LOSS') lost_value from public.warehouse_transfer_events e where e.transfer_id=t.id)x on true
 where private.has_permission(t.branch_id,'inventory.read');
grant select on public.warehouse_transfer_event_read,public.warehouse_transfer_read to authenticated;
notify pgrst,'reload schema';
commit;
