-- G02/G03/G12: exact quantities, source-line cumulative money and null-safe versions.
-- Numeric(20,6) storage supports at most six fractional digits; never silently coerce input.
begin;
create function private.require_exact_quantity(q numeric,allow_zero boolean default false) returns void
 language plpgsql security definer set search_path='' as $qty$
begin
 if q is null or q<0 or q>=100000000000000 or (not allow_zero and q=0)
 then raise exception 'quantity_invalid_or_out_of_range' using errcode='22023'; end if;
 if q<>trunc(q,6) then raise exception 'quantity_precision_exceeds_six' using errcode='22023'; end if;
end $qty$;
create function private.require_quantity_lines(lines jsonb,fields text[],allow_zero boolean default false) returns void
 language plpgsql security definer set search_path='' as $lines$
declare item jsonb; field text;
begin
 if lines is null or jsonb_typeof(lines) is distinct from 'array'
 or jsonb_array_length(lines) not between 1 and 50
 then raise exception 'quantity_lines_required' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(lines) loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'quantity_line_invalid' using errcode='22023';end if;
  foreach field in array fields loop
   if item->>field is null or item->>field !~ '^[0-9]+([.][0-9]+)?$'
   then raise exception 'quantity_format_invalid' using errcode='22023';end if;
   perform private.require_exact_quantity((item->>field)::numeric,allow_zero);
  end loop;
 end loop;
end $lines$;
revoke all on function private.require_exact_quantity(numeric,boolean),private.require_quantity_lines(jsonb,text[],boolean)
 from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.assert_commercial_line(target_branch_id uuid, target_customer_id uuid, line jsonb, actor_auth_user_id uuid)
 RETURNS TABLE(material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid, quantity numeric, conversion_numerator numeric, conversion_denominator numeric, rounding_mode text, unit_price_vnd bigint, line_total_vnd bigint, pricing_rule_id uuid, pricing_rule_version integer, price_source_type text, override_by uuid, override_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_rule public.pricing_rules%rowtype;
  selected_material_group_id uuid;
  selected_customer_tier_code text;
begin
  material_id := (line->>'material_id')::uuid;
  ordered_uom_id := (line->>'ordered_uom_id')::uuid;
  perform private.require_quantity_lines(jsonb_build_array(line),array['quantity'],false);
  quantity := (line->>'quantity')::numeric;
  conversion_numerator := (line->>'conversion_numerator')::numeric;
  conversion_denominator := (line->>'conversion_denominator')::numeric;
  rounding_mode := line->>'rounding_mode';
  unit_price_vnd := (line->>'unit_price_vnd')::bigint;
  pricing_rule_id := nullif(line->>'pricing_rule_id', '')::uuid;
  pricing_rule_version := nullif(line->>'pricing_rule_version', '')::integer;
  price_source_type := line->>'price_source_type';
  override_reason := nullif(line->>'override_reason', '');
  override_by := case when price_source_type = 'MANUAL_APPROVED' then actor_auth_user_id else null end;

  select m.name, m.base_uom_id, m.group_id into material_name, base_uom_id, selected_material_group_id
  from public.materials m where m.id = material_id and m.active and m.sale_enabled;
  if not found or quantity <= 0 or unit_price_vnd <= 0 or conversion_numerator <= 0 or conversion_denominator <= 0
    or rounding_mode not in ('HALF_UP','DOWN') then
    raise exception 'invalid_commercial_line' using errcode = '22023';
  end if;

  if ordered_uom_id <> base_uom_id and not exists (
    select 1 from public.material_uom_conversions c
    where c.material_id = assert_commercial_line.material_id
      and c.from_uom_id = assert_commercial_line.ordered_uom_id
      and c.to_uom_id = assert_commercial_line.base_uom_id
      and c.active and c.settlement_allowed and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
      and c.numerator = assert_commercial_line.conversion_numerator
      and c.denominator = assert_commercial_line.conversion_denominator
  ) then
    raise exception 'invalid_or_non_settlement_conversion' using errcode = '22023';
  end if;

  if ordered_uom_id = base_uom_id and (conversion_numerator <> 1 or conversion_denominator <> 1) then
    raise exception 'base_uom_conversion_must_be_one' using errcode = '22023';
  end if;

  if price_source_type = 'MANUAL_APPROVED' then
    if override_reason is null or char_length(override_reason) < 3 or not private.has_permission(target_branch_id, 'pricing.manage') then
      raise exception 'manual_price_requires_permission_and_reason' using errcode = '42501';
    end if;
  else
    select * into requested_rule from public.pricing_rules p
    where p.id = assert_commercial_line.pricing_rule_id
      and p.branch_id = target_branch_id
      and p.version = assert_commercial_line.pricing_rule_version
      and p.price_uom_id = assert_commercial_line.ordered_uom_id
      and p.unit_price_vnd = assert_commercial_line.unit_price_vnd
      and p.active
      and p.effective_from <= now() and (p.effective_to is null or p.effective_to > now());
    if not found then raise exception 'pricing_rule_snapshot_mismatch' using errcode = '22023'; end if;
    select c.tier_code into selected_customer_tier_code
    from public.customers c where c.id = target_customer_id and c.branch_id = target_branch_id and c.active;
    if not found then raise exception 'invalid_customer' using errcode = '22023'; end if;
    if requested_rule.scope_type = 'CUSTOMER_MATERIAL' and (requested_rule.customer_id <> target_customer_id or requested_rule.material_id <> material_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'CUSTOMER_GROUP' and (requested_rule.customer_id <> target_customer_id or requested_rule.material_group_id <> selected_material_group_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'CUSTOMER_TIER' and (requested_rule.customer_tier_code is distinct from selected_customer_tier_code or requested_rule.material_id <> material_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'DEFAULT' and requested_rule.material_id <> material_id then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    end if;
  end if;

  perform private.require_exact_quantity(quantity*conversion_numerator/conversion_denominator,false);
  line_total_vnd := round(quantity * unit_price_vnd)::bigint;
  return next;
end
$function$
;

CREATE OR REPLACE FUNCTION private.assert_purchase_line(target_branch_id uuid, target_supplier_id uuid, line jsonb, actor_auth_user_id uuid)
 RETURNS TABLE(material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid, quantity numeric, conversion_numerator numeric, conversion_denominator numeric, rounding_mode text, unit_cost_vnd bigint, line_total_cost_vnd bigint, purchase_price_rule_id uuid, purchase_price_rule_version integer, price_source_type text, override_by uuid, override_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare selected_rule public.purchase_price_rules%rowtype;
begin
  material_id := (line->>'material_id')::uuid;
  ordered_uom_id := (line->>'ordered_uom_id')::uuid;
  perform private.require_quantity_lines(jsonb_build_array(line),array['quantity'],false);
  quantity := (line->>'quantity')::numeric;
  conversion_numerator := (line->>'conversion_numerator')::numeric;
  conversion_denominator := (line->>'conversion_denominator')::numeric;
  rounding_mode := line->>'rounding_mode';
  unit_cost_vnd := (line->>'unit_cost_vnd')::bigint;
  purchase_price_rule_id := nullif(line->>'purchase_price_rule_id', '')::uuid;
  purchase_price_rule_version := nullif(line->>'purchase_price_rule_version', '')::integer;
  price_source_type := line->>'price_source_type';
  override_reason := nullif(line->>'override_reason', '');
  override_by := case when price_source_type = 'MANUAL_APPROVED' then actor_auth_user_id else null end;

  select m.name, m.base_uom_id into material_name, base_uom_id
  from public.materials m where m.id = assert_purchase_line.material_id and m.active and m.purchase_enabled;
  if not found or quantity <= 0 or unit_cost_vnd <= 0 or conversion_numerator <= 0 or conversion_denominator <= 0
    or rounding_mode not in ('HALF_UP','DOWN') then
    raise exception 'invalid_purchase_line' using errcode = '22023';
  end if;
  if ordered_uom_id = base_uom_id and (conversion_numerator <> 1 or conversion_denominator <> 1) then
    raise exception 'base_uom_conversion_must_be_one' using errcode = '22023';
  end if;
  if ordered_uom_id <> base_uom_id and not exists (
    select 1 from public.material_uom_conversions c
    where c.material_id = assert_purchase_line.material_id
      and c.from_uom_id = assert_purchase_line.ordered_uom_id
      and c.to_uom_id = assert_purchase_line.base_uom_id
      and c.numerator = assert_purchase_line.conversion_numerator
      and c.denominator = assert_purchase_line.conversion_denominator
      and c.active and c.settlement_allowed and c.effective_from <= now()
      and (c.effective_to is null or c.effective_to > now())
  ) then raise exception 'invalid_purchase_conversion' using errcode = '22023'; end if;

  if price_source_type = 'MANUAL_APPROVED' then
    if override_reason is null or char_length(override_reason) < 3
      or not private.has_permission(target_branch_id, 'purchasing.price.manage') then
      raise exception 'manual_purchase_price_requires_permission_and_reason' using errcode = '42501';
    end if;
  else
    select * into selected_rule from public.purchase_price_rules r
    where r.id = assert_purchase_line.purchase_price_rule_id
      and r.branch_id = target_branch_id and r.supplier_id = target_supplier_id
      and r.material_id = assert_purchase_line.material_id
      and r.purchase_uom_id = assert_purchase_line.ordered_uom_id
      and r.unit_cost_vnd = assert_purchase_line.unit_cost_vnd
      and r.version = assert_purchase_line.purchase_price_rule_version
      and r.source_type = assert_purchase_line.price_source_type and r.active
      and r.effective_from <= now() and (r.effective_to is null or r.effective_to > now());
    if not found then raise exception 'purchase_price_snapshot_mismatch' using errcode = '22023'; end if;
  end if;
  perform private.require_exact_quantity(quantity*conversion_numerator/conversion_denominator,false);
  line_total_cost_vnd := round(quantity * unit_cost_vnd)::bigint;
  return next;
end
$function$
;

CREATE OR REPLACE FUNCTION public.apply_route_plan(target_route_plan_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  plan public.route_plans%rowtype;
  stop record;
  delivery public.deliveries%rowtype;
  current_assignment_version integer;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into plan from public.route_plans p where p.id = target_route_plan_id for update;
  if plan.id is null or not private.has_permission(plan.branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('route_plan_id', target_route_plan_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = apply_route_plan.operation_id;
  if found then
    if receipt.command_name <> 'apply_route_plan' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if plan.status <> 'DRAFT' or plan.version  IS DISTINCT FROM expected_version then
    raise exception 'route_plan_version_conflict' using errcode = 'PT409';
  end if;

  for stop in
    select s.* from public.route_plan_stops s where s.route_plan_id = plan.id order by s.stop_order for update
  loop
    select * into delivery from public.deliveries d where d.id = stop.delivery_id for update;
    if delivery.id is null or delivery.branch_id <> plan.branch_id or delivery.execution_state not in ('PLANNED','ASSIGNED')
      or delivery.version  IS DISTINCT FROM stop.expected_delivery_version then
      raise exception 'route_delivery_stale' using errcode = 'PT409';
    end if;
    select coalesce(max(a.assignment_version), 0) into current_assignment_version
      from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
    if current_assignment_version  IS DISTINCT FROM stop.expected_assignment_version then
      raise exception 'route_assignment_stale' using errcode = 'PT409';
    end if;
    perform public.assign_delivery(
      delivery.id,
      plan.driver_employee_id,
      plan.vehicle_id,
      null::text,
      null::text,
      delivery.version,
      gen_random_uuid()
    );
  end loop;

  update public.route_plans
    set status = 'APPLIED', version = version + 1, applied_by = (select auth.uid()), applied_at = now(), apply_operation_id = apply_route_plan.operation_id
    where id = plan.id;
  insert into public.command_receipts values (apply_route_plan.operation_id, (select auth.uid()), 'apply_route_plan', payload_hash, 'route_plan', plan.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), plan.branch_id, 'route_plan.applied', 'route_plan', plan.id, apply_route_plan.operation_id,
    array['delivery_assignments','vehicle','driver']);
  return plan.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.approve_earning_event(target_earning_event_id uuid, approved_amount_vnd bigint, due_date date, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare earning public.earning_events%rowtype; basis public.compensation_manual_bases%rowtype; payload_hash text; receipt public.command_receipts%rowtype; payable_id uuid; adjustment_id uuid; outstanding bigint;
begin
  select * into earning from public.earning_events where id=target_earning_event_id;
  if earning.id is null or not private.has_permission(earning.branch_id,'compensation.approve') then raise exception 'forbidden_or_earning_not_found' using errcode='42501'; end if;
  if approved_amount_vnd=0 or due_date is null or sign(approved_amount_vnd)<>sign(earning.calculated_amount_vnd) or abs(approved_amount_vnd)>abs(earning.calculated_amount_vnd) then raise exception 'invalid_approved_amount' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('earning',target_earning_event_id,'amount',approved_amount_vnd,'due',due_date,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=approve_earning_event.operation_id;
  if found then if receipt.command_name<>'approve_earning_event' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into earning from public.earning_events where id=target_earning_event_id for update;
  if earning.version IS DISTINCT FROM expected_version then raise exception 'stale_earning_version' using errcode = 'PT409'; end if;
  if earning.approval_state<>'DRAFT' then raise exception 'earning_already_approved' using errcode='55000'; end if;
  if approved_amount_vnd>0 then
    insert into public.payable_obligations(branch_id,supplier_id,employee_id,opening_source_id,purchase_receipt_id,supplier_fulfillment_id,expense_id,earning_event_id,original_amount_vnd,due_date,recorded_by) values(earning.branch_id,null,earning.employee_id,null,null,null,null,earning.id,approved_amount_vnd,due_date,(select auth.uid())) returning id into payable_id;
  else
    select b.* into basis from public.compensation_manual_bases b where b.id=earning.manual_basis_id;
    select p.id into payable_id from public.payable_obligations p where p.earning_event_id=basis.adjusts_earning_event_id for update;
    if payable_id is null then raise exception 'adjusted_payable_not_found' using errcode='23503'; end if;
    outstanding:=private.current_payable_outstanding(payable_id);
    if outstanding+approved_amount_vnd<0 then raise exception 'adjustment_exceeds_payable_outstanding' using errcode='23514'; end if;
    insert into public.payable_adjustments(obligation_id,amount_delta_vnd,reason,evidence_object_id,recorded_by) values(payable_id,approved_amount_vnd,basis.description,basis.evidence_object_id,(select auth.uid())) returning id into adjustment_id;
  end if;
  update public.earning_events set approved_amount_vnd=approve_earning_event.approved_amount_vnd,approval_state='APPROVED',version=version+1,approved_by=(select auth.uid()),approved_at=now(),payable_obligation_id=case when approve_earning_event.approved_amount_vnd>0 then payable_id else null end,payable_adjustment_id=adjustment_id where id=earning.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'approve_earning_event',payload_hash,'earning_event',earning.id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),earning.branch_id,'earning.approved','earning_event',earning.id,operation_id,array['approved_amount_vnd','payable_effect']);
  return earning.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.approve_expense(target_expense_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  expense public.expenses%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into expense from public.expenses where id = target_expense_id;
  if expense.id is null or not private.has_permission(expense.branch_id, 'finance.expense.manage') then raise exception 'forbidden_or_expense_not_found' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('expense_id', target_expense_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_expense.operation_id;
  if found then
    if receipt.command_name <> 'approve_expense' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into expense from public.expenses where id = target_expense_id for update;
  if expense.approval_state <> 'DRAFT' or expense.version  IS DISTINCT FROM expected_version then raise exception 'expense_version_conflict' using errcode = 'PT409'; end if;
  if expense.evidence_object_id is not null then perform private.assert_verified_evidence(expense.evidence_object_id, expense.branch_id); end if;
  update public.expenses set approval_state = 'APPROVED', version = version + 1, approved_by = (select auth.uid()), approved_at = now() where id = expense.id;
  insert into public.payable_obligations(branch_id, supplier_id, expense_id, original_amount_vnd, due_date, recorded_at, recorded_by)
  values (expense.branch_id, expense.supplier_id, expense.id, expense.amount_vnd, expense.due_date, now(), (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_expense', payload_hash, 'expense', expense.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), expense.branch_id, 'expense.approved', 'expense', expense.id, operation_id, array['approval_state','version']);
  return expense.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.approve_invoice_business(target_invoice_id uuid, expected_version integer, review_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invoice public.invoice_intents%rowtype;
  line_total bigint;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.reconcile') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('invoice_id', target_invoice_id, 'version', expected_version, 'reason', trim(review_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_invoice_business.operation_id;
  if found then
    if receipt.command_name <> 'approve_invoice_business' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if invoice.status <> 'DRAFT' or invoice.version  IS DISTINCT FROM expected_version then
    raise exception 'invoice_version_conflict' using errcode = 'PT409';
  end if;
  if char_length(trim(review_reason)) not between 3 and 500 then
    raise exception 'invoice_review_reason_required' using errcode = '22023';
  end if;
  select coalesce(sum(l.source_amount_vnd), 0)::bigint into line_total from public.invoice_draft_lines l where l.invoice_intent_id = invoice.id;
  if line_total <> invoice.source_amount_vnd or not exists (
    select 1 from public.invoice_coverage c where c.invoice_intent_id = invoice.id and c.released_at is null
  ) then raise exception 'invoice_coverage_invalid' using errcode = '23514'; end if;
  update public.invoice_intents i
    set status = 'BUSINESS_APPROVED', version = i.version + 1,
        reviewed_by = (select auth.uid()), reviewed_at = now(), review_reason = trim(approve_invoice_business.review_reason),
        review_operation_id = approve_invoice_business.operation_id
    where i.id = invoice.id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_invoice_business', payload_hash, 'invoice_intent', invoice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), invoice.branch_id, 'invoice_business.approved', 'invoice_intent', invoice.id, operation_id,
    array['status','reviewed_by'], trim(review_reason));
  return invoice.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.approve_stock_count(target_stock_count_id uuid, expected_count_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare count_row public.stock_counts%rowtype; line public.stock_count_lines%rowtype; delta numeric;
  current_qty numeric; current_value bigint; reserved_qty numeric; unit_cost numeric; value_delta bigint; hash text; receipt public.command_receipts%rowtype;
begin
  select * into count_row from public.stock_counts where id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.adjust') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'version', expected_count_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_stock_count.operation_id;
  if found then if receipt.command_name <> 'approve_stock_count' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if expected_count_version is null or expected_count_version <= 0 or count_row.state <> 'OPEN' or count_row.version  IS DISTINCT FROM expected_count_version or not exists (select 1 from public.stock_count_lines where stock_count_id = target_stock_count_id) then raise exception 'stock_count_not_approvable' using errcode = 'PT409'; end if;
  perform 1 from public.warehouses where id = count_row.warehouse_id for update;
  for line in select * from public.stock_count_lines where stock_count_id = target_stock_count_id order by id loop
    if line.basis_fingerprint is null
      or line.basis_fingerprint is distinct from private.stock_count_basis(count_row.branch_id,count_row.warehouse_id,line.material_id)
    then raise exception 'stock_count_basis_changed_recount_required' using errcode='PT409'; end if;
    delta := line.counted_base_quantity - line.expected_base_quantity;
    if delta <> 0 then
      select coalesce(sum(base_quantity_delta), 0), coalesce(sum(inventory_value_delta_vnd), 0)::bigint
        into current_qty, current_value from public.inventory_movements
        where warehouse_id = count_row.warehouse_id and material_id = line.material_id;
      select coalesce(sum(r.reserved_base_quantity),0) into reserved_qty
        from public.inventory_reservations r where r.branch_id=count_row.branch_id
          and r.warehouse_id=count_row.warehouse_id and r.material_id=line.material_id and r.state='ACTIVE';
      if current_qty+delta<0 or current_qty+delta<reserved_qty
      then raise exception 'stock_count_adjustment_below_reserved_or_on_hand' using errcode='23514'; end if;
      unit_cost := case when delta<0 then case when current_qty>0 then current_value::numeric/current_qty else null end
        else coalesce(line.adjustment_unit_cost_vnd,case when current_qty>0 then current_value::numeric/current_qty else null end) end;
      if unit_cost is null or unit_cost <= 0 then raise exception 'adjustment_cost_required' using errcode = '23514'; end if;
      value_delta := round(delta * unit_cost)::bigint;
      if current_value+value_delta<0
        or ((current_qty+delta=0) is distinct from (current_value+value_delta=0))
      then raise exception 'stock_count_inventory_value_inconsistent' using errcode='23514'; end if;
      if value_delta = 0 then raise exception 'adjustment_value_too_small' using errcode = '23514'; end if;
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_stock_count_line_id, occurred_at, recorded_by)
      select count_row.branch_id, line.material_id, m.base_uom_id, 'WAREHOUSE', count_row.warehouse_id,
        'STOCK_ADJUSTMENT', delta, value_delta, unit_cost, line.id, now(), (select auth.uid())
      from public.materials m where m.id = line.material_id;
    end if;
  end loop;
  update public.stock_counts set state = 'APPROVED', version = version + 1, approved_by = (select auth.uid()), approved_at = now() where id = target_stock_count_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),count_row.branch_id,'stock_count.approved','stock_count',target_stock_count_id,
    approve_stock_count.operation_id,array['state','version','inventory_adjustment']);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_stock_count', hash, 'stock_count', target_stock_count_id, now());
  return target_stock_count_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.assign_delivery(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery.operation_id;
  if found then if receipt.command_name <> 'assign_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = 'PT409'; end if;
  if not ((target_employee_id is not null and target_vehicle_id is not null and nullif(trim(external_carrier_name), '') is null)
    or (target_employee_id is null and target_vehicle_id is null and nullif(trim(external_carrier_name), '') is not null)) then raise exception 'invalid_assignment_shape' using errcode = '22023'; end if;
  if target_employee_id is not null and (not exists (select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id where e.id = target_employee_id and e.active and a.branch_id = delivery.branch_id and a.active)
    or not exists (select 1 from public.vehicles where id = target_vehicle_id and branch_id = delivery.branch_id and active)) then raise exception 'assignment_resource_invalid' using errcode = '23503'; end if;
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.assign_work_item(target_work_item_id uuid, target_employee_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype; payload_hash text; receipt public.command_receipts%rowtype; assignment_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null or not private.has_permission(work.branch_id,'work.manage') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'employee',target_employee_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=assign_work_item.operation_id;
  if found then if receipt.command_name<>'assign_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  if work.version IS DISTINCT FROM expected_version then raise exception 'stale_work_version' using errcode = 'PT409'; end if;
  if work.execution_state<>'AVAILABLE' then raise exception 'work_not_assignable' using errcode='55000'; end if;
  perform private.assert_work_resources_available(work.id,work.branch_id,target_employee_id,work.planned_vehicle_id,work.planned_machine_id,work.scheduled_start,work.scheduled_end);
  insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(work.id,1,target_employee_id,work.planned_vehicle_id,work.planned_machine_id,'DIRECT',(select auth.uid())) returning id into assignment_id;
  update public.work_items set execution_state='CLAIMED',version=version+1 where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'assign_work_item',payload_hash,'work_item_assignment',assignment_id,now());
  return assignment_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cancel_invoice_draft(target_invoice_id uuid, expected_version integer, cancel_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invoice public.invoice_intents%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('invoice_id', target_invoice_id, 'version', expected_version, 'reason', trim(cancel_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = cancel_invoice_draft.operation_id;
  if found then
    if receipt.command_name <> 'cancel_invoice_draft' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if invoice.status <> 'DRAFT' or invoice.version  IS DISTINCT FROM expected_version then
    raise exception 'invoice_version_conflict' using errcode = 'PT409';
  end if;
  if char_length(trim(cancel_reason)) not between 3 and 500 then
    raise exception 'invoice_cancel_reason_required' using errcode = '22023';
  end if;
  update public.invoice_intents i
    set status = 'CANCELLED', version = i.version + 1,
        cancelled_by = (select auth.uid()), cancelled_at = now(), cancel_reason = trim(cancel_invoice_draft.cancel_reason),
        cancel_operation_id = cancel_invoice_draft.operation_id
    where i.id = invoice.id;
  update public.invoice_coverage c set released_at = now() where c.invoice_intent_id = invoice.id and c.released_at is null;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_invoice_draft', payload_hash, 'invoice_intent', invoice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), invoice.branch_id, 'invoice_draft.cancelled', 'invoice_intent', invoice.id, operation_id,
    array['status','coverage'], trim(cancel_reason));
  return invoice.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_planned_delivery(target_delivery_id uuid, expected_version integer, cancellation_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delivery public.deliveries%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.exception') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(cancellation_reason)), 0) < 3
    or char_length(trim(cancellation_reason)) > 500 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object(
    'delivery_id', target_delivery_id, 'version', expected_version,
    'reason', trim(cancellation_reason)));
  select * into receipt from public.command_receipts
    where command_receipts.operation_id = cancel_planned_delivery.operation_id;
  if found then
    if receipt.command_name <> 'cancel_planned_delivery' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if delivery.execution_state <> 'PLANNED' or delivery.version  IS DISTINCT FROM expected_version then
    raise exception 'delivery_cancel_version_conflict' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.delivery_lines where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_assignments where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_handoffs where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_results where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_verifications where delivery_id = delivery.id) then
    raise exception 'delivery_cancel_not_safe' using errcode = '23514';
  end if;
  perform 1 from public.inventory_reservations reservation
    join public.delivery_lines line on line.id = reservation.delivery_line_id
    where line.delivery_id = delivery.id order by reservation.id for update of reservation;
  if exists (
    select 1 from public.delivery_lines line
    left join public.inventory_reservations reservation on reservation.delivery_line_id = line.id
    where line.delivery_id = delivery.id and (
      (line.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE')
        and (reservation.id is null or reservation.state <> 'ACTIVE'))
      or (line.source_mode = 'SUPPLIER_DIRECT' and reservation.id is not null)
    )
  ) then
    raise exception 'delivery_reservation_state_conflict' using errcode = '23514';
  end if;
  update public.inventory_reservations reservation
    set state = 'RELEASED', version = version + 1, finalized_at = now()
    from public.delivery_lines line
    where line.id = reservation.delivery_line_id and line.delivery_id = delivery.id
      and reservation.state = 'ACTIVE';
  update public.deliveries set execution_state = 'CANCELLED', version = version + 1
    where id = delivery.id;
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_planned_delivery', hash,
    'delivery', delivery.id, now());
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason)
  values (
    (select auth.uid()), delivery.branch_id, 'delivery.cancel', 'delivery', delivery.id,
    operation_id, array['execution_state', 'inventory_reservations'], trim(cancellation_reason));
  return delivery.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_service_job(target_service_job_id uuid, expected_version integer, cancellation_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job public.service_jobs%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into job from public.service_jobs
    where id = target_service_job_id for update;
  if job.id is null or not private.has_permission(job.branch_id, 'service.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(cancellation_reason)), 0) < 3
    or char_length(trim(cancellation_reason)) > 500 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object(
    'service_job_id', target_service_job_id,
    'version', expected_version,
    'reason', trim(cancellation_reason)
  ));
  select * into receipt from public.command_receipts
    where command_receipts.operation_id = cancel_scheduled_service_job.operation_id;
  if found then
    if receipt.command_name <> 'cancel_scheduled_service_job' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if job.execution_state <> 'SCHEDULED' or job.version  IS DISTINCT FROM expected_version then
    raise exception 'service_cancel_version_conflict' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.work_items where service_job_id = job.id)
    or exists (select 1 from public.service_verifications where service_job_id = job.id) then
    raise exception 'service_cancel_has_execution' using errcode = '23514';
  end if;
  update public.service_jobs set execution_state = 'CANCELLED', version = version + 1
    where id = job.id;
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_scheduled_service_job', hash,
    'service_job', job.id, now()
  );
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason
  ) values (
    (select auth.uid()), job.branch_id, 'service_job.cancel', 'service_job', job.id,
    operation_id, array['execution_state'], trim(cancellation_reason)
  );
  return job.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.claim_work_item(target_work_item_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype; employee uuid; payload_hash text; receipt public.command_receipts%rowtype; assignment_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null or not private.has_permission(work.branch_id,'work.claim') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  employee:=private.current_employee_id();
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'employee',employee,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=claim_work_item.operation_id;
  if found then if receipt.command_name<>'claim_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  if work.version IS DISTINCT FROM expected_version then raise exception 'stale_work_version' using errcode = 'PT409'; end if;
  if work.assignment_mode<>'POOL_CLAIM' or work.execution_state<>'AVAILABLE' then raise exception 'work_not_claimable' using errcode='55000'; end if;
  perform private.assert_work_resources_available(work.id,work.branch_id,employee,work.planned_vehicle_id,work.planned_machine_id,work.scheduled_start,work.scheduled_end);
  insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(work.id,1,employee,work.planned_vehicle_id,work.planned_machine_id,'CLAIM',(select auth.uid())) returning id into assignment_id;
  update public.work_items set execution_state='CLAIMED',version=version+1 where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'claim_work_item',payload_hash,'work_item_assignment',assignment_id,now());
  return assignment_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_delivery_from_allocation(target_supply_allocation_id uuid, planned_base_quantity numeric, scheduled_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare allocation public.supply_allocations%rowtype; sale_line public.sales_order_lines%rowtype;
  sale_order public.sales_orders%rowtype; already_planned numeric; delivery_id uuid; delivery_line_id uuid;
  hash text; receipt public.command_receipts%rowtype;
begin
  select * into allocation from public.supply_allocations where id = target_supply_allocation_id for update;
  select * into sale_line from public.sales_order_lines where id = allocation.sales_order_line_id for update;
  select * into sale_order from public.sales_orders where id = sale_line.sales_order_id for update;
  if sale_order.id is null or sale_order.commercial_state <> 'CONFIRMED' or not private.has_permission(sale_order.branch_id, 'delivery.create') then raise exception 'order_not_ready_for_delivery' using errcode = '42501'; end if;
  if planned_base_quantity <= 0 then raise exception 'invalid_delivery_quantity' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('allocation_id', target_supply_allocation_id, 'quantity', planned_base_quantity, 'scheduled_at', scheduled_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_delivery_from_allocation.operation_id;
  if found then if receipt.command_name <> 'create_delivery_from_allocation' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(planned_base_quantity,false);

  already_planned := private.delivery_allocation_consumed(target_supply_allocation_id);
  if already_planned + planned_base_quantity > allocation.allocated_base_quantity then raise exception 'delivery_exceeds_allocation' using errcode = '23514'; end if;
  insert into public.deliveries(branch_id, sales_order_id, delivery_number, customer_id, site_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot,
    receiver_phone_snapshot, scheduled_at, created_by)
  values (sale_order.branch_id, sale_order.id, 'DL-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.delivery_number_seq')::text, 6, '0'),
    sale_order.customer_id, sale_order.site_id, sale_order.customer_name_snapshot, sale_order.site_name_snapshot,
    sale_order.delivery_address_snapshot, sale_order.receiver_name_snapshot, sale_order.receiver_phone_snapshot,
    scheduled_at, (select auth.uid())) returning id into delivery_id;
  insert into public.delivery_lines(delivery_id, sales_order_line_id, supply_allocation_id, material_id,
    base_uom_id, source_mode, warehouse_id, planned_base_quantity, conversion_numerator,
    conversion_denominator, unit_price_vnd)
  values (delivery_id, sale_line.id, allocation.id, sale_line.material_id, sale_line.base_uom_id,
    allocation.supply_mode, allocation.warehouse_id, planned_base_quantity, sale_line.conversion_numerator,
    sale_line.conversion_denominator, sale_line.unit_price_vnd) returning id into delivery_line_id;
  if allocation.supply_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
    perform private.reserve_inventory_for_line(sale_line.id, delivery_line_id, allocation.warehouse_id, planned_base_quantity, (select auth.uid()));
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_delivery_from_allocation', hash, 'delivery', delivery_id, now());
  return delivery_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_delivery_from_allocations(target_sales_order_id uuid, planned_lines jsonb, scheduled_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sale_order public.sales_orders%rowtype;
  allocation public.supply_allocations%rowtype;
  sale_line public.sales_order_lines%rowtype;
  item jsonb;
  allocation_id uuid;
  allocation_ids uuid[] := '{}';
  used_sales_lines uuid[] := '{}';
  quantity_base numeric;
  already_planned numeric;
  direct_source boolean;
  delivery_id uuid;
  delivery_line_id uuid;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into sale_order from public.sales_orders where id = target_sales_order_id;
  if sale_order.id is null or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'forbidden_or_order_not_found' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('sales_order_id', target_sales_order_id, 'lines', planned_lines, 'scheduled_at', scheduled_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_delivery_from_allocations.operation_id;
  if found then
    if receipt.command_name <> 'create_delivery_from_allocations' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(planned_lines,array['planned_base_quantity'],false);

  if jsonb_typeof(planned_lines) is distinct from 'array' then
    raise exception 'invalid_delivery_lines' using errcode = '22023';
  end if;
  if jsonb_array_length(planned_lines) < 1 or jsonb_array_length(planned_lines) > 50 then
    raise exception 'invalid_delivery_lines' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(planned_lines) loop
    allocation_id := (item->>'supply_allocation_id')::uuid;
    quantity_base := (item->>'planned_base_quantity')::numeric;
    if allocation_id is null or quantity_base is null or quantity_base <= 0 or quantity_base::text in ('NaN','Infinity','-Infinity')
      or allocation_id = any(allocation_ids) then
      raise exception 'invalid_delivery_line' using errcode = '22023';
    end if;
    allocation_ids := array_append(allocation_ids, allocation_id);
  end loop;
  perform 1 from public.supply_allocations where id = any(allocation_ids) order by id for update;
  if (select count(*) from public.supply_allocations where id = any(allocation_ids)) <> cardinality(allocation_ids) then
    raise exception 'allocation_not_found' using errcode = '23503';
  end if;
  perform 1 from public.sales_order_lines
    where id in (select sales_order_line_id from public.supply_allocations where id = any(allocation_ids))
    order by id for update;
  select * into sale_order from public.sales_orders where id = target_sales_order_id for update;
  if sale_order.commercial_state <> 'CONFIRMED' or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'order_not_ready_for_delivery' using errcode = '42501';
  end if;
  insert into public.deliveries(branch_id, sales_order_id, delivery_number, customer_id, site_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot,
    receiver_phone_snapshot, scheduled_at, created_by)
  values (sale_order.branch_id, sale_order.id, 'DL-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.delivery_number_seq')::text, 6, '0'),
    sale_order.customer_id, sale_order.site_id, sale_order.customer_name_snapshot, sale_order.site_name_snapshot,
    sale_order.delivery_address_snapshot, sale_order.receiver_name_snapshot, sale_order.receiver_phone_snapshot,
    scheduled_at, (select auth.uid())) returning id into delivery_id;
  for item in select value from jsonb_array_elements(planned_lines) loop
    allocation_id := (item->>'supply_allocation_id')::uuid;
    quantity_base := (item->>'planned_base_quantity')::numeric;
    select * into allocation from public.supply_allocations where id = allocation_id;
    select * into sale_line from public.sales_order_lines where id = allocation.sales_order_line_id;
    if sale_line.id is null or sale_line.sales_order_id <> target_sales_order_id or sale_line.id = any(used_sales_lines) then
      raise exception 'delivery_line_source_invalid_or_duplicate' using errcode = '23514';
    end if;
    if direct_source is null then
      direct_source := allocation.supply_mode = 'SUPPLIER_DIRECT';
    elsif direct_source is distinct from (allocation.supply_mode = 'SUPPLIER_DIRECT') then
      raise exception 'delivery_mixed_source_not_supported' using errcode = '23514';
    end if;
    used_sales_lines := array_append(used_sales_lines, sale_line.id);
    already_planned := private.delivery_allocation_consumed(allocation.id);
    if already_planned + quantity_base > allocation.allocated_base_quantity then
      raise exception 'delivery_exceeds_allocation' using errcode = '23514';
    end if;
    insert into public.delivery_lines(delivery_id, sales_order_line_id, supply_allocation_id, material_id,
      base_uom_id, source_mode, warehouse_id, planned_base_quantity, conversion_numerator,
      conversion_denominator, unit_price_vnd)
    values (delivery_id, sale_line.id, allocation.id, sale_line.material_id, sale_line.base_uom_id,
      allocation.supply_mode, allocation.warehouse_id, quantity_base, sale_line.conversion_numerator,
      sale_line.conversion_denominator, sale_line.unit_price_vnd) returning id into delivery_line_id;
    if allocation.supply_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      perform private.reserve_inventory_for_line(sale_line.id, delivery_line_id, allocation.warehouse_id, quantity_base, (select auth.uid()));
    end if;
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_delivery_from_allocations', hash, 'delivery', delivery_id, now());
  return delivery_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_direct_purchase_from_sales_line(source_sales_order_line_id uuid, target_supplier_id uuid, requested_quantity numeric, purchase_line jsonb, expected_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sale_line public.sales_order_lines%rowtype; sale_order public.sales_orders%rowtype;
  supplier public.suppliers%rowtype; checked record; payload jsonb; hash text;
  receipt public.command_receipts%rowtype; order_id uuid; purchase_line_id uuid; base_quantity numeric;
begin
  select * into sale_line from public.sales_order_lines where id = source_sales_order_line_id for update;
  select * into sale_order from public.sales_orders where id = sale_line.sales_order_id;
  if not private.has_permission(sale_order.branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  payload := jsonb_build_object('sales_line_id', source_sales_order_line_id, 'supplier_id', target_supplier_id, 'quantity', requested_quantity, 'line', purchase_line, 'expected_at', expected_at);
  hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_direct_purchase_from_sales_line.operation_id;
  if found then if receipt.command_name <> 'create_direct_purchase_from_sales_line' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(requested_quantity,false);

  if sale_order.commercial_state not in ('DRAFT','CONFIRMED') then raise exception 'sales_order_not_sourceable' using errcode = '23514'; end if;
  if (purchase_line->>'material_id')::uuid <> sale_line.material_id
    or (purchase_line->>'ordered_uom_id')::uuid <> sale_line.ordered_uom_id
    or (purchase_line->>'conversion_numerator')::numeric <> sale_line.conversion_numerator
    or (purchase_line->>'conversion_denominator')::numeric <> sale_line.conversion_denominator
    or requested_quantity <> (purchase_line->>'quantity')::numeric then
    raise exception 'direct_purchase_line_mismatch' using errcode = '22023';
  end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = sale_order.branch_id and active;
  if supplier.id is null then raise exception 'supplier_invalid' using errcode = '23503'; end if;
  select * into checked from private.assert_purchase_line(sale_order.branch_id, target_supplier_id, purchase_line, (select auth.uid()));
  base_quantity := checked.quantity * checked.conversion_numerator / checked.conversion_denominator;
  perform private.assert_allocation_capacity(source_sales_order_line_id, base_quantity);
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, customer_id,
    site_id, source_sales_order_id, supplier_name_snapshot, supplier_address_snapshot,
    destination_name_snapshot, destination_address_snapshot, expected_at, created_by)
  values (sale_order.branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'CUSTOMER_SITE', sale_order.customer_id, sale_order.site_id, sale_order.id,
    supplier.name, supplier.address_text, sale_order.site_name_snapshot, sale_order.delivery_address_snapshot,
    expected_at, (select auth.uid())) returning id into order_id;
  insert into public.purchase_order_lines(purchase_order_id, linked_sales_order_line_id, line_number, material_id,
    material_name_snapshot, ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator,
    rounding_mode, unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
    price_source_type, override_by, override_reason)
  values (order_id, source_sales_order_line_id, 1, checked.material_id, checked.material_name, checked.ordered_uom_id,
    checked.base_uom_id, checked.quantity, checked.conversion_numerator, checked.conversion_denominator,
    checked.rounding_mode, checked.unit_cost_vnd, checked.line_total_cost_vnd, checked.purchase_price_rule_id,
    checked.purchase_price_rule_version, checked.price_source_type, checked.override_by, checked.override_reason)
  returning id into purchase_line_id;
  insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, purchase_order_line_id,
    allocated_base_quantity, created_by)
  values (sale_order.branch_id, source_sales_order_line_id, 'SUPPLIER_DIRECT', purchase_line_id,
    base_quantity, (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_direct_purchase_from_sales_line', hash, 'purchase_order', order_id, now());
  return order_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_direct_purchase_from_sales_order(target_sales_order_id uuid, target_supplier_id uuid, purchase_lines jsonb, expected_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sale_order public.sales_orders%rowtype;
  sale_line public.sales_order_lines%rowtype;
  supplier public.suppliers%rowtype;
  receipt public.command_receipts%rowtype;
  checked record;
  payload_hash text;
  order_id uuid;
  purchase_line_id uuid;
  item jsonb;
  source_line_id uuid;
  seen_source_ids uuid[] := array[]::uuid[];
  line_no integer := 0;
  base_quantity numeric;
begin
  select * into sale_order from public.sales_orders where id = target_sales_order_id;
  if not found or not private.has_permission(sale_order.branch_id, 'purchasing.create')
  then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(purchase_lines) is distinct from 'array' then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(purchase_lines) not between 1 and 50 then raise exception 'purchase_lines_invalid' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('sales_order_id', target_sales_order_id,
    'supplier_id', target_supplier_id, 'lines', purchase_lines, 'expected_at', expected_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_direct_purchase_from_sales_order.operation_id;
  if found then
    if receipt.command_name <> 'create_direct_purchase_from_sales_order' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(purchase_lines,array['quantity'],false);

  if sale_order.commercial_state not in ('DRAFT','CONFIRMED')
  then raise exception 'sales_order_not_sourceable' using errcode = '23514'; end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = sale_order.branch_id and active;
  if supplier.id is null then raise exception 'supplier_invalid' using errcode = '23503'; end if;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, customer_id,
    site_id, source_sales_order_id, supplier_name_snapshot, supplier_address_snapshot,
    destination_name_snapshot, destination_address_snapshot, expected_at, created_by)
  values (sale_order.branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'CUSTOMER_SITE', sale_order.customer_id, sale_order.site_id, sale_order.id,
    supplier.name, supplier.address_text, sale_order.site_name_snapshot, sale_order.delivery_address_snapshot,
    expected_at, (select auth.uid())) returning id into order_id;
  for item in select value from jsonb_array_elements(purchase_lines) loop
    source_line_id := nullif(item->>'linked_sales_order_line_id', '')::uuid;
    if source_line_id is null or source_line_id = any(seen_source_ids)
    then raise exception 'direct_purchase_source_line_invalid' using errcode = '22023'; end if;
    seen_source_ids := array_append(seen_source_ids, source_line_id);
    select * into sale_line from public.sales_order_lines where id = source_line_id and sales_order_id = target_sales_order_id for update;
    if not found then raise exception 'direct_purchase_source_line_invalid' using errcode = '23503'; end if;
    select * into checked from private.assert_purchase_line(sale_order.branch_id, target_supplier_id, item, (select auth.uid()));
    if checked.material_id <> sale_line.material_id or checked.base_uom_id <> sale_line.base_uom_id
    then raise exception 'direct_purchase_line_mismatch' using errcode = '22023'; end if;
    base_quantity := checked.quantity * checked.conversion_numerator / checked.conversion_denominator;
    perform private.assert_allocation_capacity(source_line_id, base_quantity);
    line_no := line_no + 1;
    insert into public.purchase_order_lines(purchase_order_id, linked_sales_order_line_id, line_number, material_id,
      material_name_snapshot, ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator,
      rounding_mode, unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
      price_source_type, override_by, override_reason)
    values (order_id, source_line_id, line_no, checked.material_id, checked.material_name,
      checked.ordered_uom_id, checked.base_uom_id, checked.quantity, checked.conversion_numerator,
      checked.conversion_denominator, checked.rounding_mode, checked.unit_cost_vnd, checked.line_total_cost_vnd,
      checked.purchase_price_rule_id, checked.purchase_price_rule_version, checked.price_source_type,
      checked.override_by, checked.override_reason)
    returning id into purchase_line_id;
    insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, purchase_order_line_id,
      allocated_base_quantity, created_by)
    values (sale_order.branch_id, source_line_id, 'SUPPLIER_DIRECT', purchase_line_id, base_quantity, (select auth.uid()));
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_direct_purchase_from_sales_order', payload_hash, 'purchase_order', order_id, now());
  return order_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_purchase_order_draft(target_branch_id uuid, target_supplier_id uuid, target_warehouse_id uuid, expected_at timestamp with time zone, commercial_terms text, purchase_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb; hash text; receipt public.command_receipts%rowtype;
  supplier public.suppliers%rowtype; warehouse public.warehouses%rowtype;
  order_id uuid; item jsonb; checked record; line_no integer := 0;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(purchase_lines) <> 'array' or jsonb_array_length(purchase_lines) = 0 then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'supplier_id', target_supplier_id, 'warehouse_id', target_warehouse_id, 'expected_at', expected_at, 'terms', commercial_terms, 'lines', purchase_lines);
  hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_purchase_order_draft.operation_id;
  if found then if receipt.command_name <> 'create_purchase_order_draft' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_quantity_lines(purchase_lines,array['quantity'],false);

  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  select * into warehouse from public.warehouses where id = target_warehouse_id and branch_id = target_branch_id and active for share;
  if supplier.id is null or warehouse.id is null then raise exception 'supplier_or_warehouse_invalid' using errcode = '23503'; end if;
  if private.normalize_po_warehouse_address(warehouse.address_text) is null then raise exception 'warehouse_address_required' using errcode = '22023'; end if;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id,
    supplier_name_snapshot, supplier_address_snapshot, destination_name_snapshot, destination_address_snapshot,
    expected_at, commercial_terms, created_by)
  values (target_branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'WAREHOUSE', target_warehouse_id, supplier.name, supplier.address_text,
    warehouse.name, private.normalize_po_warehouse_address(warehouse.address_text), expected_at, commercial_terms, (select auth.uid())) returning id into order_id;
  for item in select value from jsonb_array_elements(purchase_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_purchase_line(target_branch_id, target_supplier_id, item, (select auth.uid()));
    insert into public.purchase_order_lines(purchase_order_id, line_number, material_id, material_name_snapshot,
      ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode,
      unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
      price_source_type, override_by, override_reason)
    values (order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_cost_vnd, checked.line_total_cost_vnd, checked.purchase_price_rule_id,
      checked.purchase_price_rule_version, checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_purchase_order_draft', hash, 'purchase_order', order_id, now());
  return order_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_quote_draft(target_branch_id uuid, target_customer_id uuid, target_site_id uuid, expires_at timestamp with time zone, commercial_terms text, quote_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload jsonb; payload_hash text; receipt public.command_receipts%rowtype;
  customer public.customers%rowtype; site public.customer_sites%rowtype;
  quote_id uuid; revision_id uuid; employee_id uuid; item jsonb; checked record; line_no integer := 0; total bigint := 0;
begin
  if not private.has_permission(target_branch_id, 'quotation.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(quote_lines) <> 'array' or jsonb_array_length(quote_lines) = 0 then raise exception 'quote_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'customer_id', target_customer_id, 'site_id', target_site_id, 'expires_at', expires_at, 'terms', commercial_terms, 'lines', quote_lines);
  payload_hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_quote_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_quote_draft' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(quote_lines,array['quantity'],false);

  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if customer.id is null or site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  employee_id := private.current_employee_id();
  insert into public.quotations(branch_id, quotation_number, customer_id, site_id, sales_owner_employee_id, created_by)
  values (target_branch_id, 'QT-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.quotation_number_seq')::text, 6, '0'), target_customer_id, target_site_id, employee_id, (select auth.uid()))
  returning id into quote_id;
  insert into public.quotation_revisions(quotation_id, revision_number, customer_name_snapshot, site_name_snapshot,
    delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, commercial_terms, expires_at, created_by)
  values (quote_id, 1, customer.display_name, site.name, site.address_text, site.receiver_name, site.receiver_phone,
    commercial_terms, expires_at, (select auth.uid())) returning id into revision_id;
  for item in select value from jsonb_array_elements(quote_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(target_branch_id, target_customer_id, item, (select auth.uid()));
    insert into public.quotation_lines(revision_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (revision_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
    total := total + checked.line_total_vnd;
  end loop;
  update public.quotation_revisions set total_vnd = total where id = revision_id;
  update public.quotations set current_revision_id = revision_id where id = quote_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_quote_draft', payload_hash, 'quotation', quote_id, now());
  return quote_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_route_plan(target_branch_id uuid, target_departure_at timestamp with time zone, target_vehicle_id uuid, target_driver_employee_id uuid, target_provider_state text, target_provider_distance_meters integer, target_provider_duration_seconds integer, target_provider_error_safe text, target_stops jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  plan_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  stop record;
  delivery public.deliveries%rowtype;
  current_assignment_version integer;
  stop_count integer;
begin
  if (select auth.uid()) is null or not private.has_permission(target_branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_departure_at is null or target_vehicle_id is null or target_driver_employee_id is null then
    raise exception 'route_resources_required' using errcode = '22023';
  end if;
  if target_provider_state not in ('RECOMMENDED','MANUAL_FALLBACK') then
    raise exception 'invalid_route_provider_state' using errcode = '22023';
  end if;
  if jsonb_typeof(target_stops) <> 'array' or jsonb_array_length(target_stops) not between 1 and 50 then
    raise exception 'invalid_route_stops' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = target_vehicle_id and v.branch_id = target_branch_id and v.active) then
    raise exception 'route_vehicle_invalid' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    where e.id = target_driver_employee_id and e.active and a.branch_id = target_branch_id
  ) then
    raise exception 'route_driver_invalid' using errcode = '23503';
  end if;

  payload_hash := private.command_payload_hash(jsonb_build_object(
    'branch_id', target_branch_id,
    'departure_at', target_departure_at,
    'vehicle_id', target_vehicle_id,
    'driver_employee_id', target_driver_employee_id,
    'provider_state', target_provider_state,
    'provider_distance_meters', target_provider_distance_meters,
    'provider_duration_seconds', target_provider_duration_seconds,
    'stops', target_stops
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_route_plan.operation_id;
  if found then
    if receipt.command_name <> 'create_route_plan' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;

  select count(*), count(distinct (item->>'stop_order')::integer)
    into stop_count, current_assignment_version
  from jsonb_array_elements(target_stops) item;
  if stop_count <> current_assignment_version
    or (select min((item->>'stop_order')::integer) from jsonb_array_elements(target_stops) item) <> 1
    or (select max((item->>'stop_order')::integer) from jsonb_array_elements(target_stops) item) <> stop_count then
    raise exception 'route_stop_order_invalid' using errcode = '22023';
  end if;

  insert into public.route_plans(
    branch_id, departure_at, vehicle_id, driver_employee_id, provider_state,
    provider_distance_meters, provider_duration_seconds, provider_error_safe,
    created_by, operation_id
  ) values (
    target_branch_id, target_departure_at, target_vehicle_id, target_driver_employee_id, target_provider_state,
    target_provider_distance_meters, target_provider_duration_seconds, nullif(left(trim(target_provider_error_safe), 300), ''),
    (select auth.uid()), operation_id
  ) returning id into plan_id;

  for stop in
    select * from jsonb_to_recordset(target_stops) as x(
      delivery_id uuid,
      stop_order integer,
      expected_delivery_version integer,
      expected_assignment_version integer,
      latitude numeric,
      longitude numeric,
      address_snapshot text,
      time_window_snapshot text,
      capacity_warning text,
      time_window_warning text
    ) order by stop_order
  loop
    select * into delivery from public.deliveries d where d.id = stop.delivery_id for update;
    if delivery.id is null or delivery.branch_id <> target_branch_id or delivery.execution_state not in ('PLANNED','ASSIGNED')
      or delivery.version  IS DISTINCT FROM stop.expected_delivery_version then
      raise exception 'route_delivery_stale' using errcode = 'PT409';
    end if;
    select coalesce(max(a.assignment_version), 0) into current_assignment_version
      from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
    if current_assignment_version  IS DISTINCT FROM stop.expected_assignment_version then
      raise exception 'route_assignment_stale' using errcode = 'PT409';
    end if;
    if nullif(trim(stop.address_snapshot), '') is null then
      raise exception 'route_address_required' using errcode = '22023';
    end if;
    insert into public.route_plan_stops(
      route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version,
      latitude, longitude, address_snapshot, time_window_snapshot, capacity_warning, time_window_warning
    ) values (
      plan_id, stop.stop_order, stop.delivery_id, stop.expected_delivery_version, stop.expected_assignment_version,
      stop.latitude, stop.longitude, trim(stop.address_snapshot), nullif(trim(stop.time_window_snapshot), ''),
      nullif(trim(stop.capacity_warning), ''), nullif(trim(stop.time_window_warning), '')
    );
  end loop;

  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_route_plan', payload_hash, 'route_plan', plan_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'route_plan.created', 'route_plan', plan_id, operation_id,
    array['stops','vehicle','driver','departure','provider_state']);
  return plan_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_sales_order_draft(target_branch_id uuid, target_customer_id uuid, target_site_id uuid, requested_delivery_at timestamp with time zone, commercial_terms text, order_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload jsonb;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  customer public.customers%rowtype;
  site public.customer_sites%rowtype;
  order_id uuid;
  employee_id uuid;
  item jsonb;
  checked record;
  line_no integer := 0;
begin
  if not private.has_permission(target_branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(order_lines) <> 'array' or jsonb_array_length(order_lines) = 0 then raise exception 'order_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'customer_id', target_customer_id, 'site_id', target_site_id, 'delivery_at', requested_delivery_at, 'terms', commercial_terms, 'lines', order_lines);
  payload_hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_sales_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_sales_order_draft' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(order_lines,array['quantity'],false);

  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if customer.id is null or site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  employee_id := private.current_employee_id();
  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, sales_owner_employee_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot,
    requested_delivery_at, commercial_terms, created_by)
  values (target_branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, employee_id, customer.display_name, site.name, site.address_text, site.receiver_name, site.receiver_phone,
    requested_delivery_at, commercial_terms, (select auth.uid())) returning id into order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(target_branch_id, target_customer_id, item, (select auth.uid()));
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_sales_order_draft', payload_hash, 'sales_order', order_id, now());
  return order_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_service_job(target_branch_id uuid, target_customer_id uuid, target_site_id uuid, service_type text, description text, scheduled_start timestamp with time zone, scheduled_end timestamp with time zone, planned_quantity numeric, unit_label text, target_sales_employee_id uuid, target_vehicle_id uuid, target_machine_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid;
begin
  if not private.has_permission(target_branch_id, 'service.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(service_type)) not between 2 and 120 or char_length(trim(description)) not between 3 and 500
    or scheduled_end <= scheduled_start or planned_quantity <= 0 or char_length(trim(unit_label)) not between 1 and 30
    or num_nonnulls(target_vehicle_id, target_machine_id) > 1 then raise exception 'invalid_service_job' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'customer',target_customer_id,'site',target_site_id,'type',trim(service_type),'description',trim(description),'start',scheduled_start,'end',scheduled_end,'quantity',planned_quantity,'unit',trim(unit_label),'sales',target_sales_employee_id,'vehicle',target_vehicle_id,'machine',target_machine_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_service_job.operation_id;
  if found then
    if receipt.command_name <> 'create_service_job' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_exact_quantity(planned_quantity,false);

  perform 1 from public.customers c join public.customer_sites s on s.customer_id = c.id
  where c.id = target_customer_id and c.branch_id = target_branch_id and c.active and s.id = target_site_id and s.active;
  if not found then raise exception 'invalid_customer_site' using errcode = '23503'; end if;
  if target_sales_employee_id is not null then
    perform 1 from public.employee_branch_access where employee_id = target_sales_employee_id and branch_id = target_branch_id and active;
    if not found then raise exception 'invalid_sales_employee' using errcode = '23503'; end if;
  end if;
  if target_vehicle_id is not null then perform 1 from public.vehicles where id = target_vehicle_id and branch_id = target_branch_id and active; if not found then raise exception 'invalid_vehicle' using errcode = '23503'; end if; end if;
  if target_machine_id is not null then perform 1 from public.machines where id = target_machine_id and branch_id = target_branch_id and active; if not found then raise exception 'invalid_machine' using errcode = '23503'; end if; end if;
  insert into public.service_jobs(branch_id,job_number,customer_id,site_id,sales_employee_id,service_type,description,scheduled_start,scheduled_end,planned_quantity,unit_label,vehicle_id,machine_id,created_by)
  values (target_branch_id,'SRV-'||to_char((scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.service_job_number_seq')::text,6,'0'),target_customer_id,target_site_id,target_sales_employee_id,trim(service_type),trim(description),scheduled_start,scheduled_end,planned_quantity,trim(unit_label),target_vehicle_id,target_machine_id,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'create_service_job',payload_hash,'service_job',entity_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'service_job.created','service_job',entity_id,operation_id,array['schedule','planned_quantity','resources']);
  return entity_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.deactivate_pricing_rule(target_id uuid, target_branch_id uuid, expected_version integer, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_rule public.pricing_rules%rowtype;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_id is null or operation_id is null or expected_version is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into old_rule from public.pricing_rules where id = target_id and branch_id = target_branch_id for update;
  if old_rule.id is null or old_rule.version  IS DISTINCT FROM expected_version or not old_rule.active then raise exception 'stale_price_rule' using errcode = 'PT409'; end if;
  update public.pricing_rules set active = false where id = target_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), target_branch_id, 'pricing.deactivate', 'pricing_rules', target_id, operation_id, array['active'], change_reason);
  return target_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.deactivate_purchase_price_rule(target_id uuid, target_branch_id uuid, expected_version integer, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_rule public.purchase_price_rules%rowtype;receipt public.command_receipts%rowtype;payload_hash text;
begin
 if auth.uid() is null or not private.has_permission(target_branch_id,'purchasing.price.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if target_id is null or operation_id is null or expected_version is null or char_length(trim(coalesce(change_reason,''))) not between 3 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 payload_hash=private.command_payload_hash(jsonb_build_object('target',target_id,'branch',target_branch_id,'version',expected_version,'reason',change_reason));
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.command_receipts c where c.operation_id=deactivate_purchase_price_rule.operation_id;
 if found then
  if receipt.command_name<>'deactivate_purchase_price_rule' or receipt.payload_hash<>payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;
 end if;
 select * into old_rule from public.purchase_price_rules where id=target_id and branch_id=target_branch_id for update;
 if old_rule.id is null or old_rule.version IS DISTINCT FROM expected_version or not old_rule.active then raise exception 'stale_price_rule' using errcode='PT409';end if;
 update public.purchase_price_rules set active=false where id=target_id;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),target_branch_id,'purchase_pricing.deactivate','purchase_price_rules',target_id,operation_id,array['active'],change_reason);
 insert into public.command_receipts values(operation_id,auth.uid(),'deactivate_purchase_price_rule',payload_hash,'purchase_price_rule',target_id,now());
 return target_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.handoff_delivery(target_delivery_id uuid, expected_version integer, handed_off_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; assignment public.delivery_assignments%rowtype;
  line public.delivery_lines%rowtype; reservation public.inventory_reservations%rowtype;
  position_qty numeric; position_value bigint; unit_cost numeric; moved_value bigint;
  handoff_id uuid; handoff_line_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.handoff') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version, 'handed_off_at', handed_off_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = handoff_delivery.operation_id;
  if found then if receipt.command_name <> 'handoff_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'ASSIGNED' or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_not_handoff_ready' using errcode = 'PT409'; end if;
  select * into assignment from public.delivery_assignments where delivery_id = target_delivery_id and superseded_at is null;
  if assignment.id is null then raise exception 'delivery_assignment_missing' using errcode = '23514'; end if;
  insert into public.delivery_handoffs(delivery_id, assignment_id, handed_off_at, handed_off_by)
  values (target_delivery_id, assignment.id, handed_off_at, (select auth.uid())) returning id into handoff_id;
  for line in select * from public.delivery_lines where delivery_id = target_delivery_id order by id loop
    if line.source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      perform 1 from public.warehouses where id = line.warehouse_id for update;
      select * into reservation from public.inventory_reservations where delivery_line_id = line.id for update;
      if reservation.id is null or reservation.state <> 'ACTIVE' or reservation.reserved_base_quantity <> line.planned_base_quantity then raise exception 'delivery_reservation_invalid' using errcode = '23514'; end if;
      select coalesce(sum(base_quantity_delta), 0), coalesce(sum(inventory_value_delta_vnd), 0)::bigint
        into position_qty, position_value from public.inventory_movements
        where warehouse_id = line.warehouse_id and material_id = line.material_id;
      if position_qty < line.planned_base_quantity or position_qty <= 0 or position_value <= 0 then raise exception 'insufficient_inventory_for_handoff' using errcode = '23514'; end if;
      unit_cost := position_value::numeric / position_qty;
      moved_value := round(line.planned_base_quantity * unit_cost)::bigint;
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity,
        unit_cost_vnd_per_base, inventory_value_vnd)
      values (handoff_id, line.id, line.planned_base_quantity, unit_cost, moved_value) returning id into handoff_line_id;
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', line.warehouse_id,
        'DELIVERY_HANDOFF', -line.planned_base_quantity, -moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
        movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
        source_delivery_handoff_line_id, occurred_at, recorded_by)
      values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
        'DELIVERY_HANDOFF', line.planned_base_quantity, moved_value, unit_cost, handoff_line_id, handed_off_at, (select auth.uid()));
      update public.inventory_reservations set state = 'CONSUMED', version = version + 1, finalized_at = now() where id = reservation.id;
    else
      insert into public.delivery_handoff_lines(delivery_handoff_id, delivery_line_id, moved_base_quantity)
      values (handoff_id, line.id, line.planned_base_quantity);
    end if;
  end loop;
  update public.deliveries set execution_state = 'DISPATCHED', version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'handoff_delivery', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.mark_delivery_arrived(target_delivery_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = mark_delivery_arrived.operation_id;
  if found then if receipt.command_name <> 'mark_delivery_arrived' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'DISPATCHED' or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_arrival_version_conflict' using errcode = 'PT409'; end if;
  update public.deliveries set execution_state = 'ARRIVED', version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'mark_delivery_arrived', hash, 'delivery', target_delivery_id, now());
  return target_delivery_id;
end
$function$
;

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
    if line.source_mode = 'SUPPLIER_DIRECT' then
      raise exception 'transit_return_requires_stock_source' using errcode = '23514';
    end if;
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
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_return_case', hash, 'return_case', case_id, now());
  return case_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(target_purchase_order_id uuid, receipt_lines jsonb, target_evidence_id uuid, received_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare order_row public.purchase_orders%rowtype; line public.purchase_order_lines%rowtype;
  item jsonb; prior_quantity numeric; received_quantity numeric; base_quantity numeric;
  inventory_value bigint; unit_cost_base numeric; total_value bigint := 0; receipt_id uuid; receipt_line_id uuid;
  hash text; command_receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'inventory.receive') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'lines', receipt_lines, 'evidence_id', target_evidence_id, 'received_at', received_at));
  select * into command_receipt from public.command_receipts where command_receipts.operation_id = receive_purchase_order.operation_id;
  if found then if command_receipt.command_name <> 'receive_purchase_order' or command_receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return command_receipt.result_entity_id; end if;
  perform private.require_quantity_lines(receipt_lines,array['received_quantity'],false);

  if order_row.state <> 'CONFIRMED' or order_row.destination_type <> 'WAREHOUSE' or jsonb_array_length(receipt_lines) = 0 or received_at > now() + interval '5 minutes' then raise exception 'purchase_order_not_receivable' using errcode = '23514'; end if;
  perform private.assert_verified_evidence(target_evidence_id, order_row.branch_id);
  perform 1 from public.warehouses where id = order_row.warehouse_id for update;
  insert into public.purchase_receipts(branch_id, purchase_order_id, receipt_number, received_at, evidence_object_id, recorded_by)
  values (order_row.branch_id, target_purchase_order_id, 'PR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_receipt_number_seq')::text, 6, '0'), received_at, target_evidence_id, (select auth.uid())) returning id into receipt_id;
  for item in select value from jsonb_array_elements(receipt_lines) loop
    received_quantity := (item->>'received_quantity')::numeric;
    select * into line from public.purchase_order_lines where id = (item->>'purchase_order_line_id')::uuid and purchase_order_id = target_purchase_order_id for update;
    if line.id is null or received_quantity <= 0 then raise exception 'invalid_receipt_line' using errcode = '22023'; end if;
    select coalesce(sum(l.received_quantity), 0) into prior_quantity from public.purchase_receipt_lines l where l.purchase_order_line_id = line.id;
    if prior_quantity + received_quantity > line.quantity then raise exception 'receipt_exceeds_purchase_line' using errcode = '23514'; end if;
    base_quantity := received_quantity * line.conversion_numerator / line.conversion_denominator;
    perform private.require_exact_quantity(base_quantity,false);
    inventory_value := round(received_quantity * line.unit_cost_vnd)::bigint;
    unit_cost_base := inventory_value::numeric / base_quantity;
    insert into public.purchase_receipt_lines(purchase_receipt_id, purchase_order_line_id, material_id, warehouse_id,
      received_quantity, received_base_quantity, unit_cost_vnd, inventory_value_vnd, unit_cost_vnd_per_base)
    values (receipt_id, line.id, line.material_id, order_row.warehouse_id, received_quantity, base_quantity,
      line.unit_cost_vnd, inventory_value, unit_cost_base) returning id into receipt_line_id;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_purchase_receipt_line_id, occurred_at, recorded_by)
    values (order_row.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', order_row.warehouse_id,
      'PURCHASE_RECEIPT', base_quantity, inventory_value, unit_cost_base, receipt_line_id, received_at, (select auth.uid()));
    total_value := total_value + inventory_value;
  end loop;
  insert into public.payable_obligations(branch_id, supplier_id, opening_source_id, purchase_receipt_id,
    original_amount_vnd, due_date, recorded_by)
  values (order_row.branch_id, order_row.supplier_id, null, receipt_id, total_value, received_at::date, (select auth.uid()));
  if not exists (
    select 1 from public.purchase_order_lines l
    where l.purchase_order_id = target_purchase_order_id
      and coalesce((select sum(rl.received_quantity) from public.purchase_receipt_lines rl where rl.purchase_order_line_id = l.id), 0) < l.quantity
  ) then update public.purchase_orders set state = 'CLOSED' where id = target_purchase_order_id; end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'receive_purchase_order', hash, 'purchase_receipt', receipt_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.receive', 'purchase_receipt', receipt_id, operation_id, array['inventory','payable']);
  return receipt_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.record_stock_count_line(target_stock_count_id uuid, target_material_id uuid, counted_base_quantity numeric, adjustment_unit_cost_vnd numeric, reason text, target_evidence_id uuid, expected_count_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare count_row public.stock_counts%rowtype; expected numeric; hash text; receipt public.command_receipts%rowtype; line_id uuid;
begin
  select * into count_row from public.stock_counts where id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  if counted_base_quantity is null or counted_base_quantity < 0 or counted_base_quantity >= 'Infinity'::numeric
  then raise exception 'invalid_stock_count_quantity' using errcode = '22023'; end if;
  if adjustment_unit_cost_vnd is not null and (adjustment_unit_cost_vnd < 0 or adjustment_unit_cost_vnd >= 'Infinity'::numeric)
  then raise exception 'invalid_stock_count_cost' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'material_id', target_material_id, 'counted', counted_base_quantity, 'cost', adjustment_unit_cost_vnd, 'reason', nullif(trim(reason), ''), 'evidence_id', target_evidence_id, 'version', expected_count_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_stock_count_line.operation_id;
  if found then if receipt.command_name <> 'record_stock_count_line' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(counted_base_quantity,true);

  if expected_count_version is null or expected_count_version <= 0 or count_row.state <> 'OPEN' or count_row.version  IS DISTINCT FROM expected_count_version or counted_base_quantity < 0 then raise exception 'stock_count_version_conflict' using errcode = 'PT409'; end if;
  if not exists (select 1 from public.materials where id = target_material_id and active) then raise exception 'material_not_found' using errcode = '23503'; end if;
  perform private.assert_verified_evidence(target_evidence_id, count_row.branch_id);
  perform 1 from public.warehouses where id=count_row.warehouse_id for update;
  if exists(select 1 from public.inventory_movements m
    where m.branch_id=count_row.branch_id and m.warehouse_id=count_row.warehouse_id
      and m.material_id=target_material_id
      and (m.occurred_at>count_row.cutoff_at or m.created_at>count_row.cutoff_at))
  then raise exception 'stock_count_cutoff_stale' using errcode='PT409'; end if;
  select coalesce(sum(base_quantity_delta), 0) into expected from public.inventory_movements
    where warehouse_id = count_row.warehouse_id and material_id = target_material_id and occurred_at <= count_row.cutoff_at;
  if counted_base_quantity <> expected and char_length(trim(reason)) < 3 then raise exception 'variance_reason_required' using errcode = '22023'; end if;
  insert into public.stock_count_lines(stock_count_id, material_id, expected_base_quantity, counted_base_quantity,
    adjustment_unit_cost_vnd, reason, evidence_object_id, recorded_by)
  values (target_stock_count_id, target_material_id, expected, counted_base_quantity,
    adjustment_unit_cost_vnd, nullif(trim(reason), ''), target_evidence_id, (select auth.uid()))
  on conflict (stock_count_id, material_id) do update set expected_base_quantity = excluded.expected_base_quantity,
    counted_base_quantity = excluded.counted_base_quantity, adjustment_unit_cost_vnd = excluded.adjustment_unit_cost_vnd,
    reason = excluded.reason, evidence_object_id = excluded.evidence_object_id, recorded_by = excluded.recorded_by,
    recorded_at = now() returning id into line_id;
  update public.stock_count_lines set
    basis_fingerprint=private.stock_count_basis(count_row.branch_id,count_row.warehouse_id,target_material_id),
    basis_count_version=count_row.version
    where id=line_id;
  insert into public.stock_count_observations(stock_count_line_id,count_version,expected_base_quantity,
    counted_base_quantity,basis_fingerprint,reason,evidence_object_id,recorded_by,operation_id)
  select l.id,count_row.version,l.expected_base_quantity,l.counted_base_quantity,l.basis_fingerprint,
    l.reason,l.evidence_object_id,(select auth.uid()),record_stock_count_line.operation_id
    from public.stock_count_lines l where l.id=line_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),count_row.branch_id,'stock_count.line.recorded','stock_count_line',line_id,
    record_stock_count_line.operation_id,array['expected_base_quantity','counted_base_quantity','basis_count_version'],
    nullif(trim(record_stock_count_line.reason),''));
  update public.stock_counts set version = version + 1 where id = target_stock_count_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_stock_count_line', hash, 'stock_count_line', line_id, now());
  return line_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.release_inventory_reservation(target_reservation_id uuid, expected_version integer, release_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare reservation public.inventory_reservations%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into reservation from public.inventory_reservations where id = target_reservation_id for update;
  if reservation.id is null then raise exception 'reservation_not_found' using errcode = '23503'; end if;
  if not private.has_permission(reservation.branch_id, 'inventory.reserve') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(release_reason)) < 3 then raise exception 'release_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('reservation_id', target_reservation_id, 'version', expected_version, 'reason', trim(release_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = release_inventory_reservation.operation_id;
  if found then if receipt.command_name <> 'release_inventory_reservation' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if reservation.state <> 'ACTIVE' or reservation.version  IS DISTINCT FROM expected_version or reservation.delivery_line_id is not null then raise exception 'reservation_not_releasable' using errcode = 'PT409'; end if;
  update public.inventory_reservations set state = 'RELEASED', version = version + 1, finalized_at = now() where id = target_reservation_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'release_inventory_reservation', hash, 'inventory_reservation', target_reservation_id, now());
  return target_reservation_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_inventory(target_sales_order_line_id uuid, target_warehouse_id uuid, requested_base_quantity numeric, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sale_line public.sales_order_lines%rowtype; sale_order public.sales_orders%rowtype; hash text;
  receipt public.command_receipts%rowtype; reservation_id uuid;
begin
  select * into sale_line from public.sales_order_lines where id = target_sales_order_line_id;
  select * into sale_order from public.sales_orders where id = sale_line.sales_order_id;
  if sale_order.id is null or sale_order.commercial_state <> 'CONFIRMED' or not private.has_permission(sale_order.branch_id, 'inventory.reserve') then raise exception 'forbidden_or_order_not_confirmed' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('sales_line_id', target_sales_order_line_id, 'warehouse_id', target_warehouse_id, 'quantity', requested_base_quantity));
  select * into receipt from public.command_receipts where command_receipts.operation_id = reserve_inventory.operation_id;
  if found then if receipt.command_name <> 'reserve_inventory' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(requested_base_quantity,false);

  reservation_id := private.reserve_inventory_for_line(target_sales_order_line_id, null, target_warehouse_id, requested_base_quantity, (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'reserve_inventory', hash, 'inventory_reservation', reservation_id, now());
  return reservation_id;
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
  if case_row.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') then
    if case_row.base_quantity > (select p.base_quantity from private.delivery_line_transit_position(line.id) p) then
      raise exception 'return_exceeds_transit_position' using errcode = '23514';
    end if;
    select case when case_row.base_quantity = p.base_quantity then p.inventory_value_vnd
      else value_amount end into value_amount from private.delivery_line_transit_position(line.id) p;
    if value_amount <= 0 then raise exception 'return_cost_below_currency_precision' using errcode = '23514'; end if;
  end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_payment_notice(target_payment_notice_id uuid, target_state text, target_review_note text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  notice public.payment_notices%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id;
  if notice.id is null or not private.has_permission(notice.branch_id, 'finance.payment_notice.review') then
    raise exception 'payment_notice_review_forbidden' using errcode = '42501';
  end if;
  if target_state not in ('UNDER_REVIEW','ACCEPTED','REJECTED') then raise exception 'invalid_review_state' using errcode = '22023'; end if;
  if nullif(trim(target_review_note), '') is not null and char_length(trim(target_review_note)) not between 3 and 500 then raise exception 'invalid_review_note' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'notice', target_payment_notice_id, 'state', target_state, 'note', nullif(trim(target_review_note), ''), 'version', expected_version
  ));
  select * into receipt from public.command_receipts r where r.operation_id = review_payment_notice.operation_id;
  if found then
    if receipt.command_name <> 'review_payment_notice' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id for update;
  if notice.version  IS DISTINCT FROM expected_version then raise exception 'stale_payment_notice_version' using errcode = 'PT409'; end if;
  insert into public.payment_notice_review_events(payment_notice_id, from_state, to_state, review_note, reviewed_by)
  values(notice.id, notice.review_state, target_state, nullif(trim(target_review_note), ''), (select auth.uid()));
  update public.payment_notices set
    review_state = target_state,
    version = version + 1,
    review_note = nullif(trim(target_review_note), ''),
    reviewed_by = case when target_state in ('ACCEPTED','REJECTED') then (select auth.uid()) else reviewed_by end,
    reviewed_at = case when target_state in ('ACCEPTED','REJECTED') then now() else reviewed_at end
  where id = notice.id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'review_payment_notice', payload_hash, 'payment_notice', notice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), notice.branch_id,
    case target_state when 'REJECTED' then 'payment_notice.rejected'
      when 'ACCEPTED' then 'payment_notice.accepted' else 'payment_notice.under_review' end,
    'payment_notice', notice.id, operation_id, array['review_state', 'review_note'], nullif(trim(target_review_note), ''));
  return notice.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_pricing_rule(target_id uuid, target_branch_id uuid, supersedes_id uuid, expected_version integer, values_json jsonb, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  old_rule public.pricing_rules%rowtype;
  field_name text; rule_scope text; rule_customer uuid; rule_material uuid; rule_group uuid;
  rule_tier text; rule_uom uuid; rule_price bigint; rule_source text;
  rule_from timestamptz; rule_to timestamptz; next_version integer;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_id is null or operation_id is null or jsonb_typeof(values_json) <> 'object'
    or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for field_name in select jsonb_object_keys(values_json) loop
    if field_name <> all(array['scope_type','customer_id','material_id','material_group_id','customer_tier_code','price_uom_id','unit_price_vnd','source_type','effective_from','effective_to']) then
      raise exception 'field_not_editable' using errcode = '42501';
    end if;
  end loop;
  rule_price := (values_json->>'unit_price_vnd')::bigint;
  rule_source := values_json->>'source_type';
  rule_from := (values_json->>'effective_from')::timestamptz;
  rule_to := (values_json->>'effective_to')::timestamptz;
  if rule_price is null or rule_price <= 0 or rule_source not in ('LIST','CONTRACT') or rule_from is null
    or (rule_to is not null and rule_to <= rule_from) then
    raise exception 'invalid_price_rule' using errcode = '22023';
  end if;
  if supersedes_id is not null then
    select * into old_rule from public.pricing_rules where id = supersedes_id and branch_id = target_branch_id for update;
    if old_rule.id is null or expected_version is null or old_rule.version  IS DISTINCT FROM expected_version or not old_rule.active then
      raise exception 'stale_price_rule' using errcode = 'PT409';
    end if;
    if values_json ?| array['scope_type','customer_id','material_id','material_group_id','customer_tier_code','price_uom_id'] then
      raise exception 'scope_immutable' using errcode = '22023';
    end if;
    rule_scope := old_rule.scope_type; rule_customer := old_rule.customer_id;
    rule_material := old_rule.material_id; rule_group := old_rule.material_group_id;
    rule_tier := old_rule.customer_tier_code; rule_uom := old_rule.price_uom_id;
    if rule_from < old_rule.effective_from then raise exception 'effective_date_before_previous' using errcode = '22023'; end if;
    if exists (
      select 1 from public.pricing_rules p where p.branch_id = target_branch_id and p.scope_type = rule_scope
        and p.customer_id is not distinct from rule_customer and p.material_id is not distinct from rule_material
        and p.material_group_id is not distinct from rule_group and p.customer_tier_code is not distinct from rule_tier
        and p.price_uom_id = rule_uom and p.version > old_rule.version
    ) then raise exception 'newer_price_version_exists' using errcode = 'PT409'; end if;
  else
    if expected_version is not null then raise exception 'unexpected_version' using errcode = '22023'; end if;
    rule_scope := values_json->>'scope_type';
    rule_customer := (values_json->>'customer_id')::uuid;
    rule_material := (values_json->>'material_id')::uuid;
    rule_group := (values_json->>'material_group_id')::uuid;
    rule_tier := nullif(trim(values_json->>'customer_tier_code'), '');
    rule_uom := (values_json->>'price_uom_id')::uuid;
  end if;
  if not ((rule_scope = 'CUSTOMER_MATERIAL' and rule_customer is not null and rule_material is not null and rule_group is null and rule_tier is null)
    or (rule_scope = 'CUSTOMER_GROUP' and rule_customer is not null and rule_material is null and rule_group is not null and rule_tier is null)
    or (rule_scope = 'CUSTOMER_TIER' and rule_customer is null and rule_material is not null and rule_group is null and rule_tier is not null and char_length(rule_tier) <= 40)
    or (rule_scope = 'DEFAULT' and rule_customer is null and rule_material is not null and rule_group is null and rule_tier is null)) then
    raise exception 'invalid_price_scope' using errcode = '22023';
  end if;
  if rule_customer is not null and not exists (select 1 from public.customers where id = rule_customer and branch_id = target_branch_id and active) then
    raise exception 'customer_outside_branch' using errcode = '42501';
  end if;
  if rule_material is not null and not exists (select 1 from public.materials where id = rule_material and active and sale_enabled) then raise exception 'material_inactive' using errcode = '22023'; end if;
  if rule_group is not null and not exists (select 1 from public.material_groups where id = rule_group and active) then raise exception 'group_inactive' using errcode = '22023'; end if;
  if not exists (select 1 from public.units_of_measure where id = rule_uom and active) then raise exception 'uom_inactive' using errcode = '22023'; end if;
  if supersedes_id is null and exists (
    select 1 from public.pricing_rules p where p.branch_id = target_branch_id and p.active and p.scope_type = rule_scope
      and p.customer_id is not distinct from rule_customer and p.material_id is not distinct from rule_material
      and p.material_group_id is not distinct from rule_group and p.customer_tier_code is not distinct from rule_tier
      and p.price_uom_id = rule_uom
  ) then raise exception 'active_rule_exists' using errcode = 'PT409'; end if;
  select coalesce(max(p.version), 0) + 1 into next_version from public.pricing_rules p
    where p.scope_type = rule_scope and p.customer_id is not distinct from rule_customer
      and p.material_id is not distinct from rule_material and p.material_group_id is not distinct from rule_group
      and p.customer_tier_code is not distinct from rule_tier and p.price_uom_id = rule_uom;
  if supersedes_id is not null then
    update public.pricing_rules set
      effective_to = case when effective_from = rule_from then effective_to
        when effective_to is null or effective_to > rule_from then rule_from else effective_to end,
      active = case when effective_from = rule_from then false else active end
    where id = supersedes_id;
  end if;
  insert into public.pricing_rules(id, branch_id, scope_type, customer_id, material_id, material_group_id,
    customer_tier_code, price_uom_id, unit_price_vnd, version, source_type,
    effective_from, effective_to, active, created_by)
  values(target_id, target_branch_id, rule_scope, rule_customer, rule_material, rule_group,
    rule_tier, rule_uom, rule_price, next_version, rule_source,
    rule_from, rule_to, true, auth.uid());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), target_branch_id, 'pricing.save', 'pricing_rules', target_id, operation_id,
    array(select jsonb_object_keys(values_json)), change_reason);
  return target_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_purchase_price_rule(target_id uuid, target_branch_id uuid, supersedes_id uuid, expected_version integer, values_json jsonb, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_rule public.purchase_price_rules%rowtype; receipt public.command_receipts%rowtype;
 supplier uuid; material uuid; uom uuid; amount bigint; source text; starts timestamptz; ends timestamptz;
 field_name text; next_version integer; payload_hash text;
begin
 if auth.uid() is null or not private.has_permission(target_branch_id,'purchasing.price.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if target_id is null or operation_id is null or jsonb_typeof(values_json) is distinct from 'object'
 or char_length(trim(coalesce(change_reason,''))) not between 3 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 for field_name in select jsonb_object_keys(values_json) loop
  if field_name<>all(array['supplier_id','material_id','purchase_uom_id','unit_cost_vnd','source_type','effective_from','effective_to']) then raise exception 'field_not_editable' using errcode='42501';end if;
 end loop;
 payload_hash=private.command_payload_hash(jsonb_build_object('target',target_id,'branch',target_branch_id,'supersedes',supersedes_id,'version',expected_version,'values',values_json,'reason',change_reason));
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.command_receipts c where c.operation_id=save_purchase_price_rule.operation_id;
 if found then
  if receipt.command_name<>'save_purchase_price_rule' or receipt.payload_hash<>payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;
  return receipt.result_entity_id;
 end if;
 if coalesce(values_json->>'unit_cost_vnd','')!~'^[1-9][0-9]{0,18}$' or (values_json->>'unit_cost_vnd')::numeric>9223372036854775807 then raise exception 'invalid_price' using errcode='22023';end if;
 amount=(values_json->>'unit_cost_vnd')::bigint;source=values_json->>'source_type';
 starts=(values_json->>'effective_from')::timestamptz;ends=(values_json->>'effective_to')::timestamptz;
 if source is null or source not in ('LIST','CONTRACT') or starts is null or (ends is not null and ends<=starts) then raise exception 'invalid_price_rule' using errcode='22023';end if;
 if supersedes_id is not null then
  select * into old_rule from public.purchase_price_rules where id=supersedes_id and branch_id=target_branch_id;
  if old_rule.id is null then raise exception 'stale_price_rule' using errcode='PT409';end if;
  supplier=old_rule.supplier_id;material=old_rule.material_id;uom=old_rule.purchase_uom_id;
  if values_json ?| array['supplier_id','material_id','purchase_uom_id'] then raise exception 'scope_immutable' using errcode='22023';end if;
 else
  if expected_version is not null then raise exception 'unexpected_version' using errcode='22023';end if;
  supplier=(values_json->>'supplier_id')::uuid;material=(values_json->>'material_id')::uuid;uom=(values_json->>'purchase_uom_id')::uuid;
 end if;
 if not exists(select 1 from public.suppliers where id=supplier and branch_id=target_branch_id and active) then raise exception 'supplier_outside_branch' using errcode='42501';end if;
 if not exists(select 1 from public.materials where id=material and active and purchase_enabled)
 or not exists(select 1 from public.units_of_measure where id=uom and active) then raise exception 'material_or_uom_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_branch_id::text||':'||supplier::text||':'||material::text||':'||uom::text,0));
 if supersedes_id is not null then
  select * into old_rule from public.purchase_price_rules where id=supersedes_id and branch_id=target_branch_id for update;
  if old_rule.id is null or expected_version is null or old_rule.version IS DISTINCT FROM expected_version or not old_rule.active
  or starts<old_rule.effective_from or exists(select 1 from public.purchase_price_rules p where p.supplier_id=supplier and p.material_id=material and p.purchase_uom_id=uom and p.version>old_rule.version) then raise exception 'stale_price_rule' using errcode='PT409';end if;
 end if;
 if exists(select 1 from public.purchase_price_rules p where p.branch_id=target_branch_id and p.supplier_id=supplier and p.material_id=material and p.purchase_uom_id=uom and p.active
  and (supersedes_id is null or p.id<>supersedes_id) and tstzrange(p.effective_from,p.effective_to,'[)')&&tstzrange(starts,ends,'[)')) then raise exception 'active_rule_exists' using errcode='PT409';end if;
 select coalesce(max(p.version),0)+1 into next_version from public.purchase_price_rules p where p.supplier_id=supplier and p.material_id=material and p.purchase_uom_id=uom;
 if supersedes_id is not null then
  update public.purchase_price_rules set effective_to=case when effective_from=starts then effective_to when effective_to is null or effective_to>starts then starts else effective_to end,
   active=case when effective_from=starts then false else active end where id=supersedes_id;
 end if;
 insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,effective_to,active,created_by)
 values(target_id,target_branch_id,supplier,material,uom,amount,next_version,source,starts,ends,true,auth.uid());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),target_branch_id,'purchase_pricing.save','purchase_price_rules',target_id,operation_id,array(select jsonb_object_keys(values_json)),change_reason);
 insert into public.command_receipts values(operation_id,auth.uid(),'save_purchase_price_rule',payload_hash,'purchase_price_rule',target_id,now());
 return target_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_inventory_stock_threshold(target_branch_id uuid, target_warehouse_id uuid, target_material_id uuid, target_threshold_base_quantity numeric, target_active boolean)
 RETURNS TABLE(threshold_id uuid, threshold_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved public.inventory_stock_thresholds;
begin
  perform private.require_exact_quantity(target_threshold_base_quantity,true);

  if auth.uid() is null or not private.has_permission(target_branch_id, 'inventory.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_threshold_base_quantity is null or target_threshold_base_quantity < 0 then
    raise exception 'invalid_threshold' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = target_warehouse_id
      and w.branch_id = target_branch_id
      and w.active
  ) then
    raise exception 'warehouse_not_available' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.materials m
    where m.id = target_material_id
      and m.active
  ) then
    raise exception 'material_not_available' using errcode = '22023';
  end if;

  insert into public.inventory_stock_thresholds (
    branch_id,
    warehouse_id,
    material_id,
    threshold_base_quantity,
    active,
    created_by,
    updated_by
  )
  values (
    target_branch_id,
    target_warehouse_id,
    target_material_id,
    target_threshold_base_quantity,
    target_active,
    auth.uid(),
    auth.uid()
  )
  on conflict (branch_id, warehouse_id, material_id)
  do update set
    threshold_base_quantity = excluded.threshold_base_quantity,
    active = excluded.active,
    version = public.inventory_stock_thresholds.version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into saved;

  return query select saved.id, saved.version;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_gps_tracking(target_delivery_id uuid, target_assignment_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delivery public.deliveries%rowtype;
  assignment public.delivery_assignments%rowtype;
  employee_id uuid;
  session_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  employee_id := private.current_employee_id();
  if employee_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into delivery from public.deliveries d where d.id = target_delivery_id for update;
  select * into assignment from public.delivery_assignments a
    where a.delivery_id = target_delivery_id and a.superseded_at is null for update;
  if delivery.id is null or assignment.id is null or assignment.employee_id <> employee_id
    or assignment.assignment_version  IS DISTINCT FROM target_assignment_version
    or delivery.execution_state not in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED') then
    raise exception 'gps_assignment_not_active' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'delivery_id', target_delivery_id,
    'assignment_version', target_assignment_version
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = start_gps_tracking.operation_id;
  if found then
    if receipt.command_name <> 'start_gps_tracking' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select s.id into session_id from public.gps_tracking_sessions s
    where s.assignment_id = assignment.id and s.status = 'ACTIVE' for update;
  if session_id is null then
    update public.gps_tracking_sessions
      set status = 'REVOKED', stopped_at = now(), stop_reason = 'assignment_superseded'
      where delivery_id = delivery.id and status = 'ACTIVE';
    insert into public.gps_tracking_sessions(
      branch_id, delivery_id, assignment_id, assignment_version, employee_id, vehicle_id, started_by, start_operation_id
    ) values (
      delivery.branch_id, delivery.id, assignment.id, assignment.assignment_version, assignment.employee_id,
      assignment.vehicle_id, (select auth.uid()), operation_id
    ) returning id into session_id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values ((select auth.uid()), delivery.branch_id, 'gps_tracking.started', 'gps_tracking_session', session_id, operation_id,
      array['delivery','assignment_version','foreground']);
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'start_gps_tracking', payload_hash, 'gps_tracking_session', session_id, now());
  return session_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.start_work_item(target_work_item_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype; assignment public.work_item_assignments%rowtype; actor_employee uuid; payload_hash text; receipt public.command_receipts%rowtype;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null then raise exception 'work_not_found' using errcode='23503'; end if;
  actor_employee:=private.current_employee_id();
  if not private.has_permission(work.branch_id,'work.manage') and not private.has_permission(work.branch_id,'work.claim') then raise exception 'forbidden' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=start_work_item.operation_id;
  if found then if receipt.command_name<>'start_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  if assignment.id is null or (assignment.employee_id<>actor_employee and not private.has_permission(work.branch_id,'work.manage')) then raise exception 'not_current_assignee' using errcode='42501'; end if;
  if work.version IS DISTINCT FROM expected_version then raise exception 'stale_work_version' using errcode = 'PT409'; end if;
  if work.execution_state<>'CLAIMED' then raise exception 'work_not_startable' using errcode='55000'; end if;
  update public.work_items set execution_state='IN_PROGRESS',started_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '2 hours',version=version+1 where id=work.id;
  if work.service_job_id is not null then update public.service_jobs set execution_state='IN_PROGRESS',version=version+1 where id=work.service_job_id and execution_state='SCHEDULED'; end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'start_work_item',payload_hash,'work_item',work.id,now());
  return work.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_delivery_result(target_delivery_id uuid, result_kind text, result_lines jsonb, receiver_name text, note text, missing_arrival_reason text, target_evidence_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; line public.delivery_lines%rowtype; item jsonb;
  actual numeric; result_id uuid; line_count integer := 0; lower_count integer := 0; positive_count integer := 0;
  hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'kind', result_kind, 'lines', result_lines, 'receiver', nullif(trim(receiver_name), ''), 'note', nullif(trim(note), ''), 'arrival_reason', nullif(trim(missing_arrival_reason), ''), 'evidence_id', target_evidence_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = submit_delivery_result.operation_id;
  if found then if receipt.command_name <> 'submit_delivery_result' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_quantity_lines(result_lines,array['actual_base_quantity'],true);

  if delivery.execution_state not in ('DISPATCHED','ARRIVED') or delivery.version  IS DISTINCT FROM expected_version then raise exception 'delivery_result_version_conflict' using errcode = 'PT409'; end if;
  if result_kind not in ('FULL','PARTIAL','FAILED') or jsonb_array_length(result_lines) = 0 then raise exception 'invalid_delivery_result' using errcode = '22023'; end if;
  if delivery.execution_state = 'DISPATCHED' and char_length(trim(missing_arrival_reason)) < 3 then raise exception 'missing_arrival_reason_required' using errcode = '22023'; end if;
  perform private.assert_verified_evidence(target_evidence_id, delivery.branch_id);
  insert into public.delivery_results(delivery_id, result_kind, receiver_name, note, missing_arrival_reason,
    evidence_object_id, submitted_by)
  values (target_delivery_id, result_kind, nullif(trim(receiver_name), ''), nullif(trim(note), ''),
    nullif(trim(missing_arrival_reason), ''), target_evidence_id, (select auth.uid())) returning id into result_id;
  for item in select value from jsonb_array_elements(result_lines) loop
    select * into line from public.delivery_lines where id = (item->>'delivery_line_id')::uuid and delivery_id = target_delivery_id;
    actual := (item->>'actual_base_quantity')::numeric;
    if line.id is null or actual < 0 or actual > line.planned_base_quantity then raise exception 'invalid_delivery_result_line' using errcode = '22023'; end if;
    insert into public.delivery_result_lines(delivery_result_id, delivery_line_id, actual_base_quantity) values (result_id, line.id, actual);
    line_count := line_count + 1;
    if actual < line.planned_base_quantity then lower_count := lower_count + 1; end if;
    if actual > 0 then positive_count := positive_count + 1; end if;
  end loop;
  if line_count <> (select count(*) from public.delivery_lines where delivery_id = target_delivery_id)
    or (result_kind = 'FULL' and lower_count <> 0)
    or (result_kind = 'PARTIAL' and (lower_count = 0 or positive_count = 0))
    or (result_kind = 'FAILED' and positive_count <> 0) then raise exception 'delivery_result_kind_mismatch' using errcode = '23514'; end if;
  update public.deliveries set execution_state = 'RESULT_SUBMITTED', result_kind = submit_delivery_result.result_kind,
    version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'submit_delivery_result', hash, 'delivery_result', result_id, now());
  return result_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.submit_portal_delivery_result(target_work_item_id uuid, result_lines jsonb, receiver_name text, note text, target_evidence_id uuid, missing_arrival_reason text, expected_work_version integer, expected_delivery_version integer, expected_assignment_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work public.work_items%rowtype; delivery public.deliveries%rowtype;
  assignment public.work_item_assignments%rowtype; source_assignment public.delivery_assignments%rowtype;
  receipt public.command_receipts%rowtype; hash text; item jsonb; line public.delivery_lines%rowtype;
  actual numeric; seen uuid[] := '{}'; positive integer := 0; lower integer := 0;
  kind text; result_id uuid; work_result_id uuid;
begin
  if not private.is_current_work_assignee(target_work_item_id) then
    raise exception 'work_result_forbidden' using errcode='42501';
  end if;
  if operation_id is null then raise exception 'operation_id_required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  hash := private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'lines',result_lines,
    'receiver',nullif(trim(receiver_name),''),'note',nullif(trim(note),''),'evidence',target_evidence_id,
    'arrival_reason',nullif(trim(missing_arrival_reason),''),'work_version',expected_work_version,
    'delivery_version',expected_delivery_version,'assignment_version',expected_assignment_version));
  select * into receipt from public.command_receipts r where r.operation_id=submit_portal_delivery_result.operation_id;
  if found then
    if receipt.command_name<>'submit_portal_delivery_result' or receipt.payload_hash<>hash then
      raise exception 'operation_payload_conflict' using errcode='23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(result_lines,array['actual_base_quantity'],true);

  select * into work from public.work_items where id=target_work_item_id;
  select * into delivery from public.deliveries where id=work.delivery_id for update;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  select * into source_assignment from public.delivery_assignments where delivery_id=delivery.id and superseded_at is null;
  if delivery.id is null or delivery.branch_id<>work.branch_id or not private.is_current_work_assignee(work.id)
    or assignment.id is null or source_assignment.id is null
    or source_assignment.employee_id is distinct from assignment.employee_id
    or source_assignment.vehicle_id is distinct from assignment.vehicle_id then
    raise exception 'delivery_assignee_mismatch' using errcode='42501';
  end if;
  if work.version is distinct from expected_work_version or delivery.version is distinct from expected_delivery_version
    or source_assignment.assignment_version is distinct from expected_assignment_version then
    raise exception 'stale_work_or_delivery_version' using errcode='40001';
  end if;
  if work.execution_state<>'IN_PROGRESS' or delivery.execution_state not in ('DISPATCHED','ARRIVED') then
    raise exception 'delivery_work_not_submittable' using errcode='55000';
  end if;
  if delivery.execution_state='DISPATCHED' and (missing_arrival_reason is null or char_length(trim(missing_arrival_reason))<3) then
    raise exception 'missing_arrival_reason_required' using errcode='22023';
  end if;
  if char_length(coalesce(trim(note),''))>1000 or char_length(coalesce(trim(receiver_name),''))>120
    or char_length(coalesce(trim(missing_arrival_reason),''))>1000 then
    raise exception 'invalid_delivery_result_text' using errcode='22023';
  end if;
  if jsonb_typeof(result_lines) is distinct from 'array' then raise exception 'invalid_delivery_lines' using errcode='22023'; end if;
  if jsonb_array_length(result_lines) not between 1 and 50 then raise exception 'invalid_delivery_lines' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(result_lines) loop
    select * into line from public.delivery_lines where id=(item->>'delivery_line_id')::uuid and delivery_id=delivery.id;
    actual := (item->>'actual_base_quantity')::numeric;
    if line.id is null or line.id=any(seen) or actual is null or actual::text in ('NaN','Infinity','-Infinity')
      or actual<0 or actual>line.planned_base_quantity or actual<>round(actual,6) then
      raise exception 'invalid_delivery_result_line' using errcode='22023';
    end if;
    seen:=array_append(seen,line.id);
    if actual>0 then positive:=positive+1; end if;
    if actual<line.planned_base_quantity then lower:=lower+1; end if;
  end loop;
  if cardinality(seen)<>(select count(*) from public.delivery_lines where delivery_id=delivery.id) then
    raise exception 'delivery_result_line_missing' using errcode='22023';
  end if;
  kind:=case when positive=0 then 'FAILED' when lower>0 then 'PARTIAL' else 'FULL' end;
  if (positive>0 and nullif(trim(receiver_name),'') is null)
    or (kind='FAILED' and char_length(coalesce(trim(note),''))<3) then
    raise exception 'delivery_receiver_or_failure_reason_required' using errcode='22023';
  end if;
  if target_evidence_id is not null and not exists(select 1 from public.portal_evidence_objects e
    where e.id=target_evidence_id and e.context_type='WORK_RESULT' and e.work_item_id=work.id
      and e.object_state='READY' and e.uploaded_by=(select auth.uid())) then
    raise exception 'work_result_evidence_invalid' using errcode='42501';
  end if;
  insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,submitted_by)
  values(work.id,assignment.id,null,nullif(trim(note),''),nullif(trim(receiver_name),''),(select auth.uid())) returning id into work_result_id;
  insert into public.delivery_results(delivery_id,result_kind,receiver_name,note,missing_arrival_reason,submitted_by,source_work_item_result_id)
  values(delivery.id,kind,nullif(trim(receiver_name),''),nullif(trim(note),''),nullif(trim(missing_arrival_reason),''),
    (select auth.uid()),work_result_id) returning id into result_id;
  for item in select value from jsonb_array_elements(result_lines) loop
    insert into public.delivery_result_lines(delivery_result_id,delivery_line_id,actual_base_quantity)
    values(result_id,(item->>'delivery_line_id')::uuid,(item->>'actual_base_quantity')::numeric);
  end loop;
  if target_evidence_id is not null then
    insert into public.work_result_portal_evidence(work_result_id,evidence_id) values(work_result_id,target_evidence_id);
  end if;
  update public.work_items set execution_state='DONE',completed_at=now(),version=version+1 where id=work.id;
  update public.deliveries set execution_state='RESULT_SUBMITTED',result_kind=kind,version=version+1 where id=delivery.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'submit_portal_delivery_result',hash,'work_item_result',work_result_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),work.branch_id,'delivery.result.submitted','delivery_result',result_id,operation_id,array['source_work_item_result_id','actual_base_quantity']);
  return work_result_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_portal_work_result(target_work_item_id uuid, actual_quantity numeric, note text, receiver_name text, target_evidence_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  result_id uuid;
  nested_operation_id uuid;
begin
  if not private.is_current_work_assignee(target_work_item_id) then raise exception 'work_result_forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'work', target_work_item_id, 'actual', actual_quantity, 'note', nullif(trim(note), ''),
    'receiver', nullif(trim(receiver_name), ''), 'evidence', target_evidence_id, 'version', expected_version
  ));
  select * into receipt from public.command_receipts r where r.operation_id = submit_portal_work_result.operation_id;
  if found then
    if receipt.command_name <> 'submit_portal_work_result' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_exact_quantity(actual_quantity,true);

  if target_evidence_id is not null and not exists (
    select 1 from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and e.context_type = 'WORK_RESULT'
      and e.work_item_id = target_work_item_id
      and e.object_state = 'READY'
      and e.uploaded_by = (select auth.uid())
  ) then
    raise exception 'work_result_evidence_invalid' using errcode = '42501';
  end if;

  nested_operation_id := md5(operation_id::text || ':work-result')::uuid;
  result_id := public.submit_work_result(
    target_work_item_id, actual_quantity, nullif(trim(note), ''), nullif(trim(receiver_name), ''), null,
    expected_version, nested_operation_id
  );
  if target_evidence_id is not null then
    insert into public.work_result_portal_evidence(work_result_id, evidence_id)
    values(result_id, target_evidence_id)
    on conflict do nothing;
  end if;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'submit_portal_work_result', payload_hash, 'work_item_result', result_id, now());
  return result_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_work_result(target_work_item_id uuid, actual_quantity numeric, note text, receiver_name text, target_evidence_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype; assignment public.work_item_assignments%rowtype; actor_employee uuid; payload_hash text; receipt public.command_receipts%rowtype; result_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  actor_employee:=private.current_employee_id();
  if work.id is null or (not private.has_permission(work.branch_id,'work.claim') and not private.has_permission(work.branch_id,'work.manage')) then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  if actual_quantity is null or actual_quantity::text in ('NaN','Infinity','-Infinity') or actual_quantity<0 or (nullif(trim(note),'') is not null and char_length(trim(note)) not between 3 and 1000) then raise exception 'invalid_work_result' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'actual',actual_quantity,'note',nullif(trim(note),''),'receiver',nullif(trim(receiver_name),''),'evidence',target_evidence_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=submit_work_result.operation_id;
  if found then if receipt.command_name<>'submit_work_result' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(actual_quantity,true);

  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  if assignment.id is null or (assignment.employee_id<>actor_employee and not private.has_permission(work.branch_id,'work.manage')) then raise exception 'not_current_assignee' using errcode='42501'; end if;
  if work.version IS DISTINCT FROM expected_version then raise exception 'stale_work_version' using errcode = 'PT409'; end if;
  if work.execution_state<>'IN_PROGRESS' then raise exception 'work_not_submittable' using errcode='55000'; end if;
  if target_evidence_id is not null then perform 1 from public.evidence_objects where id=target_evidence_id and branch_id=work.branch_id and upload_state='VERIFIED'; if not found then raise exception 'evidence_not_verified' using errcode='23503'; end if; end if;
  if work.delivery_id is not null then raise exception 'delivery_line_result_required' using errcode='22023'; end if;
  insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,evidence_object_id,submitted_by) values(work.id,assignment.id,actual_quantity,nullif(trim(note),''),nullif(trim(receiver_name),''),target_evidence_id,(select auth.uid())) returning id into result_id;
  update public.work_items set execution_state='DONE',completed_at=now(),version=version+1 where id=work.id;
  if work.service_job_id is not null then
    insert into public.service_work_logs(service_job_id,work_item_id,employee_id,started_at,ended_at,actual_quantity,result_id) values(work.service_job_id,work.id,assignment.employee_id,work.started_at,now(),actual_quantity,result_id);
    update public.service_jobs set execution_state='RESULT_SUBMITTED',version=version+1 where id=work.service_job_id;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'submit_work_result',payload_hash,'work_item_result',result_id,now());
  return result_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_order_draft(target_purchase_order_id uuid, expected_version integer, expected_at timestamp with time zone, commercial_terms text, purchase_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row public.purchase_orders%rowtype;
  old_line public.purchase_order_lines%rowtype;
  sale_line public.sales_order_lines%rowtype;
  allocation public.supply_allocations%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  item jsonb;
  checked record;
  source_line_id uuid;
  linked_sale_line_id uuid;
  written_line_id uuid;
  seen_source_ids uuid[] := array[]::uuid[];
  seen_sale_ids uuid[] := array[]::uuid[];
  line_no integer := 0;
  requested_quantity numeric;
  base_quantity numeric;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not found then raise exception 'purchase_order_not_found' using errcode = '22023'; end if;
  if not private.has_permission(order_row.branch_id, 'purchasing.create')
  then raise exception 'forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id,
    'version', expected_version, 'expected_at', expected_at, 'terms', commercial_terms, 'lines', purchase_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_purchase_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'update_purchase_order_draft' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(purchase_lines,array['quantity'],false);

  if order_row.state <> 'DRAFT' then raise exception 'purchase_order_not_editable' using errcode = '23514'; end if;
  if order_row.draft_version  IS DISTINCT FROM expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if jsonb_typeof(purchase_lines) is distinct from 'array' then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(purchase_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_purchase_draft_payload' using errcode = '22023'; end if;
  if order_row.destination_type = 'WAREHOUSE' then
    if exists (select 1 from public.supply_allocations a join public.purchase_order_lines l on l.id = a.purchase_order_line_id
      where l.purchase_order_id = target_purchase_order_id)
    then raise exception 'purchase_order_has_allocations' using errcode = '23514'; end if;
  elsif order_row.destination_type = 'CUSTOMER_SITE' and order_row.source_sales_order_id is not null then
    if exists (select 1 from public.supply_allocations a join public.purchase_order_lines l on l.id = a.purchase_order_line_id
      where l.purchase_order_id = target_purchase_order_id and a.supply_mode <> 'SUPPLIER_DIRECT')
    then raise exception 'direct_allocation_invalid' using errcode = '23514'; end if;
  else raise exception 'source_linked_purchase_requires_adjustment' using errcode = '23514'; end if;
  -- Remove only lines omitted from the submitted DRAFT; all remaining IDs stay stable.
  delete from public.supply_allocations a using public.purchase_order_lines l
  where a.purchase_order_line_id = l.id and l.purchase_order_id = target_purchase_order_id
    and not exists (select 1 from jsonb_array_elements(purchase_lines) x where nullif(x.value->>'source_line_id', '')::uuid = l.id);
  delete from public.purchase_order_lines l where l.purchase_order_id = target_purchase_order_id
    and not exists (select 1 from jsonb_array_elements(purchase_lines) x where nullif(x.value->>'source_line_id', '')::uuid = l.id);
  update public.purchase_order_lines set line_number = line_number + 1000 where purchase_order_id = target_purchase_order_id;
  for item in select value from jsonb_array_elements(purchase_lines) loop
    line_no := line_no + 1;
    source_line_id := nullif(item->>'source_line_id', '')::uuid;
    linked_sale_line_id := nullif(item->>'linked_sales_order_line_id', '')::uuid;
    if source_line_id is not null then
      if source_line_id = any(seen_source_ids) then raise exception 'purchase_line_duplicate' using errcode = '22023'; end if;
      seen_source_ids := array_append(seen_source_ids, source_line_id);
      select * into old_line from public.purchase_order_lines
      where id = source_line_id and purchase_order_id = target_purchase_order_id for update;
      if not found then raise exception 'purchase_line_not_found' using errcode = '23503'; end if;
    else old_line := null; end if;
    if order_row.destination_type = 'CUSTOMER_SITE' then
      if linked_sale_line_id is null or linked_sale_line_id = any(seen_sale_ids)
      then raise exception 'direct_purchase_source_line_invalid' using errcode = '22023'; end if;
      seen_sale_ids := array_append(seen_sale_ids, linked_sale_line_id);
      if old_line.id is not null and old_line.linked_sales_order_line_id is distinct from linked_sale_line_id
      then raise exception 'direct_purchase_source_line_immutable' using errcode = '23514'; end if;
      select * into sale_line from public.sales_order_lines
      where id = linked_sale_line_id and sales_order_id = order_row.source_sales_order_id for update;
      if not found then raise exception 'direct_purchase_source_line_invalid' using errcode = '23503'; end if;
    elsif linked_sale_line_id is not null then raise exception 'warehouse_line_cannot_link_sale' using errcode = '22023'; end if;
    if old_line.id is not null and old_line.price_source_type = 'MANUAL_APPROVED'
      and not private.has_permission(order_row.branch_id, 'purchasing.price.manage') then
      requested_quantity := (item->>'quantity')::numeric;
      if requested_quantity <= 0 or (item->>'material_id')::uuid is distinct from old_line.material_id
        or (item->>'ordered_uom_id')::uuid is distinct from old_line.ordered_uom_id
        or (item->>'conversion_numerator')::numeric is distinct from old_line.conversion_numerator
        or (item->>'conversion_denominator')::numeric is distinct from old_line.conversion_denominator
        or item->>'rounding_mode' is distinct from old_line.rounding_mode
        or (item->>'unit_cost_vnd')::bigint is distinct from old_line.unit_cost_vnd
        or item->>'price_source_type' is distinct from 'MANUAL_APPROVED'
        or nullif(item->>'purchase_price_rule_id', '') is not null
        or nullif(item->>'purchase_price_rule_version', '') is not null
        or (nullif(item->>'override_reason', '') is not null and item->>'override_reason' is distinct from old_line.override_reason)
      then raise exception 'manual_purchase_price_change_requires_permission' using errcode = '42501'; end if;
      select old_line.material_id as material_id, old_line.material_name_snapshot as material_name,
        old_line.ordered_uom_id as ordered_uom_id, old_line.base_uom_id as base_uom_id,
        requested_quantity as quantity, old_line.conversion_numerator as conversion_numerator,
        old_line.conversion_denominator as conversion_denominator, old_line.rounding_mode as rounding_mode,
        old_line.unit_cost_vnd as unit_cost_vnd, round(requested_quantity * old_line.unit_cost_vnd)::bigint as line_total_cost_vnd,
        old_line.purchase_price_rule_id as purchase_price_rule_id,
        old_line.purchase_price_rule_version as purchase_price_rule_version,
        old_line.price_source_type as price_source_type, old_line.override_by as override_by,
        old_line.override_reason as override_reason into checked;
    else
      select * into checked from private.assert_purchase_line(order_row.branch_id, order_row.supplier_id, item, (select auth.uid()));
    end if;
    if order_row.destination_type = 'CUSTOMER_SITE'
      and (checked.material_id <> sale_line.material_id or checked.base_uom_id <> sale_line.base_uom_id)
    then raise exception 'direct_purchase_line_mismatch' using errcode = '22023'; end if;
    if old_line.id is null then
      insert into public.purchase_order_lines(purchase_order_id, linked_sales_order_line_id, line_number, material_id,
        material_name_snapshot, ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator,
        rounding_mode, unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
        price_source_type, override_by, override_reason)
      values (target_purchase_order_id, linked_sale_line_id, line_no, checked.material_id, checked.material_name,
        checked.ordered_uom_id, checked.base_uom_id, checked.quantity, checked.conversion_numerator,
        checked.conversion_denominator, checked.rounding_mode, checked.unit_cost_vnd, checked.line_total_cost_vnd,
        checked.purchase_price_rule_id, checked.purchase_price_rule_version, checked.price_source_type,
        checked.override_by, checked.override_reason) returning id into written_line_id;
    else
      update public.purchase_order_lines set linked_sales_order_line_id = linked_sale_line_id, line_number = line_no,
        material_id = checked.material_id, material_name_snapshot = checked.material_name,
        ordered_uom_id = checked.ordered_uom_id, base_uom_id = checked.base_uom_id, quantity = checked.quantity,
        conversion_numerator = checked.conversion_numerator, conversion_denominator = checked.conversion_denominator,
        rounding_mode = checked.rounding_mode, unit_cost_vnd = checked.unit_cost_vnd,
        line_total_cost_vnd = checked.line_total_cost_vnd, purchase_price_rule_id = checked.purchase_price_rule_id,
        purchase_price_rule_version = checked.purchase_price_rule_version, price_source_type = checked.price_source_type,
        override_by = checked.override_by, override_reason = checked.override_reason
      where id = old_line.id returning id into written_line_id;
    end if;
    if order_row.destination_type = 'CUSTOMER_SITE' then
      if (select count(*) from public.supply_allocations where purchase_order_line_id = written_line_id) > 1
      then raise exception 'direct_allocation_invalid' using errcode = '23514'; end if;
      select * into allocation from public.supply_allocations where purchase_order_line_id = written_line_id for update;
      if allocation.id is not null and (allocation.sales_order_line_id <> linked_sale_line_id or allocation.supply_mode <> 'SUPPLIER_DIRECT')
      then raise exception 'direct_allocation_invalid' using errcode = '23514'; end if;
      base_quantity := checked.quantity * checked.conversion_numerator / checked.conversion_denominator;
      perform private.assert_allocation_capacity(linked_sale_line_id, base_quantity, allocation.id);
      if allocation.id is null then
        insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, purchase_order_line_id,
          allocated_base_quantity, created_by)
        values (order_row.branch_id, linked_sale_line_id, 'SUPPLIER_DIRECT', written_line_id, base_quantity, (select auth.uid()));
      else
        update public.supply_allocations set allocated_base_quantity = base_quantity,
          version = version + 1, updated_at = now() where id = allocation.id;
      end if;
    end if;
  end loop;
  update public.purchase_orders set expected_at = update_purchase_order_draft.expected_at,
    commercial_terms = update_purchase_order_draft.commercial_terms, draft_version = draft_version + 1
  where id = target_purchase_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_purchase_order_draft', payload_hash, 'purchase_order', target_purchase_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.draft.update', 'purchase_order', target_purchase_order_id,
    operation_id, array['expected_at','commercial_terms','lines','draft_version','supply_allocation']);
  return target_purchase_order_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_order_warehouse(target_purchase_order_id uuid, expected_version integer, target_warehouse_id uuid, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row public.purchase_orders%rowtype; warehouse_row public.warehouses%rowtype;
  receipt public.command_receipts%rowtype; hash text; address text;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not found then raise exception 'purchase_order_missing' using errcode = '22023'; end if;
  if auth.uid() is null or not private.has_permission(order_row.branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'version', expected_version, 'warehouse_id', target_warehouse_id, 'reason', change_reason));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_purchase_order_warehouse.operation_id;
  if found then
    if receipt.command_name <> 'update_purchase_order_warehouse' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if order_row.state <> 'DRAFT' or order_row.destination_type <> 'WAREHOUSE' then raise exception 'purchase_order_not_editable' using errcode = '23514'; end if;
  if expected_version is null or order_row.draft_version  IS DISTINCT FROM expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if exists(select 1 from public.supply_allocations a join public.purchase_order_lines l on l.id = a.purchase_order_line_id where l.purchase_order_id = order_row.id) then raise exception 'purchase_order_has_allocations' using errcode = '23514'; end if;
  if operation_id is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into warehouse_row from public.warehouses where id = target_warehouse_id and branch_id = order_row.branch_id and active for share;
  if not found then raise exception 'supplier_or_warehouse_invalid' using errcode = '23503'; end if;
  address := private.normalize_po_warehouse_address(warehouse_row.address_text);
  if address is null then raise exception 'warehouse_address_required' using errcode = '22023'; end if;
  update public.purchase_orders set warehouse_id = warehouse_row.id, destination_name_snapshot = warehouse_row.name,
    destination_address_snapshot = address, draft_version = draft_version + 1 where id = order_row.id;
  insert into public.command_receipts values(operation_id, auth.uid(), 'update_purchase_order_warehouse', hash, 'purchase_order', order_row.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), order_row.branch_id, 'purchase_order.draft.destination.update', 'purchase_order', order_row.id, operation_id,
    array['warehouse_id','destination_name_snapshot','destination_address_snapshot','draft_version'], change_reason);
  return order_row.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_quote_draft(target_revision_id uuid, expected_version integer, expires_at timestamp with time zone, commercial_terms text, quote_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  revision public.quotation_revisions%rowtype;
  quote public.quotations%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  original_lines jsonb;
  item jsonb;
  checked record;
  line_no integer := 0;
  total bigint := 0;
begin
  select * into revision from public.quotation_revisions where id = target_revision_id for update;
  if not found then raise exception 'quote_revision_not_found' using errcode = '22023'; end if;
  select * into quote from public.quotations where id = revision.quotation_id for update;
  if not private.has_permission(quote.branch_id, 'quotation.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'revision_id', target_revision_id, 'version', expected_version, 'expires_at', expires_at,
    'terms', commercial_terms, 'lines', quote_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_quote_draft.operation_id;
  if found then
    if receipt.command_name <> 'update_quote_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(quote_lines,array['quantity'],false);

  if quote.current_revision_id <> target_revision_id or revision.state <> 'DRAFT'
  then raise exception 'quote_revision_not_editable' using errcode = '23514'; end if;
  if revision.draft_version  IS DISTINCT FROM expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if expires_at is null or expires_at <= now() then raise exception 'invalid_quote_expiration' using errcode = '22023'; end if;
  if jsonb_typeof(quote_lines) is distinct from 'array' then raise exception 'quote_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(quote_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_draft_payload' using errcode = '22023'; end if;

  select coalesce(jsonb_object_agg(l.id::text, to_jsonb(l)), '{}'::jsonb) into original_lines
  from public.quotation_lines l where l.revision_id = target_revision_id;
  delete from public.quotation_lines where revision_id = target_revision_id;
  for item in select value from jsonb_array_elements(quote_lines) loop
    line_no := line_no + 1;
    if item->>'price_source_type' = 'MANUAL_APPROVED' and not private.has_permission(quote.branch_id, 'pricing.manage') then
      select * into checked from private.assert_preserved_manual_commercial_line(item, original_lines -> (item->>'source_line_id'));
    else
      select * into checked from private.assert_commercial_line(quote.branch_id, quote.customer_id, item, (select auth.uid()));
    end if;
    insert into public.quotation_lines(revision_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (target_revision_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
    total := total + checked.line_total_vnd;
  end loop;
  update public.quotation_revisions set expires_at = update_quote_draft.expires_at,
    commercial_terms = update_quote_draft.commercial_terms, total_vnd = total, draft_version = draft_version + 1
  where id = target_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_quote_draft', payload_hash, 'quotation_revision', target_revision_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), quote.branch_id, 'quotation.draft.update', 'quotation_revision', target_revision_id, operation_id,
    array['expires_at','commercial_terms','lines','total_vnd','draft_version']);
  return target_revision_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.update_sales_order_draft(target_order_id uuid, expected_version integer, requested_delivery_at timestamp with time zone, commercial_terms text, order_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row public.sales_orders%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  original_lines jsonb;
  item jsonb;
  checked record;
  line_no integer := 0;
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not found then raise exception 'sales_order_not_found' using errcode = '22023'; end if;
  if not private.has_permission(order_row.branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'order_id', target_order_id, 'version', expected_version, 'delivery_at', requested_delivery_at,
    'terms', commercial_terms, 'lines', order_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_sales_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'update_sales_order_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(order_lines,array['quantity'],false);

  if order_row.commercial_state <> 'DRAFT' then raise exception 'sales_order_not_editable' using errcode = '23514'; end if;
  if order_row.draft_version  IS DISTINCT FROM expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if jsonb_typeof(order_lines) is distinct from 'array' then raise exception 'order_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(order_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_draft_payload' using errcode = '22023'; end if;

  select coalesce(jsonb_object_agg(l.id::text, to_jsonb(l)), '{}'::jsonb) into original_lines
  from public.sales_order_lines l where l.sales_order_id = target_order_id;
  delete from public.sales_order_lines where sales_order_id = target_order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    if item->>'price_source_type' = 'MANUAL_APPROVED' and not private.has_permission(order_row.branch_id, 'pricing.manage') then
      select * into checked from private.assert_preserved_manual_commercial_line(item, original_lines -> (item->>'source_line_id'));
    else
      select * into checked from private.assert_commercial_line(order_row.branch_id, order_row.customer_id, item, (select auth.uid()));
    end if;
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (target_order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  update public.sales_orders set requested_delivery_at = update_sales_order_draft.requested_delivery_at,
    commercial_terms = update_sales_order_draft.commercial_terms, draft_version = draft_version + 1
  where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_sales_order_draft', payload_hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.draft.update', 'sales_order', target_order_id, operation_id,
    array['requested_delivery_at','commercial_terms','lines','draft_version']);
  return target_order_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_supply_allocation(target_sales_order_line_id uuid, supply_mode text, target_purchase_order_line_id uuid, target_warehouse_id uuid, requested_base_quantity numeric, target_allocation_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sale_line public.sales_order_lines%rowtype; sale_order public.sales_orders%rowtype; existing public.supply_allocations%rowtype;
  purchase_line public.purchase_order_lines%rowtype; purchase_order public.purchase_orders%rowtype;
  hash text; receipt public.command_receipts%rowtype; allocation_id uuid;
  purchase_base_quantity numeric; purchase_allocated_quantity numeric;
begin
  select * into sale_line from public.sales_order_lines where id = target_sales_order_line_id for update;
  select * into sale_order from public.sales_orders where id = sale_line.sales_order_id;
  if not private.has_permission(sale_order.branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('sales_line_id', target_sales_order_line_id, 'mode', supply_mode, 'purchase_line_id', target_purchase_order_line_id, 'warehouse_id', target_warehouse_id, 'base_quantity', requested_base_quantity, 'allocation_id', target_allocation_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = upsert_supply_allocation.operation_id;
  if found then if receipt.command_name <> 'upsert_supply_allocation' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(requested_base_quantity,false);

  if supply_mode = 'WAREHOUSE' then
    if target_purchase_order_line_id is not null or target_warehouse_id is null then raise exception 'invalid_allocation_shape' using errcode = '22023'; end if;
    if not exists (select 1 from public.warehouses w where w.id = target_warehouse_id and w.branch_id = sale_order.branch_id and w.active) then raise exception 'warehouse_invalid' using errcode = '23503'; end if;
  else
    select * into purchase_line from public.purchase_order_lines where id = target_purchase_order_line_id for update;
    select * into purchase_order from public.purchase_orders where id = purchase_line.purchase_order_id and branch_id = sale_order.branch_id;
    if purchase_order.id is null or purchase_line.material_id <> sale_line.material_id or purchase_line.base_uom_id <> sale_line.base_uom_id then raise exception 'purchase_line_material_mismatch' using errcode = '23503'; end if;
    if supply_mode = 'SUPPLIER_DIRECT' and (purchase_line.linked_sales_order_line_id is distinct from target_sales_order_line_id or target_warehouse_id is not null or purchase_order.destination_type <> 'CUSTOMER_SITE' or purchase_order.site_id <> sale_order.site_id) then raise exception 'direct_destination_mismatch' using errcode = '23514'; end if;
    if supply_mode = 'SUPPLIER_TO_WAREHOUSE' then
      if target_warehouse_id is null or purchase_order.destination_type <> 'WAREHOUSE' or purchase_order.warehouse_id <> target_warehouse_id then raise exception 'warehouse_destination_mismatch' using errcode = '23514'; end if;
      purchase_base_quantity := purchase_line.quantity * purchase_line.conversion_numerator / purchase_line.conversion_denominator;
      select coalesce(sum(a.allocated_base_quantity), 0) into purchase_allocated_quantity
      from public.supply_allocations a
      where a.purchase_order_line_id = target_purchase_order_line_id
        and (target_allocation_id is null or a.id <> target_allocation_id);
      if purchase_allocated_quantity + requested_base_quantity > purchase_base_quantity then raise exception 'purchase_allocation_exceeds_supply' using errcode = '23514'; end if;
    end if;
  end if;
  if target_allocation_id is null then
    perform private.assert_allocation_capacity(target_sales_order_line_id, requested_base_quantity);
    insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, purchase_order_line_id,
      warehouse_id, allocated_base_quantity, created_by)
    values (sale_order.branch_id, target_sales_order_line_id, supply_mode, target_purchase_order_line_id,
      target_warehouse_id, requested_base_quantity, (select auth.uid())) returning id into allocation_id;
  else
    select * into existing from public.supply_allocations where id = target_allocation_id and sales_order_line_id = target_sales_order_line_id for update;
    if existing.id is null then raise exception 'allocation_not_found' using errcode = '23503'; end if;
    if existing.version  IS DISTINCT FROM expected_version then raise exception 'allocation_version_conflict' using errcode = 'PT409'; end if;
    if row(existing.supply_mode, existing.purchase_order_line_id, existing.warehouse_id)
      is distinct from row(upsert_supply_allocation.supply_mode, target_purchase_order_line_id, target_warehouse_id)
      and exists (select 1 from public.delivery_lines l join public.deliveries d on d.id=l.delivery_id
        where l.supply_allocation_id=existing.id and d.execution_state<>'CANCELLED') then
      raise exception 'allocation_source_locked_after_delivery' using errcode='23514';
    end if;
    perform private.assert_allocation_capacity(target_sales_order_line_id, requested_base_quantity, target_allocation_id);
    update public.supply_allocations set supply_mode = upsert_supply_allocation.supply_mode,
      purchase_order_line_id = target_purchase_order_line_id, warehouse_id = target_warehouse_id,
      allocated_base_quantity = requested_base_quantity, version = version + 1, updated_at = now()
    where id = target_allocation_id returning id into allocation_id;
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'upsert_supply_allocation', hash, 'supply_allocation', allocation_id, now());
  return allocation_id;
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
      if handoff_line.id is null or handoff_line.unit_cost_vnd_per_base is null then raise exception 'delivery_cost_basis_missing' using errcode = '23514'; end if;
      select case when accepted = p.base_quantity then p.inventory_value_vnd
        else round(accepted * handoff_line.unit_cost_vnd_per_base)::bigint end into cost_value
        from private.delivery_line_transit_position(line.id) p;
      if accepted > (select p.base_quantity from private.delivery_line_transit_position(line.id) p)
        or (accepted > 0 and cost_value <= 0) then
        raise exception 'delivery_cost_quantity_invalid' using errcode = '23514';
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

CREATE OR REPLACE FUNCTION public.verify_delivery_work_item(target_work_item_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype; result public.work_item_results%rowtype; payload_hash text; receipt public.command_receipts%rowtype; verification_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null or not private.has_permission(work.branch_id,'work.verify') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=verify_delivery_work_item.operation_id;
  if found then if receipt.command_name<>'verify_delivery_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  if work.delivery_id is null or work.version IS DISTINCT FROM expected_version or work.execution_state<>'DONE' then raise exception 'delivery_work_not_verifiable' using errcode='55000'; end if;
  perform 1 from public.deliveries where id=work.delivery_id and execution_state='VERIFIED'; if not found then raise exception 'delivery_source_not_verified' using errcode='55000'; end if;
  select * into result from public.work_item_results where work_item_id=work.id;
  insert into public.work_item_verifications(work_item_id,result_id,verification_kind,verified_by) values(work.id,result.id,'DELIVERY_SOURCE',(select auth.uid())) returning id into verification_id;
  update public.work_items set execution_state='VERIFIED',version=version+1 where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'verify_delivery_work_item',payload_hash,'work_item_verification',verification_id,now());
  return verification_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.verify_service_job(target_service_job_id uuid, billable_quantity numeric, compensable_quantity numeric, billable_amount_vnd bigint, due_date date, verification_note text, expected_job_version integer, expected_work_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job public.service_jobs%rowtype; work public.work_items%rowtype; result public.work_item_results%rowtype; payload_hash text; receipt public.command_receipts%rowtype; verification_id uuid; work_verification_id uuid;
begin
  select * into job from public.service_jobs where id=target_service_job_id;
  if job.id is null or not private.has_permission(job.branch_id,'service.verify') then raise exception 'forbidden_or_service_not_found' using errcode='42501'; end if;
  if billable_quantity<0 or compensable_quantity<0 or billable_amount_vnd<0 or due_date is null then raise exception 'invalid_service_verification' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('job',target_service_job_id,'billable_quantity',billable_quantity,'compensable_quantity',compensable_quantity,'billable_amount',billable_amount_vnd,'due_date',due_date,'note',nullif(trim(verification_note),''),'job_version',expected_job_version,'work_version',expected_work_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=verify_service_job.operation_id;
  if found then if receipt.command_name<>'verify_service_job' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(billable_quantity,true);
  perform private.require_exact_quantity(compensable_quantity,true);

  select * into job from public.service_jobs where id=target_service_job_id for update;
  select * into work from public.work_items where service_job_id=job.id for update;
  select * into result from public.work_item_results where work_item_id=work.id;
  if job.version IS DISTINCT FROM expected_job_version or work.version IS DISTINCT FROM expected_work_version then raise exception 'stale_service_version' using errcode = 'PT409'; end if;
  if job.execution_state<>'RESULT_SUBMITTED' or work.execution_state<>'DONE' or result.id is null then raise exception 'service_not_verifiable' using errcode='55000'; end if;
  if (billable_quantity<>result.actual_quantity or compensable_quantity<>result.actual_quantity) and char_length(trim(verification_note))<3 then raise exception 'service_variance_reason_required' using errcode='22023'; end if;
  insert into public.service_verifications(service_job_id,work_item_id,result_id,actual_quantity,billable_quantity,compensable_quantity,billable_amount_vnd,verification_note,verified_by) values(job.id,work.id,result.id,result.actual_quantity,billable_quantity,compensable_quantity,billable_amount_vnd,nullif(trim(verification_note),''),(select auth.uid())) returning id into verification_id;
  insert into public.work_item_verifications(work_item_id,result_id,verification_kind,verified_by) values(work.id,result.id,'SERVICE_SOURCE',(select auth.uid())) returning id into work_verification_id;
  if billable_amount_vnd>0 then insert into public.receivable_obligations(branch_id,customer_id,site_id,opening_source_id,delivery_verification_id,service_verification_id,original_amount_vnd,due_date,recorded_by) values(job.branch_id,job.customer_id,job.site_id,null,null,verification_id,billable_amount_vnd,due_date,(select auth.uid())); end if;
  update public.work_items set execution_state='VERIFIED',version=version+1 where id=work.id;
  update public.service_jobs set execution_state='VERIFIED',version=version+1,verified_at=now() where id=job.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'verify_service_job',payload_hash,'service_verification',verification_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),job.branch_id,'service_job.verified','service_job',job.id,operation_id,array['actual_quantity','billable_quantity','compensable_quantity','billable_amount_vnd']);
  return verification_id;
end $function$
;

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
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_supplier_fulfillment.operation_id;
  if found then if receipt.command_name <> 'verify_supplier_fulfillment' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_quantity_lines(fulfillment_lines,array['supplier_quantity'],false);

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

notify pgrst,'reload schema';
commit;
