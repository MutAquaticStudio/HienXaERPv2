-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý"), delivery verification (private.verify_delivery_core, latest body
-- 20261022100100) and "Đóng phần còn lại" (public.close_sales_order_remaining, 20261007183000):
-- * S4: the receivable due date is the Vietnam business day + the customer's payment terms (private.business_today()).
-- * S3: the receivable made for an order is paid at once from that order's own unallocated prepayment (D25 records it with
--   post_payment as a customer advance named "Trả trước đơn <số đơn>"), oldest receipt first, never more than the receivable
--   owes, through private.allocate_payment_lines (payment row lock, advance_allocations ledger) with an audit event
--   `payment.allocated`. The verification's own command receipt makes it run once. A prepaid order is then not overdue and its
--   prepayment no longer reads as an advance.
-- * S2: when a verification brings a sales-order line to its ordered quantity (accepted) but the line was billed less than its
--   amount, the rest of that line's credit commitment is released (consumed + released = amount; 10 bao delivered, 9 billed →
--   100 000 ₫ freed). "Đóng phần còn lại" is also allowed when every line is delivered but credit is still held.
begin;

create or replace function private.verify_delivery_core(target_delivery_result_id uuid, verification_lines jsonb, expected_delivery_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.delivery_results%rowtype; delivery public.deliveries%rowtype; result_line public.delivery_result_lines%rowtype;
  line public.delivery_lines%rowtype; handoff_line public.delivery_handoff_lines%rowtype; item jsonb;
  accepted numeric; billable numeric; reason text; ar_amount bigint; cost_value bigint; total_ar bigint := 0; total_cost bigint := 0;
  prior_billable numeric; prior_receivable bigint; cumulative_charge bigint;
  verification_id uuid; verification_line_id uuid; commitment public.credit_commitments%rowtype;
  -- D96: the receivable made here, the order's own prepayment allocated to it, the commitment of lines delivered in full.
  receivable_id uuid; order_no text; prepaid record; owed bigint; take bigint; release_total bigint := 0; so_line record;

begin
  select * into result from public.delivery_results where id = target_delivery_result_id;
  select * into delivery from public.deliveries where id = result.delivery_id for update;
  if delivery.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.require_quantity_lines(verification_lines,array['accepted_base_quantity','billable_base_quantity'],true);

  if delivery.execution_state <> 'RESULT_SUBMITTED' or delivery.version  IS DISTINCT FROM expected_delivery_version or jsonb_array_length(verification_lines) = 0 then raise exception 'delivery_verification_version_conflict' using errcode = 'PT409'; end if;
  -- Same source-line lock order in all simultaneous verifications.
  perform 1 from public.sales_order_lines sl join public.delivery_lines dl on dl.sales_order_line_id=sl.id
    where dl.delivery_id=delivery.id order by sl.id for update of sl;
  insert into public.delivery_verifications(delivery_id, delivery_result_id, verified_by)
  values (delivery.id, result.id, (select auth.uid())) returning id into verification_id;
  for result_line in select * from public.delivery_result_lines where delivery_result_id = result.id order by id loop
    select * into line from public.delivery_lines where id = result_line.delivery_line_id;
    handoff_line := null;
    select value into item from jsonb_array_elements(verification_lines) where (value->>'delivery_line_id')::uuid = line.id;
    if item is null then raise exception 'verification_line_missing' using errcode = '22023'; end if;
    accepted := (item->>'accepted_base_quantity')::numeric;
    billable := (item->>'billable_base_quantity')::numeric;
    reason := nullif(trim(item->>'billing_variance_reason'), '');

    if result.source_work_item_result_id is not null and accepted is distinct from result_line.actual_base_quantity then
      if coalesce(length(trim(item->>'verification_adjustment_reason')),0) not between 3 and 500 then
        raise exception 'worker_quantity_adjustment_reason_required' using errcode='22023';
      end if;
    end if;
  
    if accepted < 0 or accepted > result_line.actual_base_quantity or billable < 0 or billable > result_line.actual_base_quantity then raise exception 'invalid_verified_quantity' using errcode = '22023'; end if;
    if billable <> accepted and (coalesce(char_length(reason),0) < 3 or not private.has_permission(delivery.branch_id, 'delivery.billing.override')) then raise exception 'billing_variance_not_authorized' using errcode = '42501'; end if;
    select coalesce(sum(v.billable_base_quantity),0),coalesce(sum(v.receivable_amount_vnd),0)::bigint
      into prior_billable,prior_receivable
      from public.delivery_verification_lines v join public.delivery_lines dl on dl.id=v.delivery_line_id
      join public.deliveries d on d.id=dl.delivery_id
      where dl.sales_order_line_id=line.sales_order_line_id and d.execution_state='VERIFIED';
    cumulative_charge:=round((prior_billable+billable)*line.unit_price_vnd*line.conversion_denominator/line.conversion_numerator)::bigint;
    ar_amount:=cumulative_charge-prior_receivable;
    if ar_amount<0 then raise exception 'billing_source_requires_reconciliation' using errcode='23514';end if;
    cost_value := null;
    if line.source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      select hl.* into handoff_line from public.delivery_handoff_lines hl join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
        where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
      if handoff_line.id is not null and handoff_line.moved_base_quantity=0 and accepted=0 then
        cost_value:=0;
      else
      if handoff_line.id is null or handoff_line.unit_cost_vnd_per_base is null then raise exception 'delivery_cost_basis_missing' using errcode = '23514'; end if;
      select case when accepted = p.base_quantity then p.inventory_value_vnd
        else round(accepted * handoff_line.unit_cost_vnd_per_base)::bigint end into cost_value
        from private.delivery_line_transit_position(line.id) p;
      if accepted > (select p.base_quantity from private.delivery_line_transit_position(line.id) p)
        or (accepted > 0 and cost_value <= 0) then
        raise exception 'delivery_cost_quantity_invalid' using errcode = '23514';
      end if;
      end if;
    end if;
    insert into public.delivery_verification_lines(delivery_verification_id, delivery_line_id, actual_base_quantity,
      accepted_base_quantity, billable_base_quantity, billing_variance_reason, receivable_amount_vnd,
      inventory_cost_vnd, inventory_unit_cost_vnd_per_base)
    values (verification_id, line.id, result_line.actual_base_quantity, accepted, billable, reason, ar_amount,
      cost_value, handoff_line.unit_cost_vnd_per_base) returning id into verification_line_id;
    if cost_value is not null and cost_value > 0 then
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_verification_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'DELIVERY_VERIFIED', -accepted, -cost_value, handoff_line.unit_cost_vnd_per_base,
        verification_line_id, now(), (select auth.uid()));
      total_cost := total_cost + cost_value;
    end if;
    total_ar := total_ar + ar_amount;
  end loop;
  if total_ar > 0 then
    perform 1 from public.customers where id = delivery.customer_id for update;
    select * into commitment from public.credit_commitments where sales_order_id = delivery.sales_order_id for update;
    if commitment.id is null or commitment.consumed_vnd + commitment.released_vnd + total_ar > commitment.amount_vnd then raise exception 'credit_commitment_insufficient' using errcode = '23514'; end if;
    update public.credit_commitments set consumed_vnd = consumed_vnd + total_ar where id = commitment.id;
    -- D96 (S4): the due date counts from the business day in Vietnam, not the database's UTC day.
    insert into public.receivable_obligations(branch_id, customer_id, site_id, opening_source_id,
      delivery_verification_id, original_amount_vnd, due_date, recorded_by)
    select delivery.branch_id, delivery.customer_id, delivery.site_id, null, verification_id, total_ar,
      private.business_today() + c.payment_terms_days, (select auth.uid()) from public.customers c where c.id = delivery.customer_id
    returning id into receivable_id;
    -- D96 (S3): the order's own prepayment ("Trả trước đơn <số>", D25 — a customer advance) pays this receivable, oldest
    -- first, never more than it owes, through the same allocation core as "Phân bổ" (payment row locks, advance ledger).
    select o.order_number into order_no from public.sales_orders o where o.id = delivery.sales_order_id;
    for prepaid in
      select a.id advance_id, p.id payment_id from public.advances a join public.payments p on p.id = a.payment_id
      where a.branch_id = delivery.branch_id and a.customer_id = delivery.customer_id and a.advance_side = 'CUSTOMER'
        and a.reversal_of_advance_id is null and p.direction = 'RECEIPT' and p.reversal_of_payment_id is null
        and p.external_reference = 'Trả trước đơn ' || order_no
      order by p.effective_at, p.posted_at, p.id
      for update of p
    loop
      owed := private.current_receivable_outstanding(receivable_id);
      exit when owed <= 0;
      take := least(owed, greatest(private.advance_remaining(prepaid.advance_id), 0), greatest(private.payment_available(prepaid.payment_id), 0));
      continue when take <= 0;
      perform private.allocate_payment_lines(prepaid.payment_id,
        jsonb_build_array(jsonb_build_object('obligation_id', receivable_id, 'amount_vnd', take)), (select auth.uid()));
      insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
      values ((select auth.uid()), delivery.branch_id, 'payment.allocated', 'payment', prepaid.payment_id, operation_id, array['allocations'],
        'Tự trừ tiền trả trước của đơn ' || order_no || ' vào công nợ khi xác minh giao');
    end loop;
    insert into public.revenue_entries(branch_id, sales_order_id, delivery_verification_id, amount_vnd, recorded_by)
    values (delivery.branch_id, delivery.sales_order_id, verification_id, total_ar, (select auth.uid()));
  end if;
  -- D96 (S2): a line delivered in full by this verification (accepted reaches the ordered quantity) but billed less frees
  -- the rest of its credit commitment, so consumed + released ends equal to the line amount (10 bao delivered, 9 billed).
  for so_line in
    select sl.id, sl.line_total_vnd, sl.quantity * sl.conversion_numerator / sl.conversion_denominator ordered_base,
      coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v
        join public.delivery_lines dl on dl.id = v.delivery_line_id join public.deliveries d on d.id = dl.delivery_id
        where dl.sales_order_line_id = sl.id and d.execution_state = 'VERIFIED'), 0) accepted_before,
      coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v
        join public.delivery_lines dl on dl.id = v.delivery_line_id
        where dl.sales_order_line_id = sl.id and v.delivery_verification_id = verification_id), 0) accepted_now,
      coalesce((select sum(v.receivable_amount_vnd) from public.delivery_verification_lines v
        join public.delivery_lines dl on dl.id = v.delivery_line_id join public.deliveries d on d.id = dl.delivery_id
        where dl.sales_order_line_id = sl.id and (d.execution_state = 'VERIFIED' or v.delivery_verification_id = verification_id)), 0)::bigint billed
    from public.sales_order_lines sl
    where sl.id in (select dl.sales_order_line_id from public.delivery_lines dl where dl.delivery_id = delivery.id)
    order by sl.id
  loop
    if so_line.accepted_before < so_line.ordered_base and so_line.accepted_before + so_line.accepted_now >= so_line.ordered_base then
      release_total := release_total + greatest(so_line.line_total_vnd - so_line.billed, 0);
    end if;
  end loop;
  if release_total > 0 then
    perform 1 from public.customers where id = delivery.customer_id for update;
    select * into commitment from public.credit_commitments where sales_order_id = delivery.sales_order_id for update;
    if commitment.id is not null then
      release_total := least(release_total, commitment.amount_vnd - commitment.consumed_vnd - commitment.released_vnd);
      if release_total > 0 then
        update public.credit_commitments set released_vnd = released_vnd + release_total where id = commitment.id;
      end if;
    end if;
  end if;
  if total_cost > 0 then
    insert into public.direct_cost_entries(branch_id, sales_order_id, delivery_verification_id,
      amount_delta_vnd, cost_kind, recorded_by)
    values (delivery.branch_id, delivery.sales_order_id, verification_id, total_cost, 'WAREHOUSE_COGS', (select auth.uid()));
  end if;
  update public.deliveries set execution_state = 'VERIFIED', version = version + 1, verified_at = now() where id = delivery.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), delivery.branch_id, 'delivery.verify', 'delivery_verification', verification_id, operation_id, array['inventory','receivable','revenue','direct_cost','credit_commitment']
    , case when result.source_work_item_result_id is not null then (
      select string_agg((correction.item->>'delivery_line_id') || ': ' || trim(correction.item->>'verification_adjustment_reason'), '; ' order by correction.item->>'delivery_line_id')
      from jsonb_array_elements(verification_lines) as correction(item)
      join public.delivery_result_lines reported on reported.delivery_result_id=result.id
        and reported.delivery_line_id=(correction.item->>'delivery_line_id')::uuid
      where (correction.item->>'accepted_base_quantity')::numeric is distinct from reported.actual_base_quantity
    ) else null end
  );
  return verification_id;
end
$function$
;
revoke all on function private.verify_delivery_core(uuid, jsonb, integer, uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_sales_order_remaining(
  target_order_id uuid, close_reason text, operation_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  order_row public.sales_orders%ROWTYPE;
  receipt public.command_receipts%ROWTYPE;
  payload_hash text;
BEGIN
  SELECT * INTO order_row FROM public.sales_orders WHERE id = target_order_id;
  IF NOT FOUND OR NOT private.has_permission(order_row.branch_id, 'orders.cancel') THEN
    RAISE EXCEPTION 'forbidden_or_order_not_found' USING ERRCODE = '42501';
  END IF;
  IF close_reason IS NULL OR char_length(trim(close_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'close_reason_required' USING ERRCODE = '22023';
  END IF;
  -- Same allocation -> sales-line -> sales-order lock order as Delivery creation.
  PERFORM 1 FROM public.supply_allocations a
    JOIN public.sales_order_lines l ON l.id = a.sales_order_line_id
    WHERE l.sales_order_id = target_order_id ORDER BY a.id FOR UPDATE OF a;
  PERFORM 1 FROM public.sales_order_lines WHERE sales_order_id = target_order_id ORDER BY id FOR UPDATE;
  SELECT * INTO order_row FROM public.sales_orders WHERE id = target_order_id FOR UPDATE;
  IF NOT private.has_permission(order_row.branch_id, 'orders.cancel') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  payload_hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id, 'reason', trim(close_reason)));
  SELECT * INTO receipt FROM public.command_receipts r WHERE r.operation_id = close_sales_order_remaining.operation_id;
  IF FOUND THEN
    IF receipt.command_name <> 'close_sales_order_remaining' OR receipt.payload_hash <> payload_hash
      OR receipt.actor_auth_user_id <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'operation_payload_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN receipt.result_entity_id;
  END IF;
  IF order_row.commercial_state <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'sales_order_not_closeable' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries d WHERE d.sales_order_id = target_order_id AND d.execution_state NOT IN ('VERIFIED', 'CANCELLED'))
    OR EXISTS (SELECT 1 FROM public.return_cases r JOIN public.delivery_lines l ON l.id = r.delivery_line_id
      JOIN public.deliveries d ON d.id = l.delivery_id WHERE d.sales_order_id = target_order_id AND r.state = 'OPEN')
    OR EXISTS (SELECT 1 FROM public.work_items w JOIN public.deliveries d ON d.id = w.delivery_id
      WHERE d.sales_order_id = target_order_id AND w.execution_state NOT IN ('VERIFIED', 'CANCELLED'))
    OR EXISTS (SELECT 1 FROM public.inventory_movements m JOIN public.deliveries d ON d.id = m.delivery_id
      WHERE d.sales_order_id = target_order_id AND m.location_kind = 'IN_TRANSIT'
      GROUP BY m.delivery_id, m.material_id, m.base_uom_id
      HAVING sum(m.base_quantity_delta) <> 0 OR sum(m.inventory_value_delta_vnd) <> 0) THEN
    RAISE EXCEPTION 'sales_order_unresolved_execution' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_lines l WHERE l.sales_order_id = target_order_id
    AND l.quantity * l.conversion_numerator / l.conversion_denominator > coalesce((
      SELECT sum(v.accepted_base_quantity) FROM public.delivery_verification_lines v
        JOIN public.delivery_lines dl ON dl.id = v.delivery_line_id
        JOIN public.deliveries d ON d.id = dl.delivery_id
      WHERE dl.sales_order_line_id = l.id AND d.execution_state = 'VERIFIED'), 0))
    -- D96 (S2): an order delivered in full may still hold credit (billed less than delivered); closing frees it.
    AND NOT EXISTS (SELECT 1 FROM public.credit_commitments c WHERE c.sales_order_id = target_order_id
      AND c.amount_vnd - c.consumed_vnd - c.released_vnd > 0) THEN
    RAISE EXCEPTION 'sales_order_has_no_remaining' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.customers WHERE id = order_row.customer_id FOR UPDATE;
  UPDATE public.inventory_reservations r SET state = 'RELEASED', version = r.version + 1, finalized_at = now()
    WHERE r.state = 'ACTIVE' AND r.sales_order_line_id IN (SELECT id FROM public.sales_order_lines WHERE sales_order_id = target_order_id);
  UPDATE public.credit_commitments SET released_vnd = amount_vnd - consumed_vnd WHERE sales_order_id = target_order_id;
  UPDATE public.sales_orders SET commercial_state = 'CLOSED' WHERE id = target_order_id;
  INSERT INTO public.command_receipts VALUES (operation_id, (SELECT auth.uid()), 'close_sales_order_remaining', payload_hash, 'sales_order', target_order_id, now());
  INSERT INTO public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    VALUES ((SELECT auth.uid()), order_row.branch_id, 'sales_order.remaining.close', 'sales_order', target_order_id, operation_id,
      ARRAY['commercial_state', 'credit_commitment', 'inventory_reservation'], trim(close_reason));
  RETURN target_order_id;
END
$function$;
REVOKE ALL ON FUNCTION public.close_sales_order_remaining(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_sales_order_remaining(uuid, text, uuid) TO authenticated;

notify pgrst, 'reload schema';
commit;
