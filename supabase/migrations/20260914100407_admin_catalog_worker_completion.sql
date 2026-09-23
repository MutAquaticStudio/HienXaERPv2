-- Preserve the established safe payload; correct its source-field mapping.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.worker_work_item_payload(uuid)'::regprocedure);
  definition := replace(definition, '''title'', coalesce(service_json->>''title''', '''title'', coalesce(nullif(work_json->>''title'', ''''), service_json->>''title''');
  definition := replace(definition, 'coalesce(service_json->>''scheduled_start''', 'coalesce(work_json->>''scheduled_start'', service_json->>''scheduled_start''');
  definition := replace(definition, 'coalesce(service_json->>''scheduled_end''', 'coalesce(work_json->>''scheduled_end'', service_json->>''scheduled_end''');
  execute definition;
end $$;

-- Keep one canonical assignment implementation, with additional boundary guards.
alter function public.assign_employee_role(uuid,uuid,uuid,text,uuid) set schema private;
revoke all on function private.assign_employee_role(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
create function public.assign_employee_role(target_employee_id uuid,target_branch_id uuid,target_role_id uuid,change_reason text,operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id,'roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if target_employee_id = private.current_employee_id() then raise exception 'self_access_change_forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.role_permissions p where p.role_id=target_role_id and not private.has_permission(target_branch_id,p.permission_code)) then raise exception 'role_exceeds_actor_permissions' using errcode='42501'; end if;
  perform 1 from public.employees where id=target_employee_id for update;
  return private.assign_employee_role(target_employee_id,target_branch_id,target_role_id,change_reason,operation_id);
end $$;
revoke all on function public.assign_employee_role(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.assign_employee_role(uuid,uuid,uuid,text,uuid) to authenticated;

create function public.revoke_employee_access(target_access_id uuid,change_reason text,operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.employee_branch_access%rowtype;
begin
  select * into a from public.employee_branch_access where id=target_access_id for update;
  if auth.uid() is null or a.id is null or not private.has_permission(a.branch_id,'roles.manage') or a.employee_id=private.current_employee_id() then raise exception 'forbidden' using errcode='42501'; end if;
  if char_length(trim(coalesce(change_reason,''))) not between 3 and 500 then raise exception 'reason_required' using errcode='22023'; end if;
  if not a.active then return a.id; end if;
  update public.employee_branch_access set active=false,revoked_at=now() where id=a.id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values(auth.uid(),a.branch_id,'employee.access.revoke','employee_branch_access',a.id,operation_id,array['active'],change_reason);
  return a.id;
end $$;
revoke all on function public.revoke_employee_access(uuid,text,uuid) from public,anon;
grant execute on function public.revoke_employee_access(uuid,text,uuid) to authenticated;

-- Bounded catalog writer. Table and field names are exclusively server allowlists.
create function public.save_catalog_record(kind text,target_id uuid,target_branch_id uuid,values_json jsonb,expected_json jsonb,change_reason text,operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    if tab in ('customers','suppliers') and (old_row->>'branch_id')::uuid<>target_branch_id then raise exception 'forbidden' using errcode='42501'; end if;
    if tab='customer_sites' then
      select branch_id into parent_branch from public.customers where id=(old_row->>'customer_id')::uuid;
      if parent_branch is distinct from target_branch_id or values_json->>'customer_id' is distinct from old_row->>'customer_id' then raise exception 'site_customer_immutable' using errcode='42501'; end if;
    end if;
    for k in select jsonb_object_keys(values_json) loop
      if not expected_json ? k or old_row->k is distinct from expected_json->k then raise exception 'stale_record_reload' using errcode='40001'; end if;
    end loop;
    if tab='materials' and values_json->>'base_uom_id' is distinct from old_row->>'base_uom_id' then raise exception 'base_unit_immutable' using errcode='22023'; end if;
    if tab='material_uom_conversions' and (values_json - 'active') <> (expected_json - 'active') then raise exception 'create_new_conversion_version' using errcode='22023'; end if;
  elsif expected_json is not null then raise exception 'record_missing' using errcode='40001';
  end if;
  payload:=values_json||jsonb_build_object('id',target_id);
  if tab in ('customers','suppliers') then payload:=payload||jsonb_build_object('branch_id',target_branch_id); end if;
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
revoke all on function public.save_catalog_record(text,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.save_catalog_record(text,uuid,uuid,jsonb,jsonb,text,uuid) to authenticated;
