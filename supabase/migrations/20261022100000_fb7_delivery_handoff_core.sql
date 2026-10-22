-- FB7 (Owner 22/10): after staff assign the driver and the truck, the worker does the rest from the phone.
-- 1/5: photos of the loaded truck, and the handover to the truck shared by the warehouse page and the worker portal.
begin;

-- Photos the worker took of the loaded truck (uploaded like delivery photos, each linked once).
create table public.delivery_handoff_portal_evidence (
  delivery_handoff_id uuid not null references public.delivery_handoffs(id) on delete restrict,
  evidence_id uuid not null unique references public.portal_evidence_objects(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (delivery_handoff_id, evidence_id)
);
alter table public.delivery_handoff_portal_evidence enable row level security;
create policy delivery_handoff_portal_evidence_read on public.delivery_handoff_portal_evidence for select to authenticated
using (private.portal_evidence_access(evidence_id, true));
revoke all on table public.delivery_handoff_portal_evidence from anon, authenticated;
grant select on table public.delivery_handoff_portal_evidence to authenticated;

-- Handing goods over to the truck, shared by the warehouse page and the worker portal (body of 20261011045335, without the caller check).
create or replace function private.handoff_delivery_core(target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid, loaded_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; assignment public.delivery_assignments%rowtype;
  line public.delivery_lines%rowtype; reservation public.inventory_reservations%rowtype;
  loaded numeric; position_qty numeric; position_value bigint; unit_cost numeric; moved_value bigint;
  handoff_id uuid; handoff_line_id uuid; 
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
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
  select * into assignment from public.delivery_assignments where delivery_id = target_delivery_id and superseded_at is null;
  if assignment.id is null then raise exception 'delivery_assignment_missing' using errcode = '23514'; end if;
  if assignment.employee_id is not null then
    perform private.assert_delivery_resources(delivery.id,assignment.employee_id,assignment.vehicle_id,delivery.scheduled_at,delivery.scheduled_end_at);
  end if;
  perform private.assert_vehicle_actual_load(delivery.id,loaded_lines,handed_off_at);
  -- Lock every warehouse and source in stable order before changing custody.
  perform 1 from public.supply_allocations where id in(select supply_allocation_id from public.delivery_lines where delivery_id=delivery.id) order by id for update;
  perform 1 from public.warehouses where id in(select warehouse_id from public.delivery_lines where delivery_id=delivery.id) order by id for update;
  if (select count(distinct warehouse_id) from public.delivery_lines where delivery_id=delivery.id and source_mode<>'SUPPLIER_DIRECT')>1
  then raise exception 'delivery_multiple_pickups_require_split' using errcode='23514';end if;
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
  return handoff_id;
end
$function$
;

revoke all on function private.handoff_delivery_core(uuid, integer, timestamptz, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.handoff_delivery_actual(target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid, loaded_lines jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare delivery public.deliveries%rowtype; hash text; receipt public.command_receipts%rowtype; handoff_id uuid;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.handoff') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version, 'handed_off_at', handed_off_at,'loaded_lines',loaded_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = handoff_delivery_actual.operation_id;
  if found then if receipt.command_name <> 'handoff_delivery_actual' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  handoff_id := private.handoff_delivery_core(target_delivery_id, expected_version, handed_off_at, handoff_delivery_actual.operation_id, loaded_lines);
  insert into public.command_receipts values (handoff_delivery_actual.operation_id, (select auth.uid()), 'handoff_delivery_actual', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$;

notify pgrst, 'reload schema';
commit;
