create or replace function public.save_catalog_record(
  kind text, target_id uuid, target_branch_id uuid, values_json jsonb,
  expected_json jsonb, change_reason text, operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
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
  when 'vehicles' then tab:='vehicles'; permission:='roles.manage'; allowed:=array['code','plate_number','capacity_quantity','capacity_uom_id','active'];
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
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values(auth.uid(),target_branch_id,'catalog.save',tab,target_id,operation_id,array(select jsonb_object_keys(values_json)),change_reason);
  return target_id;
end $$;

create or replace function public.save_branch_config(
  target_id uuid, source_branch_id uuid, values_json jsonb,
  expected_json jsonb, change_reason text, operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare old_row jsonb; field_name text; creator_role uuid; creator_employee uuid;
begin
  if auth.uid() is null or not private.has_permission(source_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_id is null or operation_id is null or jsonb_typeof(values_json) <> 'object'
    or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for field_name in select jsonb_object_keys(values_json) loop
    if field_name <> all(array['code', 'name', 'active']) then
      raise exception 'field_not_editable' using errcode = '42501';
    end if;
  end loop;
  select to_jsonb(b) into old_row from public.branches b where b.id = target_id for update;
  if old_row is null then
    if expected_json is not null then raise exception 'record_missing' using errcode = 'PT409'; end if;
    creator_employee := private.current_employee_id();
    select a.role_id into creator_role
    from public.employee_branch_access a
      join public.roles r on r.id = a.role_id and r.active
      join public.role_permissions rp on rp.role_id = a.role_id and rp.permission_code = 'roles.manage'
    where a.employee_id = creator_employee and a.branch_id = source_branch_id and a.active
    order by a.granted_at, a.id limit 1;
    if creator_role is null then raise exception 'admin_role_required' using errcode = '42501'; end if;
    insert into public.branches(id, code, name, active)
    values(target_id, values_json->>'code', values_json->>'name', coalesce((values_json->>'active')::boolean, true));
    insert into public.employee_branch_access(employee_id, branch_id, role_id)
    values(creator_employee, target_id, creator_role);
  else
    if not private.has_permission(target_id, 'roles.manage') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if expected_json is null then raise exception 'record_already_exists' using errcode = '23505'; end if;
    for field_name in select jsonb_object_keys(values_json) loop
      if not expected_json ? field_name or old_row->field_name is distinct from expected_json->field_name then
        raise exception 'stale_record_reload' using errcode = 'PT409';
      end if;
    end loop;
    if values_json->>'active' = 'false' and old_row->>'active' = 'true' and not exists (
      select 1 from public.employee_branch_access a join public.branches b on b.id = a.branch_id
      where a.employee_id = private.current_employee_id() and a.active and b.active and b.id <> target_id
    ) then raise exception 'last_accessible_branch' using errcode = '23514'; end if;
    update public.branches b set
      code = case when values_json ? 'code' then values_json->>'code' else b.code end,
      name = case when values_json ? 'name' then values_json->>'name' else b.name end,
      active = case when values_json ? 'active' then (values_json->>'active')::boolean else b.active end
    where b.id = target_id;
  end if;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type,
    entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), target_id, 'branch.save', 'branches', target_id, operation_id,
    array(select jsonb_object_keys(values_json)), change_reason);
  return target_id;
end $$;
revoke all on function public.save_branch_config(uuid,uuid,jsonb,jsonb,text,uuid) from public, anon;
grant execute on function public.save_branch_config(uuid,uuid,jsonb,jsonb,text,uuid) to authenticated;
