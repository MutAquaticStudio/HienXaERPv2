create sequence public.purchase_receipt_number_seq;
create sequence public.stock_count_number_seq;
create sequence public.delivery_number_seq;

create table public.evidence_objects (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  bucket_name text not null check (bucket_name in ('delivery-proofs','inventory-evidence')),
  object_path text not null check (char_length(object_path) between 3 and 500),
  audience text not null default 'INTERNAL' check (audience in ('INTERNAL','CUSTOMER')),
  upload_state text not null default 'PENDING' check (upload_state in ('PENDING','VERIFIED')),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint check (byte_size is null or byte_size > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (bucket_name, object_path),
  check ((upload_state = 'PENDING' and checksum_sha256 is null and byte_size is null and verified_at is null)
    or (upload_state = 'VERIFIED' and checksum_sha256 is not null and byte_size is not null and verified_at is not null))
);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  count_number text not null unique,
  state text not null default 'OPEN' check (state in ('OPEN','APPROVED','CANCELLED')),
  cutoff_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz
);

create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.stock_counts(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  expected_base_quantity numeric(20,6) not null,
  counted_base_quantity numeric(20,6) not null check (counted_base_quantity >= 0),
  adjustment_unit_cost_vnd numeric(20,6) check (adjustment_unit_cost_vnd is null or adjustment_unit_cost_vnd > 0),
  reason text,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (stock_count_id, material_id),
  check (counted_base_quantity = expected_base_quantity or (reason is not null and char_length(reason) >= 3))
);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  receipt_number text not null unique,
  received_at timestamptz not null,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete restrict,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  received_quantity numeric(20,6) not null check (received_quantity > 0),
  received_base_quantity numeric(20,6) not null check (received_base_quantity > 0),
  unit_cost_vnd bigint not null check (unit_cost_vnd > 0),
  inventory_value_vnd bigint not null check (inventory_value_vnd > 0),
  unit_cost_vnd_per_base numeric(20,6) not null check (unit_cost_vnd_per_base > 0),
  unique (purchase_receipt_id, purchase_order_line_id)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  delivery_number text not null unique,
  execution_state text not null default 'PLANNED' check (execution_state in ('PLANNED','ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED','VERIFIED','CANCELLED')),
  result_kind text check (result_kind is null or result_kind in ('FULL','PARTIAL','FAILED')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  customer_name_snapshot text not null,
  site_name_snapshot text not null,
  delivery_address_snapshot text not null,
  receiver_name_snapshot text,
  receiver_phone_snapshot text,
  scheduled_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table public.delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  supply_allocation_id uuid not null references public.supply_allocations(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  base_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  source_mode text not null check (source_mode in ('WAREHOUSE','SUPPLIER_DIRECT','SUPPLIER_TO_WAREHOUSE')),
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  planned_base_quantity numeric(20,6) not null check (planned_base_quantity > 0),
  conversion_numerator numeric(20,6) not null check (conversion_numerator > 0),
  conversion_denominator numeric(20,6) not null check (conversion_denominator > 0),
  unit_price_vnd bigint not null check (unit_price_vnd > 0),
  unique (delivery_id, sales_order_line_id),
  check ((source_mode = 'SUPPLIER_DIRECT' and warehouse_id is null)
    or (source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') and warehouse_id is not null))
);

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  assignment_version integer not null check (assignment_version > 0),
  employee_id uuid references public.employees(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  external_carrier_name text,
  external_carrier_phone text,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (delivery_id, assignment_version),
  check ((employee_id is not null and vehicle_id is not null and external_carrier_name is null)
    or (employee_id is null and vehicle_id is null and external_carrier_name is not null))
);
create unique index delivery_current_assignment_unique on public.delivery_assignments(delivery_id) where superseded_at is null;

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  delivery_line_id uuid unique references public.delivery_lines(id) on delete restrict,
  reserved_base_quantity numeric(20,6) not null check (reserved_base_quantity > 0),
  state text not null default 'ACTIVE' check (state in ('ACTIVE','RELEASED','CONSUMED')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table public.delivery_handoffs (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  assignment_id uuid not null references public.delivery_assignments(id) on delete restrict,
  handed_off_at timestamptz not null,
  handed_off_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.delivery_handoff_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_handoff_id uuid not null references public.delivery_handoffs(id) on delete restrict,
  delivery_line_id uuid not null unique references public.delivery_lines(id) on delete restrict,
  moved_base_quantity numeric(20,6) not null check (moved_base_quantity > 0),
  unit_cost_vnd_per_base numeric(20,6),
  inventory_value_vnd bigint,
  check ((unit_cost_vnd_per_base is null and inventory_value_vnd is null)
    or (unit_cost_vnd_per_base > 0 and inventory_value_vnd > 0))
);

create table public.delivery_results (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  result_kind text not null check (result_kind in ('FULL','PARTIAL','FAILED')),
  receiver_name text,
  note text,
  missing_arrival_reason text,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now()
);

create table public.delivery_result_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_result_id uuid not null references public.delivery_results(id) on delete restrict,
  delivery_line_id uuid not null references public.delivery_lines(id) on delete restrict,
  actual_base_quantity numeric(20,6) not null check (actual_base_quantity >= 0),
  unique (delivery_result_id, delivery_line_id)
);

create table public.delivery_verifications (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  delivery_result_id uuid not null unique references public.delivery_results(id) on delete restrict,
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now()
);

create table public.delivery_verification_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_verification_id uuid not null references public.delivery_verifications(id) on delete restrict,
  delivery_line_id uuid not null references public.delivery_lines(id) on delete restrict,
  actual_base_quantity numeric(20,6) not null check (actual_base_quantity >= 0),
  accepted_base_quantity numeric(20,6) not null check (accepted_base_quantity >= 0),
  billable_base_quantity numeric(20,6) not null check (billable_base_quantity >= 0),
  billing_variance_reason text,
  receivable_amount_vnd bigint not null check (receivable_amount_vnd >= 0),
  inventory_cost_vnd bigint check (inventory_cost_vnd is null or inventory_cost_vnd >= 0),
  inventory_unit_cost_vnd_per_base numeric(20,6),
  unique (delivery_verification_id, delivery_line_id),
  check (accepted_base_quantity <= actual_base_quantity and billable_base_quantity <= actual_base_quantity),
  check (billable_base_quantity = accepted_base_quantity or char_length(billing_variance_reason) >= 3)
);

create table public.supplier_fulfillments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  supplier_reference text,
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now()
);

create table public.supplier_fulfillment_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_fulfillment_id uuid not null references public.supplier_fulfillments(id) on delete restrict,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  supplier_quantity numeric(20,6) not null check (supplier_quantity > 0),
  supplier_base_quantity numeric(20,6) not null check (supplier_base_quantity > 0),
  payable_amount_vnd bigint not null check (payable_amount_vnd > 0),
  unique (supplier_fulfillment_id, purchase_order_line_id)
);

create table public.return_cases (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  delivery_verification_line_id uuid not null references public.delivery_verification_lines(id) on delete restrict,
  delivery_line_id uuid not null references public.delivery_lines(id) on delete restrict,
  case_kind text not null check (case_kind in ('CUSTOMER_RETURN','TRANSIT_REMAINDER','TRANSIT_LOSS')),
  base_quantity numeric(20,6) not null check (base_quantity > 0),
  reason text not null check (char_length(reason) >= 3),
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  state text not null default 'OPEN' check (state in ('OPEN','RETURNED','LOSS_APPROVED','CANCELLED')),
  resolution_warehouse_id uuid references public.warehouses(id) on delete restrict,
  resolution_reason text,
  version integer not null default 1 check (version > 0),
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  base_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  location_kind text not null check (location_kind in ('WAREHOUSE','IN_TRANSIT')),
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  delivery_id uuid references public.deliveries(id) on delete restrict,
  movement_type text not null check (movement_type in ('PURCHASE_RECEIPT','DELIVERY_HANDOFF','DELIVERY_VERIFIED','STOCK_ADJUSTMENT','RETURN_TRANSFER','CUSTOMER_RETURN','TRANSIT_LOSS')),
  base_quantity_delta numeric(20,6) not null check (base_quantity_delta <> 0),
  inventory_value_delta_vnd bigint not null check (inventory_value_delta_vnd <> 0),
  unit_cost_vnd_per_base numeric(20,6) not null check (unit_cost_vnd_per_base > 0),
  source_purchase_receipt_line_id uuid references public.purchase_receipt_lines(id) on delete restrict,
  source_delivery_handoff_line_id uuid references public.delivery_handoff_lines(id) on delete restrict,
  source_delivery_verification_line_id uuid references public.delivery_verification_lines(id) on delete restrict,
  source_stock_count_line_id uuid references public.stock_count_lines(id) on delete restrict,
  source_return_case_id uuid references public.return_cases(id) on delete restrict,
  occurred_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((location_kind = 'WAREHOUSE' and warehouse_id is not null and delivery_id is null)
    or (location_kind = 'IN_TRANSIT' and warehouse_id is null and delivery_id is not null)),
  check ((base_quantity_delta > 0 and inventory_value_delta_vnd > 0)
    or (base_quantity_delta < 0 and inventory_value_delta_vnd < 0)),
  check (num_nonnulls(source_purchase_receipt_line_id, source_delivery_handoff_line_id,
    source_delivery_verification_line_id, source_stock_count_line_id, source_return_case_id) = 1)
);
create unique index movement_receipt_line_unique on public.inventory_movements(source_purchase_receipt_line_id) where source_purchase_receipt_line_id is not null;
create unique index movement_handoff_location_unique on public.inventory_movements(source_delivery_handoff_line_id, location_kind) where source_delivery_handoff_line_id is not null;
create unique index movement_verification_line_unique on public.inventory_movements(source_delivery_verification_line_id) where source_delivery_verification_line_id is not null;
create unique index movement_count_line_unique on public.inventory_movements(source_stock_count_line_id) where source_stock_count_line_id is not null;
create unique index movement_return_location_unique on public.inventory_movements(source_return_case_id, location_kind) where source_return_case_id is not null;
create index inventory_position_idx on public.inventory_movements(branch_id, warehouse_id, material_id, occurred_at);
create index inventory_transit_idx on public.inventory_movements(delivery_id, material_id, occurred_at) where delivery_id is not null;

create table public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  delivery_verification_id uuid not null unique references public.delivery_verifications(id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table public.direct_cost_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  delivery_verification_id uuid unique references public.delivery_verifications(id) on delete restrict,
  supplier_fulfillment_id uuid unique references public.supplier_fulfillments(id) on delete restrict,
  return_case_id uuid unique references public.return_cases(id) on delete restrict,
  amount_delta_vnd bigint not null check (amount_delta_vnd <> 0),
  cost_kind text not null check (cost_kind in ('WAREHOUSE_COGS','SUPPLIER_DIRECT','LOSS','RETURN_REVERSAL')),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (num_nonnulls(delivery_verification_id, supplier_fulfillment_id, return_case_id) = 1)
);

alter table public.receivable_obligations
  alter column opening_source_id drop not null,
  add column delivery_verification_id uuid unique references public.delivery_verifications(id) on delete restrict,
  add constraint receivable_obligation_source_shape check (
    (opening_source_id is not null and delivery_verification_id is null)
    or (opening_source_id is null and delivery_verification_id is not null)
  );

alter table public.payable_obligations
  alter column opening_source_id drop not null,
  add column purchase_receipt_id uuid unique references public.purchase_receipts(id) on delete restrict,
  add column supplier_fulfillment_id uuid unique references public.supplier_fulfillments(id) on delete restrict,
  add constraint payable_obligation_source_shape check (
    (opening_source_id is not null and purchase_receipt_id is null and supplier_fulfillment_id is null)
    or (opening_source_id is null and purchase_receipt_id is not null and supplier_fulfillment_id is null)
    or (opening_source_id is null and purchase_receipt_id is null and supplier_fulfillment_id is not null)
  );

alter table public.receivable_adjustments
  add column return_case_id uuid unique references public.return_cases(id) on delete restrict;

create view public.warehouse_inventory_read with (security_barrier = true) as
with movement as (
  select branch_id, warehouse_id, material_id, base_uom_id,
    sum(base_quantity_delta) as on_hand,
    sum(inventory_value_delta_vnd) as inventory_value
  from public.inventory_movements
  where location_kind = 'WAREHOUSE'
  group by branch_id, warehouse_id, material_id, base_uom_id
), reservation as (
  select branch_id, warehouse_id, material_id, sum(reserved_base_quantity) as reserved
  from public.inventory_reservations where state = 'ACTIVE'
  group by branch_id, warehouse_id, material_id
)
select m.branch_id, m.warehouse_id, m.material_id, m.base_uom_id,
  m.on_hand::text as on_hand_base_quantity,
  coalesce(r.reserved, 0)::text as reserved_base_quantity,
  (m.on_hand - coalesce(r.reserved, 0))::text as available_base_quantity,
  case when private.has_permission(m.branch_id, 'inventory.cost.read') then m.inventory_value::bigint::text else null end as inventory_value_vnd,
  case when private.has_permission(m.branch_id, 'inventory.cost.read') and m.on_hand <> 0
    then (m.inventory_value::numeric / m.on_hand)::text else null end as average_cost_vnd_per_base
from movement m
left join reservation r on r.branch_id = m.branch_id and r.warehouse_id = m.warehouse_id and r.material_id = m.material_id
where private.has_permission(m.branch_id, 'inventory.read');

create view public.inventory_movement_read with (security_barrier = true) as
select m.id, m.branch_id, m.material_id, m.base_uom_id, m.location_kind, m.warehouse_id,
  m.delivery_id, m.movement_type, m.base_quantity_delta::text as base_quantity_delta,
  case when private.has_permission(m.branch_id, 'inventory.cost.read') then m.inventory_value_delta_vnd::text else null end as inventory_value_delta_vnd,
  case when private.has_permission(m.branch_id, 'inventory.cost.read') then m.unit_cost_vnd_per_base::text else null end as unit_cost_vnd_per_base,
  m.occurred_at
from public.inventory_movements m
where private.has_permission(m.branch_id, 'inventory.read');

create view public.stock_count_read with (security_invoker = true) as
select c.id, c.branch_id, c.warehouse_id, c.count_number, c.state, c.cutoff_at, c.version,
  count(l.id)::int as line_count,
  count(l.id) filter (where l.counted_base_quantity <> l.expected_base_quantity)::int as variance_count,
  c.created_at, c.approved_at
from public.stock_counts c left join public.stock_count_lines l on l.stock_count_id = c.id
group by c.id;

create view public.delivery_read with (security_invoker = true) as
select d.id, d.branch_id, d.sales_order_id, d.delivery_number, d.execution_state, d.result_kind,
  d.customer_id, d.site_id, d.customer_name_snapshot, d.site_name_snapshot,
  d.delivery_address_snapshot, d.receiver_name_snapshot, d.receiver_phone_snapshot,
  d.scheduled_at, d.version, a.employee_id, a.vehicle_id, a.external_carrier_name,
  d.created_at, d.verified_at
from public.deliveries d
left join public.delivery_assignments a on a.delivery_id = d.id and a.superseded_at is null;

create view public.delivery_line_read with (security_invoker = true) as
select l.id, l.delivery_id, l.sales_order_line_id, l.supply_allocation_id, l.material_id,
  s.material_name_snapshot, l.base_uom_id, u.symbol as base_uom_symbol, l.source_mode,
  l.warehouse_id, l.planned_base_quantity::text as planned_base_quantity,
  coalesce(r.actual_base_quantity, 0)::text as actual_base_quantity,
  coalesce(v.accepted_base_quantity, 0)::text as accepted_base_quantity,
  coalesce(v.billable_base_quantity, 0)::text as billable_base_quantity
from public.delivery_lines l
join public.sales_order_lines s on s.id = l.sales_order_line_id
join public.units_of_measure u on u.id = l.base_uom_id
left join public.delivery_result_lines r on r.delivery_line_id = l.id
left join public.delivery_verification_lines v on v.delivery_line_id = l.id;

create view public.purchase_receipt_read with (security_barrier = true) as
select r.id, r.branch_id, r.purchase_order_id, r.receipt_number, r.received_at,
  sum(l.received_base_quantity)::text as received_base_quantity,
  case when private.has_permission(r.branch_id, 'purchasing.price.read') then sum(l.inventory_value_vnd)::bigint::text else null end as payable_amount_vnd
from public.purchase_receipts r join public.purchase_receipt_lines l on l.purchase_receipt_id = r.id
where private.has_permission(r.branch_id, 'purchasing.read') or private.has_permission(r.branch_id, 'inventory.read')
group by r.id;

create view public.supplier_fulfillment_read with (security_barrier = true) as
select f.id, f.branch_id, f.purchase_order_id, f.supplier_reference, f.verified_at,
  sum(l.supplier_base_quantity)::text as supplier_base_quantity,
  case when private.has_permission(f.branch_id, 'purchasing.price.read') then sum(l.payable_amount_vnd)::bigint::text else null end as payable_amount_vnd
from public.supplier_fulfillments f join public.supplier_fulfillment_lines l on l.supplier_fulfillment_id = f.id
where private.has_permission(f.branch_id, 'purchasing.read') or private.has_permission(f.branch_id, 'delivery.read')
group by f.id;

create or replace function private.assert_verified_evidence(target_evidence_id uuid, target_branch_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_evidence_id is not null and not exists (
    select 1 from public.evidence_objects e where e.id = target_evidence_id
      and e.branch_id = target_branch_id and e.upload_state = 'VERIFIED'
  ) then raise exception 'evidence_not_verified' using errcode = '23514'; end if;
end
$$;
revoke all on function private.assert_verified_evidence(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_evidence_upload(
  target_branch_id uuid, bucket_name text, object_path text, audience text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare hash text; receipt public.command_receipts%rowtype; evidence_id uuid;
begin
  if not private.has_permission(target_branch_id, 'evidence.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if bucket_name not in ('delivery-proofs','inventory-evidence') or char_length(trim(object_path)) < 3 or audience not in ('INTERNAL','CUSTOMER') then raise exception 'invalid_evidence_upload' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'bucket', bucket_name, 'path', trim(object_path), 'audience', audience));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_evidence_upload.operation_id;
  if found then if receipt.command_name <> 'create_evidence_upload' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.evidence_objects(branch_id, bucket_name, object_path, audience, created_by)
  values (target_branch_id, bucket_name, trim(object_path), audience, (select auth.uid())) returning id into evidence_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_evidence_upload', hash, 'evidence_object', evidence_id, now());
  return evidence_id;
end
$$;

create or replace function public.finalize_evidence_upload(
  target_evidence_id uuid, checksum_sha256 text, byte_size bigint, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare evidence public.evidence_objects%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into evidence from public.evidence_objects where id = target_evidence_id for update;
  if evidence.id is null then raise exception 'evidence_not_found' using errcode = '23503'; end if;
  if not private.has_permission(evidence.branch_id, 'evidence.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if checksum_sha256 !~ '^[0-9a-f]{64}$' or byte_size <= 0 then raise exception 'invalid_evidence_metadata' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('evidence_id', target_evidence_id, 'checksum', checksum_sha256, 'byte_size', byte_size));
  select * into receipt from public.command_receipts where command_receipts.operation_id = finalize_evidence_upload.operation_id;
  if found then if receipt.command_name <> 'finalize_evidence_upload' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if evidence.upload_state = 'VERIFIED' and (evidence.checksum_sha256 <> checksum_sha256 or evidence.byte_size <> byte_size) then raise exception 'evidence_payload_conflict' using errcode = '23505'; end if;
  update public.evidence_objects set upload_state = 'VERIFIED', checksum_sha256 = finalize_evidence_upload.checksum_sha256,
    byte_size = finalize_evidence_upload.byte_size, verified_at = coalesce(verified_at, now()) where id = target_evidence_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'finalize_evidence_upload', hash, 'evidence_object', target_evidence_id, now());
  return target_evidence_id;
end
$$;

create or replace function private.reserve_inventory_for_line(
  target_sales_order_line_id uuid, target_delivery_line_id uuid, target_warehouse_id uuid,
  requested_base_quantity numeric, actor_auth_user_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sale_line public.sales_order_lines%rowtype; sale_order public.sales_orders%rowtype;
  on_hand numeric; reserved numeric; reservation_id uuid;
begin
  select * into sale_line from public.sales_order_lines where id = target_sales_order_line_id for update;
  select * into sale_order from public.sales_orders where id = sale_line.sales_order_id;
  perform 1 from public.warehouses where id = target_warehouse_id and branch_id = sale_order.branch_id and active for update;
  if not found or requested_base_quantity <= 0 then raise exception 'invalid_inventory_reservation' using errcode = '22023'; end if;
  select coalesce(sum(base_quantity_delta), 0) into on_hand from public.inventory_movements
    where warehouse_id = target_warehouse_id and material_id = sale_line.material_id and location_kind = 'WAREHOUSE';
  select coalesce(sum(reserved_base_quantity), 0) into reserved from public.inventory_reservations
    where warehouse_id = target_warehouse_id and material_id = sale_line.material_id and state = 'ACTIVE';
  if on_hand - reserved < requested_base_quantity then raise exception 'insufficient_available_inventory' using errcode = '23514'; end if;
  insert into public.inventory_reservations(branch_id, warehouse_id, material_id, sales_order_line_id,
    delivery_line_id, reserved_base_quantity, created_by)
  values (sale_order.branch_id, target_warehouse_id, sale_line.material_id, target_sales_order_line_id,
    target_delivery_line_id, requested_base_quantity, actor_auth_user_id) returning id into reservation_id;
  return reservation_id;
end
$$;
revoke all on function private.reserve_inventory_for_line(uuid, uuid, uuid, numeric, uuid) from public, anon, authenticated;

create or replace function public.reserve_inventory(
  target_sales_order_line_id uuid, target_warehouse_id uuid, requested_base_quantity numeric, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sale_line public.sales_order_lines%rowtype; sale_order public.sales_orders%rowtype; hash text;
  receipt public.command_receipts%rowtype; reservation_id uuid;
begin
  select * into sale_line from public.sales_order_lines where id = target_sales_order_line_id;
  select * into sale_order from public.sales_orders where id = sale_line.sales_order_id;
  if sale_order.id is null or sale_order.commercial_state <> 'CONFIRMED' or not private.has_permission(sale_order.branch_id, 'inventory.reserve') then raise exception 'forbidden_or_order_not_confirmed' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('sales_line_id', target_sales_order_line_id, 'warehouse_id', target_warehouse_id, 'quantity', requested_base_quantity));
  select * into receipt from public.command_receipts where command_receipts.operation_id = reserve_inventory.operation_id;
  if found then if receipt.command_name <> 'reserve_inventory' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  reservation_id := private.reserve_inventory_for_line(target_sales_order_line_id, null, target_warehouse_id, requested_base_quantity, (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'reserve_inventory', hash, 'inventory_reservation', reservation_id, now());
  return reservation_id;
end
$$;

create or replace function public.release_inventory_reservation(
  target_reservation_id uuid, expected_version integer, release_reason text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare reservation public.inventory_reservations%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into reservation from public.inventory_reservations where id = target_reservation_id for update;
  if reservation.id is null then raise exception 'reservation_not_found' using errcode = '23503'; end if;
  if not private.has_permission(reservation.branch_id, 'inventory.reserve') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(release_reason)) < 3 then raise exception 'release_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('reservation_id', target_reservation_id, 'version', expected_version, 'reason', trim(release_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = release_inventory_reservation.operation_id;
  if found then if receipt.command_name <> 'release_inventory_reservation' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if reservation.state <> 'ACTIVE' or reservation.version <> expected_version or reservation.delivery_line_id is not null then raise exception 'reservation_not_releasable' using errcode = '40001'; end if;
  update public.inventory_reservations set state = 'RELEASED', version = version + 1, finalized_at = now() where id = target_reservation_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'release_inventory_reservation', hash, 'inventory_reservation', target_reservation_id, now());
  return target_reservation_id;
end
$$;

create or replace function public.open_stock_count(
  target_branch_id uuid, target_warehouse_id uuid, cutoff_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare hash text; receipt public.command_receipts%rowtype; count_id uuid;
begin
  if not private.has_permission(target_branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.warehouses where id = target_warehouse_id and branch_id = target_branch_id and active for update;
  if not found or cutoff_at > now() then raise exception 'invalid_stock_count_scope' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'warehouse_id', target_warehouse_id, 'cutoff_at', cutoff_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = open_stock_count.operation_id;
  if found then if receipt.command_name <> 'open_stock_count' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.stock_counts(branch_id, warehouse_id, count_number, cutoff_at, created_by)
  values (target_branch_id, target_warehouse_id, 'SC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.stock_count_number_seq')::text, 6, '0'), cutoff_at, (select auth.uid())) returning id into count_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_stock_count', hash, 'stock_count', count_id, now());
  return count_id;
end
$$;

create or replace function public.record_stock_count_line(
  target_stock_count_id uuid, target_material_id uuid, counted_base_quantity numeric,
  adjustment_unit_cost_vnd numeric, reason text, target_evidence_id uuid,
  expected_count_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare count_row public.stock_counts%rowtype; expected numeric; hash text; receipt public.command_receipts%rowtype; line_id uuid;
begin
  select * into count_row from public.stock_counts where id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'material_id', target_material_id, 'counted', counted_base_quantity, 'cost', adjustment_unit_cost_vnd, 'reason', nullif(trim(reason), ''), 'evidence_id', target_evidence_id, 'version', expected_count_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_stock_count_line.operation_id;
  if found then if receipt.command_name <> 'record_stock_count_line' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if count_row.state <> 'OPEN' or count_row.version <> expected_count_version or counted_base_quantity < 0 then raise exception 'stock_count_version_conflict' using errcode = '40001'; end if;
  if not exists (select 1 from public.materials where id = target_material_id and active) then raise exception 'material_not_found' using errcode = '23503'; end if;
  perform private.assert_verified_evidence(target_evidence_id, count_row.branch_id);
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
  update public.stock_counts set version = version + 1 where id = target_stock_count_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_stock_count_line', hash, 'stock_count_line', line_id, now());
  return line_id;
end
$$;

create or replace function public.approve_stock_count(
  target_stock_count_id uuid, expected_count_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare count_row public.stock_counts%rowtype; line public.stock_count_lines%rowtype; delta numeric;
  current_qty numeric; current_value bigint; unit_cost numeric; value_delta bigint; hash text; receipt public.command_receipts%rowtype;
begin
  select * into count_row from public.stock_counts where id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.adjust') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'version', expected_count_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_stock_count.operation_id;
  if found then if receipt.command_name <> 'approve_stock_count' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if count_row.state <> 'OPEN' or count_row.version <> expected_count_version or not exists (select 1 from public.stock_count_lines where stock_count_id = target_stock_count_id) then raise exception 'stock_count_not_approvable' using errcode = '40001'; end if;
  perform 1 from public.warehouses where id = count_row.warehouse_id for update;
  for line in select * from public.stock_count_lines where stock_count_id = target_stock_count_id order by id loop
    delta := line.counted_base_quantity - line.expected_base_quantity;
    if delta <> 0 then
      select coalesce(sum(base_quantity_delta), 0), coalesce(sum(inventory_value_delta_vnd), 0)::bigint
        into current_qty, current_value from public.inventory_movements
        where warehouse_id = count_row.warehouse_id and material_id = line.material_id and occurred_at <= count_row.cutoff_at;
      unit_cost := coalesce(line.adjustment_unit_cost_vnd, case when current_qty > 0 then current_value::numeric / current_qty else null end);
      if unit_cost is null or unit_cost <= 0 then raise exception 'adjustment_cost_required' using errcode = '23514'; end if;
      value_delta := round(delta * unit_cost)::bigint;
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
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_stock_count', hash, 'stock_count', target_stock_count_id, now());
  return target_stock_count_id;
end
$$;

create or replace function public.receive_purchase_order(
  target_purchase_order_id uuid, receipt_lines jsonb, target_evidence_id uuid,
  received_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.create_delivery_from_allocation(
  target_supply_allocation_id uuid, planned_base_quantity numeric, scheduled_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  select coalesce(sum(l.planned_base_quantity), 0) into already_planned
  from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
  where l.supply_allocation_id = target_supply_allocation_id and d.execution_state <> 'CANCELLED';
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
$$;

create or replace function public.assign_delivery(
  target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery.operation_id;
  if found then if receipt.command_name <> 'assign_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version <> expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = '40001'; end if;
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
$$;

create or replace function public.handoff_delivery(
  target_delivery_id uuid, expected_version integer, handed_off_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  if delivery.execution_state <> 'ASSIGNED' or delivery.version <> expected_version then raise exception 'delivery_not_handoff_ready' using errcode = '40001'; end if;
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
$$;

create or replace function public.mark_delivery_arrived(
  target_delivery_id uuid, expected_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare delivery public.deliveries%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = mark_delivery_arrived.operation_id;
  if found then if receipt.command_name <> 'mark_delivery_arrived' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'DISPATCHED' or delivery.version <> expected_version then raise exception 'delivery_arrival_version_conflict' using errcode = '40001'; end if;
  update public.deliveries set execution_state = 'ARRIVED', version = version + 1 where id = target_delivery_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'mark_delivery_arrived', hash, 'delivery', target_delivery_id, now());
  return target_delivery_id;
end
$$;

create or replace function public.submit_delivery_result(
  target_delivery_id uuid, result_kind text, result_lines jsonb, receiver_name text, note text,
  missing_arrival_reason text, target_evidence_id uuid, expected_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare delivery public.deliveries%rowtype; line public.delivery_lines%rowtype; item jsonb;
  actual numeric; result_id uuid; line_count integer := 0; lower_count integer := 0; positive_count integer := 0;
  hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'kind', result_kind, 'lines', result_lines, 'receiver', nullif(trim(receiver_name), ''), 'note', nullif(trim(note), ''), 'arrival_reason', nullif(trim(missing_arrival_reason), ''), 'evidence_id', target_evidence_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = submit_delivery_result.operation_id;
  if found then if receipt.command_name <> 'submit_delivery_result' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('DISPATCHED','ARRIVED') or delivery.version <> expected_version then raise exception 'delivery_result_version_conflict' using errcode = '40001'; end if;
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
$$;

create or replace function public.verify_delivery(
  target_delivery_result_id uuid, verification_lines jsonb, expected_delivery_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result public.delivery_results%rowtype; delivery public.deliveries%rowtype; result_line public.delivery_result_lines%rowtype;
  line public.delivery_lines%rowtype; handoff_line public.delivery_handoff_lines%rowtype; item jsonb;
  accepted numeric; billable numeric; reason text; ar_amount bigint; cost_value bigint; total_ar bigint := 0; total_cost bigint := 0;
  verification_id uuid; verification_line_id uuid; commitment public.credit_commitments%rowtype;
  hash text; receipt public.command_receipts%rowtype;
begin
  select * into result from public.delivery_results where id = target_delivery_result_id;
  select * into delivery from public.deliveries where id = result.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('result_id', target_delivery_result_id, 'lines', verification_lines, 'version', expected_delivery_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_delivery.operation_id;
  if found then if receipt.command_name <> 'verify_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state <> 'RESULT_SUBMITTED' or delivery.version <> expected_delivery_version or jsonb_array_length(verification_lines) = 0 then raise exception 'delivery_verification_version_conflict' using errcode = '40001'; end if;
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
    if accepted < 0 or accepted > result_line.actual_base_quantity or billable < 0 or billable > result_line.actual_base_quantity then raise exception 'invalid_verified_quantity' using errcode = '22023'; end if;
    if billable <> accepted and (char_length(reason) < 3 or not private.has_permission(delivery.branch_id, 'delivery.billing.override')) then raise exception 'billing_variance_not_authorized' using errcode = '42501'; end if;
    ar_amount := round(billable * line.unit_price_vnd * line.conversion_denominator / line.conversion_numerator)::bigint;
    cost_value := null;
    if line.source_mode in ('WAREHOUSE','SUPPLIER_TO_WAREHOUSE') then
      select hl.* into handoff_line from public.delivery_handoff_lines hl join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
        where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
      if handoff_line.id is null or handoff_line.unit_cost_vnd_per_base is null then raise exception 'delivery_cost_basis_missing' using errcode = '23514'; end if;
      cost_value := round(accepted * handoff_line.unit_cost_vnd_per_base)::bigint;
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
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), delivery.branch_id, 'delivery.verify', 'delivery_verification', verification_id, operation_id, array['inventory','receivable','revenue','direct_cost']);
  return verification_id;
end
$$;

create or replace function public.verify_supplier_fulfillment(
  target_purchase_order_id uuid, fulfillment_lines jsonb, target_evidence_id uuid,
  supplier_reference text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.purchase_orders%rowtype; line public.purchase_order_lines%rowtype; item jsonb;
  quantity numeric; prior_quantity numeric; base_quantity numeric; amount bigint; total_amount bigint := 0;
  sales_order_id uuid; fulfillment_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'inventory.receive') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'lines', fulfillment_lines, 'evidence_id', target_evidence_id, 'supplier_reference', nullif(trim(supplier_reference), '')));
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_supplier_fulfillment.operation_id;
  if found then if receipt.command_name <> 'verify_supplier_fulfillment' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
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
$$;

create or replace function public.open_return_case(
  target_delivery_verification_line_id uuid, case_kind text, requested_base_quantity numeric,
  reason text, target_evidence_id uuid, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare verified_line public.delivery_verification_lines%rowtype; line public.delivery_lines%rowtype;
  delivery public.deliveries%rowtype; available numeric; pending numeric; case_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into verified_line from public.delivery_verification_lines where id = target_delivery_verification_line_id;
  select * into line from public.delivery_lines where id = verified_line.delivery_line_id;
  select * into delivery from public.deliveries where id = line.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.exception') then raise exception 'forbidden' using errcode = '42501'; end if;
  if case_kind not in ('CUSTOMER_RETURN','TRANSIT_REMAINDER','TRANSIT_LOSS') or requested_base_quantity <= 0 or char_length(trim(reason)) < 3 then raise exception 'invalid_return_case' using errcode = '22023'; end if;
  perform private.assert_verified_evidence(target_evidence_id, delivery.branch_id);
  hash := private.command_payload_hash(jsonb_build_object('verification_line_id', target_delivery_verification_line_id, 'kind', case_kind, 'quantity', requested_base_quantity, 'reason', trim(reason), 'evidence_id', target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = open_return_case.operation_id;
  if found then if receipt.command_name <> 'open_return_case' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if case_kind = 'CUSTOMER_RETURN' then
    available := verified_line.accepted_base_quantity;
    select coalesce(sum(rc.base_quantity), 0) into pending from public.return_cases rc where rc.delivery_verification_line_id = verified_line.id and rc.case_kind = 'CUSTOMER_RETURN' and rc.state <> 'CANCELLED';
  else
    select coalesce(sum(base_quantity_delta), 0) into available from public.inventory_movements where delivery_id = delivery.id and material_id = line.material_id and location_kind = 'IN_TRANSIT';
    select coalesce(sum(rc.base_quantity), 0) into pending from public.return_cases rc where rc.delivery_line_id = line.id and rc.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') and rc.state = 'OPEN';
  end if;
  if requested_base_quantity + pending > available then raise exception 'return_quantity_exceeds_source' using errcode = '23514'; end if;
  insert into public.return_cases(branch_id, delivery_verification_line_id, delivery_line_id, case_kind,
    base_quantity, reason, evidence_object_id, opened_by)
  values (delivery.branch_id, verified_line.id, line.id, case_kind, requested_base_quantity,
    trim(reason), target_evidence_id, (select auth.uid())) returning id into case_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_return_case', hash, 'return_case', case_id, now());
  return case_id;
end
$$;

create or replace function public.resolve_return_case(
  target_return_case_id uuid, resolution text, target_warehouse_id uuid, resolution_reason text,
  target_evidence_id uuid, expected_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  unit_cost := coalesce(verified_line.inventory_unit_cost_vnd_per_base, handoff_line.unit_cost_vnd_per_base);
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
$$;

create or replace function public.adjust_return_receivable(
  target_return_case_id uuid, credit_amount_vnd bigint, adjustment_reason text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare case_row public.return_cases%rowtype; verified_line public.delivery_verification_lines%rowtype;
  obligation public.receivable_obligations%rowtype; adjustment_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into case_row from public.return_cases where id = target_return_case_id for update;
  select * into verified_line from public.delivery_verification_lines where id = case_row.delivery_verification_line_id;
  select * into obligation from public.receivable_obligations where delivery_verification_id = verified_line.delivery_verification_id;
  if case_row.id is null or case_row.case_kind <> 'CUSTOMER_RETURN' or case_row.state <> 'RETURNED'
    or not private.has_permission(case_row.branch_id, 'finance.ar.adjust') then raise exception 'return_not_adjustable' using errcode = '42501'; end if;
  if credit_amount_vnd <= 0 or credit_amount_vnd > obligation.original_amount_vnd or char_length(trim(adjustment_reason)) < 3 then raise exception 'invalid_return_credit' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('return_case_id', target_return_case_id, 'amount', credit_amount_vnd, 'reason', trim(adjustment_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = adjust_return_receivable.operation_id;
  if found then if receipt.command_name <> 'adjust_return_receivable' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.receivable_adjustments(obligation_id, amount_delta_vnd, reason, recorded_by, return_case_id)
  values (obligation.id, -credit_amount_vnd, trim(adjustment_reason), (select auth.uid()), case_row.id) returning id into adjustment_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'adjust_return_receivable', hash, 'receivable_adjustment', adjustment_id, now());
  return adjustment_id;
end
$$;

create or replace view public.sales_order_read with (security_invoker = true) as
select o.id, o.branch_id, o.order_number, o.customer_id, o.site_id, o.quotation_revision_id,
  o.sales_owner_employee_id, o.commercial_state,
  case
    when not exists (select 1 from public.deliveries d where d.sales_order_id = o.id and d.execution_state <> 'CANCELLED') then 'NOT_STARTED'
    when coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v join public.delivery_lines dl on dl.id = v.delivery_line_id where dl.sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = o.id)), 0)
      >= coalesce((select sum(quantity * conversion_numerator / conversion_denominator) from public.sales_order_lines where sales_order_id = o.id), 0) then 'COMPLETED'
    else 'IN_PROGRESS'
  end::text as fulfillment_state,
  case when exists (select 1 from public.receivable_obligations r join public.delivery_verifications v on v.id = r.delivery_verification_id join public.deliveries d on d.id = v.delivery_id where d.sales_order_id = o.id) then 'DUE' else 'NOT_DUE' end::text as payment_state,
  o.customer_name_snapshot, o.site_name_snapshot, o.delivery_address_snapshot,
  coalesce(t.total_vnd, 0)::bigint::text as total_vnd,
  o.requested_delivery_at, o.confirmed_at, o.cancelled_at, o.created_at
from public.sales_orders o
left join (select sales_order_id, sum(line_total_vnd) as total_vnd from public.sales_order_lines group by sales_order_id) t on t.sales_order_id = o.id;

create or replace function private.reject_r6_posted_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'posted operational rows are append-only' using errcode = '55000'; end
$$;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements for each row execute function private.reject_r6_posted_mutation();
create trigger purchase_receipts_immutable before update or delete on public.purchase_receipts for each row execute function private.reject_r6_posted_mutation();
create trigger purchase_receipt_lines_immutable before update or delete on public.purchase_receipt_lines for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_lines_immutable before update or delete on public.delivery_lines for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_handoffs_immutable before update or delete on public.delivery_handoffs for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_handoff_lines_immutable before update or delete on public.delivery_handoff_lines for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_results_immutable before update or delete on public.delivery_results for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_result_lines_immutable before update or delete on public.delivery_result_lines for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_verifications_immutable before update or delete on public.delivery_verifications for each row execute function private.reject_r6_posted_mutation();
create trigger delivery_verification_lines_immutable before update or delete on public.delivery_verification_lines for each row execute function private.reject_r6_posted_mutation();
create trigger supplier_fulfillments_immutable before update or delete on public.supplier_fulfillments for each row execute function private.reject_r6_posted_mutation();
create trigger supplier_fulfillment_lines_immutable before update or delete on public.supplier_fulfillment_lines for each row execute function private.reject_r6_posted_mutation();
create trigger revenue_entries_immutable before update or delete on public.revenue_entries for each row execute function private.reject_r6_posted_mutation();
create trigger direct_cost_entries_immutable before update or delete on public.direct_cost_entries for each row execute function private.reject_r6_posted_mutation();

insert into public.permissions(code, name) values
  ('inventory.read', 'Xem tồn kho'),
  ('inventory.reserve', 'Giữ và giải phóng hàng'),
  ('inventory.receive', 'Xác nhận nhận hàng'),
  ('inventory.count', 'Ghi nhận kiểm kho'),
  ('inventory.adjust', 'Duyệt điều chỉnh kho'),
  ('inventory.cost.read', 'Xem giá trị tồn và giá vốn'),
  ('delivery.create', 'Tạo phiếu giao'),
  ('delivery.assign', 'Phân giao và thay người xe'),
  ('delivery.handoff', 'Bàn giao hàng lên xe'),
  ('delivery.submit', 'Gửi kết quả giao'),
  ('delivery.verify', 'Xác minh kết quả giao'),
  ('delivery.billing.override', 'Duyệt lượng tính tiền khác lượng nhận'),
  ('delivery.exception', 'Xử lý trả hàng và hao hụt'),
  ('evidence.manage', 'Tạo và hoàn tất bằng chứng private'),
  ('finance.ap.read', 'Xem công nợ phải trả'),
  ('finance.ar.adjust', 'Điều chỉnh phải thu theo nguồn')
on conflict (code) do nothing;

alter table public.evidence_objects enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_lines enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.delivery_handoffs enable row level security;
alter table public.delivery_handoff_lines enable row level security;
alter table public.delivery_results enable row level security;
alter table public.delivery_result_lines enable row level security;
alter table public.delivery_verifications enable row level security;
alter table public.delivery_verification_lines enable row level security;
alter table public.supplier_fulfillments enable row level security;
alter table public.supplier_fulfillment_lines enable row level security;
alter table public.return_cases enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.revenue_entries enable row level security;
alter table public.direct_cost_entries enable row level security;

create policy evidence_objects_select on public.evidence_objects for select to authenticated using ((select private.has_permission(branch_id, 'evidence.manage')) or (select private.has_permission(branch_id, 'delivery.read')));
create policy stock_counts_select on public.stock_counts for select to authenticated using ((select private.has_permission(branch_id, 'inventory.read')));
create policy stock_count_lines_select on public.stock_count_lines for select to authenticated using (exists (select 1 from public.stock_counts c where c.id = stock_count_id));
create policy purchase_receipts_select on public.purchase_receipts for select to authenticated using ((select private.has_permission(branch_id, 'purchasing.read')) or (select private.has_permission(branch_id, 'inventory.read')));
create policy purchase_receipt_lines_select on public.purchase_receipt_lines for select to authenticated using (exists (select 1 from public.purchase_receipts r where r.id = purchase_receipt_id));
create policy deliveries_select on public.deliveries for select to authenticated using ((select private.has_permission(branch_id, 'delivery.read')));
create policy delivery_lines_select on public.delivery_lines for select to authenticated using (exists (select 1 from public.deliveries d where d.id = delivery_id));
create policy delivery_assignments_select on public.delivery_assignments for select to authenticated using (exists (select 1 from public.deliveries d where d.id = delivery_id));
create policy inventory_reservations_select on public.inventory_reservations for select to authenticated using ((select private.has_permission(branch_id, 'inventory.read')) or (select private.has_permission(branch_id, 'delivery.read')));
create policy delivery_handoffs_select on public.delivery_handoffs for select to authenticated using (exists (select 1 from public.deliveries d where d.id = delivery_id));
create policy delivery_handoff_lines_select on public.delivery_handoff_lines for select to authenticated using (exists (select 1 from public.delivery_handoffs h join public.deliveries d on d.id = h.delivery_id where h.id = delivery_handoff_id));
create policy delivery_results_select on public.delivery_results for select to authenticated using (exists (select 1 from public.deliveries d where d.id = delivery_id));
create policy delivery_result_lines_select on public.delivery_result_lines for select to authenticated using (exists (select 1 from public.delivery_results r join public.deliveries d on d.id = r.delivery_id where r.id = delivery_result_id));
create policy delivery_verifications_select on public.delivery_verifications for select to authenticated using (exists (select 1 from public.deliveries d where d.id = delivery_id));
create policy delivery_verification_lines_select on public.delivery_verification_lines for select to authenticated using (exists (select 1 from public.delivery_verifications v join public.deliveries d on d.id = v.delivery_id where v.id = delivery_verification_id));
create policy supplier_fulfillments_select on public.supplier_fulfillments for select to authenticated using ((select private.has_permission(branch_id, 'purchasing.read')) or (select private.has_permission(branch_id, 'delivery.read')));
create policy supplier_fulfillment_lines_select on public.supplier_fulfillment_lines for select to authenticated using (exists (select 1 from public.supplier_fulfillments f where f.id = supplier_fulfillment_id));
create policy return_cases_select on public.return_cases for select to authenticated using ((select private.has_permission(branch_id, 'delivery.read')));
create policy inventory_movements_select on public.inventory_movements for select to authenticated using ((select private.has_permission(branch_id, 'inventory.read')));
create policy revenue_entries_select on public.revenue_entries for select to authenticated using ((select private.has_permission(branch_id, 'finance.ar.read')));
create policy direct_cost_entries_select on public.direct_cost_entries for select to authenticated using ((select private.has_permission(branch_id, 'finance.ap.read')) or (select private.has_permission(branch_id, 'inventory.cost.read')));

revoke all on table public.evidence_objects, public.stock_counts, public.stock_count_lines,
  public.purchase_receipts, public.purchase_receipt_lines, public.deliveries, public.delivery_lines,
  public.delivery_assignments, public.inventory_reservations, public.delivery_handoffs,
  public.delivery_handoff_lines, public.delivery_results, public.delivery_result_lines,
  public.delivery_verifications, public.delivery_verification_lines, public.supplier_fulfillments,
  public.supplier_fulfillment_lines, public.return_cases, public.inventory_movements,
  public.revenue_entries, public.direct_cost_entries, public.warehouse_inventory_read,
  public.inventory_movement_read, public.stock_count_read, public.delivery_read,
  public.delivery_line_read, public.purchase_receipt_read, public.supplier_fulfillment_read
  from anon, authenticated;

grant select on table public.evidence_objects, public.stock_counts, public.stock_count_lines,
  public.purchase_receipts, public.deliveries, public.delivery_lines, public.delivery_assignments,
  public.inventory_reservations, public.delivery_handoffs, public.delivery_handoff_lines,
  public.delivery_results, public.delivery_result_lines, public.delivery_verifications,
  public.delivery_verification_lines, public.supplier_fulfillments, public.return_cases,
  public.revenue_entries, public.direct_cost_entries, public.warehouse_inventory_read,
  public.inventory_movement_read, public.stock_count_read, public.delivery_read,
  public.delivery_line_read, public.purchase_receipt_read, public.supplier_fulfillment_read
  to authenticated;

revoke all on function public.create_evidence_upload(uuid, text, text, text, uuid) from public, anon;
revoke all on function public.finalize_evidence_upload(uuid, text, bigint, uuid) from public, anon;
revoke all on function public.reserve_inventory(uuid, uuid, numeric, uuid) from public, anon;
revoke all on function public.release_inventory_reservation(uuid, integer, text, uuid) from public, anon;
revoke all on function public.open_stock_count(uuid, uuid, timestamptz, uuid) from public, anon;
revoke all on function public.record_stock_count_line(uuid, uuid, numeric, numeric, text, uuid, integer, uuid) from public, anon;
revoke all on function public.approve_stock_count(uuid, integer, uuid) from public, anon;
revoke all on function public.receive_purchase_order(uuid, jsonb, uuid, timestamptz, uuid) from public, anon;
revoke all on function public.create_delivery_from_allocation(uuid, numeric, timestamptz, uuid) from public, anon;
revoke all on function public.assign_delivery(uuid, uuid, uuid, text, text, integer, uuid) from public, anon;
revoke all on function public.handoff_delivery(uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.mark_delivery_arrived(uuid, integer, uuid) from public, anon;
revoke all on function public.submit_delivery_result(uuid, text, jsonb, text, text, text, uuid, integer, uuid) from public, anon;
revoke all on function public.verify_delivery(uuid, jsonb, integer, uuid) from public, anon;
revoke all on function public.verify_supplier_fulfillment(uuid, jsonb, uuid, text, uuid) from public, anon;
revoke all on function public.open_return_case(uuid, text, numeric, text, uuid, uuid) from public, anon;
revoke all on function public.resolve_return_case(uuid, text, uuid, text, uuid, integer, uuid) from public, anon;
revoke all on function public.adjust_return_receivable(uuid, bigint, text, uuid) from public, anon;

grant execute on function public.create_evidence_upload(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.finalize_evidence_upload(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.reserve_inventory(uuid, uuid, numeric, uuid) to authenticated;
grant execute on function public.release_inventory_reservation(uuid, integer, text, uuid) to authenticated;
grant execute on function public.open_stock_count(uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.record_stock_count_line(uuid, uuid, numeric, numeric, text, uuid, integer, uuid) to authenticated;
grant execute on function public.approve_stock_count(uuid, integer, uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.create_delivery_from_allocation(uuid, numeric, timestamptz, uuid) to authenticated;
grant execute on function public.assign_delivery(uuid, uuid, uuid, text, text, integer, uuid) to authenticated;
grant execute on function public.handoff_delivery(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.mark_delivery_arrived(uuid, integer, uuid) to authenticated;
grant execute on function public.submit_delivery_result(uuid, text, jsonb, text, text, text, uuid, integer, uuid) to authenticated;
grant execute on function public.verify_delivery(uuid, jsonb, integer, uuid) to authenticated;
grant execute on function public.verify_supplier_fulfillment(uuid, jsonb, uuid, text, uuid) to authenticated;
grant execute on function public.open_return_case(uuid, text, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.resolve_return_case(uuid, text, uuid, text, uuid, integer, uuid) to authenticated;
grant execute on function public.adjust_return_receivable(uuid, bigint, text, uuid) to authenticated;

-- R6 cancellation safety: downstream inventory/delivery/accounting facts make
-- confirmed commercial documents non-cancellable. These triggers also protect
-- callers that bypass the command functions.
create or replace function private.guard_sales_order_cancellation_with_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.commercial_state = 'CANCELLED'
     and old.commercial_state <> 'CANCELLED'
     and exists (
       select 1
       from public.deliveries d
       where d.sales_order_id = old.id
     ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Sales order with delivery history cannot be cancelled';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sales_order_cancellation_with_delivery() from public;

drop trigger if exists sales_order_delivery_cancellation_guard on public.sales_orders;
create trigger sales_order_delivery_cancellation_guard
before update of commercial_state on public.sales_orders
for each row execute function private.guard_sales_order_cancellation_with_delivery();

create or replace function private.guard_purchase_order_cancellation_with_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.state = 'CANCELLED'
     and old.state <> 'CANCELLED'
     and (
       exists (
         select 1
         from public.purchase_receipts pr
         where pr.purchase_order_id = old.id
       )
       or exists (
         select 1
         from public.supplier_fulfillments sf
         where sf.purchase_order_id = old.id
       )
     ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Purchase order with receipt or supplier fulfillment history cannot be cancelled';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_purchase_order_cancellation_with_fulfillment() from public;

drop trigger if exists purchase_order_fulfillment_cancellation_guard on public.purchase_orders;
create trigger purchase_order_fulfillment_cancellation_guard
before update of state on public.purchase_orders
for each row execute function private.guard_purchase_order_cancellation_with_fulfillment();

-- Supabase Storage is absent from the PGlite phase-gate runtime. Provision the
-- private buckets and policies only when the hosted Storage schema is present.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $storage$
      insert into storage.buckets (id, name, public)
      values
        ('delivery-proofs', 'delivery-proofs', false),
        ('inventory-evidence', 'inventory-evidence', false)
      on conflict (id) do update set public = false
    $storage$;
  end if;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'r6_evidence_insert'
    ) then
      execute $policy$
        create policy r6_evidence_insert on storage.objects
        for insert to authenticated
        with check (
          bucket_id in ('delivery-proofs', 'inventory-evidence')
          and private.has_any_permission('evidence.manage')
        )
      $policy$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'r6_evidence_select'
    ) then
      execute $policy$
        create policy r6_evidence_select on storage.objects
        for select to authenticated
        using (
          bucket_id in ('delivery-proofs', 'inventory-evidence')
          and private.has_any_permission('evidence.manage')
        )
      $policy$;
    end if;
  end if;
end;
$$;

-- Hosted Storage integrity: metadata cannot become VERIFIED until the referenced
-- private object exists. The condition is skipped only in isolated runtimes that
-- intentionally do not provide the Supabase Storage schema.
create or replace function private.guard_evidence_storage_finalization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  object_exists boolean;
begin
  if new.upload_state = 'VERIFIED'
     and old.upload_state <> 'VERIFIED'
     and to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = $1 and name = $2)'
      into object_exists
      using new.bucket_name, new.object_path;
    if not object_exists then
      raise exception using
        errcode = 'foreign_key_violation',
        message = 'Evidence storage object does not exist';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_evidence_storage_finalization() from public, anon, authenticated;

drop trigger if exists evidence_storage_finalization_guard on public.evidence_objects;
create trigger evidence_storage_finalization_guard
before update of upload_state on public.evidence_objects
for each row execute function private.guard_evidence_storage_finalization();
