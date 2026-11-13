-- D72 (Owner 13/11/2026): "Xóa đơn bán" trong chi tiết đơn. Xóa hẳn đơn nháp, đơn đã hủy và đơn đã xác nhận mà CHƯA phát sinh gì:
-- không có phiếu giao (kể cả phiếu đã hủy: dòng phiếu giao chỉ ghi thêm, không xóa), không có doanh thu/chi phí/tiền, không có đơn mua NCC,
-- không có khoản khách trả trước còn hiệu lực, không có ngoại lệ tín dụng (lịch sử bất biến). Phần xác nhận đơn đã giữ (hạn mức, giữ
-- hàng, phân nguồn) được xóa cùng đơn. Mọi lần xóa ghi nhật ký (số đơn, khách, số dòng, tổng tiền, lý do) và biên nhận lệnh.
-- Guard fix: for sales orders in DRAFT or CANCELLED the operational guard returned NEW (null on DELETE), so deleting such an order
-- was skipped silently. It now returns OLD on DELETE. Nothing else in the guard changes.
CREATE OR REPLACE FUNCTION private.enforce_operational_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row_value jsonb; previous jsonb; b uuid; p jsonb; kind text; parent_id uuid;
begin
 row_value=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous=case when tg_op='UPDATE' then to_jsonb(old) else null end;
 if tg_op='UPDATE' and row_value->>'branch_id' is distinct from previous->>'branch_id'
 then raise exception 'operational_branch_reassignment_forbidden' using errcode='42501';end if;
 b=(row_value->>'branch_id')::uuid;
 if tg_table_name='sales_orders' and row_value->>'commercial_state' in ('DRAFT','CANCELLED')
 and (tg_op<>'UPDATE' or previous->>'commercial_state' in ('DRAFT','CANCELLED')) then
  -- D72: a BEFORE DELETE trigger must return OLD; returning NEW (null) skipped the delete without an error.
  if tg_op='DELETE' then return old;end if;
  return new;
 end if;
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
end $function$;

create or replace function public.delete_sales_order(target_order_id uuid, delete_reason text, operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.sales_orders%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  reason text := trim(coalesce(delete_reason, ''));
  line_count integer;
  total_vnd bigint;
  summary text;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(reason) < 3 or char_length(reason) > 300 then raise exception 'delete_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id, 'reason', reason));
  -- Replay after the order is gone: the same caller, command and payload gets the same answer.
  select * into receipt from public.command_receipts where command_receipts.operation_id = delete_sales_order.operation_id;
  if found then
    if receipt.command_name <> 'delete_sales_order' or receipt.payload_hash <> hash
       or receipt.actor_auth_user_id is distinct from (select auth.uid()) then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;

  select * into order_row from public.sales_orders where id = target_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'orders.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if order_row.commercial_state not in ('DRAFT', 'CONFIRMED', 'CANCELLED') then
    raise exception 'sales_order_not_deletable' using errcode = '23514';
  end if;

  if exists (select 1 from public.deliveries where sales_order_id = target_order_id) then
    raise exception 'sales_order_has_delivery' using errcode = '23514';
  end if;
  if exists (select 1 from public.sales_order_credit_overrides where sales_order_id = target_order_id) then
    raise exception 'sales_order_has_credit_override' using errcode = '23514';
  end if;
  if exists (select 1 from public.purchase_orders where source_sales_order_id = target_order_id)
     or exists (select 1 from public.purchase_order_lines pol join public.sales_order_lines sol on sol.id = pol.linked_sales_order_line_id where sol.sales_order_id = target_order_id)
     or exists (select 1 from public.supplier_fulfillment_lines sfl join public.sales_order_lines sol on sol.id = sfl.sales_order_line_id where sol.sales_order_id = target_order_id) then
    raise exception 'sales_order_has_purchase' using errcode = '23514';
  end if;
  -- A prepayment is a customer receipt tied to the order by its reference; a reversed one no longer counts.
  if exists (
    select 1 from public.payments p
    where p.customer_id = order_row.customer_id and p.direction = 'RECEIPT'
      and p.external_reference = 'Trả trước đơn ' || order_row.order_number
      and p.reversal_of_payment_id is null
      and not exists (select 1 from public.payments r where r.reversal_of_payment_id = p.id)
  ) then
    raise exception 'sales_order_has_prepayment' using errcode = '23514';
  end if;
  if exists (select 1 from public.revenue_entries where sales_order_id = target_order_id)
     or exists (select 1 from public.revenue_adjustments where sales_order_id = target_order_id)
     or exists (select 1 from public.direct_cost_entries where sales_order_id = target_order_id)
     or exists (select 1 from public.earning_events where sales_order_id = target_order_id)
     or exists (select 1 from public.expenses where sales_order_id = target_order_id)
     or exists (select 1 from public.bank_transactions where sales_order_id = target_order_id)
     or exists (select 1 from public.payment_request_lines where sales_order_id = target_order_id) then
    raise exception 'sales_order_has_ledger_records' using errcode = '23514';
  end if;

  select count(*), coalesce(sum(line_total_vnd), 0) into line_count, total_vnd from public.sales_order_lines where sales_order_id = target_order_id;
  summary := format('Xóa đơn %s · %s · %s dòng · %s đ · lý do: ', order_row.order_number, order_row.customer_name_snapshot, line_count, total_vnd);
  summary := summary || left(reason, greatest(500 - char_length(summary), 3));

  -- Same lock order as cancelling: the customer first, so credit checks do not race the delete.
  perform 1 from public.customers where id = order_row.customer_id for update;
  delete from public.inventory_reservations where sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = target_order_id);
  delete from public.supply_allocations where sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = target_order_id);
  delete from public.sales_order_sourcing_runs where sales_order_id = target_order_id;
  delete from public.credit_commitments where sales_order_id = target_order_id;
  delete from public.sales_order_lines where sales_order_id = target_order_id;
  delete from public.sales_orders where id = target_order_id;

  insert into public.command_receipts values (operation_id, (select auth.uid()), 'delete_sales_order', hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.delete', 'sales_order', target_order_id, operation_id,
    array['deleted', 'sales_order_lines', 'credit_commitment', 'inventory_reservations', 'supply_allocations'], summary);
  return target_order_id;
end
$$;

revoke all on function public.delete_sales_order(uuid, text, uuid) from public, anon;
grant execute on function public.delete_sales_order(uuid, text, uuid) to authenticated;

comment on function public.delete_sales_order(uuid, text, uuid)
  is 'D72: hard delete of a sales order with no deliveries, money, purchase or credit-override history. Audited, idempotent, permission orders.cancel.';

notify pgrst, 'reload schema';
