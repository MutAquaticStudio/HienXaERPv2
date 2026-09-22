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
      if not expected_json ? k or old_row->k is distinct from expected_json->k then raise exception 'stale_record_reload' using errcode='PT409'; end if;
    end loop;
    if tab='materials' and values_json->>'base_uom_id' is distinct from old_row->>'base_uom_id' then raise exception 'base_unit_immutable' using errcode='22023'; end if;
    if tab='material_uom_conversions' and (values_json - 'active') <> (expected_json - 'active') then raise exception 'create_new_conversion_version' using errcode='22023'; end if;
  elsif expected_json is not null then raise exception 'record_missing' using errcode='PT409';
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

create or replace function public.create_supplier_quick(
  target_branch_id uuid, supplier_code text, supplier_name text,
  supplier_phone text, operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare normalized_code text; hash text; receipt public.command_receipts%rowtype; supplier_id uuid;
begin
  if not (private.has_permission(target_branch_id, 'suppliers.manage') or private.has_permission(target_branch_id, 'purchasing.create')) then raise exception 'forbidden' using errcode = '42501'; end if;
  normalized_code := upper(trim(supplier_code));
  if normalized_code !~ '^[A-Z0-9_-]{2,32}$' or char_length(trim(supplier_name)) < 2 then raise exception 'supplier_invalid' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'code', normalized_code, 'name', trim(supplier_name), 'phone', nullif(trim(supplier_phone), '')));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_supplier_quick.operation_id;
  if found then if receipt.command_name <> 'create_supplier_quick' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.suppliers(branch_id, code, name, phone)
  values (target_branch_id, normalized_code, trim(supplier_name), nullif(trim(supplier_phone), ''))
  on conflict (branch_id, code) do nothing
  returning id into supplier_id;
  if supplier_id is null then raise exception 'supplier_code_exists' using errcode = '23505'; end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_supplier_quick', hash, 'supplier', supplier_id, now());
  return supplier_id;
end $$;
