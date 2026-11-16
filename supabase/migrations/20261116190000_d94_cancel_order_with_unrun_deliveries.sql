-- D94 (Owner 16/11/2026): "Hủy đơn" on an order whose deliveries never ran. Owner: "Phiếu giao ở đây là đã giao rồi đúng chứ?" →
-- proposal approved: "oki nhé theo đề xuất nhé".
-- Until now private.guard_sales_order_cancellation_with_delivery refused cancelling any order with any delivery, even one only
-- planned. Now, when no delivery of the order has happened (the D90 definition, shared below with delete_sales_order),
-- cancel_sales_order cancels the order AND, in the same transaction, its deliveries that are not cancelled yet, the way a
-- planned delivery is cancelled (cancel_planned_delivery): their active assignments are closed (history kept), their ACTIVE
-- stock reservations RELEASED, the delivery CANCELLED (version + 1, which cancels its unstarted job through
-- deliveries_sync_work_item, so it leaves "Nhận việc" and Điều phối), dispatch proposals dropped and unsent pushes about them
-- stopped (DEAD). Unlike "Xóa đơn bán", the order and the deliveries stay as history in "Đã hủy".
-- A delivery that has happened refuses with `sales_order_cancel_delivery_started: <số phiếu>`. Every other cancel rule (state,
-- reason, credit commitment release, receipt, audit) is unchanged; the audit lists the cancelled delivery numbers.

-- 1. When a delivery of an order "has happened" (D90), in one place: the first such delivery number, or null.
create or replace function private.sales_order_started_delivery_number(target_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.delivery_number
  from public.deliveries d
  where d.sales_order_id = target_order_id and (
    d.execution_state not in ('PLANNED', 'ASSIGNED', 'CANCELLED')
    or d.result_kind is not null or d.verified_at is not null
    or exists (select 1 from public.delivery_handoffs x where x.delivery_id = d.id)
    or exists (select 1 from public.delivery_results x where x.delivery_id = d.id)
    or exists (select 1 from public.delivery_verifications x where x.delivery_id = d.id)
    or exists (select 1 from public.inventory_movements x where x.delivery_id = d.id)
    or exists (select 1 from public.delivery_expense_sources x where x.delivery_id = d.id)
    or exists (select 1 from public.gps_tracking_sessions x where x.delivery_id = d.id)
    or exists (select 1 from public.gps_positions x where x.delivery_id = d.id)
    -- A split note on another order.
    or exists (select 1 from public.deliveries c where c.split_from_delivery_id = d.id and c.sales_order_id is distinct from target_order_id)
    or exists (
      select 1 from public.delivery_lines l
      where l.delivery_id = d.id and (
        exists (select 1 from public.delivery_handoff_lines x where x.delivery_line_id = l.id)
        or exists (select 1 from public.delivery_result_lines x where x.delivery_line_id = l.id)
        or exists (select 1 from public.delivery_verification_lines x where x.delivery_line_id = l.id)
        or exists (select 1 from public.return_cases x where x.delivery_line_id = l.id)
        or exists (select 1 from public.inventory_reservations x where x.delivery_line_id = l.id and x.state = 'CONSUMED')))
    or exists (
      select 1 from public.work_items w
      where w.delivery_id = d.id and (
        w.started_at is not null or w.completed_at is not null
        or w.execution_state not in ('AVAILABLE', 'CLAIMED', 'CANCELLED')
        or exists (select 1 from public.work_item_results x where x.work_item_id = w.id)
        or exists (select 1 from public.work_item_heartbeats x where x.work_item_id = w.id)
        or exists (select 1 from public.work_item_verifications x where x.work_item_id = w.id)
        or exists (select 1 from public.service_work_logs x where x.work_item_id = w.id)
        or exists (select 1 from public.service_verifications x where x.work_item_id = w.id)
        or exists (select 1 from public.portal_evidence_objects x where x.work_item_id = w.id)))
  )
  order by d.delivery_number
  limit 1
$$;

revoke all on function private.sales_order_started_delivery_number(uuid) from public, anon, authenticated;

comment on function private.sales_order_started_delivery_number(uuid)
  is 'D90/D94: the first delivery of the order that has happened (loaded, on the road, delivered, verified, stock moved, money, track, return, job started), or null when none has.';

-- 2. The cancellation guard: an order may be cancelled once every delivery of it is CANCELLED and none of them happened.
-- cancel_sales_order cancels the unrun deliveries first; any other path (portal cancel, a direct update) still meets the old refusal.
create or replace function private.guard_sales_order_cancellation_with_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.commercial_state = 'CANCELLED'
     and old.commercial_state <> 'CANCELLED'
     and (exists (select 1 from public.deliveries d where d.sales_order_id = old.id and d.execution_state <> 'CANCELLED')
          or private.sales_order_started_delivery_number(old.id) is not null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Sales order with delivery history cannot be cancelled';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sales_order_cancellation_with_delivery() from public;

-- 3. Job assignment history: as D90 (20261116150000), plus closing the assignment of a not-started delivery job of the order
-- cancel_sales_order is cancelling (transaction-local `hx.cancel_sales_order`, set and cleared inside the command).
CREATE OR REPLACE FUNCTION private.guard_work_assignment_supersession()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype;
begin
 if tg_op='DELETE' then
  select * into work from public.work_items where id=old.work_item_id;
  -- D90: only inside delete_sales_order, for an unstarted job of a delivery of the order being deleted.
  if coalesce(current_setting('hx.delete_sales_order', true), '') <> ''
   and work.delivery_id is not null and work.started_at is null and work.completed_at is null
   and work.execution_state in('AVAILABLE','CLAIMED','CANCELLED')
   and exists (select 1 from public.deliveries d where d.id=work.delivery_id
     and d.sales_order_id::text=current_setting('hx.delete_sales_order', true)) then
   return old;
  end if;
  raise exception 'work_assignment_history_immutable' using errcode='55000';
 end if;
 if tg_op='UPDATE' and old.superseded_at is null and new.superseded_at is not null
  and (to_jsonb(old)-'superseded_at')=(to_jsonb(new)-'superseded_at') then
  select * into work from public.work_items where id=old.work_item_id for update;
  if work.started_at is null and work.execution_state in('AVAILABLE','CLAIMED')
   and (private.has_permission(work.branch_id,'work.manage')
     or (work.delivery_id is not null and private.has_permission(work.branch_id,'delivery.assign'))
     -- C2: the worker declining their own unstarted job (set only inside decline_portal_work_item).
     or coalesce(current_setting('hx.decline_work_item', true), '') = old.work_item_id::text
     -- D85: the lead worker changing the person (set only inside private.field_dispatch_delivery / field_dispatch_work).
     or coalesce(current_setting('hx.field_dispatch_work_item', true), '') = old.work_item_id::text
     -- D94: cancelling the order of this delivery job (set only inside cancel_sales_order).
     or (coalesce(current_setting('hx.cancel_sales_order', true), '') <> '' and work.delivery_id is not null
       and exists (select 1 from public.deliveries d where d.id=work.delivery_id
         and d.sales_order_id::text=current_setting('hx.cancel_sales_order', true)))) then
   return new;
  end if;
 end if;
 raise exception 'work_assignment_history_immutable' using errcode='55000';
end $function$;

-- 4. "Hủy đơn".
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
  audit_reason text := cancel_reason;
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
    delete from public.delivery_dispatch_proposals where delivery_id = any(open_ids);
    -- A push not sent yet about these deliveries / jobs is not sent any more; the notification stays as history.
    update public.outbound_jobs set state = 'DEAD', lease_until = null, last_error_safe = 'Không gửi: đơn đã hủy'
      where state in ('PENDING', 'FAILED') and notification_id in (
        select n.id from public.notifications n
        where (n.entity_type = 'delivery' and n.entity_id = any(open_ids))
           or (n.entity_type = 'work_item' and n.entity_id in (select id from public.work_items where delivery_id = any(open_ids))));
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    select (select auth.uid()), d.branch_id, 'delivery.cancel', 'delivery', d.id, cancel_sales_order.operation_id,
      array['execution_state', 'inventory_reservations', 'delivery_assignment', 'work_items'],
      left('Hủy theo đơn ' || order_row.order_number || ': ' || cancel_reason, 500)
    from public.deliveries d where d.id = any(open_ids);
    select string_agg(delivery_number, ', ' order by delivery_number) into delivery_numbers from public.deliveries where id = any(open_ids);
    if char_length(delivery_numbers) > 250 then delivery_numbers := left(delivery_numbers, 240) || '…'; end if;
    audit_reason := format(' · hủy kèm %s phiếu giao chưa chạy: %s', cardinality(open_ids), delivery_numbers);
    audit_reason := left(cancel_reason, greatest(500 - char_length(audit_reason), 3)) || audit_reason;
  end if;

  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_sales_order', hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.cancel', 'sales_order', target_order_id, operation_id,
    array['commercial_state','credit_commitment']
      || case when cardinality(open_ids) > 0 then array['deliveries', 'inventory_reservations', 'work_items'] else '{}'::text[] end,
    audit_reason);
  return target_order_id;
end
$$;

revoke all on function public.cancel_sales_order(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_sales_order(uuid, text, uuid) to authenticated;

comment on function public.cancel_sales_order(uuid, text, uuid)
  is 'Cancels a draft / confirmed order and releases its credit; D94: its deliveries that never ran are cancelled with it (reservations released, jobs cancelled), a delivery that happened refuses. Audited, idempotent, permission orders.cancel.';

-- 5. "Xóa đơn bán" (D90) unchanged; its started-delivery check is now private.sales_order_started_delivery_number.
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
    -- Notifications about these deliveries / jobs would open a page that no longer exists; unsent pushes for them are dropped.
    select coalesce(array_agg(n.id), '{}') into notification_ids from public.notifications n
    where (n.entity_type = 'delivery' and n.entity_id = any(delivery_ids)) or (n.entity_type = 'work_item' and n.entity_id = any(work_ids));
    delete from public.outbound_jobs where notification_id = any(notification_ids) and state in ('PENDING', 'FAILED');
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

comment on function public.delete_sales_order(uuid, text, uuid)
  is 'D72 + D90: hard delete of a sales order with no money, purchase or credit-override history; its deliveries that never ran are deleted with it, a delivery that happened refuses. Audited, idempotent, permission orders.cancel.';

notify pgrst, 'reload schema';
