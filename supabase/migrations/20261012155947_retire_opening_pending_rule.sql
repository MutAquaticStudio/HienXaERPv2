-- Retire the opening-pending operational rule. Do not mutate historical states,
-- activation events, source ledgers, balances or imported evidence.
begin;

-- A new branch does not start an opening checklist or require activation.
drop trigger if exists operational_branch_initial_state on public.branches;

create or replace function private.require_operational_branch_access(b uuid) returns void
 language plpgsql security definer set search_path='' as $recording$
declare valid_start timestamptz; inserted uuid;
begin
 if b is null or not private.auth_actor_active() or not exists(
  select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.roles r on r.id=a.role_id and r.active join public.branches branch on branch.id=a.branch_id and branch.active
  where e.auth_user_id=auth.uid() and e.active and a.branch_id=b)
 then raise exception 'forbidden_operational_branch' using errcode='42501';end if;
 -- Keep an already recorded start. No writer changes the opening/activation state.
 if exists(select 1 from private.branch_recorded_operations where branch_id=b) then return;end if;
 select e.recorded_at into valid_start from private.branch_operational_states s
  join private.operational_state_events e on e.operation_id=s.activation_operation_id and e.branch_id=s.branch_id
  where s.branch_id=b and s.state='ACTIVE' and e.intent->>'action'='activate';
 insert into private.branch_recorded_operations(branch_id,started_at,started_by,basis)
 values(b,coalesce(valid_start,statement_timestamp()),auth.uid(),
  case when valid_start is null then 'FIRST_RECORDED_TRANSACTION' else 'EXISTING_ACTIVATION' end)
 on conflict(branch_id) do nothing returning branch_id into inserted;
 if inserted is not null then
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values(auth.uid(),b,'operations.recording_started','branch',b,b,array['recorded_operations_start']);
 end if;
end $recording$;
revoke all on function private.require_operational_branch_access(uuid) from public,anon,authenticated,service_role;

-- Keep old posting triggers/callers compatible, with branch/actor checks only.
create or replace function private.require_active_operations(b uuid) returns void
language sql security definer set search_path='' as $$
 select private.require_operational_branch_access(b)
$$;
revoke all on function private.require_active_operations(uuid) from public,anon,authenticated,service_role;

create or replace function private.operational_direct_purchase_draft_allocation_allowed(a jsonb) returns boolean
 language plpgsql security definer set search_path='' as $f$
declare draft_id uuid;
begin
 if a->>'supply_mode' is distinct from 'SUPPLIER_DIRECT'
 or a->>'warehouse_id' is not null or a->>'purchase_order_line_id' is null then return false;end if;
 -- Serialize against confirmation; the canonical draft editor already owns this row lock.
 select po.id into draft_id
 from public.purchase_order_lines pl
 join public.purchase_orders po on po.id=pl.purchase_order_id
 join public.sales_order_lines sl on sl.id=pl.linked_sales_order_line_id
 join public.sales_orders so on so.id=sl.sales_order_id
 where pl.id=(a->>'purchase_order_line_id')::uuid
 and po.state='DRAFT' and po.confirmed_at is null and po.cancelled_at is null
 and po.destination_type='CUSTOMER_SITE' and po.warehouse_id is null
 and po.branch_id=(a->>'branch_id')::uuid and so.branch_id=po.branch_id
 and so.id=po.source_sales_order_id and so.commercial_state in ('DRAFT','CONFIRMED')
 and so.customer_id=po.customer_id and so.site_id=po.site_id
 and sl.id=(a->>'sales_order_line_id')::uuid
 and sl.material_id=pl.material_id and sl.base_uom_id=pl.base_uom_id
 and (a->>'allocated_base_quantity')::numeric=pl.quantity*pl.conversion_numerator/pl.conversion_denominator
 for share of po;
 if draft_id is null then return false;end if;
 -- Even cancelled execution history excludes the draft exception; never rewrite source history.
 if exists(select 1 from public.purchase_receipts where purchase_order_id=draft_id)
 or exists(select 1 from public.supplier_fulfillments where purchase_order_id=draft_id)
 or exists(select 1 from public.delivery_lines dl
  join public.supply_allocations sa on sa.id=dl.supply_allocation_id
  join public.purchase_order_lines pl on pl.id=sa.purchase_order_line_id
  where pl.purchase_order_id=draft_id)
 then return false;end if;
 return true;
end $f$;
revoke all on function private.operational_direct_purchase_draft_allocation_allowed(jsonb) from public,anon,authenticated,service_role;

create or replace function private.register_operational_opening_package(
 package_id uuid,b uuid,run uuid,pkg jsonb,source_bytes bytea,manifest jsonb,actor uuid,
 recovery uuid,expires timestamptz,data_mode text
) returns text language plpgsql security definer set search_path='' as $f$
declare h text; item jsonb; existing private.operational_opening_packages%rowtype; actual text;
begin
 -- Legacy workflow metadata is created only for an explicitly requested historical import.
 insert into private.branch_operational_states(branch_id) values(b) on conflict(branch_id) do nothing;
 select state into actual from private.branch_operational_states where branch_id=b for update;
 if actual is distinct from 'PENDING_OPENING' then raise exception 'opening_requires_pending_state' using errcode='PT423';end if;
 if actor is null or run is null or package_id is null or pkg is null or source_bytes is null or manifest is null
 or jsonb_typeof(pkg) is distinct from 'object' or jsonb_typeof(manifest) is distinct from 'array'
 or jsonb_array_length(manifest)=0 or expires is null or expires<=clock_timestamp()
 or data_mode is null or data_mode not in ('REAL','QA_SYNTHETIC') then
  raise exception 'opening_package_invalid' using errcode='22023'; end if;
 if pkg->>'source_sha256' is distinct from encode(extensions.digest(source_bytes,'sha256'),'hex')
 then raise exception 'opening_source_hash_mismatch' using errcode='22023';end if;
 if not exists(select 1 from private.operational_recovery_checkpoints r where r.id=recovery
 and r.branch_id=b and r.verified_at<=clock_timestamp() and r.expires_at>=expires)
 then raise exception 'opening_recovery_not_verified' using errcode='42501';end if;
 for item in select value from jsonb_array_elements(manifest) loop
  if item->>'kind' is null or item->>'kind' not in ('INVENTORY','FINANCE','CASH')
  or jsonb_typeof(item->'payload') is distinct from 'object'
  or (item->'payload'->>'branch_id')::uuid is distinct from b
  or nullif(item->'payload'->>'source_ref','') is null
  then raise exception 'opening_manifest_scope_invalid' using errcode='22023';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(manifest)) <>
 (select count(distinct (m->>'kind',m->'payload'->>'source_ref')) from jsonb_array_elements(manifest) m)
 then raise exception 'opening_manifest_duplicate_source' using errcode='22023';end if;
 h=encode(extensions.digest(convert_to(pkg::text,'UTF8'),'sha256'),'hex');
 select * into existing from private.operational_opening_packages where branch_id=b and run_id=run;
 if found then
  if existing.id<>package_id or existing.package_payload<>pkg or existing.source_manifest<>manifest
   or existing.actor_id<>actor or existing.recovery_id<>recovery or existing.expires_at<>expires
   or existing.data_mode<>data_mode
  then raise exception 'opening_run_payload_conflict' using errcode='PT409';end if;
  return existing.package_sha256;
 end if;
 insert into private.operational_opening_packages(id,branch_id,run_id,package_sha256,source_sha256,
 package_payload,source_manifest,actor_id,recovery_id,expires_at,data_mode)
 values(package_id,b,run,h,pkg->>'source_sha256',pkg,manifest,actor,recovery,expires,data_mode);
 return h;
end $f$;
revoke all on function private.register_operational_opening_package(uuid,uuid,uuid,jsonb,bytea,jsonb,uuid,uuid,timestamptz,text) from public,anon,authenticated,service_role;

-- The public read reports access and historical quality, never an activation gate.
create or replace function public.operational_branch_state(target_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare scope jsonb; s private.branch_operational_states%rowtype;
begin
 if not private.auth_actor_active() or not exists(
  select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.roles r on r.id=a.role_id and r.active join public.branches b on b.id=a.branch_id and b.active
  where e.auth_user_id=auth.uid() and e.active and a.branch_id=target_branch_id)
 then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from private.branch_operational_states where branch_id=target_branch_id;
 scope:=private.branch_recording_scope(target_branch_id);
 return jsonb_build_object('state',scope->>'historical_quality','version',s.version,'canActivate',false,
  'reconciliationId',s.reconciliation_id,'postingAllowed',true,'historicalQuality',scope->>'historical_quality',
  'recordedOperationsSince',scope->'recorded_operations_since','businessTotalVerified',false);
end $$;
revoke all on function public.operational_branch_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.operational_branch_state(uuid) to authenticated;

-- Retired API: never create a fake activation or modify an old activation fact.
create or replace function public.activate_branch_operations(
 target_branch_id uuid,expected_version integer,recovery_accepted boolean,confirmation text,operation_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
begin raise exception 'manual_operational_activation_retired' using errcode='0A000';end $$;
revoke all on function public.activate_branch_operations(uuid,integer,boolean,text,uuid) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
