-- GC-12 keeps each direct PO line tied to one SO line and keeps allocation IDs stable on DRAFT edits.
create or replace function public.create_linked_direct_drafts(
  target_branch_id uuid, target_supplier_id uuid, target_customer_id uuid, target_site_id uuid,
  purchase_line jsonb, sales_line jsonb, expected_at timestamptz, commercial_terms text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  purchases jsonb := purchase_line;
  sales jsonb := sales_line;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  supplier public.suppliers%rowtype;
  customer public.customers%rowtype;
  site public.customer_sites%rowtype;
  checked_purchase record;
  checked_sale record;
  sales_order_id uuid;
  sales_line_id uuid;
  purchase_order_id uuid;
  purchase_line_id uuid;
  line_no integer;
  base_quantity numeric;
begin
  if not private.has_permission(target_branch_id, 'purchasing.create') or not private.has_permission(target_branch_id, 'orders.create')
  then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(purchases) = 'object' then purchases := jsonb_build_array(purchases); end if;
  if jsonb_typeof(sales) = 'object' then sales := jsonb_build_array(sales); end if;
  if jsonb_typeof(purchases) is distinct from 'array' or jsonb_typeof(sales) is distinct from 'array'
  then raise exception 'linked_draft_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(purchases) not between 1 and 50 or jsonb_array_length(purchases) <> jsonb_array_length(sales)
    or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'linked_draft_lines_invalid' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'branch_id', target_branch_id, 'supplier_id', target_supplier_id, 'customer_id', target_customer_id,
    'site_id', target_site_id, 'purchases', purchases, 'sales', sales, 'expected_at', expected_at, 'terms', commercial_terms));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_linked_direct_drafts.operation_id;
  if found then
    if receipt.command_name <> 'create_linked_direct_drafts' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if supplier.id is null or customer.id is null or site.id is null
  then raise exception 'linked_party_invalid' using errcode = '23503'; end if;
  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, sales_owner_employee_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot,
    receiver_phone_snapshot, requested_delivery_at, commercial_terms, created_by)
  values (target_branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, private.current_employee_id(), customer.display_name, site.name,
    site.address_text, site.receiver_name, site.receiver_phone, expected_at, commercial_terms, (select auth.uid()))
  returning id into sales_order_id;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, customer_id,
    site_id, source_sales_order_id, supplier_name_snapshot, supplier_address_snapshot,
    destination_name_snapshot, destination_address_snapshot, expected_at, commercial_terms, created_by)
  values (target_branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'CUSTOMER_SITE', target_customer_id, target_site_id, sales_order_id,
    supplier.name, supplier.address_text, site.name, site.address_text, expected_at, commercial_terms, (select auth.uid()))
  returning id into purchase_order_id;
  for line_no in 1..jsonb_array_length(purchases) loop
    if (purchases->(line_no - 1)->>'material_id')::uuid is distinct from (sales->(line_no - 1)->>'material_id')::uuid
      or (purchases->(line_no - 1)->>'ordered_uom_id')::uuid is distinct from (sales->(line_no - 1)->>'ordered_uom_id')::uuid
      or (purchases->(line_no - 1)->>'quantity')::numeric is distinct from (sales->(line_no - 1)->>'quantity')::numeric
    then raise exception 'linked_draft_lines_mismatch' using errcode = '22023'; end if;
    select * into checked_purchase from private.assert_purchase_line(target_branch_id, target_supplier_id, purchases->(line_no - 1), (select auth.uid()));
    select * into checked_sale from private.assert_commercial_line(target_branch_id, target_customer_id, sales->(line_no - 1), (select auth.uid()));
    if checked_purchase.base_uom_id <> checked_sale.base_uom_id
      or checked_purchase.conversion_numerator <> checked_sale.conversion_numerator
      or checked_purchase.conversion_denominator <> checked_sale.conversion_denominator
    then raise exception 'linked_conversion_mismatch' using errcode = '22023'; end if;
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot,
      ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode,
      unit_price_vnd, line_total_vnd, pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (sales_order_id, line_no, checked_sale.material_id, checked_sale.material_name, checked_sale.ordered_uom_id,
      checked_sale.base_uom_id, checked_sale.quantity, checked_sale.conversion_numerator, checked_sale.conversion_denominator,
      checked_sale.rounding_mode, checked_sale.unit_price_vnd, checked_sale.line_total_vnd, checked_sale.pricing_rule_id,
      checked_sale.pricing_rule_version, checked_sale.price_source_type, checked_sale.override_by, checked_sale.override_reason)
    returning id into sales_line_id;
    insert into public.purchase_order_lines(purchase_order_id, linked_sales_order_line_id, line_number, material_id,
      material_name_snapshot, ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator,
      rounding_mode, unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
      price_source_type, override_by, override_reason)
    values (purchase_order_id, sales_line_id, line_no, checked_purchase.material_id, checked_purchase.material_name,
      checked_purchase.ordered_uom_id, checked_purchase.base_uom_id, checked_purchase.quantity,
      checked_purchase.conversion_numerator, checked_purchase.conversion_denominator, checked_purchase.rounding_mode,
      checked_purchase.unit_cost_vnd, checked_purchase.line_total_cost_vnd, checked_purchase.purchase_price_rule_id,
      checked_purchase.purchase_price_rule_version, checked_purchase.price_source_type,
      checked_purchase.override_by, checked_purchase.override_reason)
    returning id into purchase_line_id;
    base_quantity := checked_purchase.quantity * checked_purchase.conversion_numerator / checked_purchase.conversion_denominator;
    insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, purchase_order_line_id,
      allocated_base_quantity, created_by)
    values (target_branch_id, sales_line_id, 'SUPPLIER_DIRECT', purchase_line_id, base_quantity, (select auth.uid()));
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_linked_direct_drafts', payload_hash, 'purchase_order', purchase_order_id, now());
  return purchase_order_id;
end
$$;

create or replace function public.create_direct_purchase_from_sales_order(
  target_sales_order_id uuid, target_supplier_id uuid, purchase_lines jsonb, expected_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.update_purchase_order_draft(
  target_purchase_order_id uuid, expected_version integer, expected_at timestamptz,
  commercial_terms text, purchase_lines jsonb, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  if order_row.state <> 'DRAFT' then raise exception 'purchase_order_not_editable' using errcode = '23514'; end if;
  if order_row.draft_version <> expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
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
$$;

revoke all on function public.create_direct_purchase_from_sales_order(uuid, uuid, jsonb, timestamptz, uuid) from public, anon;
grant execute on function public.create_direct_purchase_from_sales_order(uuid, uuid, jsonb, timestamptz, uuid) to authenticated;
