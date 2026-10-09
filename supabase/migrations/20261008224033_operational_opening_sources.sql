-- Operational opening sources. Never a receipt, stock count, payment or earning.
-- Internal operator commands only. No browser/Data API EXECUTE grant.
begin;

create table private.operational_import_receipts (
 operation_id uuid primary key,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 payload_hash text not null,
 actor_id uuid not null references auth.users(id),
 source_payload jsonb not null,
 result jsonb not null,
 recorded_at timestamptz not null default now()
);
revoke all on private.operational_import_receipts from public,anon,authenticated,service_role;
create trigger operational_import_receipts_immutable before update or delete
on private.operational_import_receipts for each row execute function private.reject_immutable_finance_mutation();

create table public.inventory_opening_sources (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id),
 warehouse_id uuid references public.warehouses(id),
 material_id uuid not null references public.materials(id),
 base_uom_id uuid not null references public.units_of_measure(id),
 location_kind text not null check(location_kind in ('WAREHOUSE','IN_TRANSIT')),
 custody_reference text,
 source_ref text not null check(char_length(source_ref) between 1 and 500),
 base_quantity numeric(20,6) not null check(base_quantity >= 0 and base_quantity::text not in ('NaN','Infinity','-Infinity')),
 unit_cost_vnd_per_base numeric(20,6) not null check(unit_cost_vnd_per_base > 0 and unit_cost_vnd_per_base::text not in ('NaN','Infinity','-Infinity')),
 value_vnd bigint not null check(value_vnd >= 0),
 cutover_at timestamptz not null,
 operation_id uuid not null,
 actor_id uuid not null references auth.users(id),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(branch_id,source_ref),
 check((location_kind='WAREHOUSE' and warehouse_id is not null and custody_reference is null)
    or (location_kind='IN_TRANSIT' and warehouse_id is null and length(custody_reference)>0)),
 check(value_vnd=round(base_quantity*unit_cost_vnd_per_base,0)),
 check((base_quantity=0 and value_vnd=0) or (base_quantity>0 and value_vnd>0))
);
alter table public.inventory_opening_sources enable row level security;
revoke all on public.inventory_opening_sources from public,anon,authenticated,service_role;
grant select on public.inventory_opening_sources to authenticated;
create policy inventory_opening_sources_read on public.inventory_opening_sources for select to authenticated
 using(private.has_permission(branch_id,'inventory.cost.read'));
create trigger inventory_opening_sources_immutable before update or delete on public.inventory_opening_sources
for each row execute function private.reject_immutable_finance_mutation();

alter table public.inventory_movements
 add column source_inventory_opening_id uuid unique references public.inventory_opening_sources(id),
 drop constraint inventory_movements_movement_type_check,
 add constraint inventory_movements_movement_type_check check(movement_type in
 ('PURCHASE_RECEIPT','DELIVERY_HANDOFF','DELIVERY_VERIFIED','STOCK_ADJUSTMENT','RETURN_TRANSFER','CUSTOMER_RETURN','TRANSIT_LOSS','OPENING')),
 drop constraint inventory_movements_check2,
 add constraint inventory_movements_check2 check(num_nonnulls(source_purchase_receipt_line_id,source_delivery_handoff_line_id,
 source_delivery_verification_line_id,source_stock_count_line_id,source_return_case_id,source_inventory_opening_id)=1),
 drop constraint inventory_movements_check,
 add constraint inventory_movements_check check(
 (location_kind='WAREHOUSE' and warehouse_id is not null and delivery_id is null)
 or (location_kind='IN_TRANSIT' and warehouse_id is null and
 ((delivery_id is not null and source_inventory_opening_id is null)
 or (delivery_id is null and source_inventory_opening_id is not null)))),
 add constraint inventory_movements_opening_kind check((movement_type='OPENING')=(source_inventory_opening_id is not null));

alter table public.opening_balance_sources
 add column historical_original_amount_vnd bigint,
 add column outstanding_at_cutover_vnd bigint,
 add column cutover_at timestamptz,
 add column source_document_ref text,
 add column operation_id uuid,
 add column import_payload jsonb,
 add constraint opening_import_amounts check(import_payload is null or
 (historical_original_amount_vnd is not null and outstanding_at_cutover_vnd is not null
 and historical_original_amount_vnd>=outstanding_at_cutover_vnd and outstanding_at_cutover_vnd>=0
 and cutover_at is not null and source_document_ref is not null and operation_id is not null));
create trigger operational_opening_source_immutable before update or delete on public.opening_balance_sources
for each row execute function private.reject_immutable_finance_mutation();

create table public.cash_opening_balances (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id),
 account_id uuid not null references public.finance_accounts(id),
 source_ref text not null check(length(source_ref)>0),
 amount_vnd bigint not null,
 cutover_at timestamptz not null,
 actor_id uuid not null references auth.users(id),
 operation_id uuid not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(branch_id,source_ref),
 unique(account_id,cutover_at)
);
alter table public.cash_opening_balances enable row level security;
revoke all on public.cash_opening_balances from public,anon,authenticated,service_role;
grant select on public.cash_opening_balances to authenticated;
create policy cash_opening_balances_read on public.cash_opening_balances for select to authenticated
 using(private.has_permission(branch_id,'finance.reconcile'));
create trigger cash_opening_balances_immutable before update or delete on public.cash_opening_balances
for each row execute function private.reject_immutable_finance_mutation();

create function private.post_inventory_opening(p jsonb, actor uuid, operation uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid=(p->>'branch_id')::uuid; m public.materials%rowtype; old public.inventory_opening_sources%rowtype; result uuid;
begin
 if actor is null or operation is null then raise exception 'opening_actor_operation_required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-opening:'||b||':'||(p->>'source_ref'),0));
 select * into old from public.inventory_opening_sources where branch_id=b and source_ref=p->>'source_ref';
 if found then
  if old.payload is distinct from p then raise exception 'opening_source_conflict' using errcode='PT409';end if;
  return old.id;
 end if;
 select * into strict m from public.materials where id=(p->>'material_id')::uuid;
 if m.base_uom_id is distinct from (p->>'base_uom_id')::uuid then raise exception 'opening_base_uom_mismatch' using errcode='23514';end if;
 if p->>'location_kind'='WAREHOUSE' and not exists(select 1 from public.warehouses where id=(p->>'warehouse_id')::uuid and branch_id=b)
 then raise exception 'opening_warehouse_branch_mismatch' using errcode='23514';end if;
 if (p->>'base_quantity')::numeric is distinct from (p->>'base_quantity')::numeric(20,6)
 or (p->>'unit_cost')::numeric is distinct from (p->>'unit_cost')::numeric(20,6)
 then raise exception 'opening_numeric_precision' using errcode='22003';end if;
 insert into public.inventory_opening_sources(branch_id,warehouse_id,material_id,base_uom_id,location_kind,custody_reference,
 source_ref,base_quantity,unit_cost_vnd_per_base,value_vnd,cutover_at,operation_id,actor_id,payload)
 values(b,(p->>'warehouse_id')::uuid,m.id,m.base_uom_id,p->>'location_kind',p->>'custody_reference',p->>'source_ref',
 (p->>'base_quantity')::numeric,(p->>'unit_cost')::numeric,(p->>'value_vnd')::bigint,(p->>'cutover_at')::timestamptz,operation,actor,p)
 returning id into result;
 if (p->>'base_quantity')::numeric>0 then
 insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,
 base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,source_inventory_opening_id,occurred_at,recorded_by)
 values(b,m.id,m.base_uom_id,p->>'location_kind',(p->>'warehouse_id')::uuid,'OPENING',
 (p->>'base_quantity')::numeric,(p->>'value_vnd')::bigint,(p->>'unit_cost')::numeric,result,(p->>'cutover_at')::timestamptz,actor);
 end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(actor,b,'inventory.opening.posted','inventory_opening',result,operation,'Explicit operational opening source');
 return result;
end $$;
revoke all on function private.post_inventory_opening(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function private.post_finance_opening(p jsonb, actor uuid, operation uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid=(p->>'branch_id')::uuid; party uuid=(p->>'party_id')::uuid;
 kind text=p->>'party_kind'; side_value text; old public.opening_balance_sources%rowtype; result uuid;
 outstanding bigint=(p->>'outstanding_vnd')::bigint;
begin
 if actor is null or operation is null then raise exception 'opening_actor_operation_required' using errcode='22023';end if;
 if kind not in ('CUSTOMER','SUPPLIER','EMPLOYEE') then raise exception 'opening_party_kind' using errcode='22023';end if;
 side_value=case when kind='CUSTOMER' then 'RECEIVABLE' else 'PAYABLE' end;
 perform pg_advisory_xact_lock(hashtextextended('finance-opening:'||b||':'||side_value||':'||(p->>'source_ref'),0));
 select * into old from public.opening_balance_sources where branch_id=b and side=side_value and source_ref=p->>'source_ref';
 if found then
  if old.import_payload is distinct from p then raise exception 'opening_source_conflict' using errcode='PT409';end if;
  return old.id;
 end if;
 if kind='CUSTOMER' and not exists(select 1 from public.customers where id=party and branch_id=b)
 or kind='SUPPLIER' and not exists(select 1 from public.suppliers where id=party and branch_id=b)
 or kind='EMPLOYEE' and not exists(select 1 from public.employee_branch_access where employee_id=party and branch_id=b)
 then raise exception 'opening_party_branch_mismatch' using errcode='23514';end if;
 if p->>'site_id' is not null and (kind<>'CUSTOMER' or not exists(
 select 1 from public.customer_sites where id=(p->>'site_id')::uuid and customer_id=party))
 then raise exception 'opening_site_customer_mismatch' using errcode='23514';end if;
 insert into public.opening_balance_sources(branch_id,side,source_ref,note,recorded_at,historical_original_amount_vnd,
 outstanding_at_cutover_vnd,cutover_at,source_document_ref,operation_id,import_payload)
 values(b,side_value,p->>'source_ref','Operational opening; historical original retained, no fake settlement',
 (p->>'cutover_at')::timestamptz,(p->>'original_vnd')::bigint,outstanding,(p->>'cutover_at')::timestamptz,
 p->>'document_ref',operation,p) returning id into result;
 -- Zero outstanding is retained as source history, not a forbidden zero obligation.
 if outstanding>0 then
  if kind='CUSTOMER' then
   insert into public.receivable_obligations(branch_id,customer_id,site_id,opening_source_id,original_amount_vnd,due_date,recorded_at,recorded_by)
   values(b,party,(p->>'site_id')::uuid,result,outstanding,(p->>'due_date')::date,(p->>'cutover_at')::timestamptz,actor);
  else
   insert into public.payable_obligations(branch_id,supplier_id,employee_id,opening_source_id,original_amount_vnd,due_date,recorded_at,recorded_by)
   values(b,case when kind='SUPPLIER' then party end,case when kind='EMPLOYEE' then party end,result,outstanding,
   (p->>'due_date')::date,(p->>'cutover_at')::timestamptz,actor);
  end if;
 end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(actor,b,'finance.opening.posted','opening_balance_source',result,operation,'Opening outstanding only; original source history retained');
 return result;
end $$;
revoke all on function private.post_finance_opening(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function private.post_cash_opening(p jsonb, actor uuid, operation uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid=(p->>'branch_id')::uuid; old public.cash_opening_balances%rowtype; result uuid;
begin
 if actor is null or operation is null then raise exception 'opening_actor_operation_required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-opening:'||b||':'||(p->>'source_ref'),0));
 select * into old from public.cash_opening_balances where branch_id=b and source_ref=p->>'source_ref';
 if found then
  if old.payload is distinct from p then raise exception 'opening_source_conflict' using errcode='PT409';end if;
  return old.id;
 end if;
 if not exists(select 1 from public.finance_accounts where id=(p->>'account_id')::uuid and branch_id=b)
 then raise exception 'opening_account_branch_mismatch' using errcode='23514';end if;
 insert into public.cash_opening_balances(branch_id,account_id,source_ref,amount_vnd,cutover_at,actor_id,operation_id,payload)
 values(b,(p->>'account_id')::uuid,p->>'source_ref',(p->>'amount_vnd')::bigint,(p->>'cutover_at')::timestamptz,actor,operation,p)
 returning id into result;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(actor,b,'cash.opening.posted','cash_opening_balance',result,operation,'Explicit cash opening; not a customer or supplier payment');
 return result;
end $$;
revoke all on function private.post_cash_opening(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create view public.cash_opening_read with(security_invoker=true) as
select id,branch_id,account_id,source_ref,amount_vnd::text amount_vnd,cutover_at from public.cash_opening_balances;
grant select on public.cash_opening_read to authenticated;
create view public.inventory_opening_transit_read with(security_invoker=true) as
select id,branch_id,material_id,base_uom_id,custody_reference,source_ref,
base_quantity::text base_quantity,value_vnd::text inventory_value_vnd,cutover_at
from public.inventory_opening_sources where location_kind='IN_TRANSIT';
grant select on public.inventory_opening_transit_read to authenticated;
commit;
