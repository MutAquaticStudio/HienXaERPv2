-- Branch-scoped operational gate. No opening import or business activation is authorized by this migration.
begin;

create table private.branch_operational_states (
 branch_id uuid primary key references public.branches(id),
 state text not null default 'PENDING_OPENING' check(state in ('PENDING_OPENING','READY_FOR_ACTIVATION','ACTIVE')),
 version integer not null default 0 check(version>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 reconciliation_id uuid,
 activation_operation_id uuid unique
);
create table private.operational_recovery_checkpoints (
 id uuid primary key,
 branch_id uuid not null references public.branches(id),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null,
 expires_at timestamptz not null,
 check(expires_at>verified_at)
);
create table private.operational_opening_packages (
 id uuid primary key,
 branch_id uuid not null references public.branches(id),
 run_id uuid not null,
 package_sha256 text not null check(package_sha256 ~ '^[a-f0-9]{64}$'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 package_payload jsonb not null check(jsonb_typeof(package_payload)='object'),
 source_manifest jsonb not null check(jsonb_typeof(source_manifest)='array' and jsonb_array_length(source_manifest)>0),
 actor_id uuid not null references auth.users(id),
 recovery_id uuid not null references private.operational_recovery_checkpoints(id),
 expires_at timestamptz not null,
 data_mode text not null check(data_mode in ('REAL','QA_SYNTHETIC')),
 status text not null default 'REGISTERED' check(status in ('REGISTERED','APPROVED','IMPORTED','RECONCILED')),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 recovery_accepted_at timestamptz,
 writer_txid xid8,
 result jsonb,
 unique(branch_id,run_id)
);
create table private.operational_opening_executions (
 package_id uuid not null references private.operational_opening_packages(id),
 transaction_id xid8 not null,
 primary key(package_id,transaction_id)
);
create table private.operational_opening_readbacks (
 id uuid primary key default extensions.gen_random_uuid(),
 package_id uuid not null unique references private.operational_opening_packages(id),
 reader_txid xid8 not null,
 snapshot_sha256 text not null,
 recorded_at timestamptz not null default now()
);
create table private.operational_state_events (
 operation_id uuid primary key,
 branch_id uuid not null references public.branches(id),
 actor_id uuid not null references auth.users(id),
 intent jsonb not null,
 recorded_at timestamptz not null default now()
);
alter table private.branch_operational_states enable row level security;
alter table private.operational_recovery_checkpoints enable row level security;
alter table private.operational_opening_packages enable row level security;
alter table private.operational_opening_executions enable row level security;
alter table private.operational_opening_readbacks enable row level security;
alter table private.operational_state_events enable row level security;
revoke all on private.branch_operational_states,private.operational_recovery_checkpoints,
 private.operational_opening_packages,private.operational_opening_executions,
 private.operational_opening_readbacks,private.operational_state_events from public,anon,authenticated,service_role;

insert into private.branch_operational_states(branch_id) select id from public.branches;

create function private.operational_owner(b uuid) returns boolean
language sql stable security definer set search_path='' as $f$
 select exists(select 1 from public.employees e
 join public.employee_branch_access a on a.employee_id=e.id and a.active
 join public.branches x on x.id=a.branch_id and x.active
 join public.roles r on r.id=a.role_id and r.active
 where e.auth_user_id=auth.uid() and e.active and a.branch_id=b and r.code='owner')
$f$;

create function private.initialize_operational_branch() returns trigger
language plpgsql security definer set search_path='' as $f$
begin
 insert into private.branch_operational_states(branch_id) values(new.id);
 return new;
end $f$;
create trigger operational_branch_initial_state after insert on public.branches
 for each row execute function private.initialize_operational_branch();

create function private.require_active_operations(b uuid) returns void
language plpgsql security definer set search_path='' as $f$
declare actual text;
begin
 select state into actual from private.branch_operational_states where branch_id=b for share;
 if actual is distinct from 'ACTIVE' then
  raise exception 'branch_not_operational: ordinary posting requires ACTIVE' using errcode='PT423';
 end if;
end $f$;

-- Root/definer ownership does not bypass this check. Opening authorization is a persisted capability,
-- accessible only through private operator entry points plus a separate authenticated Owner approval.
create function private.require_authorized_opening(b uuid,kind text,p jsonb) returns void
language plpgsql security definer set search_path='' as $f$
declare actual text;
begin
 select state into actual from private.branch_operational_states where branch_id=b for share;
 if actual is distinct from 'PENDING_OPENING' then
  raise exception 'opening_requires_pending_state' using errcode='PT423';
 end if;
 if not exists(
  select 1 from private.operational_opening_executions x
  join private.operational_opening_packages a on a.id=x.package_id
  join private.operational_recovery_checkpoints r on r.id=a.recovery_id and r.branch_id=a.branch_id
  where x.transaction_id=pg_current_xact_id() and a.branch_id=b
   and a.status='APPROVED' and a.approved_by is not null and a.approved_at is not null
   and a.actor_id=a.approved_by and a.recovery_accepted_at is not null
   and a.expires_at>clock_timestamp() and r.expires_at>clock_timestamp()
   and exists(select 1 from jsonb_array_elements(a.source_manifest) m
     where m->>'kind'=kind and m->'payload'=p)
 ) then raise exception 'opening_authorization_required' using errcode='42501'; end if;
end $f$;

-- The exact server-side manifest is immutable to business users. Registration alone is NOT approval.
create function private.register_operational_opening_package(
 package_id uuid,b uuid,run uuid,pkg jsonb,source_bytes bytea,manifest jsonb,actor uuid,
 recovery uuid,expires timestamptz,data_mode text
) returns text language plpgsql security definer set search_path='' as $f$
declare h text; item jsonb; existing private.operational_opening_packages%rowtype; actual text;
begin
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

create function public.approve_operational_opening_import(
 target_package_id uuid,expected_package_sha256 text,expected_state_version integer,
 recovery_accepted boolean,confirmation text,operation_id uuid
) returns uuid language plpgsql security definer set search_path='' as $f$
declare a private.operational_opening_packages%rowtype; s private.branch_operational_states%rowtype;
 intent jsonb; old private.operational_state_events%rowtype;
begin
 select * into a from private.operational_opening_packages where id=target_package_id;
 if not found or not private.operational_owner(a.branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from private.branch_operational_states where branch_id=a.branch_id for update;
 select * into a from private.operational_opening_packages where id=target_package_id for update;
 if expected_package_sha256 is distinct from a.package_sha256 or a.actor_id is distinct from auth.uid()
 or recovery_accepted is distinct from true
 or confirmation is distinct from 'FINAL OWNER IMPORT AUTHORIZATION:'||a.id::text||':'||a.package_sha256
 or operation_id is null then raise exception 'opening_owner_confirmation_invalid' using errcode='22023';end if;
 intent=jsonb_build_object('action','approve_opening','package',a.id,'hash',a.package_sha256,'version',expected_state_version);
 select * into old from private.operational_state_events e where e.operation_id=approve_operational_opening_import.operation_id;
 if found then
  if old.actor_id is distinct from auth.uid() or old.intent<>intent then raise exception 'operation_payload_conflict' using errcode='PT409';end if;
  return a.id;
 end if;
 if s.state is distinct from 'PENDING_OPENING' or s.version is distinct from expected_state_version
 or a.status<>'REGISTERED' or a.expires_at<=clock_timestamp()
 or not exists(select 1 from private.operational_recovery_checkpoints r where r.id=a.recovery_id
 and r.branch_id=a.branch_id and r.expires_at>clock_timestamp())
 then raise exception 'opening_approval_preconditions_failed' using errcode='PT409';end if;
 update private.operational_opening_packages set status='APPROVED',approved_by=auth.uid(),
 approved_at=clock_timestamp(),recovery_accepted_at=clock_timestamp() where id=a.id;
 insert into private.operational_state_events values(operation_id,a.branch_id,auth.uid(),intent,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(auth.uid(),a.branch_id,'operational.opening.authorized','operational_opening_package',a.id,operation_id,
 'Explicit package-bound FINAL OWNER IMPORT AUTHORIZATION; not business activation');
 return a.id;
end $f$;

create function private.begin_authorized_opening_import(
 package_id uuid,b uuid,run uuid,pkg jsonb,actor uuid
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare a private.operational_opening_packages%rowtype; actual text;
begin
 select state into actual from private.branch_operational_states where branch_id=b for share;
 select * into a from private.operational_opening_packages where id=package_id for update;
 if not found or a.branch_id is distinct from b or a.run_id is distinct from run
 or a.package_payload is distinct from pkg or a.actor_id is distinct from actor
 or a.approved_by is distinct from actor or a.approved_at is null or a.recovery_accepted_at is null
 then raise exception 'opening_authorization_binding_denied' using errcode='42501';end if;
 -- Exact committed retry is read-only. It never installs another write capability.
 if a.status in ('IMPORTED','RECONCILED') then return jsonb_build_object('completed',true,'result',a.result);end if;
 if actual is distinct from 'PENDING_OPENING' or a.status<>'APPROVED'
 or a.expires_at<=clock_timestamp()
 or not exists(select 1 from private.operational_recovery_checkpoints r where r.id=a.recovery_id and r.expires_at>clock_timestamp())
 then raise exception 'opening_authorization_unusable' using errcode='42501';end if;
 insert into private.operational_opening_executions(package_id,transaction_id)
 values(a.id,pg_current_xact_id()) on conflict do nothing;
 return jsonb_build_object('completed',false);
end $f$;

create function private.complete_authorized_opening_import(package_id uuid,result_value jsonb)
 returns void language plpgsql security definer set search_path='' as $f$
begin
 update private.operational_opening_packages a set status='IMPORTED',writer_txid=pg_current_xact_id(),result=result_value
 where a.id=package_id and a.status='APPROVED'
 and exists(select 1 from private.operational_opening_executions x
 where x.package_id=a.id and x.transaction_id=pg_current_xact_id());
 if not found then raise exception 'opening_execution_missing' using errcode='42501';end if;
end $f$;

create function private.verify_opening_source_snapshot(package_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $f$
declare a private.operational_opening_packages%rowtype; m jsonb; p jsonb; actual jsonb;
 source_id uuid; qty numeric; value_total bigint; n integer; snapshot jsonb='[]'::jsonb;
begin
 select * into strict a from private.operational_opening_packages where id=package_id;
 for m in select value from jsonb_array_elements(a.source_manifest) loop
  p=m->'payload'; actual=null;source_id=null;
  if m->>'kind'='INVENTORY' then
   execute 'select id,payload from public.inventory_opening_sources where branch_id=$1 and source_ref=$2'
   into source_id,actual using a.branch_id,p->>'source_ref';
   if actual is distinct from p then raise exception 'opening_inventory_readback_mismatch' using errcode='PT409';end if;
   execute 'select count(*)::int,coalesce(sum(base_quantity_delta),0),coalesce(sum(inventory_value_delta_vnd),0)::bigint from public.inventory_movements where source_inventory_opening_id=$1'
   into n,qty,value_total using source_id;
   if n<>(case when (p->>'base_quantity')::numeric>0 then 1 else 0 end)
   or qty<>(p->>'base_quantity')::numeric or value_total<>(p->>'value_vnd')::bigint
   then raise exception 'opening_inventory_reconciliation_failed' using errcode='PT409';end if;
  elsif m->>'kind'='FINANCE' then
   select id,to_jsonb(t)->'import_payload' into source_id,actual from public.opening_balance_sources t
   where branch_id=a.branch_id and source_ref=p->>'source_ref'
   and side=case when p->>'party_kind'='CUSTOMER' then 'RECEIVABLE' else 'PAYABLE' end;
   if actual is distinct from p then raise exception 'opening_finance_readback_mismatch' using errcode='PT409';end if;
   if p->>'party_kind'='CUSTOMER' then
    select count(*)::int,coalesce(sum(original_amount_vnd),0)::bigint into n,value_total
    from public.receivable_obligations where opening_source_id=source_id;
   else
    select count(*)::int,coalesce(sum(original_amount_vnd),0)::bigint into n,value_total
    from public.payable_obligations where opening_source_id=source_id;
   end if;
   if n<>(case when (p->>'outstanding_vnd')::bigint>0 then 1 else 0 end)
   or value_total<>(p->>'outstanding_vnd')::bigint
   then raise exception 'opening_finance_reconciliation_failed' using errcode='PT409';end if;
  elsif m->>'kind'='CASH' then
   execute 'select id,payload from public.cash_opening_balances where branch_id=$1 and source_ref=$2'
   into source_id,actual using a.branch_id,p->>'source_ref';
   if actual is distinct from p then raise exception 'opening_cash_readback_mismatch' using errcode='PT409';end if;
  else raise exception 'unsupported_opening_domain' using errcode='22023';end if;
  snapshot=snapshot||jsonb_build_array(jsonb_build_object('source_id',source_id,'kind',m->>'kind','payload',actual));
 end loop;
 return snapshot;
end $f$;

create function private.record_independent_opening_readback(package_id uuid) returns uuid
 language plpgsql security definer set search_path='' as $f$
declare a private.operational_opening_packages%rowtype; snapshot jsonb; result_id uuid;
begin
 select * into strict a from private.operational_opening_packages where id=package_id for update;
 if a.status not in ('IMPORTED','RECONCILED') or a.writer_txid is null or a.writer_txid=pg_current_xact_id()
 then raise exception 'independent_committed_readback_required' using errcode='42501';end if;
 snapshot=private.verify_opening_source_snapshot(a.id);
 insert into private.operational_opening_readbacks(package_id,reader_txid,snapshot_sha256)
 values(a.id,pg_current_xact_id(),encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'))
 on conflict on constraint operational_opening_readbacks_package_id_key do nothing;
 select id into result_id from private.operational_opening_readbacks where operational_opening_readbacks.package_id=a.id;
 return result_id;
end $f$;

create function private.mark_operational_ready(package_id uuid,readback_id uuid,expected_version integer)
 returns void language plpgsql security definer set search_path='' as $f$
declare a private.operational_opening_packages%rowtype; s private.branch_operational_states%rowtype; snapshot jsonb;
begin
 select * into strict a from private.operational_opening_packages where id=package_id;
 select * into s from private.branch_operational_states where branch_id=a.branch_id for update;
 select * into strict a from private.operational_opening_packages where id=package_id for update;
 if s.state is distinct from 'PENDING_OPENING' or s.version is distinct from expected_version
 or a.status<>'IMPORTED' or a.recovery_accepted_at is null or a.approved_by is null
 or not exists(select 1 from private.operational_recovery_checkpoints r where r.id=a.recovery_id and r.expires_at>clock_timestamp())
 then raise exception 'operational_ready_preconditions_failed' using errcode='PT409';end if;
 snapshot=private.verify_opening_source_snapshot(a.id);
 if not exists(select 1 from private.operational_opening_readbacks r where r.id=readback_id
 and r.package_id=a.id and r.reader_txid<>a.writer_txid
 and r.snapshot_sha256=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'))
 then raise exception 'operational_reconciliation_required' using errcode='42501';end if;
 update private.branch_operational_states set state='READY_FOR_ACTIVATION',version=version+1,
 updated_at=clock_timestamp(),updated_by=a.approved_by,reconciliation_id=readback_id where branch_id=a.branch_id;
 update private.operational_opening_packages set status='RECONCILED' where id=a.id;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(a.approved_by,a.branch_id,'operational.opening.reconciled','branch',a.branch_id,readback_id,'Independent committed source and ledger readback; ordinary posting remains blocked');
end $f$;

create function public.activate_branch_operations(
 target_branch_id uuid,expected_version integer,recovery_accepted boolean,confirmation text,operation_id uuid
) returns uuid language plpgsql security definer set search_path='' as $f$
declare s private.branch_operational_states%rowtype; old private.operational_state_events%rowtype; intent jsonb;
begin
 if not private.operational_owner(target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 if recovery_accepted is distinct from true or operation_id is null
 or confirmation is distinct from 'ACTIVATE:'||target_branch_id::text||':'||expected_version::text
 then raise exception 'operational_activation_confirmation_required' using errcode='22023';end if;
 select * into s from private.branch_operational_states where branch_id=target_branch_id for update;
 intent=jsonb_build_object('action','activate','branch',target_branch_id,'version',expected_version);
 select * into old from private.operational_state_events e where e.operation_id=activate_branch_operations.operation_id;
 if found then
  if old.actor_id is distinct from auth.uid() or old.intent<>intent then raise exception 'operation_payload_conflict' using errcode='PT409';end if;
  return target_branch_id;
 end if;
 if s.state is distinct from 'READY_FOR_ACTIVATION' or s.version is distinct from expected_version
 or not exists(select 1 from private.operational_opening_readbacks r
 join private.operational_opening_packages a on a.id=r.package_id
 join private.operational_recovery_checkpoints c on c.id=a.recovery_id
 where r.id=s.reconciliation_id and a.branch_id=target_branch_id and a.status='RECONCILED'
 and a.recovery_accepted_at is not null and c.expires_at>clock_timestamp())
 then raise exception 'operational_activation_preconditions_failed' using errcode='PT409';end if;
 update private.branch_operational_states set state='ACTIVE',version=version+1,updated_by=auth.uid(),
 updated_at=clock_timestamp(),activation_operation_id=operation_id where branch_id=target_branch_id;
 insert into private.operational_state_events values(operation_id,target_branch_id,auth.uid(),intent,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(auth.uid(),target_branch_id,'operational.branch.activated','branch',target_branch_id,operation_id,
 'Explicit Owner activation after accepted opening reconciliation and recovery');
 return target_branch_id;
end $f$;

create function public.operational_branch_state(target_branch_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $f$
declare s private.branch_operational_states%rowtype;
begin
 if not exists(select 1 from public.employees e join public.employee_branch_access a
 on a.employee_id=e.id and a.active join public.roles r on r.id=a.role_id and r.active
 join public.branches b on b.id=a.branch_id and b.active
 where e.auth_user_id=auth.uid() and e.active and a.branch_id=target_branch_id)
 then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from private.branch_operational_states where branch_id=target_branch_id;
 return jsonb_build_object('state',s.state,'version',s.version,
 'canActivate',s.state='READY_FOR_ACTIVATION' and private.operational_owner(target_branch_id),
 'reconciliationId',s.reconciliation_id);
end $f$;

-- Defense at table boundaries covers privileged RPCs and direct-table writes without replacing RBAC.
create function private.enforce_operational_write() returns trigger
 language plpgsql security definer set search_path='' as $f$
declare row_value jsonb; previous jsonb; b uuid; p jsonb; kind text; parent_id uuid;
begin
 row_value=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous=case when tg_op='UPDATE' then to_jsonb(old) else null end;
 if tg_op='UPDATE' and row_value->>'branch_id' is distinct from previous->>'branch_id'
 then raise exception 'operational_branch_reassignment_forbidden' using errcode='42501';end if;
 b=(row_value->>'branch_id')::uuid;
 if tg_table_name='sales_orders' and row_value->>'commercial_state' in ('DRAFT','CANCELLED')
 and (tg_op<>'UPDATE' or previous->>'commercial_state' in ('DRAFT','CANCELLED')) then return new;end if;
 if tg_table_name='purchase_orders' and row_value->>'state' in ('DRAFT','CANCELLED')
 and (tg_op<>'UPDATE' or previous->>'state' in ('DRAFT','CANCELLED')) then return new;end if;
 if tg_table_name='expenses' and row_value->>'approval_state'='DRAFT'
 and (tg_op<>'UPDATE' or previous->>'approval_state'='DRAFT') then return new;end if;
 if tg_table_name='stock_counts' and row_value->>'state'<>'APPROVED'
 and (tg_op<>'UPDATE' or previous->>'state'<>'APPROVED') then return new;end if;
 if b is null then
  if tg_table_name in ('payment_allocations') then select branch_id into b from public.payments where id=(row_value->>'payment_id')::uuid;
  elsif tg_table_name='receivable_adjustments' then select branch_id into b from public.receivable_obligations where id=(row_value->>'obligation_id')::uuid;
  elsif tg_table_name='payable_adjustments' then select branch_id into b from public.payable_obligations where id=(row_value->>'obligation_id')::uuid;
  elsif tg_table_name in ('delivery_handoffs','delivery_verifications') then select branch_id into b from public.deliveries where id=(row_value->>'delivery_id')::uuid;
  elsif tg_table_name='delivery_handoff_lines' then select d.branch_id into b from public.delivery_handoffs h join public.deliveries d on d.id=h.delivery_id where h.id=(row_value->>'delivery_handoff_id')::uuid;
  elsif tg_table_name='delivery_verification_lines' then select d.branch_id into b from public.delivery_verifications v join public.deliveries d on d.id=v.delivery_id where v.id=(row_value->>'delivery_verification_id')::uuid;
  elsif tg_table_name='purchase_receipt_lines' then select branch_id into b from public.purchase_receipts where id=(row_value->>'purchase_receipt_id')::uuid;
  elsif tg_table_name='supplier_fulfillment_lines' then select branch_id into b from public.supplier_fulfillments where id=(row_value->>'supplier_fulfillment_id')::uuid;
  elsif tg_table_name='work_item_verifications' then select branch_id into b from public.work_items where id=(row_value->>'work_item_id')::uuid;
  elsif tg_table_name='service_verifications' then select branch_id into b from public.service_jobs where id=(row_value->>'service_job_id')::uuid;
  end if;
 end if;
 -- Opening records always need a consumed-per-run manifest capability, even if SQL is owned by postgres.
 if tg_table_name in ('inventory_opening_sources','opening_balance_sources','cash_opening_balances') then
  if tg_op<>'INSERT' then raise exception 'opening_history_immutable' using errcode='42501';end if;
  p=coalesce(row_value->'payload',row_value->'import_payload');
  kind=case tg_table_name when 'inventory_opening_sources' then 'INVENTORY' when 'cash_opening_balances' then 'CASH' else 'FINANCE' end;
  perform private.require_authorized_opening(b,kind,p);
 elsif tg_table_name='inventory_movements' and row_value->>'movement_type'='OPENING' then
  parent_id=(row_value->>'source_inventory_opening_id')::uuid;
  if parent_id is null then raise exception 'opening_source_required' using errcode='42501';end if;
  execute 'select payload from public.inventory_opening_sources where id=$1 and branch_id=$2' into p using parent_id,b;
  perform private.require_authorized_opening(b,'INVENTORY',p);
  if tg_op<>'INSERT' or row_value->>'location_kind' is distinct from p->>'location_kind'
  or (row_value->>'material_id')::uuid is distinct from (p->>'material_id')::uuid
  or (row_value->>'base_uom_id')::uuid is distinct from (p->>'base_uom_id')::uuid
  or (row_value->>'warehouse_id')::uuid is distinct from (p->>'warehouse_id')::uuid
  or (row_value->>'base_quantity_delta')::numeric is distinct from (p->>'base_quantity')::numeric
  or (row_value->>'inventory_value_delta_vnd')::bigint is distinct from (p->>'value_vnd')::bigint
  then raise exception 'opening_movement_scope_denied' using errcode='42501';end if;
 elsif tg_table_name in ('receivable_obligations','payable_obligations') and row_value->>'opening_source_id' is not null then
  select to_jsonb(s)->'import_payload' into p from public.opening_balance_sources s
  where id=(row_value->>'opening_source_id')::uuid and branch_id=b;
  perform private.require_authorized_opening(b,'FINANCE',p);
  if tg_op<>'INSERT' or (row_value->>'original_amount_vnd')::bigint is distinct from (p->>'outstanding_vnd')::bigint
  or (tg_table_name='receivable_obligations' and (
   p->>'party_kind'<>'CUSTOMER' or (row_value->>'customer_id')::uuid is distinct from (p->>'party_id')::uuid
   or (row_value->>'site_id')::uuid is distinct from (p->>'site_id')::uuid
   or row_value->>'delivery_verification_id' is not null or row_value->>'service_verification_id' is not null))
  or (tg_table_name='payable_obligations' and (
   p->>'party_kind' not in ('SUPPLIER','EMPLOYEE')
   or coalesce(row_value->>'supplier_id',row_value->>'employee_id') is distinct from p->>'party_id'
   or row_value->>'purchase_receipt_id' is not null or row_value->>'supplier_fulfillment_id' is not null
   or row_value->>'expense_id' is not null or row_value->>'earning_event_id' is not null))
  then raise exception 'opening_obligation_scope_denied' using errcode='42501';end if;
 else perform private.require_active_operations(b);
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $f$;

create function private.install_operational_posting_gate() returns void
 language plpgsql security definer set search_path='' as $f$
declare t text;
begin
 foreach t in array array[
 'sales_orders','purchase_orders','supply_allocations','credit_commitments','inventory_reservations',
 'inventory_movements','purchase_receipts','purchase_receipt_lines','supplier_fulfillments','supplier_fulfillment_lines',
 'delivery_handoffs','delivery_handoff_lines','delivery_verifications','delivery_verification_lines',
 'revenue_entries','direct_cost_entries','receivable_obligations','payable_obligations',
 'receivable_adjustments','payable_adjustments','payments','payment_allocations','advances',
 'earning_events','work_item_verifications','service_verifications','expenses','stock_counts',
 'opening_balance_sources','inventory_opening_sources','cash_opening_balances'
 ] loop
  if to_regclass('public.'||t) is not null then
   execute format('create trigger operational_posting_guard before insert or update or delete on public.%I for each row execute function private.enforce_operational_write()',t);
  end if;
 end loop;
end $f$;
select private.install_operational_posting_gate();

-- Optional opening foundation is deliberately not deployed to Production by this migration.
-- If it is installed later, its new source tables MUST gain the same triggers before any authorized run.
create function private.assert_operational_opening_writers_protected() returns void
 language plpgsql security definer set search_path='' as $f$
declare t text;
begin
 foreach t in array array['inventory_opening_sources','cash_opening_balances','opening_balance_sources','inventory_movements','receivable_obligations','payable_obligations'] loop
  if not exists(select 1 from pg_trigger g where g.tgrelid=to_regclass('public.'||t) and g.tgname='operational_posting_guard'
   and g.tgenabled='O' and g.tgfoid='private.enforce_operational_write()'::regprocedure)
  then raise exception 'opening_gate_installation_required' using errcode='42501';end if;
 end loop;
end $f$;

do $lockdown$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in (
 'operational_owner','initialize_operational_branch','require_active_operations','require_authorized_opening',
 'register_operational_opening_package','begin_authorized_opening_import','complete_authorized_opening_import',
 'verify_opening_source_snapshot','record_independent_opening_readback','mark_operational_ready',
 'enforce_operational_write','install_operational_posting_gate','assert_operational_opening_writers_protected')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $lockdown$;
revoke all on function public.operational_branch_state(uuid),
 public.approve_operational_opening_import(uuid,text,integer,boolean,text,uuid),
 public.activate_branch_operations(uuid,integer,boolean,text,uuid) from public,anon,service_role;
grant execute on function public.operational_branch_state(uuid),
 public.approve_operational_opening_import(uuid,text,integer,boolean,text,uuid),
 public.activate_branch_operations(uuid,integer,boolean,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
