-- D93 / D94 follow-ups: Owner's answers (16/11/2026).
-- (1) "có": the customer pushes order approved / truck on its way / delivered / short or failed / cancelled / payment received are
--     not sent for records the daily sales-ledger import made (scripts/operational/so-ban-hang: orders with
--     commercial_terms 'Sổ <tab> dòng <TT> · …', service jobs with description 'Sổ … dòng …'). The import inserts no payment;
--     a payment is skipped when it is the prepayment of an imported order ("Trả trước đơn <số>") or when everything it settles
--     is debt of imported orders / service jobs. In-app notifications and staff pushes (rules, built-ins) are not touched.
-- (2) "Ok": quiet hours stay off by default, 21:00–06:30 proposed when switched on (D93 already does so; nothing changes).
-- (3) "ok": the overdue debt reminder repeats every 3 days (1st, 4th, 7th … day overdue, counted from the oldest overdue due
--     date); due within 3 days / due today stay daily.
-- (4) "ok": "Giao thiếu / Chưa giao được" shows only the driver's reason; without one, "Cửa hàng sẽ liên hệ lại" (never the
--     delivery note).
-- (5) "ok": D94 cancel — the `sales_order.cancel` audit (which the customer portal and the cancel push read) keeps the plain cancel
--     reason; the list of unrun deliveries cancelled with it goes to its own audit event `sales_order.cancel_deliveries`.
-- (6) "ok": D94 cancel also releases the ACTIVE reservations of the order's lines that no delivery holds.
begin;

-- ===== 1. Records of the sales-ledger import =====
create or replace function private.ledger_import_sales_order(target_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sales_orders o where o.id = target_order_id and o.commercial_terms like 'Sổ %dòng %')
$$;
revoke all on function private.ledger_import_sales_order(uuid) from public, anon, authenticated, service_role;

create or replace function private.ledger_import_payment(target_payment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.payments p
      join public.sales_orders o on o.customer_id = p.customer_id and p.external_reference = 'Trả trước đơn ' || o.order_number
      where p.id = target_payment_id and o.commercial_terms like 'Sổ %dòng %')
    or (exists (select 1 from public.payment_allocations a
        where a.payment_id = target_payment_id and a.receivable_obligation_id is not null and a.reversal_of_allocation_id is null)
      and not exists (
        select 1 from public.payment_allocations a
        join public.receivable_obligations ro on ro.id = a.receivable_obligation_id
        where a.payment_id = target_payment_id and a.reversal_of_allocation_id is null
          and not exists (select 1 from public.delivery_verifications v join public.deliveries d on d.id = v.delivery_id
              join public.sales_orders o on o.id = d.sales_order_id
            where v.id = ro.delivery_verification_id and o.commercial_terms like 'Sổ %dòng %')
          and not exists (select 1 from public.service_verifications v join public.service_jobs j on j.id = v.service_job_id
            where v.id = ro.service_verification_id and j.description like 'Sổ %dòng %')))
$$;
revoke all on function private.ledger_import_payment(uuid) from public, anon, authenticated, service_role;

-- ===== 2. Customer pushes (D93 bodies; changes: import skip, delivery problem reason) =====
create or replace function private.customer_push_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  eta timestamptz;
  reason text;
begin
  begin
    -- Owner (1): nothing for an order of the sales-ledger import.
    if new.commercial_terms like 'Sổ %dòng %' then return null; end if;
    if new.commercial_state = 'CONFIRMED' and old.commercial_state is distinct from 'CONFIRMED' then
      select min(d.scheduled_at) into eta from public.deliveries d where d.sales_order_id = new.id and d.execution_state <> 'CANCELLED';
      eta := coalesce(eta, new.requested_delivery_at);
      perform private.customer_push(new.customer_id, 'customer.order_confirmed',
        new.order_number || ' đã duyệt' || coalesce(', dự kiến giao ' || to_char(eta at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), ''),
        new.site_name_snapshot, '/customer/orders/' || new.id, false, new.id::text);
    elsif new.commercial_state = 'CANCELLED' and old.commercial_state is distinct from 'CANCELLED'
      and (old.commercial_state = 'CONFIRMED' or new.order_channel = 'CUSTOMER_PORTAL')
      -- the customer who cancelled it himself is not told
      and not exists (select 1 from public.customer_portal_memberships m where m.customer_id = new.customer_id and m.active
        and m.auth_user_id = (select auth.uid())) then
      select e.reason into reason from public.audit_events e
      where e.entity_type = 'sales_order' and e.entity_id = new.id and e.action = 'sales_order.cancel' order by e.occurred_at desc, e.id desc limit 1;
      perform private.customer_push(new.customer_id, 'customer.order_cancelled', 'Đơn ' || new.order_number || ' đã hủy',
        'Lý do: ' || nullif(trim(reason), ''), '/customer/orders/' || new.id, false, new.id::text);
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_order() from public, anon, authenticated, service_role;

create or replace function private.customer_push_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  plate text;
  result public.delivery_results%rowtype;
  link text := '/customer/orders/' || new.sales_order_id;
begin
  begin
    -- Owner (1): nothing for a delivery of an order of the sales-ledger import.
    if private.ledger_import_sales_order(new.sales_order_id) then return null; end if;
    if new.execution_state = 'DISPATCHED' and old.execution_state in ('PLANNED', 'ASSIGNED') then
      select v.plate_number into plate from public.delivery_assignments a join public.vehicles v on v.id = a.vehicle_id
      where a.delivery_id = new.id and a.superseded_at is null;
      perform private.customer_push(new.customer_id, 'customer.delivery_dispatched',
        coalesce('Xe ' || plate, 'Xe') || ' đang chở hàng tới ' || new.site_name_snapshot, new.delivery_number, link, false, new.id::text);
    elsif new.execution_state = 'VERIFIED' and old.execution_state is distinct from 'VERIFIED' then
      select * into result from public.delivery_results r where r.delivery_id = new.id;
      if new.result_kind = 'FULL' then
        perform private.customer_push(new.customer_id, 'customer.delivery_done', 'Đã giao xong ' || new.delivery_number,
          concat_ws(' · ', new.site_name_snapshot, case when result.evidence_object_id is not null then 'Có ảnh xác nhận' end), link, false, new.id::text);
      elsif new.result_kind in ('PARTIAL', 'FAILED') then
        -- Owner (4): only the driver's reason, never the delivery note.
        perform private.customer_push(new.customer_id, 'customer.delivery_problem',
          case when new.result_kind = 'PARTIAL' then 'Giao thiếu ' else 'Chưa giao được ' end || new.delivery_number,
          concat_ws(' · ', new.site_name_snapshot, coalesce(nullif(trim(result.missing_arrival_reason), ''), 'Cửa hàng sẽ liên hệ lại')),
          link, false, new.id::text);
      end if;
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_delivery() from public, anon, authenticated, service_role;

create or replace function private.customer_push_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owed bigint;
begin
  begin
    if new.direction = 'RECEIPT' and new.customer_id is not null and new.reversal_of_payment_id is null
      and not exists (select 1 from public.payments v where v.reversal_of_payment_id = new.id)
      -- Owner (1): not for money of the sales-ledger import's orders / service jobs.
      and not private.ledger_import_payment(new.id) then
      select coalesce(sum(private.current_receivable_outstanding(o.id)), 0) into owed from public.receivable_obligations o where o.customer_id = new.customer_id;
      perform private.customer_push(new.customer_id, 'customer.payment_received', 'Cửa hàng đã nhận ' || private.vnd_text(new.amount_vnd),
        case when owed > 0 then 'Còn nợ ' || private.vnd_text(owed) else 'Đã hết nợ' end, '/customer/debts', true, new.id::text);
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_payment() from public, anon, authenticated, service_role;

-- ===== 3. Debt reminders: overdue every 3 days, due soon / today daily =====
create or replace function private.customer_debt_reminders(at_day date default (now() at time zone 'Asia/Ho_Chi_Minh')::date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  row record;
  body text;
  made integer := 0;
begin
  for row in
    select o.customer_id, min(o.due_date) filter (where o.due_date < at_day) overdue_from,
      min(o.due_date) filter (where o.due_date >= at_day) next_due, sum(o.owed)::bigint owed
    from (select x.customer_id, x.due_date, private.current_receivable_outstanding(x.id) owed
      from public.receivable_obligations x join public.customers c on c.id = x.customer_id and c.active
      where x.due_date <= at_day + 3) o
    where o.owed > 0
    group by o.customer_id order by o.customer_id
  loop
    body := case
      when row.overdue_from is not null and (at_day - row.overdue_from - 1) % 3 = 0 then 'Quá hạn từ ' || to_char(row.overdue_from, 'DD/MM/YYYY')
      when row.next_due = at_day then 'Đến hạn hôm nay'
      when row.next_due is not null then 'Đến hạn ' || to_char(row.next_due, 'DD/MM/YYYY') end;
    if body is null then continue; end if;
    if private.customer_push(row.customer_id, 'customer.debt_reminder', 'Nhắc thanh toán: ' || private.vnd_text(row.owed), body,
        '/customer/debts', true, row.customer_id || ':' || at_day) > 0 then
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;
revoke all on function private.customer_debt_reminders(date) from public, anon, authenticated, service_role;

-- ===== 4. "Hủy đơn" (D94 body; changes: plain cancel reason, list in its own audit event, line reservations released) =====
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
              when released_lines > 0 then array['inventory_reservations'] else '{}'::text[] end,
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
  is 'Cancels a draft / confirmed order and releases its credit and the stock its lines hold; D94: its deliveries that never ran are cancelled with it (reservations released, jobs cancelled, listed in audit sales_order.cancel_deliveries), a delivery that happened refuses. Audited, idempotent, permission orders.cancel.';

notify pgrst, 'reload schema';
commit;
