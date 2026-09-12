create sequence public.purchase_order_number_seq;

create table public.purchase_price_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  purchase_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  unit_cost_vnd bigint not null check (unit_cost_vnd > 0),
  version integer not null check (version > 0),
  source_type text not null check (source_type in ('LIST','CONTRACT')),
  effective_from timestamptz not null,
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (supplier_id, material_id, purchase_uom_id, version),
  check (effective_to is null or effective_to > effective_from)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  purchase_order_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  destination_type text not null check (destination_type in ('WAREHOUSE','CUSTOMER_SITE')),
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  site_id uuid references public.customer_sites(id) on delete restrict,
  source_sales_order_id uuid references public.sales_orders(id) on delete restrict,
  state text not null default 'DRAFT' check (state in ('DRAFT','CONFIRMED','CLOSED','CANCELLED')),
  supplier_name_snapshot text not null,
  supplier_address_snapshot text,
  destination_name_snapshot text not null,
  destination_address_snapshot text not null,
  expected_at timestamptz,
  commercial_terms text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (destination_type = 'WAREHOUSE' and warehouse_id is not null and customer_id is null and site_id is null)
    or (destination_type = 'CUSTOMER_SITE' and warehouse_id is null and customer_id is not null and site_id is not null)
  )
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  linked_sales_order_line_id uuid references public.sales_order_lines(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_name_snapshot text not null,
  ordered_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  base_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  quantity numeric(20,6) not null check (quantity > 0),
  conversion_numerator numeric(20,6) not null check (conversion_numerator > 0),
  conversion_denominator numeric(20,6) not null check (conversion_denominator > 0),
  rounding_mode text not null check (rounding_mode in ('HALF_UP','DOWN')),
  unit_cost_vnd bigint not null check (unit_cost_vnd > 0),
  line_total_cost_vnd bigint not null check (line_total_cost_vnd > 0),
  purchase_price_rule_id uuid references public.purchase_price_rules(id) on delete restrict,
  purchase_price_rule_version integer,
  price_source_type text not null check (price_source_type in ('LIST','CONTRACT','MANUAL_APPROVED')),
  override_by uuid references auth.users(id) on delete restrict,
  override_reason text,
  unique (purchase_order_id, line_number),
  check (
    (price_source_type = 'MANUAL_APPROVED' and purchase_price_rule_id is null and purchase_price_rule_version is null and override_by is not null and override_reason is not null)
    or (price_source_type <> 'MANUAL_APPROVED' and purchase_price_rule_id is not null and purchase_price_rule_version is not null and override_by is null and override_reason is null)
  )
);

create table public.supply_allocations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  supply_mode text not null check (supply_mode in ('WAREHOUSE','SUPPLIER_DIRECT','SUPPLIER_TO_WAREHOUSE')),
  purchase_order_line_id uuid references public.purchase_order_lines(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  allocated_base_quantity numeric(20,6) not null check (allocated_base_quantity > 0),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (supply_mode = 'WAREHOUSE' and purchase_order_line_id is null and warehouse_id is not null)
    or (supply_mode = 'SUPPLIER_DIRECT' and purchase_order_line_id is not null and warehouse_id is null)
    or (supply_mode = 'SUPPLIER_TO_WAREHOUSE' and purchase_order_line_id is not null and warehouse_id is not null)
  )
);

create index purchase_orders_branch_created_idx on public.purchase_orders(branch_id, created_at desc);
create index purchase_order_lines_order_idx on public.purchase_order_lines(purchase_order_id, line_number);
create index supply_allocations_sales_line_idx on public.supply_allocations(sales_order_line_id);
create index supply_allocations_purchase_line_idx on public.supply_allocations(purchase_order_line_id) where purchase_order_line_id is not null;

create view public.purchase_order_read with (security_invoker = true) as
select p.id, p.branch_id, p.purchase_order_number, p.supplier_id, p.destination_type, p.warehouse_id,
  p.customer_id, p.site_id, p.source_sales_order_id, p.state, p.supplier_name_snapshot,
  p.destination_name_snapshot, p.destination_address_snapshot, p.expected_at,
  case when private.has_permission(p.branch_id, 'purchasing.price.read')
    then coalesce(t.total_cost_vnd, 0)::bigint::text else null end as total_cost_vnd,
  p.confirmed_at, p.cancelled_at, p.created_at
from public.purchase_orders p
left join (
  select purchase_order_id, sum(line_total_cost_vnd) as total_cost_vnd
  from public.purchase_order_lines group by purchase_order_id
) t on t.purchase_order_id = p.id;

create view public.purchase_order_line_read with (security_barrier = true) as
select l.id, l.purchase_order_id, l.linked_sales_order_line_id, l.line_number,
  l.material_id, l.material_name_snapshot, l.ordered_uom_id, l.base_uom_id,
  l.quantity::text as quantity, l.conversion_numerator::text as conversion_numerator,
  l.conversion_denominator::text as conversion_denominator, l.rounding_mode,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.unit_cost_vnd::text else null end as unit_cost_vnd,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.line_total_cost_vnd::text else null end as line_total_cost_vnd,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.purchase_price_rule_id else null end as purchase_price_rule_id,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.purchase_price_rule_version else null end as purchase_price_rule_version,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.price_source_type else null end as price_source_type
from public.purchase_order_lines l join public.purchase_orders p on p.id = l.purchase_order_id
where private.has_permission(p.branch_id, 'purchasing.read');

create view public.sales_line_supply_read with (security_invoker = true) as
select l.id as sales_order_line_id, l.sales_order_id, o.branch_id, o.order_number,
  l.material_name_snapshot, l.quantity::text as ordered_quantity, l.ordered_uom_id,
  (l.quantity * l.conversion_numerator / l.conversion_denominator)::text as required_base_quantity,
  coalesce(sum(a.allocated_base_quantity), 0)::text as allocated_base_quantity,
  ((l.quantity * l.conversion_numerator / l.conversion_denominator) - coalesce(sum(a.allocated_base_quantity), 0))::text as remaining_base_quantity
from public.sales_order_lines l
join public.sales_orders o on o.id = l.sales_order_id
left join public.supply_allocations a on a.sales_order_line_id = l.id
group by l.id, o.branch_id, o.order_number;

create or replace function private.assert_purchase_line(
  target_branch_id uuid, target_supplier_id uuid, line jsonb, actor_auth_user_id uuid
)
returns table(
  material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid,
  quantity numeric, conversion_numerator numeric, conversion_denominator numeric,
  rounding_mode text, unit_cost_vnd bigint, line_total_cost_vnd bigint,
  purchase_price_rule_id uuid, purchase_price_rule_version integer,
  price_source_type text, override_by uuid, override_reason text
)
language plpgsql security definer set search_path = '' as $$
declare selected_rule public.purchase_price_rules%rowtype;
begin
  material_id := (line->>'material_id')::uuid;
  ordered_uom_id := (line->>'ordered_uom_id')::uuid;
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
  line_total_cost_vnd := round(quantity * unit_cost_vnd)::bigint;
  return next;
end
$$;
revoke all on function private.assert_purchase_line(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

create or replace function private.assert_allocation_capacity(
  target_sales_order_line_id uuid, requested_base_quantity numeric, excluded_allocation_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare required_quantity numeric; allocated_quantity numeric;
begin
  select l.quantity * l.conversion_numerator / l.conversion_denominator into required_quantity
  from public.sales_order_lines l where l.id = target_sales_order_line_id for update;
  if not found then raise exception 'sales_order_line_not_found' using errcode = '23503'; end if;
  select coalesce(sum(a.allocated_base_quantity), 0) into allocated_quantity
  from public.supply_allocations a
  where a.sales_order_line_id = target_sales_order_line_id
    and (excluded_allocation_id is null or a.id <> excluded_allocation_id);
  if requested_base_quantity <= 0 or allocated_quantity + requested_base_quantity > required_quantity then
    raise exception 'supply_allocation_exceeds_need' using errcode = '23514';
  end if;
end
$$;
revoke all on function private.assert_allocation_capacity(uuid, numeric, uuid) from public, anon, authenticated;

create or replace function public.create_purchase_order_draft(
  target_branch_id uuid, target_supplier_id uuid, target_warehouse_id uuid,
  expected_at timestamptz, commercial_terms text, purchase_lines jsonb, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare payload jsonb; hash text; receipt public.command_receipts%rowtype;
  supplier public.suppliers%rowtype; warehouse public.warehouses%rowtype;
  order_id uuid; item jsonb; checked record; line_no integer := 0;
begin
  if not private.has_permission(target_branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(purchase_lines) <> 'array' or jsonb_array_length(purchase_lines) = 0 then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'supplier_id', target_supplier_id, 'warehouse_id', target_warehouse_id, 'expected_at', expected_at, 'terms', commercial_terms, 'lines', purchase_lines);
  hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_purchase_order_draft.operation_id;
  if found then if receipt.command_name <> 'create_purchase_order_draft' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  select * into warehouse from public.warehouses where id = target_warehouse_id and branch_id = target_branch_id and active;
  if supplier.id is null or warehouse.id is null then raise exception 'supplier_or_warehouse_invalid' using errcode = '23503'; end if;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id,
    supplier_name_snapshot, supplier_address_snapshot, destination_name_snapshot, destination_address_snapshot,
    expected_at, commercial_terms, created_by)
  values (target_branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'WAREHOUSE', target_warehouse_id, supplier.name, supplier.address_text,
    warehouse.name, warehouse.address_text, expected_at, commercial_terms, (select auth.uid())) returning id into order_id;
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
$$;

create or replace function public.create_direct_purchase_from_sales_line(
  source_sales_order_line_id uuid, target_supplier_id uuid, requested_quantity numeric,
  purchase_line jsonb, expected_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.create_linked_direct_drafts(
  target_branch_id uuid, target_supplier_id uuid, target_customer_id uuid, target_site_id uuid,
  purchase_line jsonb, sales_line jsonb, expected_at timestamptz, commercial_terms text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare payload jsonb; hash text; receipt public.command_receipts%rowtype;
  supplier public.suppliers%rowtype; customer public.customers%rowtype; site public.customer_sites%rowtype;
  checked_purchase record; checked_sale record; sales_order_id uuid; sales_line_id uuid;
  purchase_order_id uuid; purchase_line_id uuid; base_quantity numeric;
begin
  if not private.has_permission(target_branch_id, 'purchasing.create') or not private.has_permission(target_branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'supplier_id', target_supplier_id, 'customer_id', target_customer_id, 'site_id', target_site_id, 'purchase_line', purchase_line, 'sales_line', sales_line, 'expected_at', expected_at, 'terms', commercial_terms);
  hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_linked_direct_drafts.operation_id;
  if found then if receipt.command_name <> 'create_linked_direct_drafts' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if (purchase_line->>'material_id')::uuid <> (sales_line->>'material_id')::uuid
    or (purchase_line->>'ordered_uom_id')::uuid <> (sales_line->>'ordered_uom_id')::uuid
    or (purchase_line->>'quantity')::numeric <> (sales_line->>'quantity')::numeric then
    raise exception 'linked_draft_lines_mismatch' using errcode = '22023';
  end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if supplier.id is null or customer.id is null or site.id is null then raise exception 'linked_party_invalid' using errcode = '23503'; end if;
  select * into checked_purchase from private.assert_purchase_line(target_branch_id, target_supplier_id, purchase_line, (select auth.uid()));
  select * into checked_sale from private.assert_commercial_line(target_branch_id, target_customer_id, sales_line, (select auth.uid()));
  if checked_purchase.base_uom_id <> checked_sale.base_uom_id
    or checked_purchase.conversion_numerator <> checked_sale.conversion_numerator
    or checked_purchase.conversion_denominator <> checked_sale.conversion_denominator then
    raise exception 'linked_conversion_mismatch' using errcode = '22023';
  end if;
  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, sales_owner_employee_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot,
    receiver_phone_snapshot, requested_delivery_at, commercial_terms, created_by)
  values (target_branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, private.current_employee_id(), customer.display_name, site.name,
    site.address_text, site.receiver_name, site.receiver_phone, expected_at, commercial_terms, (select auth.uid()))
  returning id into sales_order_id;
  insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot,
    ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode,
    unit_price_vnd, line_total_vnd, pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
  values (sales_order_id, 1, checked_sale.material_id, checked_sale.material_name, checked_sale.ordered_uom_id,
    checked_sale.base_uom_id, checked_sale.quantity, checked_sale.conversion_numerator, checked_sale.conversion_denominator,
    checked_sale.rounding_mode, checked_sale.unit_price_vnd, checked_sale.line_total_vnd, checked_sale.pricing_rule_id,
    checked_sale.pricing_rule_version, checked_sale.price_source_type, checked_sale.override_by, checked_sale.override_reason)
  returning id into sales_line_id;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, customer_id,
    site_id, source_sales_order_id, supplier_name_snapshot, supplier_address_snapshot,
    destination_name_snapshot, destination_address_snapshot, expected_at, commercial_terms, created_by)
  values (target_branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'CUSTOMER_SITE', target_customer_id, target_site_id, sales_order_id,
    supplier.name, supplier.address_text, site.name, site.address_text, expected_at, commercial_terms, (select auth.uid()))
  returning id into purchase_order_id;
  insert into public.purchase_order_lines(purchase_order_id, linked_sales_order_line_id, line_number, material_id,
    material_name_snapshot, ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator,
    rounding_mode, unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
    price_source_type, override_by, override_reason)
  values (purchase_order_id, sales_line_id, 1, checked_purchase.material_id, checked_purchase.material_name,
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
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_linked_direct_drafts', hash, 'purchase_order', purchase_order_id, now());
  return purchase_order_id;
end
$$;

create or replace function public.upsert_supply_allocation(
  target_sales_order_line_id uuid, supply_mode text, target_purchase_order_line_id uuid,
  target_warehouse_id uuid, requested_base_quantity numeric, target_allocation_id uuid,
  expected_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    if existing.version <> expected_version then raise exception 'allocation_version_conflict' using errcode = '40001'; end if;
    perform private.assert_allocation_capacity(target_sales_order_line_id, requested_base_quantity, target_allocation_id);
    update public.supply_allocations set supply_mode = upsert_supply_allocation.supply_mode,
      purchase_order_line_id = target_purchase_order_line_id, warehouse_id = target_warehouse_id,
      allocated_base_quantity = requested_base_quantity, version = version + 1, updated_at = now()
    where id = target_allocation_id returning id into allocation_id;
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'upsert_supply_allocation', hash, 'supply_allocation', allocation_id, now());
  return allocation_id;
end
$$;

create or replace function public.confirm_purchase_order(target_purchase_order_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.purchase_orders%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not private.has_permission(order_row.branch_id, 'purchasing.confirm') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = confirm_purchase_order.operation_id;
  if found then if receipt.command_name <> 'confirm_purchase_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.state <> 'DRAFT' or not exists (select 1 from public.purchase_order_lines where purchase_order_id = target_purchase_order_id) then raise exception 'purchase_order_not_confirmable' using errcode = '23514'; end if;
  update public.purchase_orders set state = 'CONFIRMED', confirmed_at = now() where id = target_purchase_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'confirm_purchase_order', hash, 'purchase_order', target_purchase_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.confirm', 'purchase_order', target_purchase_order_id, operation_id, array['state']);
  return target_purchase_order_id;
end
$$;

create or replace function public.cancel_purchase_order(target_purchase_order_id uuid, cancel_reason text, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.purchase_orders%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not private.has_permission(order_row.branch_id, 'purchasing.cancel') then raise exception 'forbidden' using errcode = '42501'; end if;
  if cancel_reason is null or char_length(cancel_reason) < 3 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'reason', cancel_reason));
  select * into receipt from public.command_receipts where command_receipts.operation_id = cancel_purchase_order.operation_id;
  if found then if receipt.command_name <> 'cancel_purchase_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.state not in ('DRAFT','CONFIRMED') then raise exception 'purchase_order_not_cancellable' using errcode = '23514'; end if;
  if exists (select 1 from public.supply_allocations a join public.purchase_order_lines l on l.id = a.purchase_order_line_id where l.purchase_order_id = target_purchase_order_id) then
    delete from public.supply_allocations a using public.purchase_order_lines l where a.purchase_order_line_id = l.id and l.purchase_order_id = target_purchase_order_id;
  end if;
  update public.purchase_orders set state = 'CANCELLED', cancelled_at = now() where id = target_purchase_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_purchase_order', hash, 'purchase_order', target_purchase_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.cancel', 'purchase_order', target_purchase_order_id, operation_id, array['state','supply_allocation'], cancel_reason);
  return target_purchase_order_id;
end
$$;

create or replace function public.create_supplier_quick(
  target_branch_id uuid, supplier_code text, supplier_name text, supplier_phone text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare normalized_code text; hash text; receipt public.command_receipts%rowtype; supplier_id uuid;
begin
  if not (private.has_permission(target_branch_id, 'suppliers.manage') or private.has_permission(target_branch_id, 'purchasing.create')) then raise exception 'forbidden' using errcode = '42501'; end if;
  normalized_code := upper(trim(supplier_code));
  if normalized_code !~ '^[A-Z0-9_-]{2,32}$' or char_length(trim(supplier_name)) < 2 then raise exception 'supplier_invalid' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'code', normalized_code, 'name', trim(supplier_name), 'phone', nullif(trim(supplier_phone), '')));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_supplier_quick.operation_id;
  if found then if receipt.command_name <> 'create_supplier_quick' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.suppliers(branch_id, code, name, phone)
  values (target_branch_id, normalized_code, trim(supplier_name), nullif(trim(supplier_phone), ''))
  on conflict (branch_id, code) do update set name = excluded.name, phone = coalesce(excluded.phone, public.suppliers.phone)
  returning id into supplier_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_supplier_quick', hash, 'supplier', supplier_id, now());
  return supplier_id;
end
$$;

create or replace function private.guard_purchase_order_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'purchase_order_is_not_deletable' using errcode = '55000'; end if;
  if old.state <> 'DRAFT' and (to_jsonb(new) - array['state','cancelled_at']::text[]) <> (to_jsonb(old) - array['state','cancelled_at']::text[]) then raise exception 'confirmed_purchase_order_is_immutable' using errcode = '55000'; end if;
  if old.state = 'DRAFT' and new.state not in ('DRAFT','CONFIRMED','CANCELLED') then raise exception 'invalid_purchase_order_transition' using errcode = '23514'; end if;
  if old.state = 'CONFIRMED' and new.state not in ('CONFIRMED','CLOSED','CANCELLED') then raise exception 'invalid_purchase_order_transition' using errcode = '23514'; end if;
  if old.state in ('CLOSED','CANCELLED') and new.state <> old.state then raise exception 'terminal_purchase_order_transition' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger purchase_order_guard before update or delete on public.purchase_orders for each row execute function private.guard_purchase_order_mutation();

create or replace function private.guard_purchase_line_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare parent_state text;
begin
  select p.state into parent_state from public.purchase_orders p where p.id = coalesce(new.purchase_order_id, old.purchase_order_id);
  if parent_state <> 'DRAFT' then raise exception 'confirmed_purchase_order_lines_are_immutable' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
create trigger purchase_line_guard before update or delete on public.purchase_order_lines for each row execute function private.guard_purchase_line_mutation();

insert into public.permissions(code, name) values
  ('purchasing.create', 'Tạo đơn mua và phân nguồn'),
  ('purchasing.confirm', 'Xác nhận đơn mua'),
  ('purchasing.cancel', 'Hủy đơn mua'),
  ('purchasing.price.read', 'Xem giá mua'),
  ('purchasing.price.manage', 'Nhập giá mua thủ công'),
  ('suppliers.manage', 'Tạo và cập nhật nhà cung cấp')
on conflict (code) do nothing;

alter table public.purchase_price_rules enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.supply_allocations enable row level security;

revoke all on table public.purchase_price_rules, public.purchase_orders, public.purchase_order_lines,
  public.supply_allocations, public.purchase_order_read, public.purchase_order_line_read,
  public.sales_line_supply_read from anon, authenticated;
grant select on table public.purchase_price_rules, public.purchase_orders,
  public.supply_allocations, public.purchase_order_read, public.purchase_order_line_read,
  public.sales_line_supply_read to authenticated;

create policy purchase_price_rules_select on public.purchase_price_rules for select to authenticated
  using ((select private.has_permission(branch_id, 'purchasing.price.read')));
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using ((select private.has_permission(branch_id, 'purchasing.read')));
create policy purchase_order_lines_select on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id));
create policy supply_allocations_select on public.supply_allocations for select to authenticated
  using ((select private.has_permission(branch_id, 'purchasing.read')) or (select private.has_permission(branch_id, 'orders.read')));

revoke all on function public.create_purchase_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid) from public, anon;
revoke all on function public.create_direct_purchase_from_sales_line(uuid, uuid, numeric, jsonb, timestamptz, uuid) from public, anon;
revoke all on function public.create_linked_direct_drafts(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz, text, uuid) from public, anon;
revoke all on function public.upsert_supply_allocation(uuid, text, uuid, uuid, numeric, uuid, integer, uuid) from public, anon;
revoke all on function public.confirm_purchase_order(uuid, uuid) from public, anon;
revoke all on function public.cancel_purchase_order(uuid, text, uuid) from public, anon;
revoke all on function public.create_supplier_quick(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.create_purchase_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid) to authenticated;
grant execute on function public.create_direct_purchase_from_sales_line(uuid, uuid, numeric, jsonb, timestamptz, uuid) to authenticated;
grant execute on function public.create_linked_direct_drafts(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz, text, uuid) to authenticated;
grant execute on function public.upsert_supply_allocation(uuid, text, uuid, uuid, numeric, uuid, integer, uuid) to authenticated;
grant execute on function public.confirm_purchase_order(uuid, uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid, text, uuid) to authenticated;
grant execute on function public.create_supplier_quick(uuid, text, text, text, uuid) to authenticated;
