-- HIỀN XA ERP P5 — Supplier orders, sourcing, and dropship.
-- Supplier-direct allocations never touch a warehouse or create inventory.
-- Purchase-order confirmation records a commercial commitment, never AP.

create type public.sourcing_mode as enum (
  'WAREHOUSE', 'SUPPLIER_DIRECT', 'SUPPLIER_TO_WAREHOUSE'
);

create type public.purchase_order_status as enum (
  'DRAFT', 'CONFIRMED', 'SENT', 'ACKNOWLEDGED',
  'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'
);

create type public.supply_allocation_status as enum (
  'PLANNED', 'ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);

create sequence public.purchase_order_number_seq start 1;
revoke all on sequence public.purchase_order_number_seq from anon, authenticated;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 180),
  tax_code text check (tax_code is null or char_length(trim(tax_code)) between 6 and 32),
  phone text check (phone is null or char_length(trim(phone)) between 6 and 32),
  email text check (email is null or char_length(trim(email)) between 5 and 180),
  address text check (address is null or char_length(trim(address)) between 3 and 300),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index suppliers_active_idx on public.suppliers(is_active, code);
create index suppliers_created_by_idx on public.suppliers(created_by);

create table public.supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  unit_cost numeric(20, 2) not null check (unit_cost > 0),
  currency text not null default 'VND'
    check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  valid_from date not null,
  valid_to date,
  version integer not null check (version > 0),
  change_reason text not null check (char_length(trim(change_reason)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (supplier_id, material_id, uom_id, version),
  constraint supplier_price_period check (valid_to is null or valid_to >= valid_from)
);

create unique index supplier_price_one_current_idx
  on public.supplier_price_history(supplier_id, material_id, uom_id)
  where valid_to is null;
create index supplier_price_supplier_idx
  on public.supplier_price_history(supplier_id, valid_from desc);
create index supplier_price_material_idx
  on public.supplier_price_history(material_id, uom_id, valid_from desc);
create index supplier_price_created_by_idx on public.supplier_price_history(created_by);

create table public.purchase_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_supplier_price_id uuid not null
    references public.supplier_price_history(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_code_snapshot text not null,
  supplier_name_snapshot text not null,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  unit_cost numeric(20, 2) not null check (unit_cost > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  supplier_price_version integer not null check (supplier_price_version > 0),
  captured_by uuid not null references public.user_profiles(user_id) on delete restrict,
  captured_at timestamptz not null default now()
);

create index purchase_cost_snapshots_price_idx
  on public.purchase_cost_snapshots(source_supplier_price_id);
create index purchase_cost_snapshots_supplier_idx
  on public.purchase_cost_snapshots(supplier_id, captured_at desc);
create index purchase_cost_snapshots_material_idx
  on public.purchase_cost_snapshots(material_id, captured_at desc);
create index purchase_cost_snapshots_actor_idx on public.purchase_cost_snapshots(captured_by);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_order_number text not null unique
    check (purchase_order_number = upper(trim(purchase_order_number))
      and char_length(purchase_order_number) between 4 and 40),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_code_snapshot text not null,
  supplier_name_snapshot text not null,
  status public.purchase_order_status not null default 'DRAFT',
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  total_amount numeric(20, 2) not null check (total_amount > 0),
  delivery_mode public.sourcing_mode not null
    check (delivery_mode in ('SUPPLIER_DIRECT', 'SUPPLIER_TO_WAREHOUSE')),
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  direct_customer_id uuid references public.customers(id) on delete restrict,
  direct_customer_site_id uuid references public.customer_sites(id) on delete restrict,
  confirmed_by uuid references public.user_profiles(user_id) on delete restrict,
  confirmed_at timestamptz,
  sent_by uuid references public.user_profiles(user_id) on delete restrict,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or char_length(trim(cancellation_reason)) between 10 and 500
  ),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_route check (
    (
      delivery_mode = 'SUPPLIER_DIRECT'
      and warehouse_id is null
      and direct_customer_id is not null
      and direct_customer_site_id is not null
    )
    or (
      delivery_mode = 'SUPPLIER_TO_WAREHOUSE'
      and warehouse_id is not null
      and direct_customer_id is null
      and direct_customer_site_id is null
    )
  ),
  constraint purchase_order_lifecycle check (
    (status = 'DRAFT' and confirmed_at is null and sent_at is null and acknowledged_at is null)
    or (status = 'CONFIRMED' and confirmed_at is not null and sent_at is null)
    or (status = 'SENT' and confirmed_at is not null and sent_at is not null and acknowledged_at is null)
    or (status in ('ACKNOWLEDGED', 'PARTIALLY_DELIVERED', 'DELIVERED')
      and confirmed_at is not null and sent_at is not null and acknowledged_at is not null)
    or (status = 'CANCELLED' and cancelled_at is not null
      and cancellation_reason is not null)
  )
);

create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id, created_at desc);
create index purchase_orders_status_idx on public.purchase_orders(status, created_at desc);
create index purchase_orders_warehouse_idx on public.purchase_orders(warehouse_id)
  where warehouse_id is not null;
create index purchase_orders_direct_site_idx on public.purchase_orders(direct_customer_site_id)
  where direct_customer_site_id is not null;
create index purchase_orders_created_by_idx on public.purchase_orders(created_by);

create table public.supply_allocations (
  id uuid primary key default gen_random_uuid(),
  fulfillment_requirement_id uuid not null
    references public.fulfillment_requirements(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  sourcing_mode public.sourcing_mode not null,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  direct_customer_id uuid references public.customers(id) on delete restrict,
  direct_customer_site_id uuid references public.customer_sites(id) on delete restrict,
  purchase_order_line_id uuid,
  allocated_quantity numeric(20, 6) not null check (allocated_quantity > 0),
  supplier_delivered_qty numeric(20, 6) not null default 0 check (supplier_delivered_qty >= 0),
  customer_accepted_qty numeric(20, 6) not null default 0 check (customer_accepted_qty >= 0),
  customer_billable_qty numeric(20, 6) not null default 0 check (customer_billable_qty >= 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  status public.supply_allocation_status not null default 'PLANNED',
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_allocation_route check (
    (
      sourcing_mode = 'WAREHOUSE'
      and supplier_id is null
      and warehouse_id is not null
      and direct_customer_id is null
      and direct_customer_site_id is null
    )
    or (
      sourcing_mode = 'SUPPLIER_DIRECT'
      and supplier_id is not null
      and warehouse_id is null
      and direct_customer_id is not null
      and direct_customer_site_id is not null
    )
    or (
      sourcing_mode = 'SUPPLIER_TO_WAREHOUSE'
      and supplier_id is not null
      and warehouse_id is not null
      and direct_customer_id is null
      and direct_customer_site_id is null
    )
  ),
  constraint supply_allocation_quantity_chain check (
    supplier_delivered_qty <= allocated_quantity
    and customer_accepted_qty <= supplier_delivered_qty
    and customer_billable_qty <= customer_accepted_qty
  ),
  unique (id, sales_order_line_id)
);

create index supply_allocations_requirement_idx
  on public.supply_allocations(fulfillment_requirement_id, status);
create index supply_allocations_sales_line_idx
  on public.supply_allocations(sales_order_line_id, status);
create index supply_allocations_supplier_idx on public.supply_allocations(supplier_id)
  where supplier_id is not null;
create index supply_allocations_warehouse_idx on public.supply_allocations(warehouse_id)
  where warehouse_id is not null;
create index supply_allocations_direct_site_idx
  on public.supply_allocations(direct_customer_site_id)
  where direct_customer_site_id is not null;

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  supply_allocation_id uuid not null unique
    references public.supply_allocations(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  ordered_quantity numeric(20, 6) not null check (ordered_quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  uom_snapshot jsonb not null,
  purchase_cost_snapshot_id uuid not null
    references public.purchase_cost_snapshots(id) on delete restrict,
  unit_cost numeric(20, 2) not null check (unit_cost > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  line_amount numeric(20, 2) not null check (line_amount > 0),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, line_number)
);

alter table public.supply_allocations
  add constraint supply_allocations_purchase_order_line_fk
  foreign key (purchase_order_line_id)
  references public.purchase_order_lines(id) on delete restrict;

create unique index supply_allocations_purchase_order_line_unique
  on public.supply_allocations(purchase_order_line_id)
  where purchase_order_line_id is not null;
create index purchase_order_lines_order_idx
  on public.purchase_order_lines(purchase_order_id, line_number);
create index purchase_order_lines_sales_line_idx
  on public.purchase_order_lines(sales_order_line_id);
create index purchase_order_lines_material_idx on public.purchase_order_lines(material_id);
create index purchase_order_lines_cost_snapshot_idx
  on public.purchase_order_lines(purchase_cost_snapshot_id);

create table public.purchase_order_state_transitions (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  from_status public.purchase_order_status not null,
  to_status public.purchase_order_status not null,
  reason text,
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now(),
  check (from_status <> to_status)
);

create index purchase_order_transitions_order_idx
  on public.purchase_order_state_transitions(purchase_order_id, occurred_at desc);
create index purchase_order_transitions_actor_idx
  on public.purchase_order_state_transitions(actor_user_id, occurred_at desc);

create table public.purchase_order_evidence (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  evidence_id uuid not null unique references public.evidence(id) on delete restrict,
  label text not null check (char_length(trim(label)) between 3 and 180),
  linked_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index purchase_order_evidence_order_idx
  on public.purchase_order_evidence(purchase_order_id, created_at desc);
create index purchase_order_evidence_actor_idx on public.purchase_order_evidence(linked_by);

create trigger suppliers_updated_at
before update on public.suppliers
for each row execute function app_private.set_master_updated_at();
create trigger purchase_orders_updated_at
before update on public.purchase_orders
for each row execute function app_private.touch_updated_at();
create trigger supply_allocations_updated_at
before update on public.supply_allocations
for each row execute function app_private.touch_updated_at();

create or replace function app_private.validate_supplier_price_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.supplier_price_history as price
    where price.supplier_id = new.supplier_id
      and price.material_id = new.material_id
      and price.uom_id = new.uom_id
      and price.id <> new.id
      and daterange(price.valid_from, coalesce(price.valid_to, 'infinity'::date), '[]')
        && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'SUPPLIER_PRICE_EFFECTIVE_PERIOD_OVERLAP' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger supplier_price_validate_version
before insert on public.supplier_price_history
for each row execute function app_private.validate_supplier_price_version();

create or replace function app_private.prevent_supplier_price_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.supplier_id is distinct from old.supplier_id
    or new.material_id is distinct from old.material_id
    or new.uom_id is distinct from old.uom_id
    or new.unit_cost is distinct from old.unit_cost
    or new.currency is distinct from old.currency
    or new.valid_from is distinct from old.valid_from
    or new.version is distinct from old.version
    or new.change_reason is distinct from old.change_reason
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or old.valid_to is not null
    or new.valid_to is null
  then
    raise exception 'SUPPLIER_PRICE_IMMUTABLE' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger supplier_price_immutable
before update on public.supplier_price_history
for each row execute function app_private.prevent_supplier_price_rewrite();
create trigger supplier_price_no_delete
before delete on public.supplier_price_history
for each row execute function app_private.prevent_immutable_delete();
create trigger purchase_cost_snapshots_no_update_or_delete
before update or delete on public.purchase_cost_snapshots
for each row execute function app_private.prevent_immutable_delete();
create trigger purchase_order_lines_no_update_or_delete
before update or delete on public.purchase_order_lines
for each row execute function app_private.prevent_immutable_delete();
create trigger purchase_order_transitions_no_update_or_delete
before update or delete on public.purchase_order_state_transitions
for each row execute function app_private.prevent_immutable_delete();
create trigger purchase_order_evidence_no_update_or_delete
before update or delete on public.purchase_order_evidence
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_supply_allocation_consistency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ordered_quantity numeric(20, 6);
  line_uom_id uuid;
  order_customer_id uuid;
  order_customer_site_id uuid;
  requirement_line_id uuid;
  other_allocated_quantity numeric(20, 6);
begin
  select line.ordered_quantity, line.uom_id,
    sales_order.customer_id, sales_order.customer_site_id
  into ordered_quantity, line_uom_id, order_customer_id, order_customer_site_id
  from public.sales_order_lines as line
  join public.sales_orders as sales_order on sales_order.id = line.sales_order_id
  where line.id = new.sales_order_line_id
  for update;

  if not found then
    raise exception 'SALES_ORDER_LINE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select requirement.sales_order_line_id
  into requirement_line_id
  from public.fulfillment_requirements as requirement
  where requirement.id = new.fulfillment_requirement_id;

  if requirement_line_id is distinct from new.sales_order_line_id then
    raise exception 'FULFILLMENT_REQUIREMENT_LINE_MISMATCH' using errcode = '23514';
  end if;

  if new.uom_id is distinct from line_uom_id then
    raise exception 'SUPPLY_ALLOCATION_UOM_MISMATCH' using errcode = '23514';
  end if;

  if new.sourcing_mode = 'SUPPLIER_DIRECT'
    and (
      new.direct_customer_id is distinct from order_customer_id
      or new.direct_customer_site_id is distinct from order_customer_site_id
    )
  then
    raise exception 'DROPSHIP_CUSTOMER_SITE_MISMATCH' using errcode = '23514';
  end if;

  select coalesce(sum(allocation.allocated_quantity), 0)
  into other_allocated_quantity
  from public.supply_allocations as allocation
  where allocation.sales_order_line_id = new.sales_order_line_id
    and allocation.id is distinct from new.id
    and allocation.status <> 'CANCELLED';

  if new.status <> 'CANCELLED'
    and other_allocated_quantity + new.allocated_quantity > ordered_quantity
  then
    raise exception 'SUPPLY_ALLOCATION_EXCEEDS_ORDERED_QUANTITY'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger supply_allocations_guard_consistency
before insert or update on public.supply_allocations
for each row execute function app_private.guard_supply_allocation_consistency();

create or replace function app_private.guard_supply_allocation_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.fulfillment_requirement_id is distinct from old.fulfillment_requirement_id
    or new.sales_order_line_id is distinct from old.sales_order_line_id
    or new.sourcing_mode is distinct from old.sourcing_mode
    or new.supplier_id is distinct from old.supplier_id
    or new.warehouse_id is distinct from old.warehouse_id
    or new.direct_customer_id is distinct from old.direct_customer_id
    or new.direct_customer_site_id is distinct from old.direct_customer_site_id
    or new.allocated_quantity is distinct from old.allocated_quantity
    or new.uom_id is distinct from old.uom_id
    or new.uom_symbol_snapshot is distinct from old.uom_symbol_snapshot
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'SUPPLY_ALLOCATION_ROUTE_IMMUTABLE' using errcode = '22000';
  end if;

  if old.purchase_order_line_id is not null
    and new.purchase_order_line_id is distinct from old.purchase_order_line_id
  then
    raise exception 'SUPPLY_ALLOCATION_PURCHASE_ORDER_IMMUTABLE' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger supply_allocations_guard_update
before update on public.supply_allocations
for each row execute function app_private.guard_supply_allocation_update();
create trigger supply_allocations_no_delete
before delete on public.supply_allocations
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_purchase_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if new.purchase_order_number is distinct from old.purchase_order_number
    or new.supplier_id is distinct from old.supplier_id
    or new.supplier_code_snapshot is distinct from old.supplier_code_snapshot
    or new.supplier_name_snapshot is distinct from old.supplier_name_snapshot
    or new.currency is distinct from old.currency
    or new.total_amount is distinct from old.total_amount
    or new.delivery_mode is distinct from old.delivery_mode
    or new.warehouse_id is distinct from old.warehouse_id
    or new.direct_customer_id is distinct from old.direct_customer_id
    or new.direct_customer_site_id is distinct from old.direct_customer_site_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'PURCHASE_ORDER_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;

  if new.status = old.status then
    return new;
  end if;

  allowed :=
    (old.status = 'DRAFT' and new.status in ('CONFIRMED', 'CANCELLED'))
    or (old.status = 'CONFIRMED' and new.status in ('SENT', 'CANCELLED'))
    or (old.status = 'SENT' and new.status in ('ACKNOWLEDGED', 'CANCELLED'))
    or (old.status = 'ACKNOWLEDGED' and new.status in ('PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'))
    or (old.status = 'PARTIALLY_DELIVERED' and new.status in ('DELIVERED', 'CANCELLED'));
  if not allowed then
    raise exception 'INVALID_PURCHASE_ORDER_TRANSITION' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger purchase_orders_guard_update
before update on public.purchase_orders
for each row execute function app_private.guard_purchase_order_update();
create trigger purchase_orders_no_delete
before delete on public.purchase_orders
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.transition_purchase_order(
  p_purchase_order_id uuid,
  p_next_status public.purchase_order_status,
  p_actor_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_order public.purchase_orders%rowtype;
  required_permission text;
begin
  required_permission := case
    when p_next_status = 'CONFIRMED' then 'purchase_order.confirm'
    else 'purchase_order.send'
  end;
  perform app_private.assert_actor_permission(p_actor_id, required_permission);

  select * into current_order from public.purchase_orders
  where id = p_purchase_order_id for update;
  if not found then
    raise exception 'PURCHASE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_next_status = 'CONFIRMED' and not exists (
    select 1 from public.purchase_order_lines
    where purchase_order_id = p_purchase_order_id
  ) then
    raise exception 'PURCHASE_ORDER_HAS_NO_LINES' using errcode = '23514';
  end if;

  if p_next_status = 'CANCELLED'
    and (p_reason is null or char_length(trim(p_reason)) < 10)
  then
    raise exception 'PURCHASE_ORDER_CANCELLATION_REASON_REQUIRED' using errcode = '23514';
  end if;

  update public.purchase_orders set
    status = p_next_status,
    confirmed_by = case when p_next_status = 'CONFIRMED' then p_actor_id else confirmed_by end,
    confirmed_at = case when p_next_status = 'CONFIRMED' then now() else confirmed_at end,
    sent_by = case when p_next_status = 'SENT' then p_actor_id else sent_by end,
    sent_at = case when p_next_status = 'SENT' then now() else sent_at end,
    acknowledged_at = case when p_next_status = 'ACKNOWLEDGED' then now() else acknowledged_at end,
    cancelled_at = case when p_next_status = 'CANCELLED' then now() else cancelled_at end,
    cancellation_reason = case when p_next_status = 'CANCELLED' then trim(p_reason) else cancellation_reason end
  where id = p_purchase_order_id;

  insert into public.purchase_order_state_transitions (
    purchase_order_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_purchase_order_id, current_order.status, p_next_status, p_reason, p_actor_id
  );

  return p_purchase_order_id;
end;
$$;

revoke all on function app_private.validate_supplier_price_version() from public;
revoke all on function app_private.prevent_supplier_price_rewrite() from public;
revoke all on function app_private.guard_supply_allocation_consistency() from public;
revoke all on function app_private.guard_supply_allocation_update() from public;
revoke all on function app_private.guard_purchase_order_update() from public;
revoke all on function app_private.transition_purchase_order(
  uuid, public.purchase_order_status, uuid, text
) from public, anon, authenticated;

alter table public.suppliers enable row level security;
alter table public.supplier_price_history enable row level security;
alter table public.purchase_cost_snapshots enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.supply_allocations enable row level security;
alter table public.purchase_order_state_transitions enable row level security;
alter table public.purchase_order_evidence enable row level security;

revoke all on public.suppliers from anon, authenticated;
revoke all on public.supplier_price_history from anon, authenticated;
revoke all on public.purchase_cost_snapshots from anon, authenticated;
revoke all on public.purchase_orders from anon, authenticated;
revoke all on public.purchase_order_lines from anon, authenticated;
revoke all on public.supply_allocations from anon, authenticated;
revoke all on public.purchase_order_state_transitions from anon, authenticated;
revoke all on public.purchase_order_evidence from anon, authenticated;

grant select on public.suppliers to authenticated;
grant select on public.supplier_price_history to authenticated;
grant select on public.purchase_cost_snapshots to authenticated;
grant select on public.purchase_orders to authenticated;
grant select on public.purchase_order_lines to authenticated;
grant select on public.supply_allocations to authenticated;
grant select on public.purchase_order_state_transitions to authenticated;
grant select on public.purchase_order_evidence to authenticated;

create policy suppliers_read_authorized on public.suppliers
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('supplier.read'))
);
create policy supplier_prices_read_authorized on public.supplier_price_history
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('supplier_price.read'))
);
create policy purchase_cost_snapshots_read_authorized on public.purchase_cost_snapshots
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('purchase_order.read'))
);
create policy purchase_orders_read_authorized on public.purchase_orders
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('purchase_order.read'))
);
create policy purchase_order_lines_read_authorized on public.purchase_order_lines
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('purchase_order.read'))
);
create policy supply_allocations_read_authorized on public.supply_allocations
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('sourcing.read'))
);
create policy purchase_order_transitions_read_authorized
on public.purchase_order_state_transitions for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('purchase_order.read'))
    or (select app_private.has_permission('audit.view'))
  )
);
create policy purchase_order_evidence_read_authorized
on public.purchase_order_evidence for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('purchase_order.read'))
  and (select app_private.has_permission('evidence.read'))
);

insert into public.permissions (code, description_vi) values
  ('supplier.read', 'Xem nhà cung cấp'),
  ('supplier.manage', 'Tạo và cập nhật hồ sơ nhà cung cấp'),
  ('supplier_price.read', 'Xem lịch sử giá mua nhà cung cấp'),
  ('supplier_price.manage', 'Ghi nhận phiên bản giá mua nhà cung cấp'),
  ('sourcing.read', 'Xem phương án chia nguồn hàng'),
  ('sourcing.manage', 'Chia nguồn hàng cho dòng đơn bán'),
  ('purchase_order.read', 'Xem đơn mua và ảnh chụp giá mua'),
  ('purchase_order.create', 'Tạo đơn mua từ phần chia nguồn'),
  ('purchase_order.confirm', 'Xác nhận đơn mua'),
  ('purchase_order.send', 'Gửi, ghi nhận phản hồi hoặc hủy đơn mua')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'supplier.read', 'supplier.manage', 'supplier_price.read', 'supplier_price.manage',
  'sourcing.read', 'sourcing.manage', 'purchase_order.read',
  'purchase_order.create', 'purchase_order.confirm', 'purchase_order.send'
)
where role.code in ('OWNER_ADMIN', 'PURCHASING_SOURCING')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'supplier.read', 'supplier_price.read', 'sourcing.read', 'sourcing.manage',
  'purchase_order.read', 'purchase_order.create', 'purchase_order.confirm'
)
where role.code = 'SUPERVISOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'supplier.read', 'supplier_price.read', 'sourcing.read', 'purchase_order.read'
)
where role.code in ('WAREHOUSE', 'FINANCE', 'AUDITOR_VIEWER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'sourcing.read', 'purchase_order.read'
)
where role.code = 'SALES'
on conflict do nothing;
