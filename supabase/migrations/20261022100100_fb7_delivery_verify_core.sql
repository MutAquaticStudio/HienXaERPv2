-- FB7 2/5: verification shared by the office page and the worker's report; goods not delivered go back to their warehouse.
begin;

-- Verifying a delivery result, shared by the office page and the worker's report (body of 20261011025252, without the caller check).
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

revoke all on function private.verify_delivery_core(uuid, jsonb, integer, uuid) from public, anon, authenticated, service_role;

create or replace function public.verify_delivery(target_delivery_result_id uuid, verification_lines jsonb, expected_delivery_version integer, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare result public.delivery_results%rowtype; delivery public.deliveries%rowtype; hash text; receipt public.command_receipts%rowtype; verification_id uuid;
begin
  select * into result from public.delivery_results where id = target_delivery_result_id;
  select * into delivery from public.deliveries where id = result.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('result_id', target_delivery_result_id, 'lines', verification_lines, 'version', expected_delivery_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_delivery.operation_id;
  if found then if receipt.command_name <> 'verify_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  verification_id := private.verify_delivery_core(target_delivery_result_id, verification_lines, expected_delivery_version, verify_delivery.operation_id);
  insert into public.command_receipts values (verify_delivery.operation_id, (select auth.uid()), 'verify_delivery', hash, 'delivery_verification', verification_id, now());
  return verification_id;
end
$function$;

-- Goods still on the truck after a verified delivery go back to the warehouse they were taken from.
create or replace function private.return_delivery_remainder(target_delivery_id uuid, operation_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $function$
declare delivery public.deliveries%rowtype; line public.delivery_lines%rowtype; verified_line public.delivery_verification_lines%rowtype;
  remaining numeric; remaining_value bigint; unit_cost numeric; case_id uuid; returned integer := 0;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or delivery.execution_state <> 'VERIFIED' then return 0; end if;
  for line in select l.* from public.delivery_lines l where l.delivery_id = delivery.id
      and l.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE') order by l.id loop
    select p.base_quantity, p.inventory_value_vnd into remaining, remaining_value from private.delivery_line_transit_position(line.id) p;
    if coalesce(remaining, 0) <= 0 or coalesce(remaining_value, 0) <= 0 then continue; end if;
    if not exists (select 1 from public.warehouses w where w.id = line.warehouse_id and w.branch_id = delivery.branch_id and w.active) then continue; end if;
    perform 1 from public.warehouses where id = line.warehouse_id for update;
    select v.* into verified_line from public.delivery_verification_lines v
      join public.delivery_verifications dv on dv.id = v.delivery_verification_id
      where v.delivery_line_id = line.id and dv.delivery_id = delivery.id order by dv.verified_at desc, v.id limit 1;
    if verified_line.id is null then continue; end if;
    unit_cost := remaining_value::numeric / remaining;
    insert into public.return_cases(branch_id, delivery_verification_line_id, delivery_line_id, case_kind, base_quantity, reason, state,
      resolution_warehouse_id, resolution_reason, opened_by, resolved_by, resolved_at)
    values (delivery.branch_id, verified_line.id, line.id, 'TRANSIT_REMAINDER', remaining, 'Hàng chưa giao, xe chở về kho', 'RETURNED',
      line.warehouse_id, 'Tự nhập lại kho xuất khi thợ báo giao', (select auth.uid()), (select auth.uid()), now()) returning id into case_id;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base, source_return_case_id, occurred_at, recorded_by)
    values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
      'RETURN_TRANSFER', -remaining, -remaining_value, unit_cost, case_id, now(), (select auth.uid()));
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base, source_return_case_id, occurred_at, recorded_by)
    values (delivery.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', line.warehouse_id,
      'RETURN_TRANSFER', remaining, remaining_value, unit_cost, case_id, now(), (select auth.uid()));
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values ((select auth.uid()), delivery.branch_id, 'delivery.return_resolved', 'return_case', case_id, operation_id,
      array['state', 'resolution_warehouse_id', 'physical_custody'], 'Hàng chưa giao tự nhập lại kho xuất');
    returned := returned + 1;
  end loop;
  return returned;
end
$function$;
revoke all on function private.return_delivery_remainder(uuid, uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
