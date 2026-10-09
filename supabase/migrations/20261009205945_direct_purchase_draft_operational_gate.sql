-- OP_GATE_DIRECT_PO_DRAFT_01: preserve safe direct-purchase planning without permitting posting.
begin;

create function private.operational_direct_purchase_draft_allocation_allowed(a jsonb) returns boolean
 language plpgsql security definer set search_path='' as $f$
declare branch_state text; draft_id uuid;
begin
 if a->>'supply_mode' is distinct from 'SUPPLIER_DIRECT'
 or a->>'warehouse_id' is not null or a->>'purchase_order_line_id' is null then return false;end if;
 select state into branch_state from private.branch_operational_states
 where branch_id=(a->>'branch_id')::uuid for share;
 if branch_state is null or branch_state not in ('PENDING_OPENING','READY_FOR_ACTIVATION') then return false;end if;
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
revoke all on function private.operational_direct_purchase_draft_allocation_allowed(jsonb)
 from public,anon,authenticated,service_role;

create or replace function private.enforce_operational_write() returns trigger
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
 if tg_table_name='supply_allocations'
 and (tg_op<>'UPDATE' or
  (row_value-array['allocated_base_quantity','version','updated_at'])
  is not distinct from (previous-array['allocated_base_quantity','version','updated_at']))
 and private.operational_direct_purchase_draft_allocation_allowed(row_value) then
  if tg_op='DELETE' then return old;end if;
  return new;
 end if;
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

-- Existing trigger ACL, RBAC, RLS, opening authorization and all other posting boundaries are unchanged.
commit;
