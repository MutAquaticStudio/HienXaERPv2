-- HIỀN XA ERP P6 — Inventory and yard control.
-- InventoryMovement is the source of truth. Balances are private projections
-- maintained only by guarded database functions; browser roles cannot mutate them.

create type public.inventory_movement_type as enum (
  'RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'
);

create type public.stock_reservation_status as enum (
  'ACTIVE', 'CONSUMED', 'RELEASED', 'CANCELLED'
);

create type public.warehouse_document_status as enum (
  'DRAFT', 'CONFIRMED', 'CANCELLED'
);

create type public.stock_count_status as enum (
  'DRAFT', 'COUNTED', 'ADJUSTED', 'CANCELLED'
);

create sequence public.inventory_movement_number_seq start 1;
create sequence public.stock_reservation_number_seq start 1;
create sequence public.warehouse_receipt_number_seq start 1;
create sequence public.warehouse_issue_number_seq start 1;
create sequence public.stock_count_number_seq start 1;
create sequence public.stock_adjustment_number_seq start 1;

revoke all on sequence public.inventory_movement_number_seq from anon, authenticated;
revoke all on sequence public.stock_reservation_number_seq from anon, authenticated;
revoke all on sequence public.warehouse_receipt_number_seq from anon, authenticated;
revoke all on sequence public.warehouse_issue_number_seq from anon, authenticated;
revoke all on sequence public.stock_count_number_seq from anon, authenticated;
revoke all on sequence public.stock_adjustment_number_seq from anon, authenticated;

create table app_private.inventory_positions (
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  on_hand_quantity numeric(20, 6) not null default 0 check (on_hand_quantity >= 0),
  reserved_quantity numeric(20, 6) not null default 0 check (reserved_quantity >= 0),
  inventory_value numeric(20, 2) not null default 0 check (inventory_value >= 0),
  moving_average_cost numeric(20, 6) not null default 0 check (moving_average_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, material_id),
  constraint inventory_position_reservation_limit check (
    reserved_quantity <= on_hand_quantity
  )
);

revoke all on app_private.inventory_positions from public, anon, authenticated;
alter table app_private.inventory_positions enable row level security;

create table public.inventory_reorder_policies (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  minimum_quantity numeric(20, 6) not null check (minimum_quantity >= 0),
  target_quantity numeric(20, 6) not null check (target_quantity > minimum_quantity),
  change_reason text not null check (char_length(trim(change_reason)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, material_id)
);

create index inventory_reorder_policies_material_idx
  on public.inventory_reorder_policies(material_id, warehouse_id);
create index inventory_reorder_policies_actor_idx
  on public.inventory_reorder_policies(updated_by, updated_at desc);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text not null unique,
  fulfillment_requirement_id uuid not null
    references public.fulfillment_requirements(id) on delete restrict,
  supply_allocation_id uuid not null unique
    references public.supply_allocations(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  document_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  document_uom_symbol_snapshot text not null,
  document_quantity numeric(20, 6) not null check (document_quantity > 0),
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  base_uom_symbol_snapshot text not null,
  conversion_snapshot jsonb not null,
  reserved_quantity numeric(20, 6) not null check (reserved_quantity > 0),
  consumed_quantity numeric(20, 6) not null default 0 check (consumed_quantity >= 0),
  status public.stock_reservation_status not null default 'ACTIVE',
  release_reason text check (
    release_reason is null or char_length(trim(release_reason)) between 10 and 500
  ),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_reservation_quantity_chain check (
    consumed_quantity <= reserved_quantity
  ),
  constraint stock_reservation_lifecycle check (
    (status = 'ACTIVE' and consumed_quantity = 0 and release_reason is null)
    or (status = 'CONSUMED' and consumed_quantity = reserved_quantity and release_reason is null)
    or (status in ('RELEASED', 'CANCELLED') and release_reason is not null)
  )
);

create index stock_reservations_position_idx
  on public.stock_reservations(warehouse_id, material_id, status);
create index stock_reservations_sales_line_idx
  on public.stock_reservations(sales_order_line_id, status);
create index stock_reservations_requirement_idx
  on public.stock_reservations(fulfillment_requirement_id, status);
create index stock_reservations_actor_idx on public.stock_reservations(created_by);

create table public.warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  status public.warehouse_document_status not null default 'DRAFT',
  received_at timestamptz not null,
  evidence_id uuid references public.evidence(id) on delete restrict,
  notes text check (notes is null or char_length(trim(notes)) between 3 and 500),
  confirmed_by uuid references public.user_profiles(user_id) on delete restrict,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or char_length(trim(cancellation_reason)) between 10 and 500
  ),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_receipt_lifecycle check (
    (status = 'DRAFT' and confirmed_by is null and confirmed_at is null and cancelled_at is null)
    or (status = 'CONFIRMED' and confirmed_by is not null and confirmed_at is not null and cancelled_at is null)
    or (status = 'CANCELLED' and cancelled_at is not null and cancellation_reason is not null)
  )
);

create index warehouse_receipts_warehouse_idx
  on public.warehouse_receipts(warehouse_id, received_at desc);
create index warehouse_receipts_po_idx on public.warehouse_receipts(purchase_order_id)
  where purchase_order_id is not null;
create index warehouse_receipts_status_idx
  on public.warehouse_receipts(status, received_at desc);

create table public.warehouse_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  warehouse_receipt_id uuid not null references public.warehouse_receipts(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  purchase_order_line_id uuid references public.purchase_order_lines(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  document_quantity numeric(20, 6) not null check (document_quantity > 0),
  document_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  document_uom_symbol_snapshot text not null,
  base_quantity numeric(20, 6) not null check (base_quantity > 0),
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  base_uom_symbol_snapshot text not null,
  conversion_snapshot jsonb not null,
  document_unit_cost numeric(20, 2) not null check (document_unit_cost > 0),
  base_unit_cost numeric(20, 6) not null check (base_unit_cost > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  line_amount numeric(20, 2) not null check (line_amount > 0),
  created_at timestamptz not null default now(),
  unique (warehouse_receipt_id, line_number)
);

create index warehouse_receipt_lines_receipt_idx
  on public.warehouse_receipt_lines(warehouse_receipt_id, line_number);
create index warehouse_receipt_lines_material_idx
  on public.warehouse_receipt_lines(material_id, base_uom_id);
create index warehouse_receipt_lines_po_line_idx
  on public.warehouse_receipt_lines(purchase_order_line_id)
  where purchase_order_line_id is not null;

create table public.warehouse_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null unique,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  status public.warehouse_document_status not null default 'DRAFT',
  issued_at timestamptz not null,
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  evidence_id uuid references public.evidence(id) on delete restrict,
  confirmed_by uuid references public.user_profiles(user_id) on delete restrict,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or char_length(trim(cancellation_reason)) between 10 and 500
  ),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_issue_lifecycle check (
    (status = 'DRAFT' and confirmed_by is null and confirmed_at is null and cancelled_at is null)
    or (status = 'CONFIRMED' and confirmed_by is not null and confirmed_at is not null and cancelled_at is null)
    or (status = 'CANCELLED' and cancelled_at is not null and cancellation_reason is not null)
  )
);

create index warehouse_issues_warehouse_idx
  on public.warehouse_issues(warehouse_id, issued_at desc);
create index warehouse_issues_sales_order_idx on public.warehouse_issues(sales_order_id)
  where sales_order_id is not null;
create index warehouse_issues_status_idx on public.warehouse_issues(status, issued_at desc);

create table public.warehouse_issue_lines (
  id uuid primary key default gen_random_uuid(),
  warehouse_issue_id uuid not null references public.warehouse_issues(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  reservation_id uuid references public.stock_reservations(id) on delete restrict,
  sales_order_line_id uuid references public.sales_order_lines(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  base_quantity numeric(20, 6) not null check (base_quantity > 0),
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  base_uom_symbol_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (warehouse_issue_id, line_number),
  unique (reservation_id)
);

create index warehouse_issue_lines_issue_idx
  on public.warehouse_issue_lines(warehouse_issue_id, line_number);
create index warehouse_issue_lines_material_idx
  on public.warehouse_issue_lines(material_id, base_uom_id);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  count_number text not null unique,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status public.stock_count_status not null default 'DRAFT',
  count_reason text not null check (char_length(trim(count_reason)) between 10 and 500),
  counted_at timestamptz not null,
  captured_by uuid references public.user_profiles(user_id) on delete restrict,
  captured_at timestamptz,
  adjusted_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_count_lifecycle check (
    (status = 'DRAFT' and captured_by is null and captured_at is null and adjusted_at is null)
    or (status = 'COUNTED' and captured_by is not null and captured_at is not null and adjusted_at is null)
    or (status = 'ADJUSTED' and captured_by is not null and captured_at is not null and adjusted_at is not null)
    or status = 'CANCELLED'
  )
);

create index stock_counts_warehouse_idx
  on public.stock_counts(warehouse_id, counted_at desc);
create index stock_counts_status_idx on public.stock_counts(status, counted_at desc);

create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.stock_counts(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  base_uom_symbol_snapshot text not null,
  system_quantity numeric(20, 6),
  counted_quantity numeric(20, 6) not null check (counted_quantity >= 0),
  variance_quantity numeric(20, 6),
  moving_average_cost_snapshot numeric(20, 6),
  notes text check (notes is null or char_length(trim(notes)) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (stock_count_id, line_number),
  unique (stock_count_id, material_id)
);

create index stock_count_lines_count_idx
  on public.stock_count_lines(stock_count_id, line_number);
create index stock_count_lines_material_idx
  on public.stock_count_lines(material_id, base_uom_id);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_number text not null unique,
  stock_count_id uuid not null unique references public.stock_counts(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  approved_by uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index stock_adjustments_warehouse_idx
  on public.stock_adjustments(warehouse_id, approved_at desc);
create index stock_adjustments_actor_idx on public.stock_adjustments(approved_by);

create table public.stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  stock_adjustment_id uuid not null references public.stock_adjustments(id) on delete restrict,
  stock_count_line_id uuid not null unique references public.stock_count_lines(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  variance_quantity numeric(20, 6) not null check (variance_quantity <> 0),
  unit_cost_snapshot numeric(20, 6) not null check (unit_cost_snapshot >= 0),
  value_delta numeric(20, 2) not null,
  created_at timestamptz not null default now()
);

create index stock_adjustment_lines_adjustment_idx
  on public.stock_adjustment_lines(stock_adjustment_id);
create index stock_adjustment_lines_material_idx
  on public.stock_adjustment_lines(material_id, base_uom_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  movement_number text not null unique,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  quantity_delta numeric(20, 6) not null check (quantity_delta <> 0),
  unit_cost numeric(20, 6) not null check (unit_cost >= 0),
  inventory_value_delta numeric(20, 2) not null,
  on_hand_after numeric(20, 6) not null check (on_hand_after >= 0),
  inventory_value_after numeric(20, 2) not null check (inventory_value_after >= 0),
  moving_average_cost_after numeric(20, 6) not null check (moving_average_cost_after >= 0),
  source_entity_type text not null check (
    source_entity_type in ('WAREHOUSE_RECEIPT', 'WAREHOUSE_ISSUE', 'STOCK_ADJUSTMENT')
  ),
  source_entity_id uuid not null,
  source_line_id uuid not null unique,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now(),
  constraint inventory_movement_direction check (
    (movement_type in ('RECEIPT', 'ADJUSTMENT_IN') and quantity_delta > 0 and inventory_value_delta >= 0)
    or (movement_type in ('ISSUE', 'ADJUSTMENT_OUT') and quantity_delta < 0 and inventory_value_delta <= 0)
  )
);

create index inventory_movements_position_idx
  on public.inventory_movements(warehouse_id, material_id, occurred_at desc, id);
create index inventory_movements_source_idx
  on public.inventory_movements(source_entity_type, source_entity_id);
create index inventory_movements_actor_idx
  on public.inventory_movements(actor_user_id, occurred_at desc);

create view public.inventory_stock_status
with (security_invoker = true)
as
select
  position.warehouse_id,
  warehouse.code as warehouse_code,
  warehouse.name_vi as warehouse_name,
  position.material_id,
  material.code as material_code,
  material.name_vi as material_name,
  position.base_uom_id,
  uom.symbol as base_uom_symbol,
  position.on_hand_quantity,
  position.reserved_quantity,
  position.on_hand_quantity - position.reserved_quantity as available_quantity,
  position.inventory_value,
  position.moving_average_cost,
  policy.minimum_quantity,
  policy.target_quantity,
  case
    when policy.id is null then false
    else position.on_hand_quantity - position.reserved_quantity <= policy.minimum_quantity
  end as is_low_stock,
  position.updated_at
from app_private.inventory_positions as position
join public.warehouses as warehouse on warehouse.id = position.warehouse_id
join public.materials as material on material.id = position.material_id
join public.uom_catalog as uom on uom.id = position.base_uom_id
left join public.inventory_reorder_policies as policy
  on policy.warehouse_id = position.warehouse_id
  and policy.material_id = position.material_id;

revoke all on public.inventory_stock_status from anon, authenticated;

create trigger inventory_reorder_policies_updated_at
before update on public.inventory_reorder_policies
for each row execute function app_private.touch_updated_at();
create trigger stock_reservations_updated_at
before update on public.stock_reservations
for each row execute function app_private.touch_updated_at();
create trigger warehouse_receipts_updated_at
before update on public.warehouse_receipts
for each row execute function app_private.touch_updated_at();
create trigger warehouse_issues_updated_at
before update on public.warehouse_issues
for each row execute function app_private.touch_updated_at();
create trigger stock_counts_updated_at
before update on public.stock_counts
for each row execute function app_private.touch_updated_at();

create trigger inventory_movements_no_update_or_delete
before update or delete on public.inventory_movements
for each row execute function app_private.prevent_immutable_delete();
create trigger warehouse_receipt_lines_no_update_or_delete
before update or delete on public.warehouse_receipt_lines
for each row execute function app_private.prevent_immutable_delete();
create trigger warehouse_issue_lines_no_update_or_delete
before update or delete on public.warehouse_issue_lines
for each row execute function app_private.prevent_immutable_delete();
create trigger stock_adjustments_no_update_or_delete
before update or delete on public.stock_adjustments
for each row execute function app_private.prevent_immutable_delete();
create trigger stock_adjustment_lines_no_update_or_delete
before update or delete on public.stock_adjustment_lines
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_stock_reservation_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.reservation_number is distinct from old.reservation_number
    or new.fulfillment_requirement_id is distinct from old.fulfillment_requirement_id
    or new.supply_allocation_id is distinct from old.supply_allocation_id
    or new.sales_order_line_id is distinct from old.sales_order_line_id
    or new.warehouse_id is distinct from old.warehouse_id
    or new.material_id is distinct from old.material_id
    or new.document_uom_id is distinct from old.document_uom_id
    or new.document_uom_symbol_snapshot is distinct from old.document_uom_symbol_snapshot
    or new.document_quantity is distinct from old.document_quantity
    or new.base_uom_id is distinct from old.base_uom_id
    or new.base_uom_symbol_snapshot is distinct from old.base_uom_symbol_snapshot
    or new.conversion_snapshot is distinct from old.conversion_snapshot
    or new.reserved_quantity is distinct from old.reserved_quantity
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'STOCK_RESERVATION_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;

  if old.status <> 'ACTIVE' and new.status is distinct from old.status then
    raise exception 'STOCK_RESERVATION_TERMINAL' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stock_reservations_guard_update
before update on public.stock_reservations
for each row execute function app_private.guard_stock_reservation_update();
create trigger stock_reservations_no_delete
before delete on public.stock_reservations
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_warehouse_receipt_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.receipt_number is distinct from old.receipt_number
    or new.warehouse_id is distinct from old.warehouse_id
    or new.purchase_order_id is distinct from old.purchase_order_id
    or new.supplier_id is distinct from old.supplier_id
    or new.received_at is distinct from old.received_at
    or new.evidence_id is distinct from old.evidence_id
    or new.notes is distinct from old.notes
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'WAREHOUSE_RECEIPT_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;

  if old.status <> 'DRAFT' and new.status is distinct from old.status then
    raise exception 'WAREHOUSE_RECEIPT_TERMINAL' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger warehouse_receipts_guard_update
before update on public.warehouse_receipts
for each row execute function app_private.guard_warehouse_receipt_update();
create trigger warehouse_receipts_no_delete
before delete on public.warehouse_receipts
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_warehouse_issue_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.issue_number is distinct from old.issue_number
    or new.warehouse_id is distinct from old.warehouse_id
    or new.sales_order_id is distinct from old.sales_order_id
    or new.issued_at is distinct from old.issued_at
    or new.reason is distinct from old.reason
    or new.evidence_id is distinct from old.evidence_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'WAREHOUSE_ISSUE_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;

  if old.status <> 'DRAFT' and new.status is distinct from old.status then
    raise exception 'WAREHOUSE_ISSUE_TERMINAL' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger warehouse_issues_guard_update
before update on public.warehouse_issues
for each row execute function app_private.guard_warehouse_issue_update();
create trigger warehouse_issues_no_delete
before delete on public.warehouse_issues
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_stock_count_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.count_number is distinct from old.count_number
    or new.warehouse_id is distinct from old.warehouse_id
    or new.count_reason is distinct from old.count_reason
    or new.counted_at is distinct from old.counted_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'STOCK_COUNT_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;

  if old.status = 'DRAFT' and new.status in ('DRAFT', 'COUNTED', 'CANCELLED') then
    return new;
  end if;
  if old.status = 'COUNTED' and new.status in ('COUNTED', 'ADJUSTED') then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'INVALID_STOCK_COUNT_TRANSITION' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stock_counts_guard_update
before update on public.stock_counts
for each row execute function app_private.guard_stock_count_update();
create trigger stock_counts_no_delete
before delete on public.stock_counts
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_stock_count_line_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.stock_count_id is distinct from old.stock_count_id
    or new.line_number is distinct from old.line_number
    or new.material_id is distinct from old.material_id
    or new.material_code_snapshot is distinct from old.material_code_snapshot
    or new.material_name_snapshot is distinct from old.material_name_snapshot
    or new.base_uom_id is distinct from old.base_uom_id
    or new.base_uom_symbol_snapshot is distinct from old.base_uom_symbol_snapshot
    or new.counted_quantity is distinct from old.counted_quantity
    or new.notes is distinct from old.notes
    or new.created_at is distinct from old.created_at
    or old.system_quantity is not null
  then
    raise exception 'STOCK_COUNT_LINE_IMMUTABLE' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger stock_count_lines_guard_update
before update on public.stock_count_lines
for each row execute function app_private.guard_stock_count_line_update();
create trigger stock_count_lines_no_delete
before delete on public.stock_count_lines
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.post_inventory_movement(
  p_warehouse_id uuid,
  p_material_id uuid,
  p_base_uom_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_unit_cost numeric,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_source_line_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  position app_private.inventory_positions%rowtype;
  movement_id uuid := gen_random_uuid();
  signed_quantity numeric(20, 6);
  value_delta numeric(20, 2);
  next_on_hand numeric(20, 6);
  next_value numeric(20, 2);
  next_average numeric(20, 6);
  required_permission text;
begin
  required_permission := case
    when p_movement_type = 'RECEIPT' then 'inventory.receive'
    when p_movement_type = 'ISSUE' then 'inventory.issue'
    else 'inventory.adjust'
  end;
  perform app_private.assert_actor_permission(p_actor_id, required_permission);

  if p_quantity <= 0 then
    raise exception 'INVENTORY_QUANTITY_MUST_BE_POSITIVE' using errcode = '23514';
  end if;
  if p_unit_cost < 0 then
    raise exception 'INVENTORY_UNIT_COST_INVALID' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.materials as material
    where material.id = p_material_id and material.base_uom_id = p_base_uom_id
  ) then
    raise exception 'INVENTORY_BASE_UOM_MISMATCH' using errcode = '23514';
  end if;

  insert into app_private.inventory_positions (
    warehouse_id, material_id, base_uom_id
  ) values (p_warehouse_id, p_material_id, p_base_uom_id)
  on conflict (warehouse_id, material_id) do nothing;

  select * into position
  from app_private.inventory_positions
  where warehouse_id = p_warehouse_id and material_id = p_material_id
  for update;

  if position.base_uom_id is distinct from p_base_uom_id then
    raise exception 'INVENTORY_BASE_UOM_MISMATCH' using errcode = '23514';
  end if;

  if p_movement_type in ('RECEIPT', 'ADJUSTMENT_IN') then
    signed_quantity := round(p_quantity, 6);
    value_delta := round(p_quantity * p_unit_cost, 2);
    next_on_hand := position.on_hand_quantity + signed_quantity;
    next_value := position.inventory_value + value_delta;
    next_average := case
      when next_on_hand = 0 then 0
      else round(next_value / next_on_hand, 6)
    end;
  else
    signed_quantity := -round(p_quantity, 6);
    if position.on_hand_quantity < p_quantity then
      raise exception 'INSUFFICIENT_ON_HAND_INVENTORY' using errcode = '23514';
    end if;
    value_delta := -round(p_quantity * position.moving_average_cost, 2);
    next_on_hand := position.on_hand_quantity + signed_quantity;
    next_value := greatest(0, position.inventory_value + value_delta);
    next_average := case
      when next_on_hand = 0 then 0
      else position.moving_average_cost
    end;
  end if;

  if position.reserved_quantity > next_on_hand then
    raise exception 'INVENTORY_MOVEMENT_BREACHES_RESERVATIONS' using errcode = '23514';
  end if;

  update app_private.inventory_positions set
    on_hand_quantity = next_on_hand,
    inventory_value = next_value,
    moving_average_cost = next_average,
    updated_at = now()
  where warehouse_id = p_warehouse_id and material_id = p_material_id;

  insert into public.inventory_movements (
    id, movement_number, warehouse_id, material_id, base_uom_id,
    movement_type, quantity_delta, unit_cost, inventory_value_delta,
    on_hand_after, inventory_value_after, moving_average_cost_after,
    source_entity_type, source_entity_id, source_line_id, reason,
    actor_user_id
  ) values (
    movement_id,
    'IM-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.inventory_movement_number_seq')::text, 6, '0'),
    p_warehouse_id, p_material_id, p_base_uom_id, p_movement_type,
    signed_quantity,
    case when p_movement_type in ('ISSUE', 'ADJUSTMENT_OUT')
      then position.moving_average_cost else p_unit_cost end,
    value_delta, next_on_hand, next_value, next_average,
    p_source_entity_type, p_source_entity_id, p_source_line_id,
    trim(p_reason), p_actor_id
  );

  return movement_id;
end;
$$;

create or replace function app_private.reserve_stock(
  p_supply_allocation_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allocation record;
  conversion record;
  position app_private.inventory_positions%rowtype;
  reservation_id uuid := gen_random_uuid();
  base_quantity numeric(20, 6);
  conversion_snapshot jsonb;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'inventory.reserve');

  select
    source.id, source.fulfillment_requirement_id, source.sales_order_line_id,
    source.warehouse_id, source.allocated_quantity, source.status,
    line.material_id, line.uom_id as document_uom_id,
    line.uom_symbol_snapshot as document_uom_symbol,
    material.base_uom_id, base_uom.symbol as base_uom_symbol
  into allocation
  from public.supply_allocations as source
  join public.sales_order_lines as line on line.id = source.sales_order_line_id
  join public.materials as material on material.id = line.material_id
  join public.uom_catalog as base_uom on base_uom.id = material.base_uom_id
  where source.id = p_supply_allocation_id
    and source.sourcing_mode = 'WAREHOUSE'
  for update of source;

  if not found then
    raise exception 'WAREHOUSE_ALLOCATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if allocation.status = 'CANCELLED' then
    raise exception 'SUPPLY_ALLOCATION_CANCELLED' using errcode = '23514';
  end if;

  if allocation.document_uom_id = allocation.base_uom_id then
    base_quantity := round(allocation.allocated_quantity, 6);
    conversion_snapshot := jsonb_build_object(
      'method', 'BASE_UOM_IDENTITY',
      'fromUomId', allocation.document_uom_id,
      'toUomId', allocation.base_uom_id,
      'sourceQuantity', 1,
      'targetQuantity', 1,
      'version', 1
    );
  else
    select
      conversion.id, conversion.source_quantity, conversion.target_quantity,
      conversion.method, conversion.rounding_scale, conversion.version
    into conversion
    from public.material_uom_conversions as conversion
    where conversion.material_id = allocation.material_id
      and conversion.from_uom_id = allocation.document_uom_id
      and conversion.to_uom_id = allocation.base_uom_id
      and conversion.is_current = true
      and conversion.valid_from <= current_date
      and (conversion.valid_to is null or conversion.valid_to >= current_date)
    order by conversion.version desc
    limit 1;

    if not found then
      raise exception 'RESERVATION_BASE_UOM_CONVERSION_NOT_FOUND'
        using errcode = '23514';
    end if;
    base_quantity := round(
      allocation.allocated_quantity * conversion.target_quantity /
        conversion.source_quantity,
      conversion.rounding_scale
    );
    conversion_snapshot := jsonb_build_object(
      'conversionId', conversion.id,
      'method', conversion.method,
      'fromUomId', allocation.document_uom_id,
      'toUomId', allocation.base_uom_id,
      'sourceQuantity', conversion.source_quantity,
      'targetQuantity', conversion.target_quantity,
      'roundingScale', conversion.rounding_scale,
      'version', conversion.version
    );
  end if;

  if base_quantity <= 0 then
    raise exception 'INVALID_RESERVATION_QUANTITY' using errcode = '23514';
  end if;

  insert into app_private.inventory_positions (
    warehouse_id, material_id, base_uom_id
  ) values (allocation.warehouse_id, allocation.material_id, allocation.base_uom_id)
  on conflict (warehouse_id, material_id) do nothing;

  select * into position
  from app_private.inventory_positions
  where warehouse_id = allocation.warehouse_id
    and material_id = allocation.material_id
  for update;

  if position.base_uom_id is distinct from allocation.base_uom_id then
    raise exception 'RESERVATION_BASE_UOM_MISMATCH' using errcode = '23514';
  end if;
  if position.on_hand_quantity - position.reserved_quantity < base_quantity then
    raise exception 'INSUFFICIENT_AVAILABLE_INVENTORY' using errcode = '23514';
  end if;

  update app_private.inventory_positions set
    reserved_quantity = reserved_quantity + base_quantity,
    updated_at = now()
  where warehouse_id = allocation.warehouse_id
    and material_id = allocation.material_id;

  insert into public.stock_reservations (
    id, reservation_number, fulfillment_requirement_id, supply_allocation_id,
    sales_order_line_id, warehouse_id, material_id,
    document_uom_id, document_uom_symbol_snapshot, document_quantity,
    base_uom_id, base_uom_symbol_snapshot, conversion_snapshot,
    reserved_quantity, created_by
  ) values (
    reservation_id,
    'RSV-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.stock_reservation_number_seq')::text, 5, '0'),
    allocation.fulfillment_requirement_id, allocation.id,
    allocation.sales_order_line_id, allocation.warehouse_id,
    allocation.material_id,
    allocation.document_uom_id, allocation.document_uom_symbol,
    allocation.allocated_quantity,
    allocation.base_uom_id, allocation.base_uom_symbol, conversion_snapshot,
    base_quantity, p_actor_id
  );

  return reservation_id;
end;
$$;

create or replace function app_private.release_stock_reservation(
  p_reservation_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation public.stock_reservations%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'inventory.reserve');
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'RESERVATION_RELEASE_REASON_REQUIRED' using errcode = '23514';
  end if;

  select * into reservation from public.stock_reservations
  where id = p_reservation_id for update;
  if not found then
    raise exception 'STOCK_RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if reservation.status <> 'ACTIVE' then
    raise exception 'STOCK_RESERVATION_TERMINAL' using errcode = '23514';
  end if;

  perform 1 from app_private.inventory_positions
  where warehouse_id = reservation.warehouse_id
    and material_id = reservation.material_id
  for update;

  update app_private.inventory_positions set
    reserved_quantity = reserved_quantity - reservation.reserved_quantity,
    updated_at = now()
  where warehouse_id = reservation.warehouse_id
    and material_id = reservation.material_id;

  update public.stock_reservations set
    status = 'RELEASED', release_reason = trim(p_reason)
  where id = p_reservation_id;
  return p_reservation_id;
end;
$$;

create or replace function app_private.confirm_warehouse_receipt(
  p_receipt_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  receipt public.warehouse_receipts%rowtype;
  line public.warehouse_receipt_lines%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'inventory.receive');
  select * into receipt from public.warehouse_receipts
  where id = p_receipt_id for update;
  if not found then
    raise exception 'WAREHOUSE_RECEIPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if receipt.status <> 'DRAFT' then
    raise exception 'WAREHOUSE_RECEIPT_NOT_DRAFT' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.warehouse_receipt_lines
    where warehouse_receipt_id = p_receipt_id
  ) then
    raise exception 'WAREHOUSE_RECEIPT_HAS_NO_LINES' using errcode = '23514';
  end if;
  if receipt.purchase_order_id is not null and not exists (
    select 1 from public.purchase_orders as purchase_order
    where purchase_order.id = receipt.purchase_order_id
      and purchase_order.delivery_mode = 'SUPPLIER_TO_WAREHOUSE'
      and purchase_order.warehouse_id = receipt.warehouse_id
  ) then
    raise exception 'DROPSHIP_PURCHASE_ORDER_CANNOT_ENTER_WAREHOUSE' using errcode = '23514';
  end if;

  for line in
    select * from public.warehouse_receipt_lines
    where warehouse_receipt_id = p_receipt_id order by line_number
  loop
    perform app_private.post_inventory_movement(
      receipt.warehouse_id, line.material_id, line.base_uom_id,
      'RECEIPT', line.base_quantity, line.base_unit_cost,
      'WAREHOUSE_RECEIPT', receipt.id, line.id,
      coalesce(receipt.notes, 'Xác nhận nhập kho'), p_actor_id
    );
  end loop;

  update public.warehouse_receipts set
    status = 'CONFIRMED', confirmed_by = p_actor_id, confirmed_at = now()
  where id = p_receipt_id;
  return p_receipt_id;
end;
$$;

create or replace function app_private.confirm_warehouse_issue(
  p_issue_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  issue public.warehouse_issues%rowtype;
  line public.warehouse_issue_lines%rowtype;
  reservation public.stock_reservations%rowtype;
  position app_private.inventory_positions%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'inventory.issue');
  select * into issue from public.warehouse_issues
  where id = p_issue_id for update;
  if not found then
    raise exception 'WAREHOUSE_ISSUE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if issue.status <> 'DRAFT' then
    raise exception 'WAREHOUSE_ISSUE_NOT_DRAFT' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.warehouse_issue_lines
    where warehouse_issue_id = p_issue_id
  ) then
    raise exception 'WAREHOUSE_ISSUE_HAS_NO_LINES' using errcode = '23514';
  end if;

  for line in
    select * from public.warehouse_issue_lines
    where warehouse_issue_id = p_issue_id order by line_number
  loop
    select * into position from app_private.inventory_positions
    where warehouse_id = issue.warehouse_id and material_id = line.material_id
    for update;
    if not found then
      raise exception 'INSUFFICIENT_ON_HAND_INVENTORY' using errcode = '23514';
    end if;

    if line.reservation_id is not null then
      select * into reservation from public.stock_reservations
      where id = line.reservation_id for update;
      if not found or reservation.status <> 'ACTIVE'
        or reservation.warehouse_id <> issue.warehouse_id
        or reservation.material_id <> line.material_id
        or reservation.reserved_quantity <> line.base_quantity
      then
        raise exception 'WAREHOUSE_ISSUE_RESERVATION_MISMATCH' using errcode = '23514';
      end if;
      update app_private.inventory_positions set
        reserved_quantity = reserved_quantity - reservation.reserved_quantity,
        updated_at = now()
      where warehouse_id = reservation.warehouse_id
        and material_id = reservation.material_id;
      update public.stock_reservations set
        status = 'CONSUMED', consumed_quantity = reserved_quantity
      where id = reservation.id;
    elsif position.on_hand_quantity - position.reserved_quantity < line.base_quantity then
      raise exception 'INSUFFICIENT_AVAILABLE_INVENTORY' using errcode = '23514';
    end if;

    perform app_private.post_inventory_movement(
      issue.warehouse_id, line.material_id, line.base_uom_id,
      'ISSUE', line.base_quantity, position.moving_average_cost,
      'WAREHOUSE_ISSUE', issue.id, line.id, issue.reason, p_actor_id
    );
  end loop;

  update public.warehouse_issues set
    status = 'CONFIRMED', confirmed_by = p_actor_id, confirmed_at = now()
  where id = p_issue_id;
  return p_issue_id;
end;
$$;

create or replace function app_private.capture_stock_count(
  p_stock_count_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stock_count public.stock_counts%rowtype;
  count_line public.stock_count_lines%rowtype;
  position app_private.inventory_positions%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'inventory.count');
  select * into stock_count from public.stock_counts
  where id = p_stock_count_id for update;
  if not found then
    raise exception 'STOCK_COUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if stock_count.status <> 'DRAFT' then
    raise exception 'STOCK_COUNT_NOT_DRAFT' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.stock_count_lines where stock_count_id = p_stock_count_id
  ) then
    raise exception 'STOCK_COUNT_HAS_NO_LINES' using errcode = '23514';
  end if;

  for count_line in
    select * from public.stock_count_lines
    where stock_count_id = p_stock_count_id order by line_number
  loop
    insert into app_private.inventory_positions (
      warehouse_id, material_id, base_uom_id
    ) values (stock_count.warehouse_id, count_line.material_id, count_line.base_uom_id)
    on conflict (warehouse_id, material_id) do nothing;

    select * into position from app_private.inventory_positions
    where warehouse_id = stock_count.warehouse_id
      and material_id = count_line.material_id
    for update;

    update public.stock_count_lines set
      system_quantity = position.on_hand_quantity,
      variance_quantity = count_line.counted_quantity - position.on_hand_quantity,
      moving_average_cost_snapshot = position.moving_average_cost
    where id = count_line.id;
  end loop;

  update public.stock_counts set
    status = 'COUNTED', captured_by = p_actor_id, captured_at = now()
  where id = p_stock_count_id;
  return p_stock_count_id;
end;
$$;

create or replace function app_private.approve_stock_adjustment(
  p_stock_count_id uuid,
  p_reason text,
  p_evidence_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stock_count public.stock_counts%rowtype;
  count_line public.stock_count_lines%rowtype;
  position app_private.inventory_positions%rowtype;
  adjustment_id uuid := gen_random_uuid();
  adjustment_line_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'inventory.adjust');
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'STOCK_ADJUSTMENT_REASON_REQUIRED' using errcode = '23514';
  end if;
  if not exists (select 1 from public.evidence where id = p_evidence_id) then
    raise exception 'STOCK_ADJUSTMENT_EVIDENCE_REQUIRED' using errcode = '23514';
  end if;

  select * into stock_count from public.stock_counts
  where id = p_stock_count_id for update;
  if not found then
    raise exception 'STOCK_COUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if stock_count.status <> 'COUNTED' then
    raise exception 'STOCK_COUNT_NOT_READY_FOR_ADJUSTMENT' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.stock_count_lines
    where stock_count_id = p_stock_count_id and variance_quantity <> 0
  ) then
    raise exception 'STOCK_COUNT_HAS_NO_VARIANCE' using errcode = '23514';
  end if;

  insert into public.stock_adjustments (
    id, adjustment_number, stock_count_id, warehouse_id, reason,
    evidence_id, approved_by
  ) values (
    adjustment_id,
    'ADJ-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.stock_adjustment_number_seq')::text, 5, '0'),
    stock_count.id, stock_count.warehouse_id, trim(p_reason),
    p_evidence_id, p_actor_id
  );

  for count_line in
    select * from public.stock_count_lines
    where stock_count_id = p_stock_count_id and variance_quantity <> 0
    order by line_number
  loop
    select * into position from app_private.inventory_positions
    where warehouse_id = stock_count.warehouse_id
      and material_id = count_line.material_id
    for update;
    if not found or position.on_hand_quantity <> count_line.system_quantity then
      raise exception 'STOCK_COUNT_STALE_RECOUNT_REQUIRED' using errcode = '23514';
    end if;

    adjustment_line_id := gen_random_uuid();
    insert into public.stock_adjustment_lines (
      id, stock_adjustment_id, stock_count_line_id, material_id,
      base_uom_id, variance_quantity, unit_cost_snapshot, value_delta
    ) values (
      adjustment_line_id, adjustment_id, count_line.id, count_line.material_id,
      count_line.base_uom_id, count_line.variance_quantity,
      count_line.moving_average_cost_snapshot,
      round(count_line.variance_quantity * count_line.moving_average_cost_snapshot, 2)
    );

    perform app_private.post_inventory_movement(
      stock_count.warehouse_id, count_line.material_id, count_line.base_uom_id,
      case when count_line.variance_quantity > 0
        then 'ADJUSTMENT_IN'::public.inventory_movement_type
        else 'ADJUSTMENT_OUT'::public.inventory_movement_type end,
      abs(count_line.variance_quantity), count_line.moving_average_cost_snapshot,
      'STOCK_ADJUSTMENT', adjustment_id, adjustment_line_id,
      trim(p_reason), p_actor_id
    );
  end loop;

  update public.stock_counts set status = 'ADJUSTED', adjusted_at = now()
  where id = p_stock_count_id;
  return adjustment_id;
end;
$$;

revoke all on function app_private.guard_stock_reservation_update() from public;
revoke all on function app_private.guard_warehouse_receipt_update() from public;
revoke all on function app_private.guard_warehouse_issue_update() from public;
revoke all on function app_private.guard_stock_count_update() from public;
revoke all on function app_private.guard_stock_count_line_update() from public;
revoke all on function app_private.post_inventory_movement(
  uuid, uuid, uuid, public.inventory_movement_type, numeric, numeric,
  text, uuid, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.reserve_stock(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.release_stock_reservation(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.confirm_warehouse_receipt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.confirm_warehouse_issue(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.capture_stock_count(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.approve_stock_adjustment(uuid, text, uuid, uuid)
  from public, anon, authenticated;

alter table public.inventory_reorder_policies enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.warehouse_receipts enable row level security;
alter table public.warehouse_receipt_lines enable row level security;
alter table public.warehouse_issues enable row level security;
alter table public.warehouse_issue_lines enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_lines enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on public.inventory_reorder_policies from anon, authenticated;
revoke all on public.stock_reservations from anon, authenticated;
revoke all on public.warehouse_receipts from anon, authenticated;
revoke all on public.warehouse_receipt_lines from anon, authenticated;
revoke all on public.warehouse_issues from anon, authenticated;
revoke all on public.warehouse_issue_lines from anon, authenticated;
revoke all on public.stock_counts from anon, authenticated;
revoke all on public.stock_count_lines from anon, authenticated;
revoke all on public.stock_adjustments from anon, authenticated;
revoke all on public.stock_adjustment_lines from anon, authenticated;
revoke all on public.inventory_movements from anon, authenticated;

grant select on public.inventory_reorder_policies to authenticated;
grant select on public.stock_reservations to authenticated;
grant select on public.warehouse_receipts to authenticated;
grant select on public.warehouse_receipt_lines to authenticated;
grant select on public.warehouse_issues to authenticated;
grant select on public.warehouse_issue_lines to authenticated;
grant select on public.stock_counts to authenticated;
grant select on public.stock_count_lines to authenticated;
grant select on public.stock_adjustments to authenticated;
grant select on public.stock_adjustment_lines to authenticated;
grant select on public.inventory_movements to authenticated;

create policy inventory_reorder_policies_read_authorized
on public.inventory_reorder_policies for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy stock_reservations_read_authorized
on public.stock_reservations for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy warehouse_receipts_read_authorized
on public.warehouse_receipts for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy warehouse_receipt_lines_read_authorized
on public.warehouse_receipt_lines for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy warehouse_issues_read_authorized
on public.warehouse_issues for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy warehouse_issue_lines_read_authorized
on public.warehouse_issue_lines for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy stock_counts_read_authorized
on public.stock_counts for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy stock_count_lines_read_authorized
on public.stock_count_lines for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('inventory.read'))
);
create policy stock_adjustments_read_authorized
on public.stock_adjustments for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('inventory.read'))
    or (select app_private.has_permission('audit.view'))
  )
);
create policy stock_adjustment_lines_read_authorized
on public.stock_adjustment_lines for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('inventory.read'))
    or (select app_private.has_permission('audit.view'))
  )
);
create policy inventory_movements_read_authorized
on public.inventory_movements for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('inventory.read'))
    or (select app_private.has_permission('audit.view'))
  )
);

insert into public.permissions (code, description_vi) values
  ('inventory.read', 'Xem tồn kho, giữ hàng và sổ chuyển động kho'),
  ('inventory.reserve', 'Giữ hoặc giải phóng tồn kho cho đơn bán'),
  ('inventory.receive', 'Xác nhận phiếu nhập kho'),
  ('inventory.issue', 'Xác nhận phiếu xuất kho'),
  ('inventory.count', 'Ghi nhận kiểm kê kho'),
  ('inventory.adjust', 'Duyệt điều chỉnh tồn kho từ kiểm kê'),
  ('inventory.policy.manage', 'Thiết lập ngưỡng tồn tối thiểu và mục tiêu')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'inventory.read', 'inventory.reserve', 'inventory.receive', 'inventory.issue',
  'inventory.count', 'inventory.adjust', 'inventory.policy.manage'
)
where role.code in ('OWNER_ADMIN', 'WAREHOUSE')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'inventory.read', 'inventory.reserve', 'inventory.count', 'inventory.adjust'
)
where role.code = 'SUPERVISOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'inventory.read', 'inventory.receive'
)
where role.code = 'PURCHASING_SOURCING'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'inventory.read', 'inventory.issue'
)
where role.code = 'DISPATCHER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'inventory.read', 'inventory.reserve'
)
where role.code = 'SALES'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code = 'inventory.read'
where role.code in ('FINANCE', 'AUDITOR_VIEWER')
on conflict do nothing;
