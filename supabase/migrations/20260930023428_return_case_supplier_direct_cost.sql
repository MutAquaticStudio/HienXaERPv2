-- Supplier-direct deliveries have no inventory handoff cost. Use the verified
-- fulfillment cost of the exact PO/SO line, not the fulfillment-wide cost.
create or replace function public.resolve_return_case(
  target_return_case_id uuid,
  resolution text,
  target_warehouse_id uuid,
  resolution_reason text,
  target_evidence_id uuid,
  expected_version integer,
  operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
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
  if case_row.state <> 'OPEN' or case_row.version <> expected_version or char_length(trim(resolution_reason)) < 3 then raise exception 'return_case_version_conflict' using errcode = '40001'; end if;
  perform private.assert_verified_evidence(target_evidence_id, case_row.branch_id);
  select hl.* into handoff_line from public.delivery_handoff_lines hl join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
    where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
  if line.source_mode = 'SUPPLIER_DIRECT' and case_row.case_kind = 'CUSTOMER_RETURN' then
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
  if case_row.case_kind in ('CUSTOMER_RETURN','TRANSIT_REMAINDER') then
    if resolution <> 'RETURNED' or not exists (select 1 from public.warehouses where id = target_warehouse_id and branch_id = case_row.branch_id and active) then raise exception 'invalid_return_resolution' using errcode = '22023'; end if;
    perform 1 from public.warehouses where id = target_warehouse_id for update;
    if case_row.case_kind = 'TRANSIT_REMAINDER' then
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
    if case_row.case_kind = 'CUSTOMER_RETURN' then
      insert into public.direct_cost_entries(branch_id, sales_order_id, return_case_id, amount_delta_vnd, cost_kind, recorded_by)
      values (case_row.branch_id, delivery.sales_order_id, case_row.id, -value_amount, 'RETURN_REVERSAL', (select auth.uid()));
    end if;
    update public.return_cases set state = 'RETURNED', resolution_warehouse_id = target_warehouse_id,
      resolution_reason = trim(resolve_return_case.resolution_reason), evidence_object_id = coalesce(target_evidence_id, evidence_object_id),
      version = version + 1, resolved_by = (select auth.uid()), resolved_at = now() where id = case_row.id;
  elsif case_row.case_kind = 'TRANSIT_LOSS' then
    if resolution <> 'LOSS_APPROVED' then raise exception 'invalid_loss_resolution' using errcode = '22023'; end if;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_return_case_id, occurred_at, recorded_by)
    values (case_row.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
      'TRANSIT_LOSS', -case_row.base_quantity, -value_amount, unit_cost, case_row.id, now(), (select auth.uid()));
    insert into public.direct_cost_entries(branch_id, sales_order_id, return_case_id, amount_delta_vnd, cost_kind, recorded_by)
    values (case_row.branch_id, delivery.sales_order_id, case_row.id, value_amount, 'LOSS', (select auth.uid()));
    update public.return_cases set state = 'LOSS_APPROVED', resolution_reason = trim(resolve_return_case.resolution_reason),
      evidence_object_id = coalesce(target_evidence_id, evidence_object_id), version = version + 1,
      resolved_by = (select auth.uid()), resolved_at = now() where id = case_row.id;
  else raise exception 'invalid_return_resolution' using errcode = '22023'; end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'resolve_return_case', hash, 'return_case', case_row.id, now());
  return case_row.id;
end
$function$;
