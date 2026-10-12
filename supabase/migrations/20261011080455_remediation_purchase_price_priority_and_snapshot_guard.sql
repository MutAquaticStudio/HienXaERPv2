-- G04/G02: supplier version priority and trusted saved purchase/retail snapshots.
begin;
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
  perform private.require_quantity_lines(jsonb_build_array(line),array['quantity','conversion_numerator','conversion_denominator'],false);
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
    if exists(select 1 from public.purchase_price_rules p where p.branch_id=target_branch_id and p.supplier_id=target_supplier_id and p.material_id=assert_purchase_line.material_id and p.purchase_uom_id=assert_purchase_line.ordered_uom_id and p.active and p.effective_from<=now() and(p.effective_to is null or p.effective_to>now()) and p.version>selected_rule.version) then raise exception 'purchase_price_priority_mismatch' using errcode='22023';end if;
    if exists(select 1 from public.purchase_price_rules p where p.branch_id=target_branch_id and p.supplier_id=target_supplier_id and p.material_id=assert_purchase_line.material_id and p.purchase_uom_id=assert_purchase_line.ordered_uom_id and p.active and p.effective_from<=now() and(p.effective_to is null or p.effective_to>now()) and p.version=selected_rule.version and p.id<>selected_rule.id) then raise exception 'purchase_price_priority_ambiguous' using errcode='22023';end if;
  end if;
  perform private.require_exact_quantity(quantity*conversion_numerator/conversion_denominator,false);
  line_total_cost_vnd := round(quantity * unit_cost_vnd)::bigint;
  return next;
end
$function$
;
CREATE OR REPLACE FUNCTION private.commercial_snapshot_matches(line jsonb, original jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select coalesce(original is not null and (case when original->>'price_source_type'='MANUAL_APPROVED' then original->>'override_by' is not null and coalesce(length(original->>'override_reason'),0)>=3 else original->>'pricing_rule_id' is not null and original->>'pricing_rule_version' is not null end) and line->>'source_line_id'=original->>'id'
 and line->>'material_id' is not distinct from original->>'material_id'
 and line->>'ordered_uom_id' is not distinct from original->>'ordered_uom_id'
 and line->>'unit_price_vnd' is not distinct from original->>'unit_price_vnd'
 and line->>'price_source_type' is not distinct from original->>'price_source_type'
 and nullif(line->>'pricing_rule_id','') is not distinct from original->>'pricing_rule_id'
 and nullif(line->>'pricing_rule_version','') is not distinct from original->>'pricing_rule_version'
 and nullif(line->>'override_reason','') is not distinct from original->>'override_reason'
 and (line->>'conversion_numerator')::numeric is not distinct from (original->>'conversion_numerator')::numeric
 and (line->>'conversion_denominator')::numeric is not distinct from (original->>'conversion_denominator')::numeric
 and line->>'rounding_mode' is not distinct from original->>'rounding_mode',false)
$function$
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
    if old_line.id is not null
      and (item->>'material_id')::uuid is not distinct from old_line.material_id
      and (item->>'ordered_uom_id')::uuid is not distinct from old_line.ordered_uom_id
      and (item->>'conversion_numerator')::numeric is not distinct from old_line.conversion_numerator
      and (item->>'conversion_denominator')::numeric is not distinct from old_line.conversion_denominator
      and item->>'rounding_mode' is not distinct from old_line.rounding_mode
      and (item->>'unit_cost_vnd')::bigint is not distinct from old_line.unit_cost_vnd
      and item->>'price_source_type' is not distinct from old_line.price_source_type
      and nullif(item->>'purchase_price_rule_id','')::uuid is not distinct from old_line.purchase_price_rule_id
      and nullif(item->>'purchase_price_rule_version','')::integer is not distinct from old_line.purchase_price_rule_version
      and (nullif(item->>'override_reason','') is null or item->>'override_reason' is not distinct from old_line.override_reason)
      and(case when old_line.price_source_type='MANUAL_APPROVED' then old_line.override_by is not null else old_line.purchase_price_rule_id is not null and old_line.purchase_price_rule_version is not null end)
    then
      perform private.require_quantity_lines(jsonb_build_array(item),array['quantity','conversion_numerator','conversion_denominator'],false);
      requested_quantity:=(item->>'quantity')::numeric;
      perform private.require_exact_quantity(requested_quantity*old_line.conversion_numerator/old_line.conversion_denominator,false);
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
notify pgrst,'reload schema';
commit;
