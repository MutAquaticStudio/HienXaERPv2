begin;
-- Physical custody is linked to the vehicle used at handoff, independent of planned calendar windows.
create function private.vehicle_cargo_lines(target_vehicle_id uuid)
 returns table(delivery_line_id uuid,material_id uuid,base_uom_id uuid,base_quantity numeric)
language sql stable set search_path='' as $body$
 select l.id,l.material_id,l.base_uom_id,
  case when l.source_mode='SUPPLIER_DIRECT' then hl.moved_base_quantity
   -coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v where v.delivery_line_id=l.id),0)
   -coalesce((select sum(r.base_quantity) from public.return_cases r where r.delivery_line_id=l.id
     and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state in('RETURNED','LOSS_APPROVED')),0)
  else (select p.base_quantity from private.delivery_line_transit_position(l.id) p) end
 from public.delivery_handoffs h join public.delivery_assignments a on a.id=h.assignment_id
 join public.delivery_handoff_lines hl on hl.delivery_handoff_id=h.id
 join public.delivery_lines l on l.id=hl.delivery_line_id
 where a.vehicle_id=target_vehicle_id
$body$;
revoke all on function private.vehicle_cargo_lines(uuid) from public,anon,authenticated,service_role;

create function private.assert_vehicle_actual_load(target_delivery_id uuid,loaded_lines jsonb,load_basis_at timestamptz)
 returns void language plpgsql security definer set search_path='' as $body$
declare d public.deliveries%rowtype; a public.delivery_assignments%rowtype; v public.vehicles%rowtype;
 cargo record; total_load numeric:=0; conversion_count integer; numerator numeric; denominator numeric;
begin
 select * into d from public.deliveries where id=target_delivery_id;
 select * into a from public.delivery_assignments where delivery_id=d.id and superseded_at is null;
 if a.vehicle_id is null then return;end if;
 -- Every canonical loading path holds this mutex before touching warehouse custody.
 select * into v from public.vehicles where id=a.vehicle_id and branch_id=d.branch_id and active for update;
 if v.id is null then raise exception 'vehicle_not_available' using errcode='23503';end if;
 if v.capacity_quantity is null or v.capacity_uom_id is null or v.capacity_verified_at is null
  or v.capacity_verified_by is null or nullif(trim(v.capacity_source_note),'') is null
 then raise exception 'vehicle_capacity_basis_missing' using errcode='23514';end if;
 for cargo in
  select c.material_id,c.base_uom_id,c.base_quantity from private.vehicle_cargo_lines(v.id) c
  union all
  select l.material_id,l.base_uom_id,(i->>'loaded_base_quantity')::numeric
   from jsonb_array_elements(loaded_lines) i join public.delivery_lines l on l.id=(i->>'delivery_line_id')::uuid
   where l.delivery_id=d.id
 loop
  if cargo.base_quantity is null or cargo.base_quantity<0 then
   raise exception 'vehicle_cargo_source_requires_reconciliation' using errcode='23514';end if;
  if cargo.base_quantity=0 then continue;end if;
  if cargo.base_uom_id=v.capacity_uom_id then numerator:=1;denominator:=1;
  else
   select count(*)::integer,min(c.numerator),min(c.denominator) into conversion_count,numerator,denominator
    from public.material_uom_conversions c where c.active and c.from_uom_id=cargo.base_uom_id
     and c.to_uom_id=v.capacity_uom_id and (c.material_id=cargo.material_id or c.material_id is null)
     and c.conversion_type in('EXACT','PACKAGING','MEASURED')
     and (c.conversion_type<>'MEASURED' or nullif(trim(c.source_note),'') is not null)
     and c.effective_from<=load_basis_at and(c.effective_to is null or c.effective_to>load_basis_at);
   if conversion_count<>1 or numerator is null or denominator is null or numerator<=0 or denominator<=0
    then raise exception 'vehicle_capacity_conversion_missing' using errcode='23514';end if;
  end if;
  total_load:=total_load+cargo.base_quantity*numerator/denominator;
 end loop;
 if total_load>v.capacity_quantity then raise exception 'vehicle_actual_cargo_capacity_exceeded' using errcode='23514';end if;
end $body$;
revoke all on function private.assert_vehicle_actual_load(uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;

create function private.guard_vehicle_capacity_with_cargo() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
 if (new.capacity_quantity is distinct from old.capacity_quantity or new.capacity_uom_id is distinct from old.capacity_uom_id
   or (old.active and not new.active)) and exists(select 1 from private.vehicle_cargo_lines(old.id) c where c.base_quantity<>0)
 then raise exception 'vehicle_capacity_locked_by_cargo' using errcode='PT409';end if;
 return new;
end $body$;
revoke all on function private.guard_vehicle_capacity_with_cargo() from public,anon,authenticated,service_role;
create trigger vehicle_capacity_with_cargo before update on public.vehicles
 for each row execute function private.guard_vehicle_capacity_with_cargo();

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
  if handed_off_at is null or not isfinite(handed_off_at) then raise exception 'handoff_time_required' using errcode='22023';end if;
  if assignment.employee_id is not null then
    perform private.assert_delivery_resources(delivery.id,assignment.employee_id,assignment.vehicle_id,delivery.scheduled_at,delivery.scheduled_end_at);
  end if;
  perform private.assert_vehicle_actual_load(delivery.id,(select jsonb_agg(jsonb_build_object(
   'delivery_line_id',l.id,'loaded_base_quantity',l.planned_base_quantity)) from public.delivery_lines l where l.delivery_id=delivery.id),handed_off_at);
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
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'handoff_delivery_actual', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$
;
notify pgrst,'reload schema';
commit;
