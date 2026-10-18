-- FB3 D15 (Owner 17/10/2026): customers order on the customer portal; the business approves.
-- * The portal shows what the customer can buy, in its sale units, at the price that applies to this customer (the same rule
--   priority as an internal order), and only "Còn hàng / Đặt trước" — never stock numbers, costs or other customers' prices.
-- * submit_portal_order creates a DRAFT sales order marked CUSTOMER_PORTAL ("Chờ duyệt"); prices are taken on the server and
--   every line passes the same commercial checks as an internal order. Nothing is reserved yet: credit, stock and purchases
--   happen when the business confirms ("Duyệt") with the existing confirm + auto-sourcing (D19). Rejecting is the existing
--   cancel with a reason, which the customer sees.
-- * The customer can cancel its own order while it is still waiting.
begin;

alter table public.sales_orders
  add column order_channel text not null default 'INTERNAL' check (order_channel in ('INTERNAL', 'CUSTOMER_PORTAL')),
  add column portal_note text check (char_length(portal_note) <= 1000),
  add column submitted_by uuid references auth.users(id) on delete set null;
create index sales_orders_portal_waiting_idx on public.sales_orders(branch_id, created_at desc)
  where order_channel = 'CUSTOMER_PORTAL' and commercial_state = 'DRAFT';

-- The customer of a portal login that may order (OWNER or FINANCE_CONTACT), or null.
create or replace function private.portal_ordering_customer(target_customer_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.customer_id from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id
  where m.auth_user_id = (select auth.uid()) and m.active and c.active and m.membership_role in ('OWNER', 'FINANCE_CONTACT')
    and (target_customer_id is null or m.customer_id = target_customer_id) and private.auth_actor_active()
  order by m.customer_id limit 1
$$;
revoke all on function private.portal_ordering_customer(uuid) from public, anon, authenticated, service_role;

-- Exact conversion of a sale unit into the base unit, as accepted for settlement now (null when the unit cannot be sold).
create or replace function private.portal_sale_conversion(target_material_id uuid, target_uom_id uuid, out numerator numeric, out denominator numeric)
language plpgsql stable security definer set search_path = '' as $$
declare base uuid;
begin
  select m.base_uom_id into base from public.materials m where m.id = target_material_id and m.active and m.sale_enabled;
  if base is null then return; end if;
  if target_uom_id = base then numerator := 1; denominator := 1; return; end if;
  select c.numerator, c.denominator into numerator, denominator from public.material_uom_conversions c
  where c.material_id = target_material_id and c.from_uom_id = target_uom_id and c.to_uom_id = base and c.active and c.settlement_allowed
    and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
  order by c.effective_from desc limit 1;
end
$$;
revoke all on function private.portal_sale_conversion(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.customer_portal_catalog(target_customer_id uuid default null, search text default null, page_limit integer default 60)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  customer public.customers%rowtype;
  needle text := nullif(trim(coalesce(search, '')), '');
  wanted integer := greatest(1, least(coalesce(page_limit, 60), 200));
  unit record;
  rule public.pricing_rules%rowtype;
  rule_id uuid;
  stocked jsonb := '{}'::jsonb;
  items jsonb := '[]'::jsonb;
  found_count integer := 0;
  in_stock boolean;
begin
  select c.* into customer from public.customers c where c.id = private.portal_ordering_customer(target_customer_id);
  if customer.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  for unit in
    select m.id material_id, m.code, m.name, m.specification, g.name group_name, u.id uom_id, u.name uom_name, u.symbol uom_symbol,
      u.decimal_scale, bu.symbol base_symbol, conv.numerator, conv.denominator
    from public.materials m
    join public.material_groups g on g.id = m.group_id
    join public.units_of_measure bu on bu.id = m.base_uom_id
    cross join lateral (
      select m.base_uom_id uom_id union
      select c.from_uom_id from public.material_uom_conversions c
      where c.material_id = m.id and c.to_uom_id = m.base_uom_id and c.active and c.settlement_allowed
        and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
    ) sale_unit
    join public.units_of_measure u on u.id = sale_unit.uom_id
    cross join lateral private.portal_sale_conversion(m.id, u.id) conv
    where m.active and m.sale_enabled and conv.numerator is not null
      and (needle is null or m.name ilike '%' || needle || '%' or m.code ilike '%' || needle || '%' or g.name ilike '%' || needle || '%')
    order by g.name, m.name, m.id, conv.numerator / conv.denominator desc
    limit wanted * 4
  loop
    exit when found_count >= wanted;
    begin
      rule_id := private.preferred_commercial_price_rule(customer.branch_id, customer.id, unit.material_id, unit.uom_id);
    exception when others then
      continue; -- no price for this customer in this unit: not offered on the portal.
    end;
    select * into rule from public.pricing_rules p where p.id = rule_id;
    if not stocked ? unit.material_id::text then
      stocked := stocked || jsonb_build_object(unit.material_id::text, exists (select 1 from public.warehouses w
        where w.branch_id = customer.branch_id and w.active and private.free_warehouse_stock(w.id, unit.material_id) > 0));
    end if;
    in_stock := (stocked->>unit.material_id::text)::boolean;
    found_count := found_count + 1;
    items := items || jsonb_build_object('material_id', unit.material_id, 'code', unit.code, 'name', unit.name, 'specification', unit.specification,
      'group_name', unit.group_name, 'uom_id', unit.uom_id, 'uom_name', unit.uom_name, 'uom_symbol', unit.uom_symbol, 'decimal_scale', unit.decimal_scale,
      'base_symbol', unit.base_symbol, 'conversion_numerator', unit.numerator::text, 'conversion_denominator', unit.denominator::text,
      'unit_price_vnd', rule.unit_price_vnd::text, 'in_stock', in_stock);
  end loop;
  return jsonb_build_object(
    'customer', jsonb_build_object('id', customer.id, 'code', customer.code, 'display_name', customer.display_name),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'address_text', s.address_text,
      'receiver_name', s.receiver_name, 'receiver_phone', s.receiver_phone) order by s.name, s.id)
      from public.customer_sites s where s.customer_id = customer.id and s.active), '[]'::jsonb),
    'items', items);
end
$function$;
revoke all on function public.customer_portal_catalog(uuid, text, integer) from public, anon;
grant execute on function public.customer_portal_catalog(uuid, text, integer) to authenticated;

create or replace function public.submit_portal_order(target_customer_id uuid, target_site_id uuid, new_site jsonb, requested_delivery_at timestamptz,
  order_lines jsonb, note text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  customer public.customers%rowtype;
  site public.customer_sites%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  created uuid;
  item jsonb;
  line jsonb;
  checked record;
  conv record;
  rule public.pricing_rules%rowtype;
  rule_id uuid;
  line_no integer := 0;
  total bigint := 0;
  clean_note text := nullif(trim(coalesce(note, '')), '');
begin
  select c.* into customer from public.customers c where c.id = private.portal_ordering_customer(target_customer_id);
  if me is null or submit_portal_order.operation_id is null or target_customer_id is null or customer.id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(order_lines) is distinct from 'array' or jsonb_array_length(order_lines) not between 1 and 50
    or char_length(coalesce(clean_note, '')) > 1000
    or (requested_delivery_at is not null and requested_delivery_at not between now() - interval '1 hour' and now() + interval '120 days')
    or (target_site_id is null) = (new_site is null) then
    raise exception 'portal_order_invalid' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('customer', customer.id, 'site', target_site_id, 'new_site', new_site,
    'delivery_at', requested_delivery_at, 'lines', order_lines, 'note', clean_note));
  perform pg_advisory_xact_lock(hashtextextended(submit_portal_order.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = submit_portal_order.operation_id;
  if found then
    if receipt.command_name <> 'submit_portal_order' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_quantity_lines(order_lines, array['quantity'], false);

  if target_site_id is not null then
    select * into site from public.customer_sites s where s.id = target_site_id and s.customer_id = customer.id and s.active;
    if site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  else
    if char_length(trim(coalesce(new_site->>'name', ''))) not between 2 and 160 or char_length(trim(coalesce(new_site->>'address', ''))) not between 5 and 300
      or char_length(coalesce(new_site->>'receiver_name', '')) > 120 or char_length(coalesce(new_site->>'receiver_phone', '')) > 60 then
      raise exception 'portal_order_invalid' using errcode = '22023';
    end if;
    insert into public.customer_sites(customer_id, code, name, address_text, receiver_name, receiver_phone)
    values (customer.id, 'DG-' || upper(substr(md5(submit_portal_order.operation_id::text), 1, 8)), trim(new_site->>'name'), trim(new_site->>'address'),
      nullif(trim(coalesce(new_site->>'receiver_name', '')), ''), nullif(trim(coalesce(new_site->>'receiver_phone', '')), ''))
    returning * into site;
  end if;

  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, sales_owner_employee_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot,
    requested_delivery_at, created_by, order_channel, portal_note, submitted_by)
  values (customer.branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    customer.id, site.id, site.sales_owner_employee_id, customer.display_name, site.name, site.address_text, site.receiver_name, site.receiver_phone,
    requested_delivery_at, me, 'CUSTOMER_PORTAL', clean_note, me)
  returning id into created;

  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    select * into conv from private.portal_sale_conversion(nullif(item->>'material_id', '')::uuid, nullif(item->>'ordered_uom_id', '')::uuid);
    if conv.numerator is null then raise exception 'invalid_commercial_line' using errcode = '22023'; end if;
    begin
      rule_id := private.preferred_commercial_price_rule(customer.branch_id, customer.id, (item->>'material_id')::uuid, (item->>'ordered_uom_id')::uuid);
    exception when others then
      raise exception 'portal_price_unavailable' using errcode = '22023';
    end;
    select * into rule from public.pricing_rules p where p.id = rule_id;
    line := jsonb_build_object('material_id', item->>'material_id', 'ordered_uom_id', item->>'ordered_uom_id', 'quantity', item->'quantity',
      'conversion_numerator', conv.numerator, 'conversion_denominator', conv.denominator, 'rounding_mode', 'HALF_UP',
      'unit_price_vnd', rule.unit_price_vnd, 'pricing_rule_id', rule.id, 'pricing_rule_version', rule.version, 'price_source_type', rule.source_type);
    select * into checked from private.assert_commercial_line(customer.branch_id, customer.id, line, me);
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type)
    values (created, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode, checked.unit_price_vnd, checked.line_total_vnd,
      checked.pricing_rule_id, checked.pricing_rule_version, checked.price_source_type);
    total := total + checked.line_total_vnd;
  end loop;

  insert into public.command_receipts values (submit_portal_order.operation_id, me, 'submit_portal_order', hash, 'sales_order', created, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, customer.branch_id, 'sales_order.portal_submitted', 'sales_order', created, submit_portal_order.operation_id,
    array['sales_order', 'lines'], 'Khách đặt trên cổng khách');
  perform private.notify(customer.branch_id, 'order.portal_submitted', 'sales_order', created, 'Đơn mới từ khách: ' || customer.display_name,
    line_no || ' mặt hàng · ' || replace(to_char(total, 'FM999,999,999,999,990'), ',', '.') || ' ₫ · ' || site.name || ' — chờ duyệt',
    '/admin/orders/' || created, 'orders.confirm', null, 'order.portal_submitted:' || created);
  return created;
end
$function$;
revoke all on function public.submit_portal_order(uuid, uuid, jsonb, timestamptz, jsonb, text, uuid) from public, anon;
grant execute on function public.submit_portal_order(uuid, uuid, jsonb, timestamptz, jsonb, text, uuid) to authenticated;

create or replace function public.cancel_portal_order(target_order_id uuid, reason text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  order_row public.sales_orders%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  clean_reason text := trim(coalesce(reason, ''));
begin
  select * into order_row from public.sales_orders o where o.id = target_order_id for update;
  if me is null or order_row.id is null or cancel_portal_order.operation_id is null
    or private.portal_ordering_customer(order_row.customer_id) is distinct from order_row.customer_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_reason) not between 3 and 300 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', order_row.id, 'reason', clean_reason));
  select * into receipt from public.command_receipts r where r.operation_id = cancel_portal_order.operation_id;
  if found then
    if receipt.command_name <> 'cancel_portal_order' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if order_row.order_channel <> 'CUSTOMER_PORTAL' or order_row.commercial_state <> 'DRAFT' then
    raise exception 'portal_order_not_cancellable' using errcode = '23514';
  end if;
  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = order_row.id;
  insert into public.command_receipts values (cancel_portal_order.operation_id, me, 'cancel_portal_order', hash, 'sales_order', order_row.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, order_row.branch_id, 'sales_order.cancel', 'sales_order', order_row.id, cancel_portal_order.operation_id, array['commercial_state'],
    'Khách hủy: ' || clean_reason);
  perform private.notify(order_row.branch_id, 'order.portal_cancelled', 'sales_order', order_row.id, 'Khách hủy đơn ' || order_row.order_number,
    order_row.customer_name_snapshot || ' · ' || clean_reason, '/admin/orders/' || order_row.id, 'orders.read', null, 'order.portal_cancelled:' || order_row.id);
  return order_row.id;
end
$function$;
revoke all on function public.cancel_portal_order(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_portal_order(uuid, text, uuid) to authenticated;

-- Order card on the portal: also where it came from and the delivery site.
create or replace function private.customer_order_payload(target_order_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  order_row record;
  member_role text;
  deliveries_json jsonb;
begin
  select * into order_row from public.sales_order_read o where o.id = target_order_id;
  if order_row.id is null then return null; end if;
  member_role := private.portal_customer_role(order_row.customer_id);

  select coalesce(jsonb_agg(
    private.customer_delivery_payload(d.id)
    order by d.created_at, d.id
  ), '[]'::jsonb)
  into deliveries_json
  from public.delivery_read d
  where d.sales_order_id = target_order_id;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', order_row.id,
    'number', order_row.order_number,
    'state', order_row.commercial_state,
    'fulfillment_state', order_row.fulfillment_state,
    'payment_state', case when member_role in ('OWNER', 'FINANCE_CONTACT') then order_row.payment_state else null end,
    'ordered_at', coalesce(order_row.confirmed_at, order_row.created_at),
    'requested_delivery_date', order_row.requested_delivery_at,
    'total_amount_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') then order_row.total_vnd::text else null end,
    'channel', (select s.order_channel from public.sales_orders s where s.id = target_order_id),
    'site_name', order_row.site_name_snapshot,
    'deliveries', deliveries_json
  ));
end
$function$;

-- Lines, note, delivery address, why it was cancelled and whether the customer may still cancel it.
create or replace function private.customer_order_extras(target_order_id uuid, member_role text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'delivery_address', o.delivery_address_snapshot,
    'receiver_name', o.receiver_name_snapshot,
    'receiver_phone', o.receiver_phone_snapshot,
    'portal_note', o.portal_note,
    'can_cancel', o.order_channel = 'CUSTOMER_PORTAL' and o.commercial_state = 'DRAFT' and member_role in ('OWNER', 'FINANCE_CONTACT'),
    'cancel_reason', case when o.commercial_state = 'CANCELLED' then (select e.reason from public.audit_events e
      where e.entity_type = 'sales_order' and e.entity_id = o.id and e.action = 'sales_order.cancel' order by e.occurred_at desc, e.id desc limit 1) end,
    'lines', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', l.id, 'material_name', l.material_name_snapshot, 'quantity', l.quantity::text, 'uom_symbol', u.symbol,
      'unit_price_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') then l.unit_price_vnd::text end,
      'line_total_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') then l.line_total_vnd::text end)) order by l.line_number)
      from public.sales_order_lines l join public.units_of_measure u on u.id = l.ordered_uom_id where l.sales_order_id = o.id), '[]'::jsonb)))
  from public.sales_orders o where o.id = target_order_id
$$;
revoke all on function private.customer_order_extras(uuid, text) from public, anon, authenticated, service_role;

create or replace function public.customer_portal_order(target_order_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  order_row record;
  member_role text;
  result_json jsonb;
  debt_json jsonb := null;
  payments_json jsonb := '[]'::jsonb;
  quotation_documents jsonb := '[]'::jsonb;
  delivery_documents jsonb := '[]'::jsonb;
  payment_documents jsonb := '[]'::jsonb;
begin
  select * into order_row from public.sales_order_read o where o.id = target_order_id;
  if order_row.id is null then raise exception 'order_not_found' using errcode = '23503'; end if;

  member_role := private.portal_customer_role(order_row.customer_id);
  if member_role is null then
    raise exception 'forbidden_or_order_not_found' using errcode = '42501';
  end if;

  result_json := private.customer_order_payload(target_order_id) || private.customer_order_extras(target_order_id, member_role);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'delivery-' || d.id::text,
    'kind', 'DELIVERY',
    'title', 'Phiếu giao ' || d.delivery_number,
    'state', d.execution_state,
    'issued_at', coalesce(d.verified_at, d.created_at)
  ) order by d.created_at, d.id), '[]'::jsonb)
  into delivery_documents
  from public.delivery_read d
  where d.sales_order_id = target_order_id;

  if order_row.quotation_revision_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'quotation-' || qr.id::text,
      'kind', 'QUOTATION',
      'title', 'Báo giá ' || q.quotation_number || ' · R' || qr.revision_number::text,
      'state', qr.state,
      'issued_at', coalesce(qr.sent_at, qr.created_at),
      'href', '/api/quotation-revisions/' || qr.id::text || '/pdf'
    )), '[]'::jsonb)
    into quotation_documents
    from public.quotation_revisions qr
    join public.quotations q on q.id = qr.quotation_id
    where qr.id = order_row.quotation_revision_id
      and q.customer_id = order_row.customer_id;
  end if;

  if member_role in ('OWNER', 'FINANCE_CONTACT') then
    select jsonb_build_object(
      'original_amount_vnd', coalesce(sum(r.original_amount_vnd), 0)::text,
      'outstanding_amount_vnd', coalesce(sum(r.outstanding_amount_vnd), 0)::text,
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'source_type', r.source_type,
        'source_number', r.source_label,
        'original_amount_vnd', r.original_amount_vnd::text,
        'outstanding_amount_vnd', r.outstanding_amount_vnd::text,
        'due_date', r.due_date
      ) order by r.due_date, r.id) filter (where r.id is not null), '[]'::jsonb)
    )
    into debt_json
    from public.receivable_read r
    where r.sales_order_id = target_order_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', payment.id,
      'number', payment.payment_number,
      'amount_vnd', payment.amount_vnd::text,
      'allocated_amount_vnd', payment.allocated_amount_vnd::text,
      'order_allocated_amount_vnd', payment.order_allocated_amount_vnd::text,
      'effective_at', payment.effective_at,
      'state', payment.posting_state,
      'reconciliation_state', payment.reconciliation_state
    ) order by payment.effective_at desc, payment.id), '[]'::jsonb)
    into payments_json
    from (
      select p.id, p.payment_number, p.amount_vnd, p.allocated_amount_vnd,
        p.effective_at, p.posting_state, p.reconciliation_state,
        sum(a.amount_delta_vnd)::bigint as order_allocated_amount_vnd
      from public.payment_read p
      join public.payment_allocations a on a.payment_id = p.id
      join public.receivable_read r on r.id = a.receivable_obligation_id
      where r.sales_order_id = target_order_id
        and p.customer_id = order_row.customer_id
      group by p.id, p.payment_number, p.amount_vnd, p.allocated_amount_vnd,
        p.effective_at, p.posting_state, p.reconciliation_state
      order by p.effective_at desc, p.id
      limit 50
    ) payment;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'payment-' || payment.id::text,
      'kind', 'PAYMENT',
      'title', 'Phiếu thu ' || payment.payment_number,
      'state', payment.posting_state,
      'issued_at', payment.effective_at
    ) order by payment.effective_at desc, payment.id), '[]'::jsonb)
    into payment_documents
    from (
      select distinct p.id, p.payment_number, p.effective_at, p.posting_state
      from public.payment_read p
      join public.payment_allocations a on a.payment_id = p.id
      join public.receivable_read r on r.id = a.receivable_obligation_id
      where r.sales_order_id = target_order_id
        and p.customer_id = order_row.customer_id
      order by p.effective_at desc, p.id
      limit 50
    ) payment;
  end if;

  return result_json || jsonb_build_object(
    'can_view_finance', member_role in ('OWNER', 'FINANCE_CONTACT'),
    'debt', debt_json,
    'payments', payments_json,
    'documents', quotation_documents || delivery_documents || payment_documents
  );
end
$function$;
revoke all on function public.customer_portal_order(uuid) from public, anon;
grant execute on function public.customer_portal_order(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
