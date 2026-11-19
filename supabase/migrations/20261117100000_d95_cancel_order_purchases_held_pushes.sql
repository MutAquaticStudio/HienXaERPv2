-- D95 (Owner 16/11/2026: "Ok giờ hãy fix các điểm chú ý"), part 1 — "Hủy đơn" and the purchases / pushes / route plans around it.
-- (S1/P1) cancel_sales_order refuses (`sales_order_cancel_has_purchase`) when a purchase order linked to the order (by
--     purchase_orders.source_sales_order_id or purchase_order_lines.linked_sales_order_line_id) was sent to the supplier
--     (CONFIRMED / CLOSED, or a draft with a "Gửi NCC" record), has a goods receipt or a supplier fulfilment, or is a draft that
--     also buys for something else. A linked draft (the one D19 makes on confirmation) is cancelled with the order: state
--     CANCELLED, its source allocations dropped (as cancel_purchase_order does), audit `purchase_order.cancel`
--     "Hủy theo đơn bán <số>: <lý do>", its unsent pushes stopped. confirm_purchase_order, private.confirm_purchase_on_receipt
--     (receiving / supplier delivery / supplier delivery note of a draft) and verify_supplier_fulfillment refuse a purchase order
--     whose linked sales order is CANCELLED (`purchase_linked_sales_order_cancelled`).
-- (D1/A1) Pushes held for quiet hours (state HELD) are stopped like PENDING / FAILED ones when "Hủy đơn" / "Xóa đơn bán"
--     cancels or deletes the deliveries and jobs they are about; private.release_quiet_pushes drops (DEAD, 'Việc/đơn đã hủy') a
--     held push whose notification was deleted or whose delivery / job / purchase order is cancelled.
-- (D3) A cancelled delivery leaves the draft route plans it was in (stop deleted, plan version + 1), so "Áp dụng lộ trình"
--     no longer fails with route_delivery_stale. Applied plans keep their stops as history.
begin;

-- ===== 1. What a cancelled delivery leaves behind, in one place =====
create or replace function private.stop_cancelled_delivery_followups(target_delivery_ids uuid[], stop_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(target_delivery_ids), 0) = 0 then return; end if;
  -- A push not sent yet (waiting, failed, held for quiet hours) about these deliveries / their jobs is not sent any more;
  -- the notification stays as history. "Phiếu đã được tách" (split_delivery) is itself about the cancellation and still goes.
  update public.outbound_jobs set state = 'DEAD', lease_until = null, last_error_safe = left(stop_reason, 300)
    where state in ('PENDING', 'FAILED', 'HELD') and notification_id in (
      select n.id from public.notifications n
      where n.kind <> 'work.delivery_split'
        and ((n.entity_type = 'delivery' and n.entity_id = any(target_delivery_ids))
          or (n.entity_type = 'work_item' and n.entity_id in (select w.id from public.work_items w where w.delivery_id = any(target_delivery_ids)))));
  delete from public.delivery_dispatch_proposals where delivery_id = any(target_delivery_ids);
  -- D3: draft route plans drop the stop (version + 1 so an open page reloads); applied plans keep it as history.
  update public.route_plans p set version = p.version + 1
    where p.status = 'DRAFT' and exists (select 1 from public.route_plan_stops s where s.route_plan_id = p.id and s.delivery_id = any(target_delivery_ids));
  delete from public.route_plan_stops s using public.route_plans p
    where p.id = s.route_plan_id and p.status = 'DRAFT' and s.delivery_id = any(target_delivery_ids);
end
$$;
revoke all on function private.stop_cancelled_delivery_followups(uuid[], text) from public, anon, authenticated, service_role;

-- ===== 2. Purchase orders of a sales order =====
create or replace function private.sales_order_purchase_ids(target_order_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.id), '{}')
  from public.purchase_orders p
  where p.source_sales_order_id = target_order_id
     or exists (select 1 from public.purchase_order_lines pol join public.sales_order_lines sol on sol.id = pol.linked_sales_order_line_id
       where pol.purchase_order_id = p.id and sol.sales_order_id = target_order_id)
$$;
revoke all on function private.sales_order_purchase_ids(uuid) from public, anon, authenticated, service_role;

-- True when a sales order the purchase order buys for is CANCELLED.
create or replace function private.purchase_linked_sales_order_cancelled(target_purchase_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sales_orders o
    where o.commercial_state = 'CANCELLED' and (
      o.id = (select p.source_sales_order_id from public.purchase_orders p where p.id = target_purchase_order_id)
      or o.id in (select sol.sales_order_id from public.purchase_order_lines pol
        join public.sales_order_lines sol on sol.id = pol.linked_sales_order_line_id
        where pol.purchase_order_id = target_purchase_order_id)))
$$;
revoke all on function private.purchase_linked_sales_order_cancelled(uuid) from public, anon, authenticated, service_role;

-- ===== 3. "Hủy đơn" (D93/D94 follow-up body; changes: purchases refuse / drafts cancelled, HELD pushes, route plans) =====
create or replace function public.cancel_sales_order(target_order_id uuid, cancel_reason text, operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.sales_orders%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  delivery_ids uuid[];
  open_ids uuid[];
  started_number text;
  delivery_numbers text;
  released_lines integer := 0;
  purchase_ids uuid[];
  draft_purchase_ids uuid[] := '{}';
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not private.has_permission(order_row.branch_id, 'orders.cancel') then raise exception 'forbidden' using errcode = '42501'; end if;
  if cancel_reason is null or char_length(cancel_reason) < 3 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id, 'reason', cancel_reason));
  select * into receipt from public.command_receipts where command_receipts.operation_id = cancel_sales_order.operation_id;
  if found then if receipt.command_name <> 'cancel_sales_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.commercial_state not in ('DRAFT','CONFIRMED') then raise exception 'sales_order_not_cancellable' using errcode = '23514'; end if;

  -- D94: the order's deliveries and their jobs are locked so nobody loads or starts one while the order is being cancelled.
  select coalesce(array_agg(d.id order by d.delivery_number), '{}') into delivery_ids
  from (select id, delivery_number from public.deliveries where sales_order_id = target_order_id for update) d;
  perform 1 from public.work_items where delivery_id = any(delivery_ids) order by id for update;
  -- A delivery that has really happened keeps the order: the message names the first one.
  started_number := private.sales_order_started_delivery_number(target_order_id);
  if started_number is not null then
    raise exception 'sales_order_cancel_delivery_started: %', started_number using errcode = '23514';
  end if;

  -- D95 (S1): the purchase orders buying for the order, locked so nobody confirms or receives one meanwhile.
  purchase_ids := private.sales_order_purchase_ids(target_order_id);
  perform 1 from public.purchase_orders where id = any(purchase_ids) order by id for update;
  if exists (select 1 from public.purchase_orders p where p.id = any(purchase_ids)
        and (p.state in ('CONFIRMED', 'CLOSED')
          or (p.state = 'DRAFT' and exists (select 1 from public.purchase_order_dispatches x where x.purchase_order_id = p.id))
          -- a draft that also buys for something else is not this order's to cancel
          or (p.state = 'DRAFT' and p.source_sales_order_id is distinct from target_order_id and exists (
            select 1 from public.purchase_order_lines pol where pol.purchase_order_id = p.id and (pol.linked_sales_order_line_id is null
              or pol.linked_sales_order_line_id not in (select l.id from public.sales_order_lines l where l.sales_order_id = target_order_id))))))
     or exists (select 1 from public.purchase_receipts r where r.purchase_order_id = any(purchase_ids))
     or exists (select 1 from public.supplier_fulfillments f where f.purchase_order_id = any(purchase_ids))
     or exists (select 1 from public.supplier_fulfillment_lines sfl join public.sales_order_lines sol on sol.id = sfl.sales_order_line_id
       where sol.sales_order_id = target_order_id) then
    raise exception 'sales_order_cancel_has_purchase' using errcode = '23514';
  end if;
  select coalesce(array_agg(p.id order by p.purchase_order_number), '{}') into draft_purchase_ids
  from public.purchase_orders p where p.id = any(purchase_ids) and p.state = 'DRAFT';

  perform 1 from public.customers where id = order_row.customer_id for update;
  update public.credit_commitments set released_vnd = amount_vnd - consumed_vnd where sales_order_id = target_order_id;

  -- D94: the deliveries not cancelled yet are cancelled as cancel_planned_delivery does, with their plan cleared.
  select coalesce(array_agg(id order by delivery_number), '{}') into open_ids
  from public.deliveries where id = any(delivery_ids) and execution_state <> 'CANCELLED';
  if cardinality(open_ids) > 0 then
    -- The job leaves the worker: its assignment is closed (kept as history), as a decline or a reassignment does.
    perform set_config('hx.cancel_sales_order', target_order_id::text, true);
    update public.work_item_assignments set superseded_at = now()
      where work_item_id in (select id from public.work_items where delivery_id = any(open_ids)) and superseded_at is null;
    perform set_config('hx.cancel_sales_order', '', true);
    update public.delivery_assignments set superseded_at = now() where delivery_id = any(open_ids) and superseded_at is null;
    -- The stock they held is available again.
    update public.inventory_reservations reservation
      set state = 'RELEASED', version = reservation.version + 1, finalized_at = now()
      from public.delivery_lines line
      where line.id = reservation.delivery_line_id and line.delivery_id = any(open_ids) and reservation.state = 'ACTIVE';
    -- deliveries_sync_work_item cancels the unstarted job with it, so it leaves "Nhận việc" and Điều phối.
    update public.deliveries set execution_state = 'CANCELLED', version = version + 1 where id = any(open_ids);
    update public.work_items set execution_state = 'CANCELLED', version = version + 1
      where delivery_id = any(open_ids) and execution_state in ('AVAILABLE', 'CLAIMED');
    -- Dispatch proposals dropped, unsent pushes stopped (D95: held ones too), draft route plans left (D95).
    perform private.stop_cancelled_delivery_followups(open_ids, 'Không gửi: đơn đã hủy');
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    select (select auth.uid()), d.branch_id, 'delivery.cancel', 'delivery', d.id, cancel_sales_order.operation_id,
      array['execution_state', 'inventory_reservations', 'delivery_assignment', 'work_items'],
      left('Hủy theo đơn ' || order_row.order_number || ': ' || cancel_reason, 500)
    from public.deliveries d where d.id = any(open_ids);
    select string_agg(delivery_number, ', ' order by delivery_number) into delivery_numbers from public.deliveries where id = any(open_ids);
    if char_length(delivery_numbers) > 250 then delivery_numbers := left(delivery_numbers, 240) || '…'; end if;
  end if;

  -- D95 (S1): the order's draft purchase orders are cancelled with it, as cancel_purchase_order does.
  if cardinality(draft_purchase_ids) > 0 then
    -- A source still named by a (cancelled) delivery line stays as history; the others go.
    delete from public.supply_allocations a using public.purchase_order_lines l
      where a.purchase_order_line_id = l.id and l.purchase_order_id = any(draft_purchase_ids)
        and not exists (select 1 from public.delivery_lines dl where dl.supply_allocation_id = a.id);
    update public.purchase_orders set state = 'CANCELLED', cancelled_at = now() where id = any(draft_purchase_ids);
    update public.outbound_jobs set state = 'DEAD', lease_until = null, last_error_safe = 'Không gửi: đơn mua đã hủy'
      where state in ('PENDING', 'FAILED', 'HELD') and notification_id in (
        select n.id from public.notifications n where n.entity_type = 'purchase_order' and n.entity_id = any(draft_purchase_ids));
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    select (select auth.uid()), p.branch_id, 'purchase_order.cancel', 'purchase_order', p.id, cancel_sales_order.operation_id,
      array['state', 'supply_allocation'], left('Hủy theo đơn bán ' || order_row.order_number || ': ' || cancel_reason, 500)
    from public.purchase_orders p where p.id = any(draft_purchase_ids);
  end if;

  -- Owner (6): stock held for the order's lines without a delivery is available again too.
  update public.inventory_reservations reservation
    set state = 'RELEASED', version = reservation.version + 1, finalized_at = now()
    where reservation.delivery_line_id is null and reservation.state = 'ACTIVE'
      and reservation.sales_order_line_id in (select l.id from public.sales_order_lines l where l.sales_order_id = target_order_id);
  get diagnostics released_lines = row_count;

  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_sales_order', hash, 'sales_order', target_order_id, now());
  -- Owner (5): the reason the customer sees stays plain; the deliveries cancelled with it are an internal audit event of their own.
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.cancel', 'sales_order', target_order_id, operation_id,
    array['commercial_state','credit_commitment']
      || case when cardinality(open_ids) > 0 then array['deliveries', 'inventory_reservations', 'work_items']
              when released_lines > 0 then array['inventory_reservations'] else '{}'::text[] end
      || case when cardinality(draft_purchase_ids) > 0 then array['purchase_orders'] else '{}'::text[] end,
    left(cancel_reason, 500));
  if cardinality(open_ids) > 0 then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values ((select auth.uid()), order_row.branch_id, 'sales_order.cancel_deliveries', 'sales_order', target_order_id, operation_id,
      array['deliveries'], format('Hủy kèm %s phiếu giao chưa chạy: %s', cardinality(open_ids), delivery_numbers));
  end if;
  return target_order_id;
end
$$;

revoke all on function public.cancel_sales_order(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_sales_order(uuid, text, uuid) to authenticated;

comment on function public.cancel_sales_order(uuid, text, uuid)
  is 'Cancels a draft / confirmed order and releases its credit and the stock its lines hold; D94: its deliveries that never ran are cancelled with it, a delivery that happened refuses; D95: a purchase sent to the supplier / received refuses, its draft purchase orders are cancelled with it. Audited, idempotent, permission orders.cancel.';

-- ===== 4. "Xóa đơn bán" (D94 body; change: held pushes are dropped too) =====
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
  started_number text;
  delivery_ids uuid[];
  work_ids uuid[];
  notification_ids uuid[];
  delivery_numbers text;
  remaining integer;
  deleted_count integer;
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

  -- D90: the order's deliveries and their jobs are locked so nobody loads or starts one while it is being deleted.
  select coalesce(array_agg(d.id order by d.delivery_number), '{}') into delivery_ids
  from (select id, delivery_number from public.deliveries where sales_order_id = target_order_id for update) d;
  select coalesce(array_agg(w.id), '{}') into work_ids
  from (select id from public.work_items where delivery_id = any(delivery_ids) for update) w;

  -- D90: a delivery that has really happened (loaded, on the road, delivered, verified, stock moved, money, track, return, job
  -- started) keeps the order. The message names the first such delivery.
  started_number := private.sales_order_started_delivery_number(target_order_id);
  if started_number is not null then
    raise exception 'sales_order_delivery_started: %', started_number using errcode = '23514';
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
  summary := format('Xóa đơn %s · %s · %s dòng · %s đ · ', order_row.order_number, order_row.customer_name_snapshot, line_count, total_vnd);
  if cardinality(delivery_ids) > 0 then
    select string_agg(delivery_number, ', ' order by delivery_number) into delivery_numbers from public.deliveries where id = any(delivery_ids);
    if char_length(delivery_numbers) > 250 then delivery_numbers := left(delivery_numbers, 240) || '…'; end if;
    summary := summary || format('xóa %s phiếu giao chưa chạy: %s · ', cardinality(delivery_ids), delivery_numbers);
  end if;
  summary := summary || 'lý do: ';
  summary := summary || left(reason, greatest(500 - char_length(summary), 3));

  -- Same lock order as cancelling: the customer first, so credit checks do not race the delete.
  perform 1 from public.customers where id = order_row.customer_id for update;
  -- Reservations of the order's lines, including the ones its deliveries held: deleting them gives the stock back.
  delete from public.inventory_reservations where sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = target_order_id);

  if cardinality(delivery_ids) > 0 then
    perform set_config('hx.delete_sales_order', target_order_id::text, true);
    -- Notifications about these deliveries / jobs would open a page that no longer exists; unsent pushes for them are dropped
    -- (D95: also the ones held for quiet hours).
    select coalesce(array_agg(n.id), '{}') into notification_ids from public.notifications n
    where (n.entity_type = 'delivery' and n.entity_id = any(delivery_ids)) or (n.entity_type = 'work_item' and n.entity_id = any(work_ids));
    delete from public.outbound_jobs where notification_id = any(notification_ids) and state in ('PENDING', 'FAILED', 'HELD');
    delete from public.notifications where id = any(notification_ids);
    delete from public.route_plan_stops where delivery_id = any(delivery_ids);
    delete from public.delivery_dispatch_proposals where delivery_id = any(delivery_ids);
    delete from public.delivery_dispatch_exclusions where delivery_id = any(delivery_ids);
    delete from public.work_item_assignments where work_item_id = any(work_ids);
    delete from public.work_items where id = any(work_ids);
    delete from public.delivery_assignments where delivery_id = any(delivery_ids);
    delete from public.delivery_lines where delivery_id = any(delivery_ids);
    -- A split note before the note it was split from.
    loop
      delete from public.deliveries d where d.id = any(delivery_ids)
        and not exists (select 1 from public.deliveries c where c.split_from_delivery_id = d.id);
      get diagnostics deleted_count = row_count;
      select count(*) into remaining from public.deliveries where id = any(delivery_ids);
      exit when remaining = 0;
      if deleted_count = 0 then raise exception 'sales_order_delivery_started: %', (select min(delivery_number) from public.deliveries where id = any(delivery_ids)) using errcode = '23514'; end if;
    end loop;
    perform set_config('hx.delete_sales_order', '', true);
  end if;

  delete from public.supply_allocations where sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = target_order_id);
  delete from public.sales_order_sourcing_runs where sales_order_id = target_order_id;
  delete from public.credit_commitments where sales_order_id = target_order_id;
  delete from public.sales_order_lines where sales_order_id = target_order_id;
  delete from public.sales_orders where id = target_order_id;

  insert into public.command_receipts values (operation_id, (select auth.uid()), 'delete_sales_order', hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.delete', 'sales_order', target_order_id, operation_id,
    array['deleted', 'sales_order_lines', 'credit_commitment', 'inventory_reservations', 'supply_allocations']
      || case when cardinality(delivery_ids) > 0 then array['deliveries', 'delivery_lines', 'delivery_assignments', 'work_items'] else '{}'::text[] end,
    summary);
  return target_order_id;
end
$$;

revoke all on function public.delete_sales_order(uuid, text, uuid) from public, anon;
grant execute on function public.delete_sales_order(uuid, text, uuid) to authenticated;

-- ===== 5. A purchase for a cancelled sales order is not confirmed, received as confirmation or verified =====
create or replace function public.confirm_purchase_order(target_purchase_order_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.purchase_orders%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not private.has_permission(order_row.branch_id, 'purchasing.confirm') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = confirm_purchase_order.operation_id;
  if found then if receipt.command_name <> 'confirm_purchase_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.state <> 'DRAFT' or not exists (select 1 from public.purchase_order_lines where purchase_order_id = target_purchase_order_id) then raise exception 'purchase_order_not_confirmable' using errcode = '23514'; end if;
  -- D95: the sales order it buys for was cancelled.
  if private.purchase_linked_sales_order_cancelled(target_purchase_order_id) then raise exception 'purchase_linked_sales_order_cancelled' using errcode = '23514'; end if;
  update public.purchase_orders set state = 'CONFIRMED', confirmed_at = now() where id = target_purchase_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'confirm_purchase_order', hash, 'purchase_order', target_purchase_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.confirm', 'purchase_order', target_purchase_order_id, operation_id, array['state']);
  return target_purchase_order_id;
end
$$;

create or replace function private.confirm_purchase_on_receipt(target_purchase_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare order_row public.purchase_orders%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.state <> 'DRAFT' then return; end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = order_row.id) then
    raise exception 'purchase_order_not_confirmable' using errcode = '23514';
  end if;
  -- D95: the sales order it buys for was cancelled.
  if private.purchase_linked_sales_order_cancelled(order_row.id) then
    raise exception 'purchase_linked_sales_order_cancelled' using errcode = '23514';
  end if;
  update public.purchase_orders set state = 'CONFIRMED', confirmed_at = now() where id = order_row.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.confirm', 'purchase_order', order_row.id, gen_random_uuid(), array['state'],
    'Xác nhận khi nhận hàng');
end
$function$;
revoke all on function private.confirm_purchase_on_receipt(uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_supplier_fulfillment(target_purchase_order_id uuid, fulfillment_lines jsonb, target_evidence_id uuid, supplier_reference text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare order_row public.purchase_orders%rowtype; line public.purchase_order_lines%rowtype; item jsonb;
  quantity numeric; prior_quantity numeric; base_quantity numeric; amount bigint; total_amount bigint := 0;
  sales_order_id uuid; fulfillment_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'inventory.receive') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'lines', fulfillment_lines, 'evidence_id', target_evidence_id, 'supplier_reference', nullif(trim(supplier_reference), '')));
  perform private.lock_saved_command_intent(verify_supplier_fulfillment.operation_id,'verify_supplier_fulfillment');
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_supplier_fulfillment.operation_id;
  if found then if receipt.command_name <> 'verify_supplier_fulfillment' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_quantity_lines(fulfillment_lines,array['supplier_quantity'],false);
  -- D95: no supplier delivery (payable, direct cost) is recorded for a cancelled sales order.
  if private.purchase_linked_sales_order_cancelled(order_row.id) then
    raise exception 'purchase_linked_sales_order_cancelled' using errcode = '23514';
  end if;
  -- FB10: the supplier's delivery is the confirmation of a draft order.
  perform private.confirm_purchase_on_receipt(order_row.id); select * into order_row from public.purchase_orders where id = target_purchase_order_id;

  if order_row.state <> 'CONFIRMED' or order_row.destination_type <> 'CUSTOMER_SITE' or jsonb_array_length(fulfillment_lines) = 0 then raise exception 'direct_purchase_not_verifiable' using errcode = '23514'; end if;
  perform private.assert_verified_evidence(target_evidence_id, order_row.branch_id);
  insert into public.supplier_fulfillments(branch_id, purchase_order_id, evidence_object_id, supplier_reference, verified_by)
  values (order_row.branch_id, target_purchase_order_id, target_evidence_id, nullif(trim(supplier_reference), ''), (select auth.uid())) returning id into fulfillment_id;
  for item in select value from jsonb_array_elements(fulfillment_lines) loop
    quantity := (item->>'supplier_quantity')::numeric;
    select * into line from public.purchase_order_lines where id = (item->>'purchase_order_line_id')::uuid and purchase_order_id = target_purchase_order_id for update;
    if line.id is null or line.linked_sales_order_line_id is null or quantity <= 0 then raise exception 'invalid_supplier_fulfillment_line' using errcode = '22023'; end if;
    select coalesce(sum(fl.supplier_quantity), 0) into prior_quantity from public.supplier_fulfillment_lines fl where fl.purchase_order_line_id = line.id;
    if prior_quantity + quantity > line.quantity then raise exception 'supplier_fulfillment_exceeds_purchase_line' using errcode = '23514'; end if;
    base_quantity := quantity * line.conversion_numerator / line.conversion_denominator;
    perform private.require_exact_quantity(base_quantity,false);
    amount := round(quantity * line.unit_cost_vnd)::bigint;
    insert into public.supplier_fulfillment_lines(supplier_fulfillment_id, purchase_order_line_id,
      sales_order_line_id, supplier_quantity, supplier_base_quantity, payable_amount_vnd)
    values (fulfillment_id, line.id, line.linked_sales_order_line_id, quantity, base_quantity, amount);
    total_amount := total_amount + amount;
    select sl.sales_order_id into sales_order_id from public.sales_order_lines sl where sl.id = line.linked_sales_order_line_id;
  end loop;
  insert into public.payable_obligations(branch_id, supplier_id, opening_source_id, supplier_fulfillment_id,
    original_amount_vnd, due_date, recorded_by)
  values (order_row.branch_id, order_row.supplier_id, null, fulfillment_id, total_amount, current_date, (select auth.uid()));
  insert into public.direct_cost_entries(branch_id, sales_order_id, supplier_fulfillment_id,
    amount_delta_vnd, cost_kind, recorded_by)
  values (order_row.branch_id, sales_order_id, fulfillment_id, total_amount, 'SUPPLIER_DIRECT', (select auth.uid()));
  if not exists (
    select 1 from public.purchase_order_lines l where l.purchase_order_id = target_purchase_order_id
      and coalesce((select sum(fl.supplier_quantity) from public.supplier_fulfillment_lines fl where fl.purchase_order_line_id = l.id), 0) < l.quantity
  ) then update public.purchase_orders set state = 'CLOSED' where id = target_purchase_order_id; end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'verify_supplier_fulfillment', hash, 'supplier_fulfillment', fulfillment_id, now());
  return fulfillment_id;
end
$function$
;

-- ===== 6. Quiet hours: a held push about something cancelled or deleted is not sent when they end =====
create or replace function private.release_quiet_pushes(at_time timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  grp record;
  payload jsonb;
  total integer;
  released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('hx_release_quiet_pushes', 0));
  -- D95: the notification was deleted (its order deleted), or its delivery / job / purchase order was cancelled meanwhile.
  update public.outbound_jobs j set state = 'DEAD', lease_until = null, last_error_safe = 'Việc/đơn đã hủy'
  where j.state = 'HELD' and j.next_run_at <= at_time and (
    (j.notification_id is null and j.payload ? 'notification_id')
    or exists (select 1 from public.notifications n where n.id = j.notification_id and n.kind <> 'work.delivery_split' and (
      (n.entity_type = 'delivery' and exists (select 1 from public.deliveries d where d.id = n.entity_id and d.execution_state = 'CANCELLED'))
      or (n.entity_type = 'work_item' and exists (select 1 from public.work_items w where w.id = n.entity_id and w.execution_state = 'CANCELLED'))
      or (n.entity_type = 'purchase_order' and exists (select 1 from public.purchase_orders p where p.id = n.entity_id and p.state = 'CANCELLED')))));
  for grp in
    select j.branch_id, j.target, array_agg(j.id order by j.created_at, j.id) ids,
      array_agg(coalesce(j.payload->>'title', 'Thông báo') order by j.created_at, j.id) titles,
      count(distinct coalesce(j.payload->>'link', '')) links, min(j.payload->>'link') link
    from public.outbound_jobs j where j.state = 'HELD' and j.next_run_at <= at_time
    group by j.branch_id, j.target order by min(j.created_at)
  loop
    total := cardinality(grp.ids);
    if total = 1 then
      update public.outbound_jobs set state = 'PENDING', next_run_at = now() where id = grp.ids[1] and state = 'HELD';
      perform private.dispatch_outbound_job(grp.ids[1]);
    else
      payload := jsonb_strip_nulls(jsonb_build_object('kind', 'quiet.digest', 'title', 'Trong giờ yên lặng có ' || total || ' thông báo',
        'body', left(array_to_string(grp.titles[1:3], ' · ') || case when total > 3 then ' · và ' || (total - 3) || ' thông báo khác' else '' end, 1000),
        'link', case when grp.links = 1 then grp.link end));
      perform private.enqueue_outbound_job(grp.branch_id, null, null, 'PUSH', grp.target, payload, 'quiet:' || grp.target || ':' || grp.ids[1]);
      update public.outbound_jobs set state = 'MERGED', last_error_safe = 'Đã gộp vào một thông báo lúc hết giờ yên lặng'
      where id = any(grp.ids) and state = 'HELD';
    end if;
    released := released + 1;
  end loop;
  delete from public.outbound_jobs j where j.state = 'MERGED' and j.created_at < now() - interval '60 days';
  return released;
end $$;
revoke all on function private.release_quiet_pushes(timestamptz) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
