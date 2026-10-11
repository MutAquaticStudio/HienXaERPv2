begin;
alter table public.delivery_handoff_lines drop constraint delivery_handoff_lines_moved_base_quantity_check;
alter table public.delivery_handoff_lines add constraint delivery_handoff_lines_moved_base_quantity_check check(moved_base_quantity>=0);
CREATE OR REPLACE FUNCTION public.handoff_delivery_actual(target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid, loaded_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; assignment public.delivery_assignments%rowtype;
  line public.delivery_lines%rowtype; reservation public.inventory_reservations%rowtype;
  loaded numeric; position_qty numeric; position_value bigint; unit_cost numeric; moved_value bigint;
  handoff_id uuid; handoff_line_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.handoff') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version, 'handed_off_at', handed_off_at,'loaded_lines',loaded_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = handoff_delivery_actual.operation_id;
  if found then if receipt.command_name <> 'handoff_delivery_actual' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'ASSIGNED' or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_not_handoff_ready' using errcode = 'PT409'; end if;
  perform private.require_quantity_lines(loaded_lines,array['loaded_base_quantity'],true);
  if handed_off_at is null or not isfinite(handed_off_at) then raise exception 'handoff_time_required' using errcode='22023';end if;
  if jsonb_array_length(loaded_lines)<>(select count(*) from public.delivery_lines where delivery_id=delivery.id)
   or (select count(distinct (i->>'delivery_line_id')::uuid) from jsonb_array_elements(loaded_lines) i)<>jsonb_array_length(loaded_lines)
   or exists(select 1 from jsonb_array_elements(loaded_lines) i where not exists(select 1 from public.delivery_lines l
     where l.id=(i->>'delivery_line_id')::uuid and l.delivery_id=delivery.id))
  then raise exception 'delivery_loading_line_missing_or_duplicate' using errcode='22023';end if;
  if not exists(select 1 from jsonb_array_elements(loaded_lines) i where (i->>'loaded_base_quantity')::numeric>0)
  then raise exception 'delivery_loading_empty' using errcode='22023';end if;
  -- Lock every warehouse and source in stable order before changing custody.
  perform 1 from public.supply_allocations where id in(select supply_allocation_id from public.delivery_lines where delivery_id=delivery.id) order by id for update;
  perform 1 from public.warehouses where id in(select warehouse_id from public.delivery_lines where delivery_id=delivery.id) order by id for update;
  select * into assignment from public.delivery_assignments where delivery_id = target_delivery_id and superseded_at is null;
  if assignment.id is null then raise exception 'delivery_assignment_missing' using errcode = '23514'; end if;
  insert into public.delivery_handoffs(delivery_id, assignment_id, handed_off_at, handed_off_by)
  values (target_delivery_id, assignment.id, handed_off_at, (select auth.uid())) returning id into handoff_id;
  for line in select * from public.delivery_lines where delivery_id = target_delivery_id order by id loop
    select (i->>'loaded_base_quantity')::numeric into loaded from jsonb_array_elements(loaded_lines) i where (i->>'delivery_line_id')::uuid=line.id;
    if loaded is null or loaded>line.planned_base_quantity then raise exception 'delivery_loaded_quantity_exceeds_plan' using errcode='22023';end if;
    if line.source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      perform 1 from public.warehouses where id = line.warehouse_id for update;
      select * into reservation from public.inventory_reservations where delivery_line_id = line.id for update;
      if reservation.id is null or reservation.state <> 'ACTIVE' or reservation.reserved_base_quantity <> line.planned_base_quantity then raise exception 'delivery_reservation_invalid' using errcode = '23514'; end if;
      if loaded=0 then
       insert into public.delivery_handoff_lines(delivery_handoff_id,delivery_line_id,moved_base_quantity,unit_cost_vnd_per_base,inventory_value_vnd)
        values(handoff_id,line.id,0,null,null);
       update public.inventory_reservations set state='RELEASED',version=version+1,finalized_at=now() where id=reservation.id;
       continue;
      end if;
      select coalesce(sum(base_quantity_delta), 0), coalesce(sum(inventory_value_delta_vnd), 0)::bigint
        into position_qty, position_value from public.inventory_movements
        where warehouse_id = line.warehouse_id and material_id = line.material_id;
      if position_qty < loaded or position_qty <= 0 or position_value <= 0 then raise exception 'insufficient_inventory_for_handoff' using errcode = '23514'; end if;
      unit_cost := position_value::numeric / position_qty;
      moved_value := case when loaded=position_qty then position_value else round(loaded*unit_cost)::bigint end;
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity,
        unit_cost_vnd_per_base, inventory_value_vnd)
      values (handoff_id, line.id, loaded, unit_cost, moved_value) returning id into handoff_line_id;
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', line.warehouse_id,
        'DELIVERY_HANDOFF', -loaded, -moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'DELIVERY_HANDOFF', loaded, moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      update public.inventory_reservations set state = 'CONSUMED', version = version + 1, finalized_at = now() where id = reservation.id;
    else
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity)
      values (handoff_id, line.id, loaded);
    end if;
  end loop;
  update public.deliveries set execution_state = 'DISPATCHED', version = version + 1 where id = target_delivery_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
   values((select auth.uid()),delivery.branch_id,'delivery.loaded','delivery_handoff',handoff_id,operation_id,
    array['planned_base_quantity','moved_base_quantity','reservation','inventory_custody'], 'Ghi lượng thực lấy; phần chưa lấy được giải phóng giữ chỗ');
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'handoff_delivery_actual', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.verify_delivery(target_delivery_result_id uuid, verification_lines jsonb, expected_delivery_version integer, operation_id uuid)
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
  hash text; receipt public.command_receipts%rowtype;
begin
  select * into result from public.delivery_results where id = target_delivery_result_id;
  select * into delivery from public.deliveries where id = result.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('result_id', target_delivery_result_id, 'lines', verification_lines, 'version', expected_delivery_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_delivery.operation_id;
  if found then if receipt.command_name <> 'verify_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
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
    insert into public.receivable_obligations(branch_id, customer_id, site_id, opening_source_id,
      delivery_verification_id, original_amount_vnd, due_date, recorded_by)
    select delivery.branch_id, delivery.customer_id, delivery.site_id, null, verification_id, total_ar,
      current_date + c.payment_terms_days, (select auth.uid()) from public.customers c where c.id = delivery.customer_id;
    insert into public.revenue_entries(branch_id, sales_order_id, delivery_verification_id, amount_vnd, recorded_by)
    values (delivery.branch_id, delivery.sales_order_id, verification_id, total_ar, (select auth.uid()));
  end if;
  if total_cost > 0 then
    insert into public.direct_cost_entries(branch_id, sales_order_id, delivery_verification_id,
      amount_delta_vnd, cost_kind, recorded_by)
    values (delivery.branch_id, delivery.sales_order_id, verification_id, total_cost, 'WAREHOUSE_COGS', (select auth.uid()));
  end if;
  update public.deliveries set execution_state = 'VERIFIED', version = version + 1, verified_at = now() where id = delivery.id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'verify_delivery', hash, 'delivery_verification', verification_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), delivery.branch_id, 'delivery.verify', 'delivery_verification', verification_id, operation_id, array['inventory','receivable','revenue','direct_cost']
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
create or replace view public.delivery_line_read with(security_invoker=true) as
select q.*,h.moved_base_quantity::text as loaded_base_quantity from (SELECT l.id,
    l.delivery_id,
    l.sales_order_line_id,
    l.supply_allocation_id,
    l.material_id,
    s.material_name_snapshot,
    l.base_uom_id,
    u.symbol AS base_uom_symbol,
    l.source_mode,
    l.warehouse_id,
    l.planned_base_quantity::text AS planned_base_quantity,
    COALESCE(r.actual_base_quantity, 0::numeric)::text AS actual_base_quantity,
    COALESCE(v.accepted_base_quantity, 0::numeric)::text AS accepted_base_quantity,
    COALESCE(v.billable_base_quantity, 0::numeric)::text AS billable_base_quantity
   FROM delivery_lines l
     JOIN sales_order_lines s ON s.id = l.sales_order_line_id
     JOIN units_of_measure u ON u.id = l.base_uom_id
     LEFT JOIN delivery_result_lines r ON r.delivery_line_id = l.id
     LEFT JOIN delivery_verification_lines v ON v.delivery_line_id = l.id) q left join public.delivery_handoff_lines h on h.delivery_line_id=q.id;
notify pgrst,'reload schema';
commit;
