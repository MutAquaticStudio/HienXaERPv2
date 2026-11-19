-- D75 (Owner 14/11/2026): "Đặt dịch vụ" trên cổng khách. Phần 1: danh mục loại dịch vụ quyết định loại nào khách thấy.
-- * `portal_visible` (mặc định false): chỉ loại được bật mới hiện cho khách đặt. Bật / tắt ở Dịch vụ → Loại dịch vụ.
-- * `portal_group`: tên nhóm khách thấy (Chạc, Máy, Vận chuyển, Nhân công…); trống thì khách thấy nhóm "Khác".
-- * Khách thấy gộp theo TÊN trong cùng nhóm và chọn đơn vị tính (xe, xe cn to, ca, giờ…): mỗi lựa chọn là một loại dịch vụ
--   riêng, nên hai loại cùng tên đang hiện cho khách không được trùng đơn vị tính (chỉ mục duy nhất bên dưới).
-- * Validator lưu danh mục giống hệt bản 20261023150000, chỉ thêm hai cột vào danh sách được sửa của 'service_types'.
begin;

alter table public.service_types
  add column portal_visible boolean not null default false,
  add column portal_group text check (portal_group is null or char_length(trim(portal_group)) between 1 and 60);
create unique index service_types_portal_option_unique
  on public.service_types (branch_id, lower(trim(name)), lower(trim(unit_label)))
  where portal_visible and active;

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
  when 'service_types' then tab:='service_types'; permission:='service.manage'; allowed:=array['code','name','unit_label','default_price_vnd','resource_kind','portal_visible','portal_group','active'];
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
    -- FB9: "Ngừng dùng / Dùng lại" sends only `active`; the base unit is checked only when it is being saved.
    if tab='materials' and values_json ? 'base_uom_id' and values_json->>'base_uom_id' is distinct from old_row->>'base_uom_id' then raise exception 'base_unit_immutable' using errcode='22023'; end if;
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

notify pgrst, 'reload schema';
commit;
