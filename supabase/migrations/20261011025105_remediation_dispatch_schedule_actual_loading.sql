-- G06/G13/G14/G21: schedule checks at assignment; actual loading separate from plan.
begin;
alter table public.deliveries add column scheduled_end_at timestamptz;
alter table public.deliveries add constraint delivery_schedule_window_valid
 check (scheduled_end_at is null or (scheduled_at is not null and scheduled_end_at>scheduled_at));

create function private.assert_delivery_resources(target_delivery_id uuid, target_employee_id uuid,
 target_vehicle_id uuid, target_start timestamptz,target_end timestamptz) returns void
language plpgsql security definer set search_path='' as $body$
declare d public.deliveries%rowtype; vehicle public.vehicles%rowtype; l public.delivery_lines%rowtype;
 load numeric:=0; factor numeric; conversion_count integer; work_id uuid;
begin
 select * into d from public.deliveries where id=target_delivery_id;
 if target_start is null or target_end is null or target_end<=target_start
 then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
 select id into work_id from public.work_items where delivery_id=d.id;
 perform private.assert_work_resources_available(coalesce(work_id,d.id),d.branch_id,target_employee_id,target_vehicle_id,null,target_start,target_end);
 -- The same employee/vehicle locks protect unpublished assignments and work assignments.
 if exists(select 1 from public.delivery_assignments a join public.deliveries other on other.id=a.delivery_id
  where a.superseded_at is null and other.id<>d.id and other.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
  and (a.employee_id=target_employee_id or a.vehicle_id=target_vehicle_id)
  and tstzrange(other.scheduled_at,coalesce(other.scheduled_end_at,other.scheduled_at+interval '4 hours'),'[)')
    &&tstzrange(target_start,target_end,'[)'))
 then raise exception 'work_resource_schedule_collision' using errcode='23P01';end if;
 select * into vehicle from public.vehicles where id=target_vehicle_id;
 if vehicle.capacity_quantity is null or vehicle.capacity_uom_id is null
 then raise exception 'vehicle_capacity_basis_missing' using errcode='23514';end if;
 perform private.require_exact_quantity(vehicle.capacity_quantity,false);
 for l in select * from public.delivery_lines where delivery_id=d.id loop
  if l.base_uom_id=vehicle.capacity_uom_id then factor:=1;
  else
   select count(*)::integer,min(c.numerator/c.denominator) into conversion_count,factor
   from public.material_uom_conversions c where c.active and c.from_uom_id=l.base_uom_id
    and c.to_uom_id=vehicle.capacity_uom_id and (c.material_id=l.material_id or c.material_id is null)
    and c.conversion_type in('EXACT','PACKAGING','MEASURED')
    and (c.conversion_type<>'MEASURED' or nullif(trim(c.source_note),'') is not null)
    and c.effective_from<=target_start and (c.effective_to is null or c.effective_to>target_start);
   if conversion_count<>1 or factor is null
   then raise exception 'vehicle_capacity_conversion_missing' using errcode='23514';end if;
  end if;
  load:=load+l.planned_base_quantity*factor;
 end loop;
 if load>vehicle.capacity_quantity then raise exception 'vehicle_capacity_exceeded' using errcode='23514';end if;
end $body$;
revoke all on function private.assert_delivery_resources(uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.assign_delivery(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; work public.work_items%rowtype; work_assignment_version integer; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery.operation_id;
  if found then if receipt.command_name <> 'assign_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version is distinct from expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = 'PT409'; end if;
  if not ((target_employee_id is not null and target_vehicle_id is not null and nullif(trim(external_carrier_name), '') is null)
    or (target_employee_id is null and target_vehicle_id is null and nullif(trim(external_carrier_name), '') is not null)) then raise exception 'invalid_assignment_shape' using errcode = '22023'; end if;
  if target_employee_id is not null and (not exists (select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id where e.id = target_employee_id and e.active and a.branch_id = delivery.branch_id and a.active)
    or not exists (select 1 from public.vehicles where id = target_vehicle_id and branch_id = delivery.branch_id and active)) then raise exception 'assignment_resource_invalid' using errcode = '23503'; end if;
  select * into work from public.work_items where delivery_id=delivery.id for update;
  if work.id is not null and(work.execution_state not in('AVAILABLE','CLAIMED') or work.started_at is not null)
  then raise exception 'delivery_reassignment_after_work_started_forbidden' using errcode='PT409';end if;
  if work.id is not null and target_employee_id is null then
   raise exception 'delivery_external_assignment_with_work_forbidden' using errcode='PT409';
  end if;
  if target_employee_id is not null then
   perform private.assert_delivery_resources(delivery.id,target_employee_id,target_vehicle_id,delivery.scheduled_at,
     coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+interval '4 hours'));
  end if;
  update public.gps_tracking_sessions set status='REVOKED',stopped_at=now(),stop_reason='assignment_superseded'
   where delivery_id=delivery.id and status='ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', scheduled_end_at=coalesce(scheduled_end_at,work.scheduled_end,scheduled_at+interval '4 hours'), version = version + 1 where id = target_delivery_id;
  if work.id is not null then
   update public.work_item_assignments set superseded_at=now() where work_item_id=work.id and superseded_at is null;
   if target_employee_id is null then
    update public.work_items set execution_state='CANCELLED',version=version+1 where id=work.id;
   else
    select coalesce(max(assignment_version),0)+1 into work_assignment_version from public.work_item_assignments where work_item_id=work.id;
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by)
     values(work.id,work_assignment_version,target_employee_id,target_vehicle_id,null,'DIRECT',(select auth.uid()));
    update public.work_items set planned_vehicle_id=target_vehicle_id,scheduled_start=delivery.scheduled_at,scheduled_end=coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+interval '4 hours'),execution_state='CLAIMED',version=version+1 where id=work.id;
   end if;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.assigned','delivery',delivery.id,assign_delivery.operation_id,
   array['delivery_assignment','work_assignment','assignment_version','gps_session'],
   case when work.id is not null then 'Đồng bộ phân giao trước khi bắt đầu việc' else 'Phân giao theo kế hoạch' end);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$

;
CREATE OR REPLACE FUNCTION public.assign_delivery_scheduled(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid, scheduled_start timestamptz, scheduled_end timestamptz)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; work public.work_items%rowtype; work_assignment_version integer; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version,'scheduled_start',scheduled_start,'scheduled_end',scheduled_end));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery_scheduled.operation_id;
  if found then if receipt.command_name <> 'assign_delivery_scheduled' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version is distinct from expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = 'PT409'; end if;
  if not ((target_employee_id is not null and target_vehicle_id is not null and nullif(trim(external_carrier_name), '') is null)
    or (target_employee_id is null and target_vehicle_id is null and nullif(trim(external_carrier_name), '') is not null)) then raise exception 'invalid_assignment_shape' using errcode = '22023'; end if;
  if target_employee_id is not null and (not exists (select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id where e.id = target_employee_id and e.active and a.branch_id = delivery.branch_id and a.active)
    or not exists (select 1 from public.vehicles where id = target_vehicle_id and branch_id = delivery.branch_id and active)) then raise exception 'assignment_resource_invalid' using errcode = '23503'; end if;
  if scheduled_start is null or scheduled_end is null or scheduled_end<=scheduled_start
  then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
  delivery.scheduled_at:=scheduled_start;delivery.scheduled_end_at:=scheduled_end;
  select * into work from public.work_items where delivery_id=delivery.id for update;
  if work.id is not null and(work.execution_state not in('AVAILABLE','CLAIMED') or work.started_at is not null)
  then raise exception 'delivery_reassignment_after_work_started_forbidden' using errcode='PT409';end if;
  if work.id is not null and target_employee_id is null then
   raise exception 'delivery_external_assignment_with_work_forbidden' using errcode='PT409';
  end if;
  if target_employee_id is not null then
   perform private.assert_delivery_resources(delivery.id,target_employee_id,target_vehicle_id,delivery.scheduled_at,
     coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+interval '4 hours'));
  end if;
  update public.gps_tracking_sessions set status='REVOKED',stopped_at=now(),stop_reason='assignment_superseded'
   where delivery_id=delivery.id and status='ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', scheduled_at=scheduled_start,scheduled_end_at=scheduled_end, version = version + 1 where id = target_delivery_id;
  if work.id is not null then
   update public.work_item_assignments set superseded_at=now() where work_item_id=work.id and superseded_at is null;
   if target_employee_id is null then
    update public.work_items set execution_state='CANCELLED',version=version+1 where id=work.id;
   else
    select coalesce(max(assignment_version),0)+1 into work_assignment_version from public.work_item_assignments where work_item_id=work.id;
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by)
     values(work.id,work_assignment_version,target_employee_id,target_vehicle_id,null,'DIRECT',(select auth.uid()));
    update public.work_items set planned_vehicle_id=target_vehicle_id,scheduled_start=delivery.scheduled_at,scheduled_end=coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+interval '4 hours'),execution_state='CLAIMED',version=version+1 where id=work.id;
   end if;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.assigned','delivery',delivery.id,assign_delivery_scheduled.operation_id,
   array['delivery_assignment','work_assignment','assignment_version','gps_session'],
   case when work.id is not null then 'Đồng bộ phân giao trước khi bắt đầu việc' else 'Phân giao theo kế hoạch' end);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery_scheduled', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$

;
create function private.delivery_loaded_quantity(target_line_id uuid) returns numeric language sql stable set search_path='' as $body$
 select h.moved_base_quantity from public.delivery_handoff_lines h where h.delivery_line_id=target_line_id
$body$;
revoke all on function private.delivery_loaded_quantity(uuid) from public,anon,authenticated,service_role;

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
  select * into assignment from public.delivery_assignments where delivery_id = target_delivery_id and superseded_at is null;
  if assignment.id is null then raise exception 'delivery_assignment_missing' using errcode = '23514'; end if;
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
        values(handoff_id,line.id,0,0,0);
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
CREATE OR REPLACE FUNCTION private.delivery_allocation_consumed(target_allocation_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(case
    when d.execution_state = 'VERIFIED' then coalesce(v.accepted_base_quantity, 0)
      + case when l.source_mode = 'SUPPLIER_DIRECT' then 0 else greatest(p.base_quantity, 0) end
    when d.execution_state in('DISPATCHED','ARRIVED','RESULT_SUBMITTED') then coalesce(private.delivery_loaded_quantity(l.id),l.planned_base_quantity)
    else l.planned_base_quantity end), 0)
  from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
  left join public.delivery_verification_lines v on v.delivery_line_id = l.id
  left join lateral private.delivery_line_transit_position(l.id) p on true
  where l.supply_allocation_id = target_allocation_id and d.execution_state <> 'CANCELLED'
$function$

;
CREATE OR REPLACE FUNCTION public.submit_delivery_result(target_delivery_id uuid, result_kind text, result_lines jsonb, receiver_name text, note text, missing_arrival_reason text, target_evidence_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; line public.delivery_lines%rowtype; item jsonb;
  actual numeric; result_id uuid; line_count integer := 0; lower_count integer := 0; positive_count integer := 0;
  hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'kind', result_kind, 'lines', result_lines, 'receiver', nullif(trim(receiver_name), ''), 'note', nullif(trim(note), ''), 'arrival_reason', nullif(trim(missing_arrival_reason), ''), 'evidence_id', target_evidence_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = submit_delivery_result.operation_id;
  if found then if receipt.command_name <> 'submit_delivery_result' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_quantity_lines(result_lines,array['actual_base_quantity'],true);

  if delivery.execution_state not in ('DISPATCHED','ARRIVED') or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_result_version_conflict' using errcode = 'PT409'; end if;
  if result_kind not in ('FULL','PARTIAL','FAILED') or jsonb_array_length(result_lines) = 0 then raise exception 'invalid_delivery_result' using errcode = '22023'; end if;
  if delivery.execution_state = 'DISPATCHED' and char_length(trim(missing_arrival_reason)) < 3 then raise exception 'missing_arrival_reason_required' using errcode = '22023'; end if;
  perform private.assert_verified_evidence(target_evidence_id, delivery.branch_id);
  insert into public.delivery_results(delivery_id, result_kind, receiver_name, note, missing_arrival_reason,
    evidence_object_id, submitted_by)
  values (target_delivery_id, result_kind, nullif(trim(receiver_name), ''), nullif(trim(note), ''),
    nullif(trim(missing_arrival_reason), ''), target_evidence_id, (select auth.uid())) returning id into result_id;
  for item in select value from jsonb_array_elements(result_lines) loop
    select * into line from public.delivery_lines where id = (item->>'delivery_line_id')::uuid and delivery_id = target_delivery_id;
    actual := (item->>'actual_base_quantity')::numeric;
    if line.id is null or actual < 0 or actual > coalesce(private.delivery_loaded_quantity(line.id),0) then raise exception 'invalid_delivery_result_line' using errcode = '22023'; end if;
    insert into public.delivery_result_lines(delivery_result_id, delivery_line_id, actual_base_quantity) values (result_id, line.id, actual);
    line_count := line_count + 1;
    if actual < line.planned_base_quantity then lower_count := lower_count + 1; end if;
    if actual > 0 then positive_count := positive_count + 1; end if;
  end loop;
  if line_count <> (select count(*) from public.delivery_lines where delivery_id = target_delivery_id)
    or (result_kind = 'FULL' and lower_count <> 0)
    or (result_kind = 'PARTIAL' and (lower_count = 0 or positive_count = 0))
    or (result_kind = 'FAILED' and positive_count <> 0) then raise exception 'delivery_result_kind_mismatch' using errcode = '23514'; end if;
  update public.deliveries set execution_state = 'RESULT_SUBMITTED', result_kind = submit_delivery_result.result_kind,
    version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'submit_delivery_result', hash, 'delivery_result', result_id, now());
  return result_id;
end
$function$

;
CREATE OR REPLACE FUNCTION public.submit_portal_delivery_result(target_work_item_id uuid, result_lines jsonb, receiver_name text, note text, target_evidence_id uuid, missing_arrival_reason text, expected_work_version integer, expected_delivery_version integer, expected_assignment_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work public.work_items%rowtype; delivery public.deliveries%rowtype;
  assignment public.work_item_assignments%rowtype; source_assignment public.delivery_assignments%rowtype;
  receipt public.command_receipts%rowtype; hash text; item jsonb; line public.delivery_lines%rowtype;
  actual numeric; seen uuid[] := '{}'; positive integer := 0; lower integer := 0;
  kind text; result_id uuid; work_result_id uuid;
begin
  if not private.is_current_work_assignee(target_work_item_id) then
    raise exception 'work_result_forbidden' using errcode='42501';
  end if;
  if operation_id is null then raise exception 'operation_id_required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  hash := private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'lines',result_lines,
    'receiver',nullif(trim(receiver_name),''),'note',nullif(trim(note),''),'evidence',target_evidence_id,
    'arrival_reason',nullif(trim(missing_arrival_reason),''),'work_version',expected_work_version,
    'delivery_version',expected_delivery_version,'assignment_version',expected_assignment_version));
  select * into receipt from public.command_receipts r where r.operation_id=submit_portal_delivery_result.operation_id;
  if found then
    if receipt.command_name<>'submit_portal_delivery_result' or receipt.payload_hash<>hash then
      raise exception 'operation_payload_conflict' using errcode='23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(result_lines,array['actual_base_quantity'],true);

  select * into work from public.work_items where id=target_work_item_id;
  select * into delivery from public.deliveries where id=work.delivery_id for update;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  select * into source_assignment from public.delivery_assignments where delivery_id=delivery.id and superseded_at is null;
  if delivery.id is null or delivery.branch_id<>work.branch_id or not private.is_current_work_assignee(work.id)
    or assignment.id is null or source_assignment.id is null
    or source_assignment.employee_id is distinct from assignment.employee_id
    or source_assignment.vehicle_id is distinct from assignment.vehicle_id then
    raise exception 'delivery_assignee_mismatch' using errcode='42501';
  end if;
  if work.version is distinct from expected_work_version or delivery.version is distinct from expected_delivery_version
    or source_assignment.assignment_version is distinct from expected_assignment_version then
    raise exception 'stale_work_or_delivery_version' using errcode='40001';
  end if;
  if work.execution_state<>'IN_PROGRESS' or delivery.execution_state not in ('DISPATCHED','ARRIVED') then
    raise exception 'delivery_work_not_submittable' using errcode='55000';
  end if;
  if delivery.execution_state='DISPATCHED' and (missing_arrival_reason is null or char_length(trim(missing_arrival_reason))<3) then
    raise exception 'missing_arrival_reason_required' using errcode='22023';
  end if;
  if char_length(coalesce(trim(note),''))>1000 or char_length(coalesce(trim(receiver_name),''))>120
    or char_length(coalesce(trim(missing_arrival_reason),''))>1000 then
    raise exception 'invalid_delivery_result_text' using errcode='22023';
  end if;
  if jsonb_typeof(result_lines) is distinct from 'array' then raise exception 'invalid_delivery_lines' using errcode='22023'; end if;
  if jsonb_array_length(result_lines) not between 1 and 50 then raise exception 'invalid_delivery_lines' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(result_lines) loop
    select * into line from public.delivery_lines where id=(item->>'delivery_line_id')::uuid and delivery_id=delivery.id;
    actual := (item->>'actual_base_quantity')::numeric;
    if line.id is null or line.id=any(seen) or actual is null or actual::text in ('NaN','Infinity','-Infinity')
      or actual<0 or actual>coalesce(private.delivery_loaded_quantity(line.id),0) or actual<>round(actual,6) then
      raise exception 'invalid_delivery_result_line' using errcode='22023';
    end if;
    seen:=array_append(seen,line.id);
    if actual>0 then positive:=positive+1; end if;
    if actual<line.planned_base_quantity then lower:=lower+1; end if;
  end loop;
  if cardinality(seen)<>(select count(*) from public.delivery_lines where delivery_id=delivery.id) then
    raise exception 'delivery_result_line_missing' using errcode='22023';
  end if;
  kind:=case when positive=0 then 'FAILED' when lower>0 then 'PARTIAL' else 'FULL' end;
  if (positive>0 and nullif(trim(receiver_name),'') is null)
    or (kind='FAILED' and char_length(coalesce(trim(note),''))<3) then
    raise exception 'delivery_receiver_or_failure_reason_required' using errcode='22023';
  end if;
  if target_evidence_id is not null and not exists(select 1 from public.portal_evidence_objects e
    where e.id=target_evidence_id and e.context_type='WORK_RESULT' and e.work_item_id=work.id
      and e.object_state='READY' and e.uploaded_by=(select auth.uid())) then
    raise exception 'work_result_evidence_invalid' using errcode='42501';
  end if;
  insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,submitted_by)
  values(work.id,assignment.id,null,nullif(trim(note),''),nullif(trim(receiver_name),''),(select auth.uid())) returning id into work_result_id;
  insert into public.delivery_results(delivery_id,result_kind,receiver_name,note,missing_arrival_reason,submitted_by,source_work_item_result_id)
  values(delivery.id,kind,nullif(trim(receiver_name),''),nullif(trim(note),''),nullif(trim(missing_arrival_reason),''),
    (select auth.uid()),work_result_id) returning id into result_id;
  for item in select value from jsonb_array_elements(result_lines) loop
    insert into public.delivery_result_lines(delivery_result_id,delivery_line_id,actual_base_quantity)
    values(result_id,(item->>'delivery_line_id')::uuid,(item->>'actual_base_quantity')::numeric);
  end loop;
  if target_evidence_id is not null then
    insert into public.work_result_portal_evidence(work_result_id,evidence_id) values(work_result_id,target_evidence_id);
  end if;
  update public.work_items set execution_state='DONE',completed_at=now(),version=version+1 where id=work.id;
  update public.deliveries set execution_state='RESULT_SUBMITTED',result_kind=kind,version=version+1 where id=delivery.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'submit_portal_delivery_result',hash,'work_item_result',work_result_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),work.branch_id,'delivery.result.submitted','delivery_result',result_id,operation_id,array['source_work_item_result_id','actual_base_quantity']);
  return work_result_id;
end $function$

;
CREATE OR REPLACE FUNCTION public.publish_work_item(target_branch_id uuid, source_kind text, source_id uuid, requested_assignment_mode text, target_employee_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; title text; start_at timestamptz; end_at timestamptz; vehicle uuid; machine uuid; employee uuid := target_employee_id; source_delivery uuid; source_service uuid;
begin
  if not private.has_permission(target_branch_id, 'work.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if source_kind not in ('DELIVERY','SERVICE_JOB') or requested_assignment_mode not in ('DIRECT','POOL_CLAIM') then raise exception 'invalid_work_source' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'kind',source_kind,'source',source_id,'mode',requested_assignment_mode,'employee',target_employee_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = publish_work_item.operation_id;
  if found then
    if receipt.command_name <> 'publish_work_item' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if source_kind = 'SERVICE_JOB' then
    select j.id,j.service_type||' - '||j.job_number,j.scheduled_start,j.scheduled_end,j.vehicle_id,j.machine_id into source_service,title,start_at,end_at,vehicle,machine
    from public.service_jobs j where j.id=source_id and j.branch_id=target_branch_id and j.execution_state='SCHEDULED' for update;
    if source_service is null then raise exception 'service_not_ready' using errcode = '55000'; end if;
  else
    if requested_assignment_mode <> 'DIRECT' then raise exception 'delivery_requires_direct_assignment' using errcode = '22023'; end if;
    select d.id,'Giao hàng - '||d.delivery_number,d.scheduled_at,coalesce(d.scheduled_end_at,d.scheduled_at+interval '4 hours'),a.vehicle_id,a.employee_id into source_delivery,title,start_at,end_at,vehicle,employee
    from public.deliveries d join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null
    where d.id=source_id and d.branch_id=target_branch_id and d.execution_state='ASSIGNED' and d.scheduled_at is not null for update of d;
    if source_delivery is null or employee is null then raise exception 'delivery_not_ready_for_work' using errcode = '55000'; end if;
    if exists (select 1 from public.deliveries d where d.id = source_delivery
        and (nullif(trim(d.delivery_address_snapshot),'') is null
          or nullif(trim(d.receiver_name_snapshot),'') is null
          or nullif(trim(d.receiver_phone_snapshot),'') is null))
      or not exists (select 1 from public.delivery_lines l where l.delivery_id = source_delivery and l.planned_base_quantity > 0) then
      raise exception 'delivery_contact_or_lines_missing' using errcode = '55000';
    end if;
  end if;
  if requested_assignment_mode='DIRECT' and employee is null then raise exception 'direct_employee_required' using errcode = '22023'; end if;
  if requested_assignment_mode='POOL_CLAIM' and employee is not null then raise exception 'pool_cannot_preassign_employee' using errcode = '22023'; end if;
  insert into public.work_items(branch_id,work_number,delivery_id,service_job_id,title,assignment_mode,execution_state,scheduled_start,scheduled_end,planned_vehicle_id,planned_machine_id,created_by)
  values(target_branch_id,'WRK-'||to_char((start_at at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.work_item_number_seq')::text,6,'0'),source_delivery,source_service,title,requested_assignment_mode,case when employee is null then 'AVAILABLE' else 'CLAIMED' end,start_at,end_at,vehicle,machine,(select auth.uid())) returning id into entity_id;
  if employee is not null then
    perform private.assert_work_resources_available(entity_id,target_branch_id,employee,vehicle,machine,start_at,end_at);
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(entity_id,1,employee,vehicle,machine,'DIRECT',(select auth.uid()));
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'publish_work_item',payload_hash,'work_item',entity_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'work_item.published','work_item',entity_id,operation_id,array['source','assignment_mode','schedule']);
  return entity_id;
end
$function$

;
CREATE OR REPLACE FUNCTION private.assert_work_resources_available(target_work_item_id uuid, target_branch_id uuid, target_employee_id uuid, target_vehicle_id uuid, target_machine_id uuid, target_start timestamp with time zone, target_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.employees e
  where e.id = target_employee_id and e.active
    and exists (select 1 from public.employee_branch_access a where a.employee_id = e.id and a.branch_id = target_branch_id and a.active)
  for update;
  if not found then raise exception 'employee_not_eligible' using errcode = '23503'; end if;
  if target_vehicle_id is not null then
    perform 1 from public.vehicles where id = target_vehicle_id and branch_id = target_branch_id and active for update;
    if not found then raise exception 'vehicle_not_available' using errcode = '23503'; end if;
  end if;
  if target_machine_id is not null then
    perform 1 from public.machines where id = target_machine_id and branch_id = target_branch_id and active for update;
    if not found then raise exception 'machine_not_available' using errcode = '23503'; end if;
  end if;
  if target_start is null or target_end is null or target_end<=target_start then raise exception 'work_schedule_window_required' using errcode='22023';end if;
  if exists(select 1 from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id
    where a.superseded_at is null and d.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
    and d.id is distinct from (select delivery_id from public.work_items where id=target_work_item_id)
    and d.id<>target_work_item_id and (a.employee_id=target_employee_id or a.vehicle_id=target_vehicle_id)
    and tstzrange(d.scheduled_at,coalesce(d.scheduled_end_at,d.scheduled_at+interval '4 hours'),'[)')&&tstzrange(target_start,target_end,'[)'))
  then raise exception 'work_resource_schedule_collision' using errcode='23P01';end if;
  if exists (
    select 1 from public.work_item_assignments a
    join public.work_items w on w.id = a.work_item_id
    where a.superseded_at is null and w.id <> target_work_item_id
      and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
      and tstzrange(w.scheduled_start, w.scheduled_end, '[)') && tstzrange(target_start, target_end, '[)')
      and (a.employee_id = target_employee_id
        or (target_vehicle_id is not null and a.vehicle_id = target_vehicle_id)
        or (target_machine_id is not null and a.machine_id = target_machine_id))
  ) then raise exception 'work_resource_schedule_collision' using errcode = '23P01'; end if;
end
$function$
;
revoke all on function public.assign_delivery_scheduled(uuid,uuid,uuid,text,text,integer,uuid,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.assign_delivery_scheduled(uuid,uuid,uuid,text,text,integer,uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.handoff_delivery_actual(uuid,integer,timestamptz,uuid,jsonb) from public,anon,service_role;
grant execute on function public.handoff_delivery_actual(uuid,integer,timestamptz,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
