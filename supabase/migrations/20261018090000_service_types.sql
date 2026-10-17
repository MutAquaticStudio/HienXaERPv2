-- FB4 D23 (Owner 17/10/2026): service catalogue. The owner keeps a list of the services the business sells, each with its
-- unit (trip, hour, day, shift, m³…), an optional default unit price and whether it needs a vehicle or a machine, e.g.
-- "Xe chở hàng — theo chuyến", "Máy xúc — theo giờ". Scheduling a service job picks a type from that list: the job keeps
-- a copy of the type's name, unit and price (the type may change later; the job does not). The billed amount at
-- verification is still entered by the verifier, the app only suggests billable quantity × unit price.
-- Saved and deleted through the existing catalog commands (kind 'service_types', permission service.manage like the
-- rest of the service module). Older jobs keep their free-text type and no price.
begin;

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  unit_label text not null check (char_length(trim(unit_label)) between 1 and 30),
  default_price_vnd bigint check (default_price_vnd is null or default_price_vnd >= 0),
  resource_kind text not null default 'NONE' check (resource_kind in ('NONE', 'VEHICLE', 'MACHINE')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, code)
);
alter table public.service_types enable row level security;
revoke all on public.service_types from anon, authenticated;
grant select on public.service_types to authenticated;
create policy service_types_select on public.service_types for select to authenticated
  using ((select private.has_permission(branch_id, 'service.read')) or (select private.has_permission(branch_id, 'service.manage')));

alter table public.service_jobs
  add column service_type_id uuid references public.service_types(id) on delete restrict,
  add column unit_price_vnd bigint check (unit_price_vnd is null or unit_price_vnd >= 0);
create index service_jobs_service_type_idx on public.service_jobs(service_type_id) where service_type_id is not null;

-- Catalog commands: service types are a branch catalogue managed with service.manage.
create or replace function private.master_command_allowed(command text,kind text,branch uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case
 when command='save_branch_config' then (kind is null or kind='branches') and private.has_permission(branch,'roles.manage')
 when command='save_customer_site_profile' then (kind is null or kind in('customers','sites')) and private.has_permission(branch,'customers.manage')
 when command='save_catalog_record' then case
  when kind in('materials','units','groups','conversions') then private.has_permission(branch,'catalog.manage')
  when kind in('warehouses','vehicles','machines') then private.has_permission(branch,'roles.manage')
  when kind='suppliers' then private.has_permission(branch,'suppliers.manage')
  when kind in('customers','sites') then private.has_permission(branch,'customers.manage')
  when kind='service_types' then private.has_permission(branch,'service.manage')
  when kind is null then private.has_permission(branch,'catalog.manage') or private.has_permission(branch,'roles.manage') or private.has_permission(branch,'suppliers.manage') or private.has_permission(branch,'customers.manage') or private.has_permission(branch,'service.manage')
  else false end
 else false end
$$;
revoke all on function private.master_command_allowed(text,text,uuid) from public,anon,authenticated,service_role;

-- Same validator as before (captured from save_catalog_record in 20261012081213), plus kind 'service_types'.
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
  when 'vehicles' then tab:='vehicles'; permission:='roles.manage'; allowed:=array['code','plate_number','capacity_quantity','capacity_uom_id','capacity_source_note','active'];
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
      if nullif(trim(values_json->>'capacity_source_note'),'') is null or length(trim(values_json->>'capacity_source_note')) not between 3 and 500
      then raise exception 'vehicle_capacity_evidence_required' using errcode='22023';end if;
    end if;
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

-- Same as 20261017160000, plus kind 'service_types' (a type a job uses stays: service_jobs points at it).
create or replace function public.delete_catalog_record(kind text, target_id uuid, target_branch_id uuid, change_reason text, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tab text;
  old_row jsonb;
  parent_branch uuid;
  hash text;
  receipt public.command_receipts%rowtype;
  label text;
begin
  -- Fixed table per kind; the table name never comes from the caller.
  tab := case kind
    when 'materials' then 'materials' when 'units' then 'units_of_measure' when 'groups' then 'material_groups'
    when 'customers' then 'customers' when 'suppliers' then 'suppliers' when 'sites' then 'customer_sites'
    when 'warehouses' then 'warehouses' when 'vehicles' then 'vehicles' when 'machines' then 'machines'
    when 'conversions' then 'material_uom_conversions' when 'service_types' then 'service_types' end;
  if tab is null then raise exception 'unsupported_catalog' using errcode = '22023'; end if;
  if auth.uid() is null or target_branch_id is null
    or not private.master_command_allowed((case when kind in ('customers', 'sites') then 'save_customer_site_profile' else 'save_catalog_record' end), kind, target_branch_id)
  then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_id is null or delete_catalog_record.operation_id is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 300 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  hash := private.command_payload_hash(jsonb_build_object('kind', kind, 'target', target_id, 'branch', target_branch_id, 'reason', trim(change_reason)));
  perform pg_advisory_xact_lock(hashtextextended(delete_catalog_record.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = delete_catalog_record.operation_id;
  if found then
    if receipt.command_name <> 'delete_catalog_record' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', tab) into old_row using target_id;
  if old_row is null then raise exception 'record_missing' using errcode = 'PT409'; end if;
  if tab in ('customers', 'suppliers', 'warehouses', 'vehicles', 'machines', 'service_types')
    and (old_row->>'branch_id')::uuid is distinct from target_branch_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if tab = 'customer_sites' then
    select c.branch_id into parent_branch from public.customers c where c.id = (old_row->>'customer_id')::uuid;
    if parent_branch is distinct from target_branch_id then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  -- The record's own set-up goes with it (selling units, prices, stock thresholds, a customer's sites and portal access,
  -- a supplier's purchase prices). Any of those already used by a document still blocks, and the subtransaction below
  -- then undoes every delete in it.
  begin
    if tab = 'materials' then
      delete from public.material_uom_conversions c where c.material_id = target_id;
      delete from public.pricing_rules r where r.material_id = target_id;
      delete from public.purchase_price_rules r where r.material_id = target_id;
      delete from public.inventory_stock_thresholds t where t.material_id = target_id;
    elsif tab = 'customers' then
      delete from public.pricing_rules r where r.customer_id = target_id;
      delete from public.customer_portal_memberships m where m.customer_id = target_id;
      delete from public.customer_sites s where s.customer_id = target_id;
    elsif tab = 'suppliers' then
      delete from public.purchase_price_rules r where r.supplier_id = target_id;
    elsif tab = 'material_groups' then
      delete from public.pricing_rules r where r.material_group_id = target_id;
    elsif tab = 'warehouses' then
      delete from public.inventory_stock_thresholds t where t.warehouse_id = target_id;
    end if;
    execute format('delete from public.%I t where t.id = $1', tab) using target_id;
  exception when foreign_key_violation then
    raise exception 'catalog_record_in_use' using errcode = '23503';
  end;

  -- The row is gone, so the audit reason keeps what it was.
  label := left(concat_ws(' ', old_row->>'code', coalesce(old_row->>'name', old_row->>'display_name', old_row->>'plate_number', old_row->>'symbol')), 150);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, 'catalog.delete', tab, target_id, delete_catalog_record.operation_id, array['deleted'],
    left(trim(change_reason) || ' · đã xóa ' || coalesce(nullif(label, ''), target_id::text), 500));
  insert into public.command_receipts values (delete_catalog_record.operation_id, auth.uid(), 'delete_catalog_record', hash, 'catalog_record', target_id, now());
  return target_id;
end
$function$;
revoke all on function public.delete_catalog_record(text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.delete_catalog_record(text, uuid, uuid, text, uuid) to authenticated;

-- Scheduling from the catalogue: same checks as create_service_job; the type decides the name, unit and price kept on
-- the job, and which resource may be attached (a type that needs no vehicle or machine takes neither).
create or replace function public.schedule_service_job(target_branch_id uuid, target_customer_id uuid, target_site_id uuid,
  target_service_type_id uuid, description text, scheduled_start timestamptz, scheduled_end timestamptz, planned_quantity numeric,
  target_sales_employee_id uuid, target_vehicle_id uuid, target_machine_id uuid, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  entity_id uuid;
  chosen_type public.service_types%rowtype;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'service.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_service_type_id is null or char_length(trim(coalesce(description, ''))) not between 3 and 500
    or scheduled_start is null or scheduled_end is null or scheduled_end <= scheduled_start or planned_quantity is null or planned_quantity <= 0
    or num_nonnulls(target_vehicle_id, target_machine_id) > 1 or schedule_service_job.operation_id is null then
    raise exception 'invalid_service_job' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'customer', target_customer_id, 'site', target_site_id,
    'type', target_service_type_id, 'description', trim(description), 'start', scheduled_start, 'end', scheduled_end, 'quantity', planned_quantity,
    'sales', target_sales_employee_id, 'vehicle', target_vehicle_id, 'machine', target_machine_id));
  perform pg_advisory_xact_lock(hashtextextended(schedule_service_job.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = schedule_service_job.operation_id;
  if found then
    if receipt.command_name <> 'schedule_service_job' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_exact_quantity(planned_quantity, false);

  select * into chosen_type from public.service_types t where t.id = target_service_type_id and t.branch_id = target_branch_id and t.active;
  if chosen_type.id is null then raise exception 'invalid_service_type' using errcode = '23503'; end if;
  if (chosen_type.resource_kind = 'NONE' and num_nonnulls(target_vehicle_id, target_machine_id) > 0)
    or (chosen_type.resource_kind = 'VEHICLE' and target_machine_id is not null)
    or (chosen_type.resource_kind = 'MACHINE' and target_vehicle_id is not null) then
    raise exception 'service_resource_mismatch' using errcode = '22023';
  end if;
  perform 1 from public.customers c join public.customer_sites s on s.customer_id = c.id
  where c.id = target_customer_id and c.branch_id = target_branch_id and c.active and s.id = target_site_id and s.active;
  if not found then raise exception 'invalid_customer_site' using errcode = '23503'; end if;
  if target_sales_employee_id is not null then
    perform 1 from public.employee_branch_access a where a.employee_id = target_sales_employee_id and a.branch_id = target_branch_id and a.active;
    if not found then raise exception 'invalid_sales_employee' using errcode = '23503'; end if;
  end if;
  if target_vehicle_id is not null then
    perform 1 from public.vehicles v where v.id = target_vehicle_id and v.branch_id = target_branch_id and v.active;
    if not found then raise exception 'invalid_vehicle' using errcode = '23503'; end if;
  end if;
  if target_machine_id is not null then
    perform 1 from public.machines m where m.id = target_machine_id and m.branch_id = target_branch_id and m.active;
    if not found then raise exception 'invalid_machine' using errcode = '23503'; end if;
  end if;

  insert into public.service_jobs(branch_id, job_number, customer_id, site_id, sales_employee_id, service_type, service_type_id, description,
    scheduled_start, scheduled_end, planned_quantity, unit_label, unit_price_vnd, vehicle_id, machine_id, created_by)
  values (target_branch_id,
    'SRV-' || to_char((scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.service_job_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, target_sales_employee_id, trim(chosen_type.name), chosen_type.id, trim(description),
    scheduled_start, scheduled_end, planned_quantity, trim(chosen_type.unit_label), chosen_type.default_price_vnd, target_vehicle_id, target_machine_id,
    (select auth.uid()))
  returning id into entity_id;
  insert into public.command_receipts values (schedule_service_job.operation_id, (select auth.uid()), 'schedule_service_job', payload_hash, 'service_job', entity_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), target_branch_id, 'service_job.created', 'service_job', entity_id, schedule_service_job.operation_id,
    array['schedule', 'planned_quantity', 'resources', 'service_type'], left('Loại dịch vụ: ' || chosen_type.name, 500));
  return entity_id;
end
$function$;
revoke all on function public.schedule_service_job(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, numeric, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.schedule_service_job(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, numeric, uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
