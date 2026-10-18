-- FB5 (Owner 18/10/2026): purchase prices split over the material's units, vehicle capacity read through unit conversions
-- (no capacity evidence note), and how much of each order line a truck can carry.
begin;

-- One purchase price typed in one unit, saved together with the prices it implies for the material's other units ("1 bao
-- 80.000 ₫" → also 1 tấn, 1 kg). Every rule goes through save_purchase_price_rule with all its checks, in one transaction:
-- one refused rule saves none of them.
create or replace function public.save_purchase_price_rules(target_branch_id uuid, rules jsonb, change_reason text, operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  hash text;
  receipt public.command_receipts%rowtype;
  item jsonb;
  item_no integer;
  saved jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or target_branch_id is null or not private.has_permission(target_branch_id, 'purchasing.price.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if save_purchase_price_rules.operation_id is null or jsonb_typeof(rules) is distinct from 'array' or jsonb_array_length(rules) not between 1 and 20 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'rules', rules, 'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(save_purchase_price_rules.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_purchase_price_rules.operation_id;
  if found then
    if receipt.command_name <> 'save_purchase_price_rules' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return (select jsonb_agg(value->'target_id' order by ordinality) from jsonb_array_elements(rules) with ordinality);
  end if;
  for item, item_no in select value, ordinality from jsonb_array_elements(rules) with ordinality loop
    if jsonb_typeof(item) is distinct from 'object' or (item->>'target_id') is null
      or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['target_id', 'supersedes_id', 'expected_version', 'values'])) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    saved := saved || to_jsonb(public.save_purchase_price_rule((item->>'target_id')::uuid, target_branch_id, (item->>'supersedes_id')::uuid,
      (item->>'expected_version')::integer, item->'values', change_reason, md5(save_purchase_price_rules.operation_id::text || ':' || item_no)::uuid));
  end loop;
  insert into public.command_receipts values (save_purchase_price_rules.operation_id, auth.uid(), 'save_purchase_price_rules', hash,
    'purchase_price_rule', (rules->0->>'target_id')::uuid, now());
  return saved;
end
$function$;

revoke all on function public.save_purchase_price_rules(uuid, jsonb, text, uuid) from public, anon;

grant execute on function public.save_purchase_price_rules(uuid, jsonb, text, uuid) to authenticated;

-- How many capacity units one from_uom of the material is, reading the material's own and the general conversions both
-- ways (1 tấn = 20 bao also gives 1 bao = 0,05 tấn), up to three steps, the material's own conversion first. Null when there
-- is no path. Same conversions the capacity check always accepted (exact, packaging, measured with a source).
create or replace function private.capacity_factor(target_material_id uuid, from_uom uuid, capacity_uom uuid, at_time timestamptz)
returns numeric
language sql stable security definer set search_path = '' as $$
  with recursive edges as (
    select c.from_uom_id as a, c.to_uom_id as b, c.numerator / c.denominator as f, (c.material_id is not null)::integer as own
    from public.material_uom_conversions c
    where c.active and (c.material_id = target_material_id or c.material_id is null) and c.numerator > 0 and c.denominator > 0
      and c.conversion_type in ('EXACT', 'PACKAGING', 'MEASURED') and (c.conversion_type <> 'MEASURED' or nullif(trim(c.source_note), '') is not null)
      and c.effective_from <= at_time and (c.effective_to is null or c.effective_to > at_time)
    union all
    select c.to_uom_id, c.from_uom_id, c.denominator / c.numerator, (c.material_id is not null)::integer
    from public.material_uom_conversions c
    where c.active and (c.material_id = target_material_id or c.material_id is null) and c.numerator > 0 and c.denominator > 0
      and c.conversion_type in ('EXACT', 'PACKAGING', 'MEASURED') and (c.conversion_type <> 'MEASURED' or nullif(trim(c.source_note), '') is not null)
      and c.effective_from <= at_time and (c.effective_to is null or c.effective_to > at_time)
  ), walk(node, f, hops, own, path) as (
    select from_uom, 1::numeric, 0, 0, array[from_uom]
    union all
    select e.b, w.f * e.f, w.hops + 1, w.own + e.own, w.path || e.b
    from walk w join edges e on e.a = w.node
    where w.hops < 3 and not e.b = any(w.path)
  )
  select w.f from walk w where w.node = capacity_uom order by w.hops, w.own desc limit 1
$$;

revoke all on function private.capacity_factor(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- Same validator as 20261018170000, except the capacity evidence note is no longer required (Owner 18/10).
CREATE OR REPLACE FUNCTION private.canonical_save_catalog_record(kind text, target_id uuid, target_branch_id uuid, values_json jsonb, expected_json jsonb, change_reason text, operation_id uuid)
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
  when 'vehicles' then tab:='vehicles'; permission:='roles.manage'; allowed:=array['code','plate_number','capacity_quantity','capacity_uom_id','capacity_source_note','default_driver_employee_id','active'];
  when 'machines' then tab:='machines'; permission:='roles.manage'; allowed:=array['code','name','machine_type','active'];
  when 'conversions' then tab:='material_uom_conversions'; permission:='catalog.manage'; allowed:=array['material_id','from_uom_id','to_uom_id','numerator','denominator','conversion_type','settlement_allowed','rounding_scale','rounding_mode','source_note','active'];
  when 'service_types' then tab:='service_types'; permission:='service.manage'; allowed:=array['code','name','unit_label','default_price_vnd','resource_kind','active'];
  else raise exception 'unsupported_catalog' using errcode='22023'; end case;
  if auth.uid() is null or not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501'; end if;
  if char_length(trim(coalesce(change_reason,''))) not between 3 and 500 or target_id is null or operation_id is null or jsonb_typeof(values_json)<>'object' then raise exception 'invalid_input' using errcode='22023'; end if;
  for k in select jsonb_object_keys(values_json) loop
    if not k=any(allowed) then raise exception 'field_not_editable' using errcode='42501'; end if;
  end loop;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into old_row using target_id;
  if old_row is not null then
    if expected_json is null then raise exception 'record_already_exists' using errcode='23505'; end if;
    if tab in ('customers','suppliers','warehouses','vehicles','machines','service_types') and (old_row->>'branch_id')::uuid<>target_branch_id then raise exception 'forbidden' using errcode='42501'; end if;
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
      where a.vehicle_id=target_id and a.superseded_at is null and d.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED'))
      and ((values_json->>'capacity_quantity')::numeric is distinct from (old_row->>'capacity_quantity')::numeric
        or (values_json->>'capacity_uom_id')::uuid is distinct from (old_row->>'capacity_uom_id')::uuid
        or coalesce((values_json->>'active')::boolean,true)=false) then
      raise exception 'vehicle_capacity_locked_by_assignment' using errcode='PT409';
    end if;
    if values_json->>'capacity_quantity' is not null then
      perform private.require_exact_quantity((values_json->>'capacity_quantity')::numeric,false);
    end if;
    -- FB5 (Owner 18/10): the capacity evidence note is optional; a blank one is stored as no note.
    if values_json ? 'capacity_source_note' and nullif(trim(values_json->>'capacity_source_note'),'') is null then
      values_json:=jsonb_set(values_json,'{capacity_source_note}','null'::jsonb);
    end if;
  end if;
  -- F3: a truck's default driver works in the same branch.
  if kind='vehicles' and nullif(values_json->>'default_driver_employee_id','') is not null and not exists(select 1 from public.employee_branch_access a
    join public.employees e on e.id=a.employee_id where a.employee_id=(values_json->>'default_driver_employee_id')::uuid and a.branch_id=target_branch_id and a.active and e.active)
  then raise exception 'invalid_default_driver' using errcode='23503'; end if;
  if kind='vehicles' and values_json ? 'default_driver_employee_id' and values_json->>'default_driver_employee_id'='' then
    values_json:=jsonb_set(values_json,'{default_driver_employee_id}','null'::jsonb);
  end if;
  payload:=values_json||jsonb_build_object('id',target_id);
  if tab in ('customers','suppliers','warehouses','vehicles','machines','service_types') then payload:=payload||jsonb_build_object('branch_id',target_branch_id); end if;
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

revoke all on function private.canonical_save_catalog_record(text,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;

-- Same as 20261018110000, with the capacity read through capacity_factor.
CREATE OR REPLACE FUNCTION private.assert_delivery_resources(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, target_start timestamp with time zone, target_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deliveries%rowtype; vehicle public.vehicles%rowtype; l public.delivery_lines%rowtype;
 load numeric:=0; factor numeric; work_id uuid; free_at timestamptz;
begin
 select * into d from public.deliveries where id=target_delivery_id;
 if target_start is null or target_end is null or target_end<=target_start
 then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
 if not private.employee_can_report_work(target_employee_id,d.branch_id) then raise exception 'delivery_employee_cannot_report_work' using errcode='23503';end if;
 select id into work_id from public.work_items where delivery_id=d.id;
 -- F2: a clash says when the person and vehicle are free next, so the caller can offer that time.
 free_at:=private.next_free_start(d.branch_id,target_employee_id,target_vehicle_id,target_start,target_end-target_start,d.id);
 if free_at>target_start then
  raise exception 'work_resource_schedule_collision' using errcode='23P01',
   hint='next_free_at='||to_char(free_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 end if;
 perform private.assert_work_resources_available(coalesce(work_id,d.id),d.branch_id,target_employee_id,target_vehicle_id,null,target_start,target_end);
 -- The same employee/vehicle locks protect unpublished assignments and work assignments.
 if exists(select 1 from public.delivery_assignments a join public.deliveries other on other.id=a.delivery_id
  where a.superseded_at is null and other.id<>d.id and other.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
  and (a.employee_id=target_employee_id or a.vehicle_id=target_vehicle_id)
  and tstzrange(other.scheduled_at,coalesce(other.scheduled_end_at,other.scheduled_at+private.delivery_stop_interval(other.branch_id)),'[)')
    &&tstzrange(target_start,target_end,'[)'))
 then raise exception 'work_resource_schedule_collision' using errcode='23P01';end if;
 select * into vehicle from public.vehicles where id=target_vehicle_id;
 -- FB5: the capacity and its unit are enough (no evidence note); the goods are counted in the truck's unit through the
 -- conversions both ways (a 4 tấn truck and goods in bao with 1 tấn = 20 bao).
 if vehicle.capacity_quantity is null or vehicle.capacity_uom_id is null
 then raise exception 'vehicle_capacity_basis_missing' using errcode='23514';end if;
 perform private.require_exact_quantity(vehicle.capacity_quantity,false);
 for l in select * from public.delivery_lines where delivery_id=d.id loop
  factor:=private.capacity_factor(l.material_id,l.base_uom_id,vehicle.capacity_uom_id,target_start);
  if factor is null then raise exception 'vehicle_capacity_conversion_missing' using errcode='23514',
   hint='material='||coalesce((select m.name from public.materials m where m.id=l.material_id),'');end if;
  load:=load+l.planned_base_quantity*factor;
 end loop;
 if load>vehicle.capacity_quantity then raise exception 'vehicle_capacity_exceeded' using errcode='23514';end if;
end $function$
;

-- Same as 20261011045335 (cargo already on the truck counts too), with the capacity read through capacity_factor.
create or replace function private.assert_vehicle_actual_load(target_delivery_id uuid,loaded_lines jsonb,load_basis_at timestamptz)
 returns void language plpgsql security definer set search_path='' as $body$
declare d public.deliveries%rowtype; a public.delivery_assignments%rowtype; v public.vehicles%rowtype;
 cargo record; total_load numeric:=0; factor numeric;
begin
 select * into d from public.deliveries where id=target_delivery_id;
 select * into a from public.delivery_assignments where delivery_id=d.id and superseded_at is null;
 if a.vehicle_id is null then return;end if;
 -- Every canonical loading path holds this mutex before touching warehouse custody.
 select * into v from public.vehicles where id=a.vehicle_id and branch_id=d.branch_id and active for update;
 if v.id is null then raise exception 'vehicle_not_available' using errcode='23503';end if;
 if v.capacity_quantity is null or v.capacity_uom_id is null
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
  factor:=private.capacity_factor(cargo.material_id,cargo.base_uom_id,v.capacity_uom_id,load_basis_at);
  if factor is null then raise exception 'vehicle_capacity_conversion_missing' using errcode='23514',
   hint='material='||coalesce((select m.name from public.materials m where m.id=cargo.material_id),'');end if;
  total_load:=total_load+cargo.base_quantity*factor;
 end loop;
 if total_load>v.capacity_quantity then raise exception 'vehicle_actual_cargo_capacity_exceeded' using errcode='23514';end if;
end $body$;

revoke all on function private.assert_vehicle_actual_load(uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;

-- "Lập phiếu giao": how much of each line of the order each active truck can carry, in the unit the line was sold in
-- ("xe 4 tấn ≈ 80 bao"). Null when no conversion links the line's goods to the truck's unit.
create or replace function public.vehicle_capacity_by_order(target_sales_order_id uuid)
returns table(vehicle_id uuid, sales_order_line_id uuid, capacity_in_line_unit numeric)
language plpgsql stable security definer set search_path = '' as $function$
declare branch uuid;
begin
  select o.branch_id into branch from public.sales_orders o where o.id = target_sales_order_id;
  if branch is null or auth.uid() is null or not (private.has_permission(branch, 'delivery.create') or private.has_permission(branch, 'delivery.assign')
    or private.has_permission(branch, 'delivery.read')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select v.id, l.id, case when f.factor is null or f.factor <= 0 then null
      else trunc(v.capacity_quantity / (f.factor * l.conversion_numerator / l.conversion_denominator), 6) end
    from public.vehicles v cross join public.sales_order_lines l
    cross join lateral (select private.capacity_factor(l.material_id, l.base_uom_id, v.capacity_uom_id, now()) as factor) f
    where v.branch_id = branch and v.active and v.capacity_quantity is not null and v.capacity_uom_id is not null
      and l.sales_order_id = target_sales_order_id
    order by v.code, l.line_number;
end
$function$;

revoke all on function public.vehicle_capacity_by_order(uuid) from public, anon;

grant execute on function public.vehicle_capacity_by_order(uuid) to authenticated;

-- "Lộ trình": the planned goods of the chosen deliveries in the truck's unit, through the same conversions as the check on
-- assignment. Null when some goods cannot be converted to the truck's unit (or the truck has no capacity unit).
create or replace function public.vehicle_load_for_deliveries(target_vehicle_id uuid, target_delivery_ids uuid[])
returns numeric
language plpgsql stable security definer set search_path = '' as $function$
declare
  vehicle public.vehicles%rowtype;
  item record;
  factor numeric;
  total numeric := 0;
begin
  select * into vehicle from public.vehicles v where v.id = target_vehicle_id;
  if vehicle.id is null or auth.uid() is null or not (private.has_permission(vehicle.branch_id, 'delivery.assign')
    or private.has_permission(vehicle.branch_id, 'delivery.read')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if vehicle.capacity_uom_id is null or coalesce(cardinality(target_delivery_ids), 0) not between 1 and 50 then return null; end if;
  for item in select l.material_id, l.base_uom_id, l.planned_base_quantity from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
    where l.delivery_id = any(target_delivery_ids) and d.branch_id = vehicle.branch_id loop
    factor := private.capacity_factor(item.material_id, item.base_uom_id, vehicle.capacity_uom_id, now());
    if factor is null then return null; end if;
    total := total + item.planned_base_quantity * factor;
  end loop;
  return total;
end
$function$;

revoke all on function public.vehicle_load_for_deliveries(uuid, uuid[]) from public, anon;

grant execute on function public.vehicle_load_for_deliveries(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
