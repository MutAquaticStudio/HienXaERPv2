begin;
alter table public.vehicles add column capacity_source_note text check(capacity_source_note is null or length(trim(capacity_source_note)) between 3 and 500);
alter table public.vehicles add column capacity_verified_at timestamptz;
alter table public.vehicles add column capacity_verified_by uuid references auth.users(id) on delete restrict;
CREATE OR REPLACE FUNCTION public.save_catalog_record(kind text, target_id uuid, target_branch_id uuid, values_json jsonb, expected_json jsonb, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tab text; allowed text[]; permission text; old_row jsonb; payload jsonb;
  cols text; vals text; assignments text; k text; parent_branch uuid;
begin
  case kind
  when 'materials' then tab:='materials'; permission:='catalog.manage'; allowed:=array['code','name','group_id','base_uom_id','specification','sale_enabled','purchase_enabled','active'];
  when 'units' then tab:='units_of_measure'; permission:='catalog.manage'; allowed:=array['code','name','symbol','decimal_scale','active'];
  when 'groups' then tab:='material_groups'; permission:='catalog.manage'; allowed:=array['code','name','active'];
  when 'customers' then tab:='customers'; permission:='customers.manage'; allowed:=array['code','display_name','customer_type','phone','email','address_text','tax_code','active'];
  when 'suppliers' then tab:='suppliers'; permission:='suppliers.manage'; allowed:=array['code','name','phone','email','address_text','tax_code','payment_terms_days','active'];
  when 'sites' then tab:='customer_sites'; permission:='customers.manage'; allowed:=array['customer_id','code','name','address_text','receiver_name','receiver_phone','access_note','receiving_window','active'];
  when 'warehouses' then tab:='warehouses'; permission:='roles.manage'; allowed:=array['code','name','address_text','active'];
  when 'vehicles' then tab:='vehicles'; permission:='roles.manage'; allowed:=array['code','plate_number','capacity_quantity','capacity_uom_id','capacity_source_note','active'];
  when 'machines' then tab:='machines'; permission:='roles.manage'; allowed:=array['code','name','machine_type','active'];
  when 'conversions' then tab:='material_uom_conversions'; permission:='catalog.manage'; allowed:=array['material_id','from_uom_id','to_uom_id','numerator','denominator','conversion_type','settlement_allowed','rounding_scale','rounding_mode','source_note','active'];
  else raise exception 'unsupported_catalog' using errcode='22023'; end case;
  if auth.uid() is null or not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501'; end if;
  if char_length(trim(coalesce(change_reason,''))) not between 3 and 500 or target_id is null or operation_id is null or jsonb_typeof(values_json)<>'object' then raise exception 'invalid_input' using errcode='22023'; end if;
  for k in select jsonb_object_keys(values_json) loop
    if not k=any(allowed) then raise exception 'field_not_editable' using errcode='42501'; end if;
  end loop;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into old_row using target_id;
  if old_row is not null then
    if expected_json is null then raise exception 'record_already_exists' using errcode='23505'; end if;
    if tab in ('customers','suppliers','warehouses','vehicles','machines') and (old_row->>'branch_id')::uuid<>target_branch_id then raise exception 'forbidden' using errcode='42501'; end if;
    if tab='customer_sites' then
      select branch_id into parent_branch from public.customers where id=(old_row->>'customer_id')::uuid;
      if parent_branch is distinct from target_branch_id or values_json->>'customer_id' is distinct from old_row->>'customer_id' then raise exception 'site_customer_immutable' using errcode='42501'; end if;
    end if;
    for k in select jsonb_object_keys(values_json) loop
      if not expected_json ? k or old_row->k is distinct from expected_json->k then raise exception 'stale_record_reload' using errcode='PT409'; end if;
    end loop;
    if tab='materials' and values_json->>'base_uom_id' is distinct from old_row->>'base_uom_id' then raise exception 'base_unit_immutable' using errcode='22023'; end if;
    if tab='material_uom_conversions' and (values_json - 'active') <> (expected_json - 'active') then raise exception 'create_new_conversion_version' using errcode='22023'; end if;
  elsif expected_json is not null then raise exception 'record_missing' using errcode='PT409';
  end if;
  if kind='vehicles' and (values_json ? 'capacity_quantity' or values_json ? 'capacity_uom_id' or values_json ? 'capacity_source_note') then
    if exists(select 1 from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id
      where a.vehicle_id=target_id and a.superseded_at is null and d.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')) then
      raise exception 'vehicle_capacity_locked_by_assignment' using errcode='PT409';
    end if;
    if values_json->>'capacity_quantity' is not null then
      perform private.require_exact_quantity((values_json->>'capacity_quantity')::numeric,false);
      if nullif(trim(values_json->>'capacity_source_note'),'') is null or length(trim(values_json->>'capacity_source_note')) not between 3 and 500
      then raise exception 'vehicle_capacity_evidence_required' using errcode='22023';end if;
    end if;
  end if;
  payload:=values_json||jsonb_build_object('id',target_id);
  if tab in ('customers','suppliers','warehouses','vehicles','machines') then payload:=payload||jsonb_build_object('branch_id',target_branch_id); end if;
  if tab='customer_sites' then
    select branch_id into parent_branch from public.customers where id=(payload->>'customer_id')::uuid and active;
    if parent_branch is distinct from target_branch_id then raise exception 'customer_outside_branch' using errcode='42501'; end if;
  end if;
  if old_row is null then
    select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into cols,vals from jsonb_object_keys(payload) key;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',tab,cols,vals,tab) using payload;
  else
    select string_agg(format('%I=r.%I',key,key),',') into assignments from jsonb_object_keys(values_json) key;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2',tab,assignments,tab) using payload,target_id;
  end if;
  if kind='vehicles' and (values_json ? 'capacity_quantity' or values_json ? 'capacity_uom_id' or values_json ? 'capacity_source_note') then
    update public.vehicles set capacity_verified_at=case when capacity_quantity is null then null else now() end,
      capacity_verified_by=case when capacity_quantity is null then null else (select auth.uid()) end where id=target_id;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values(auth.uid(),target_branch_id,'catalog.save',tab,target_id,operation_id,array(select jsonb_object_keys(values_json)),change_reason);
  return target_id;
end $function$
;
CREATE OR REPLACE FUNCTION private.assert_delivery_resources(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, target_start timestamp with time zone, target_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if vehicle.capacity_quantity is null or vehicle.capacity_uom_id is null or vehicle.capacity_verified_at is null or vehicle.capacity_verified_by is null or nullif(trim(vehicle.capacity_source_note),'') is null
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
end $function$
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
  if assignment.employee_id is not null then
    perform private.assert_delivery_resources(delivery.id,assignment.employee_id,assignment.vehicle_id,delivery.scheduled_at,delivery.scheduled_end_at);
  end if;
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
