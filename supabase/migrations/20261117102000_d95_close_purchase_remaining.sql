-- D95 (Owner 16/11/2026: "Ok giờ hãy fix các điểm chú ý"), part 3 — (P2) "Đóng phần còn lại" of a purchase order.
-- A confirmed purchase order the supplier delivered only in part (goods receipt for a warehouse order, supplier fulfilment for a
-- supplier-direct one) could neither be closed nor cancelled (cancel refuses after a receipt). close_purchase_order_remaining
-- (permission purchasing.cancel, reason 3–500 characters, idempotent by operation_id) closes it: state CLOSED, what was received
-- and its payable stay as recorded, audit `purchase_order.remaining.close` with the reason. The sales lines' sources on its lines
-- shrink to what arrived (never below what a delivery already plans or delivered from them; a source left with nothing is
-- removed unless a delivery line names it), so the sales order shows the remainder as needing a new source.
-- Refusals: purchase_order_not_closeable (not CONFIRMED), purchase_order_nothing_received (nothing arrived: use "Hủy đơn mua"),
-- purchase_order_has_no_remaining (everything arrived), close_reason_required.
begin;

create or replace function public.close_purchase_order_remaining(target_purchase_order_id uuid, close_reason text, operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.purchase_orders%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  reason text := trim(coalesce(close_reason, ''));
  line record;
  allocation record;
  keep numeric;
  consumed numeric;
  target numeric;
  received_any boolean;
  short_any boolean;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'purchasing.cancel') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(reason) not between 3 and 500 then raise exception 'close_reason_required' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'reason', reason));
  select * into receipt from public.command_receipts r where r.operation_id = close_purchase_order_remaining.operation_id;
  if found then
    if receipt.command_name <> 'close_purchase_order_remaining' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from (select auth.uid()) then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if order_row.state <> 'CONFIRMED' then raise exception 'purchase_order_not_closeable' using errcode = '23514'; end if;

  -- What arrived per line: goods receipts for a warehouse order, the supplier's verified deliveries for a direct one.
  select coalesce(bool_or(x.arrived > 0), false), coalesce(bool_or(x.arrived < x.quantity), false) into received_any, short_any
  from (select l.quantity,
      case when order_row.destination_type = 'WAREHOUSE'
        then coalesce((select sum(r.received_quantity) from public.purchase_receipt_lines r where r.purchase_order_line_id = l.id), 0)
        else coalesce((select sum(f.supplier_quantity) from public.supplier_fulfillment_lines f where f.purchase_order_line_id = l.id), 0) end arrived
    from public.purchase_order_lines l where l.purchase_order_id = order_row.id) x;
  if not received_any then raise exception 'purchase_order_nothing_received' using errcode = '23514'; end if;
  if not short_any then raise exception 'purchase_order_has_no_remaining' using errcode = '23514'; end if;

  -- The sales lines' sources on this order shrink to what arrived, oldest first.
  for line in select l.id,
      case when order_row.destination_type = 'WAREHOUSE'
        then coalesce((select sum(r.received_base_quantity) from public.purchase_receipt_lines r where r.purchase_order_line_id = l.id), 0)
        else coalesce((select sum(f.supplier_base_quantity) from public.supplier_fulfillment_lines f where f.purchase_order_line_id = l.id), 0) end arrived_base
    from public.purchase_order_lines l where l.purchase_order_id = order_row.id order by l.line_number loop
    keep := line.arrived_base;
    for allocation in select a.* from public.supply_allocations a where a.purchase_order_line_id = line.id
        order by a.created_at, a.id for update loop
      consumed := private.delivery_allocation_consumed(allocation.id);
      target := greatest(least(allocation.allocated_base_quantity, keep), consumed);
      keep := greatest(keep - target, 0);
      if target = allocation.allocated_base_quantity then continue; end if;
      if target > 0 then
        update public.supply_allocations set allocated_base_quantity = target, version = version + 1, updated_at = now() where id = allocation.id;
      elsif not exists (select 1 from public.delivery_lines dl where dl.supply_allocation_id = allocation.id) then
        delete from public.supply_allocations where id = allocation.id;
      end if;
    end loop;
  end loop;

  update public.purchase_orders set state = 'CLOSED' where id = order_row.id;
  insert into public.command_receipts values (close_purchase_order_remaining.operation_id, (select auth.uid()), 'close_purchase_order_remaining',
    payload_hash, 'purchase_order', order_row.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.remaining.close', 'purchase_order', order_row.id,
    close_purchase_order_remaining.operation_id, array['state', 'supply_allocation'], reason);
  return order_row.id;
end
$$;

revoke all on function public.close_purchase_order_remaining(uuid, text, uuid) from public, anon;
grant execute on function public.close_purchase_order_remaining(uuid, text, uuid) to authenticated;

comment on function public.close_purchase_order_remaining(uuid, text, uuid)
  is 'D95: closes a confirmed purchase order received in part; the received goods and payable stay, the sales lines'' sources shrink to what arrived. Audited with a reason, idempotent, permission purchasing.cancel.';

notify pgrst, 'reload schema';
commit;
