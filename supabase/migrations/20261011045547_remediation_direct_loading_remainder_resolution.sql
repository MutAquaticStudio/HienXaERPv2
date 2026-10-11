begin;
-- Direct pickup residuals are actual goods, with supplier source cost and no synthetic internal transit ledger.
CREATE OR REPLACE FUNCTION public.open_return_case(target_delivery_verification_line_id uuid, case_kind text, requested_base_quantity numeric, reason text, target_evidence_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  verified_line public.delivery_verification_lines%rowtype;
  line public.delivery_lines%rowtype;
  delivery public.deliveries%rowtype;
  handoff_line public.delivery_handoff_lines%rowtype;
  available numeric;
  pending numeric;
  resolved numeric;
  case_id uuid;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into verified_line from public.delivery_verification_lines where id = target_delivery_verification_line_id;
  select * into line from public.delivery_lines where id = verified_line.delivery_line_id;
  select * into delivery from public.deliveries where id = line.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.exception') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if case_kind not in ('CUSTOMER_RETURN','TRANSIT_REMAINDER','TRANSIT_LOSS')
    or requested_base_quantity <= 0 or char_length(trim(reason)) < 3 then
    raise exception 'invalid_return_case' using errcode = '22023';
  end if;
  perform private.assert_verified_evidence(target_evidence_id, delivery.branch_id);
  hash := private.command_payload_hash(jsonb_build_object(
    'verification_line_id', target_delivery_verification_line_id, 'kind', case_kind,
    'quantity', requested_base_quantity, 'reason', trim(reason), 'evidence_id', target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = open_return_case.operation_id;
  if found then
    if receipt.command_name <> 'open_return_case' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_exact_quantity(requested_base_quantity,false);

  if case_kind = 'CUSTOMER_RETURN' then
    available := verified_line.accepted_base_quantity;
    select coalesce(sum(rc.base_quantity), 0) into pending from public.return_cases rc
      where rc.delivery_verification_line_id = verified_line.id
        and rc.case_kind = 'CUSTOMER_RETURN' and rc.state <> 'CANCELLED';
  else
    select hl.* into handoff_line from public.delivery_handoff_lines hl
      join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
      where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
    if handoff_line.id is null then
      raise exception 'delivery_handoff_line_missing' using errcode = '23514';
    end if;
    select coalesce(sum(rc.base_quantity), 0) into resolved from public.return_cases rc
      where rc.delivery_line_id = line.id
        and rc.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS')
        and rc.state in ('RETURNED','LOSS_APPROVED');
    available := greatest(handoff_line.moved_base_quantity - verified_line.accepted_base_quantity - resolved, 0);
    select coalesce(sum(rc.base_quantity), 0) into pending from public.return_cases rc
      where rc.delivery_line_id = line.id
        and rc.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') and rc.state = 'OPEN';
  end if;
  if requested_base_quantity + pending > available then
    raise exception 'return_quantity_exceeds_source' using errcode = '23514';
  end if;
  insert into public.return_cases(branch_id, delivery_verification_line_id, delivery_line_id, case_kind,
    base_quantity, reason, evidence_object_id, opened_by)
  values (delivery.branch_id, verified_line.id, line.id, case_kind, requested_base_quantity,
    trim(reason), target_evidence_id, (select auth.uid())) returning id into case_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
   values((select auth.uid()),delivery.branch_id,'delivery.return_opened','return_case',case_id,operation_id,
    array['case_kind','base_quantity','source_verification'],trim(reason));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_return_case', hash, 'return_case', case_id, now());
  return case_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_return_case(target_return_case_id uuid, resolution text, target_warehouse_id uuid, resolution_reason text, target_evidence_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare case_row public.return_cases%rowtype; line public.delivery_lines%rowtype; delivery public.deliveries%rowtype;
  verified_line public.delivery_verification_lines%rowtype; handoff_line public.delivery_handoff_lines%rowtype;
  unit_cost numeric; value_amount bigint; hash text; receipt public.command_receipts%rowtype;
begin
  select * into case_row from public.return_cases where id = target_return_case_id for update;
  select * into line from public.delivery_lines where id = case_row.delivery_line_id;
  select * into delivery from public.deliveries where id = line.delivery_id for update;
  select * into verified_line from public.delivery_verification_lines where id = case_row.delivery_verification_line_id;
  if case_row.id is null or not private.has_permission(case_row.branch_id, 'delivery.exception') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('return_case_id', target_return_case_id, 'resolution', resolution, 'warehouse_id', target_warehouse_id, 'reason', trim(resolution_reason), 'evidence_id', target_evidence_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = resolve_return_case.operation_id;
  if found then if receipt.command_name <> 'resolve_return_case' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if case_row.state <> 'OPEN' or case_row.version  IS DISTINCT FROM expected_version or char_length(trim(resolution_reason)) < 3 then raise exception 'return_case_version_conflict' using errcode = 'PT409'; end if;
  perform private.assert_verified_evidence(target_evidence_id, case_row.branch_id);
  select hl.* into handoff_line from public.delivery_handoff_lines hl join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
    where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
  if line.source_mode = 'SUPPLIER_DIRECT' then
    select sum(sfl.payable_amount_vnd)::numeric / nullif(sum(sfl.supplier_base_quantity), 0)
      into unit_cost
    from public.supply_allocations sa
    join public.supplier_fulfillment_lines sfl
      on sfl.purchase_order_line_id = sa.purchase_order_line_id
      and sfl.sales_order_line_id = line.sales_order_line_id
    join public.supplier_fulfillments sf on sf.id = sfl.supplier_fulfillment_id
    where sa.id = line.supply_allocation_id and sf.branch_id = case_row.branch_id;
  else
    unit_cost := coalesce(verified_line.inventory_unit_cost_vnd_per_base, handoff_line.unit_cost_vnd_per_base);
  end if;
  if unit_cost is null or unit_cost <= 0 then raise exception 'return_cost_basis_missing' using errcode = '23514'; end if;
  value_amount := round(case_row.base_quantity * unit_cost)::bigint;
  if case_row.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') then
    if line.source_mode='SUPPLIER_DIRECT' then
      if case_row.base_quantity>handoff_line.moved_base_quantity-verified_line.accepted_base_quantity
        -coalesce((select sum(r.base_quantity) from public.return_cases r where r.delivery_line_id=line.id
          and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state in('RETURNED','LOSS_APPROVED')),0)
      then raise exception 'return_exceeds_transit_position' using errcode='23514';end if;
      if value_amount<=0 then raise exception 'return_cost_below_currency_precision' using errcode='23514';end if;
    else
    if case_row.base_quantity > (select p.base_quantity from private.delivery_line_transit_position(line.id) p) then
      raise exception 'return_exceeds_transit_position' using errcode = '23514';
    end if;
    select case when case_row.base_quantity = p.base_quantity then p.inventory_value_vnd
      else value_amount end into value_amount from private.delivery_line_transit_position(line.id) p;
    if value_amount <= 0 then raise exception 'return_cost_below_currency_precision' using errcode = '23514'; end if;
    end if;
  end if;
  if case_row.case_kind in ('CUSTOMER_RETURN','TRANSIT_REMAINDER') then
    if resolution <> 'RETURNED' or not exists (select 1 from public.warehouses where id = target_warehouse_id and branch_id = case_row.branch_id and active) then raise exception 'invalid_return_resolution' using errcode = '22023'; end if;
    perform 1 from public.warehouses where id = target_warehouse_id for update;
    if case_row.case_kind = 'TRANSIT_REMAINDER' and line.source_mode<>'SUPPLIER_DIRECT' then
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_return_case_id, occurred_at, recorded_by)
      values (case_row.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'RETURN_TRANSFER', -case_row.base_quantity, -value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    end if;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_return_case_id, occurred_at, recorded_by)
    values (case_row.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', target_warehouse_id,
      case when case_row.case_kind = 'CUSTOMER_RETURN' then 'CUSTOMER_RETURN' else 'RETURN_TRANSFER' end,
      case_row.base_quantity, value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    if case_row.case_kind = 'CUSTOMER_RETURN' or(line.source_mode='SUPPLIER_DIRECT' and case_row.case_kind='TRANSIT_REMAINDER') then
      insert into public.direct_cost_entries(branch_id, sales_order_id, return_case_id, amount_delta_vnd, cost_kind, recorded_by)
      values (case_row.branch_id, delivery.sales_order_id, case_row.id, -value_amount, 'RETURN_REVERSAL', (select auth.uid()));
    end if;
    update public.return_cases set state = 'RETURNED', resolution_warehouse_id = target_warehouse_id,
      resolution_reason = trim(resolve_return_case.resolution_reason), evidence_object_id = coalesce(target_evidence_id, evidence_object_id),
      version = version + 1, resolved_by = (select auth.uid()), resolved_at = now() where id = case_row.id;
  elsif case_row.case_kind = 'TRANSIT_LOSS' then
    if resolution <> 'LOSS_APPROVED' then raise exception 'invalid_loss_resolution' using errcode = '22023'; end if;
    if line.source_mode<>'SUPPLIER_DIRECT' then
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_return_case_id, occurred_at, recorded_by)
    values (case_row.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
      'TRANSIT_LOSS', -case_row.base_quantity, -value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    insert into public.direct_cost_entries(branch_id, sales_order_id, return_case_id, amount_delta_vnd, cost_kind, recorded_by)
    values (case_row.branch_id, delivery.sales_order_id, case_row.id, value_amount, 'LOSS', (select auth.uid()));
    end if; -- Supplier-direct source cost already includes the lost units; do not post it twice.
    update public.return_cases set state = 'LOSS_APPROVED', resolution_reason = trim(resolve_return_case.resolution_reason),
      evidence_object_id = coalesce(target_evidence_id, evidence_object_id), version = version + 1,
      resolved_by = (select auth.uid()), resolved_at = now() where id = case_row.id;
  else raise exception 'invalid_return_resolution' using errcode = '22023'; end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
   values((select auth.uid()),case_row.branch_id,'delivery.return_resolved','return_case',case_row.id,operation_id,
    array['state','resolution_warehouse_id','physical_custody','source_cost'],trim(resolution_reason));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'resolve_return_case', hash, 'return_case', case_row.id, now());
  return case_row.id;
end
$function$
;
notify pgrst,'reload schema';
commit;
