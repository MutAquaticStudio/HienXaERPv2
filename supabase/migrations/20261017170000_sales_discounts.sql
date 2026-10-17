-- FB3 P5 (17/10/2026, Owner): KiotViet-style discounts on a sales order — per line (VND or % of the unit price) and for
-- the whole order (VND or %). A discount is kept per unit of the line: unit_price_vnd becomes the selling price after
-- discount (whole đồng) and list_unit_price_vnd keeps the price before it, so every later step (delivery snapshot,
-- cumulative billing on verification, returns, credit) keeps working on unit_price_vnd and line_total_vnd unchanged.
-- An order discount is spread over the lines' unit prices by the application (exact to the đồng where the quantities
-- allow); the order only remembers what was typed (mode + value) so the editor can show it again.
-- Discounts need pricing.manage, like any change to the price list price.
begin;

alter table public.sales_order_lines
  add column list_unit_price_vnd bigint,
  add column discount_unit_vnd bigint not null default 0,
  add column discount_mode text,
  add column discount_value numeric(20,2),
  add constraint sales_order_line_discount_valid check (
    discount_unit_vnd >= 0
    and ((discount_unit_vnd = 0 and list_unit_price_vnd is null and discount_mode is null and discount_value is null)
      or (discount_unit_vnd > 0 and list_unit_price_vnd = unit_price_vnd + discount_unit_vnd
        and (discount_mode is null) = (discount_value is null)
        and (discount_mode is null or (discount_mode in ('AMOUNT', 'PERCENT') and discount_value > 0)))));

alter table public.sales_orders
  add column order_discount_mode text,
  add column order_discount_value numeric(20,2),
  add constraint sales_order_discount_input_valid check (
    (order_discount_mode is null and order_discount_value is null)
    or (order_discount_mode in ('AMOUNT', 'PERCENT') and order_discount_value > 0
      and (order_discount_mode = 'AMOUNT' or order_discount_value < 100)));

-- The selling price of one line after its discount. `list_price` is the checked price before discount (price list or
-- approved manual price). The discount per unit may also carry the line's share of an order discount, so the line's
-- own input (mode + value) may be smaller than it but never larger.
create or replace function private.discounted_sales_line(target_branch_id uuid, item jsonb, list_price bigint, line_quantity numeric)
 returns table(unit_price_vnd bigint, line_total_vnd bigint, list_unit_price_vnd bigint, discount_unit_vnd bigint, discount_mode text, discount_value numeric)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if coalesce(item->>'discount_unit_vnd', '') !~ '^[0-9]{0,18}$' or coalesce(item->>'discount_value', '') !~ '^([0-9]{1,18}([.][0-9]{1,2})?)?$' then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  discount_unit_vnd := coalesce(nullif(item->>'discount_unit_vnd', '')::bigint, 0);
  discount_mode := nullif(item->>'discount_mode', '');
  discount_value := nullif(item->>'discount_value', '')::numeric;
  if discount_unit_vnd >= list_price then raise exception 'invalid_discount' using errcode = '22023'; end if;
  if discount_mode is null then
    if discount_value is not null then raise exception 'invalid_discount' using errcode = '22023'; end if;
  elsif discount_unit_vnd = 0 or discount_value is null or discount_value <= 0 or discount_mode not in ('AMOUNT', 'PERCENT')
    or (discount_mode = 'AMOUNT' and (discount_value <> trunc(discount_value) or discount_value > discount_unit_vnd))
    or (discount_mode = 'PERCENT' and (discount_value >= 100 or round(list_price * discount_value / 100) > discount_unit_vnd)) then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  if discount_unit_vnd > 0 and not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'discount_requires_permission' using errcode = '42501';
  end if;
  unit_price_vnd := list_price - discount_unit_vnd;
  line_total_vnd := round(line_quantity * unit_price_vnd)::bigint;
  if line_total_vnd <= 0 then raise exception 'invalid_discount' using errcode = '22023'; end if;
  list_unit_price_vnd := case when discount_unit_vnd > 0 then list_price end;
  return next;
end
$function$;
revoke all on function private.discounted_sales_line(uuid, jsonb, bigint, numeric) from public, anon, authenticated, service_role;

-- What was typed as the order discount: null, or {mode: AMOUNT|PERCENT, value}.
create or replace function private.checked_order_discount(target_branch_id uuid, order_discount jsonb)
 returns table(mode text, value numeric)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if order_discount is null or order_discount = 'null'::jsonb then return next; return; end if;
  if jsonb_typeof(order_discount) <> 'object' or exists (select 1 from jsonb_object_keys(order_discount) k where k <> all(array['mode', 'value']))
    or coalesce(order_discount->>'value', '') !~ '^[0-9]{1,18}([.][0-9]{1,2})?$' then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  mode := order_discount->>'mode';
  value := (order_discount->>'value')::numeric;
  if mode not in ('AMOUNT', 'PERCENT') or value <= 0 or (mode = 'AMOUNT' and value <> trunc(value)) or (mode = 'PERCENT' and value >= 100) then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;
  if not private.has_permission(target_branch_id, 'pricing.manage') then raise exception 'discount_requires_permission' using errcode = '42501'; end if;
  return next;
end
$function$;
revoke all on function private.checked_order_discount(uuid, jsonb) from public, anon, authenticated, service_role;

-- Same contract as before plus `order_discount`; lines may carry discount_unit_vnd / discount_mode / discount_value.
-- A payload without discounts hashes exactly as before, so earlier receipts still replay.
drop function public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid);
create function public.create_sales_order_draft(target_branch_id uuid, target_customer_id uuid, target_site_id uuid, requested_delivery_at timestamp with time zone, commercial_terms text, order_lines jsonb, operation_id uuid, order_discount jsonb default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  priced record;
  discount record;
  line_no integer := 0;
begin
  if not private.has_permission(target_branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(order_lines) <> 'array' or jsonb_array_length(order_lines) = 0 then raise exception 'order_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'customer_id', target_customer_id, 'site_id', target_site_id, 'delivery_at', requested_delivery_at, 'terms', commercial_terms, 'lines', order_lines)
    || case when order_discount is null then '{}'::jsonb else jsonb_build_object('order_discount', order_discount) end;
  payload_hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_sales_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_sales_order_draft' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(order_lines,array['quantity'],false);
  select * into discount from private.checked_order_discount(target_branch_id, order_discount);

  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if customer.id is null or site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  employee_id := private.current_employee_id();
  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, sales_owner_employee_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot,
    requested_delivery_at, commercial_terms, created_by, order_discount_mode, order_discount_value)
  values (target_branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, employee_id, customer.display_name, site.name, site.address_text, site.receiver_name, site.receiver_phone,
    requested_delivery_at, commercial_terms, (select auth.uid()), discount.mode, discount.value) returning id into order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(target_branch_id, target_customer_id, item, (select auth.uid()));
    select * into priced from private.discounted_sales_line(target_branch_id, item, checked.unit_price_vnd, checked.quantity);
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason,
      list_unit_price_vnd, discount_unit_vnd, discount_mode, discount_value)
    values (order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      priced.unit_price_vnd, priced.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason,
      priced.list_unit_price_vnd, priced.discount_unit_vnd, priced.discount_mode, priced.discount_value);
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_sales_order_draft', payload_hash, 'sales_order', order_id, now());
  return order_id;
end
$function$;

drop function public.update_sales_order_draft(uuid, integer, timestamptz, text, jsonb, uuid);
create function public.update_sales_order_draft(target_order_id uuid, expected_version integer, requested_delivery_at timestamp with time zone, commercial_terms text, order_lines jsonb, operation_id uuid, order_discount jsonb default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  order_row public.sales_orders%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  original_lines jsonb;
  item jsonb;
  checked record;
  priced record;
  discount record;
  line_no integer := 0;
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not found then raise exception 'sales_order_not_found' using errcode = '22023'; end if;
  if not private.has_permission(order_row.branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'order_id', target_order_id, 'version', expected_version, 'delivery_at', requested_delivery_at,
    'terms', commercial_terms, 'lines', order_lines)
    || case when order_discount is null then '{}'::jsonb else jsonb_build_object('order_discount', order_discount) end);
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
  select * into discount from private.checked_order_discount(order_row.branch_id, order_discount);

  -- A preserved line is compared on its price before discount; the discount is applied again from this payload.
  select coalesce(jsonb_object_agg(l.id::text, to_jsonb(l) || jsonb_build_object('unit_price_vnd', coalesce(l.list_unit_price_vnd, l.unit_price_vnd))), '{}'::jsonb)
  into original_lines
  from public.sales_order_lines l where l.sales_order_id = target_order_id;
  delete from public.sales_order_lines where sales_order_id = target_order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    if private.commercial_snapshot_matches(item,original_lines -> (item->>'source_line_id')) then
      select * into checked from private.assert_preserved_commercial_line(item, original_lines -> (item->>'source_line_id'));
    else
      select * into checked from private.assert_commercial_line(order_row.branch_id, order_row.customer_id, item, (select auth.uid()));
    end if;
    select * into priced from private.discounted_sales_line(order_row.branch_id, item, checked.unit_price_vnd, checked.quantity);
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason,
      list_unit_price_vnd, discount_unit_vnd, discount_mode, discount_value)
    values (target_order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      priced.unit_price_vnd, priced.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason,
      priced.list_unit_price_vnd, priced.discount_unit_vnd, priced.discount_mode, priced.discount_value);
  end loop;
  update public.sales_orders set requested_delivery_at = update_sales_order_draft.requested_delivery_at,
    commercial_terms = update_sales_order_draft.commercial_terms, draft_version = draft_version + 1,
    order_discount_mode = discount.mode, order_discount_value = discount.value
  where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_sales_order_draft', payload_hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.draft.update', 'sales_order', target_order_id, operation_id,
    array['requested_delivery_at','commercial_terms','lines','draft_version'] || case when order_discount is null then array[]::text[] else array['order_discount'] end);
  return target_order_id;
end
$function$;

revoke all on function public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid, jsonb) to authenticated;
revoke all on function public.update_sales_order_draft(uuid, integer, timestamptz, text, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.update_sales_order_draft(uuid, integer, timestamptz, text, jsonb, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
