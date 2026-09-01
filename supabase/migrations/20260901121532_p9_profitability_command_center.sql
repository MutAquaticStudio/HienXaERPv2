-- HIỀN XA ERP P9 — profitability and executive command center.
-- Contribution profit includes direct costs only. General overhead is never
-- assigned to an order by this phase.

create type public.profitability_lifecycle as enum (
  'ESTIMATED', 'ACTUAL_OPEN', 'FINALIZED'
);
create type public.profitability_basis as enum ('QUOTED', 'COMMITTED', 'ACTUAL');
create type public.direct_cost_category as enum (
  'MATERIAL', 'TRANSPORT', 'LOADING', 'FUEL',
  'DIRECT_LABOR', 'OTHER_DIRECT'
);

create table public.order_profitability (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null unique references public.sales_orders(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  lifecycle public.profitability_lifecycle not null default 'ESTIMATED',
  quoted_revenue numeric(20, 2) not null default 0 check (quoted_revenue >= 0),
  committed_revenue numeric(20, 2) not null default 0 check (committed_revenue >= 0),
  actual_revenue numeric(20, 2) not null default 0 check (actual_revenue >= 0),
  quoted_direct_cost numeric(20, 2) not null default 0 check (quoted_direct_cost >= 0),
  committed_direct_cost numeric(20, 2) not null default 0 check (committed_direct_cost >= 0),
  actual_direct_cost numeric(20, 2) not null default 0 check (actual_direct_cost >= 0),
  quoted_contribution_profit numeric(20, 2)
    generated always as (quoted_revenue - quoted_direct_cost) stored,
  committed_contribution_profit numeric(20, 2)
    generated always as (committed_revenue - committed_direct_cost) stored,
  actual_contribution_profit numeric(20, 2)
    generated always as (actual_revenue - actual_direct_cost) stored,
  version integer not null default 1 check (version > 0),
  finalized_by uuid references public.user_profiles(user_id) on delete restrict,
  finalized_at timestamptz,
  reopened_by uuid references public.user_profiles(user_id) on delete restrict,
  reopened_at timestamptz,
  reopen_reason text check (
    reopen_reason is null or char_length(trim(reopen_reason)) between 10 and 500
  ),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profitability_lifecycle_shape check (
    (lifecycle in ('ESTIMATED', 'ACTUAL_OPEN') and finalized_at is null and finalized_by is null)
    or (lifecycle = 'FINALIZED' and finalized_at is not null and finalized_by is not null)
  ),
  constraint profitability_reopen_shape check (
    (reopened_at is null and reopened_by is null and reopen_reason is null)
    or (reopened_at is not null and reopened_by is not null and reopen_reason is not null)
  )
);
create index order_profitability_lifecycle_idx
  on public.order_profitability(lifecycle, updated_at desc);

create table public.profitability_cost_entries (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  basis public.profitability_basis not null,
  category public.direct_cost_category not null,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  material_id uuid references public.materials(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  service_reference_id uuid,
  expense_allocation_id uuid references public.expense_allocations(id) on delete restrict,
  source_entity_type text not null check (
    source_entity_type in (
      'SALES_ORDER_LINE', 'PURCHASE_ORDER_LINE', 'DELIVERY_ACTUAL',
      'INVENTORY_MOVEMENT', 'EXPENSE_ALLOCATION', 'MANUAL_DIRECT_COST'
    )
  ),
  source_entity_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  occurred_at timestamptz not null,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (basis, category, source_entity_type, source_entity_id)
);
create index profitability_cost_entries_order_idx
  on public.profitability_cost_entries(sales_order_id, basis, category, occurred_at);
create index profitability_cost_entries_supplier_idx
  on public.profitability_cost_entries(supplier_id, basis)
  where supplier_id is not null;
create index profitability_cost_entries_vehicle_idx
  on public.profitability_cost_entries(vehicle_id, basis)
  where vehicle_id is not null;
create index profitability_cost_entries_material_idx
  on public.profitability_cost_entries(material_id, basis)
  where material_id is not null;

create table public.profitability_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  order_profitability_id uuid not null references public.order_profitability(id) on delete restrict,
  from_lifecycle public.profitability_lifecycle,
  to_lifecycle public.profitability_lifecycle not null,
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now(),
  check (from_lifecycle is null or from_lifecycle <> to_lifecycle)
);
create index profitability_lifecycle_events_order_idx
  on public.profitability_lifecycle_events(order_profitability_id, occurred_at desc);

create or replace function app_private.require_profitability_internal_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('app.profitability_internal_write', true) is distinct from 'on' then
    raise exception 'PROFITABILITY_WRITE_REQUIRES_COMMAND' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function app_private.reject_profitability_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'PROFITABILITY_HISTORY_IS_IMMUTABLE' using errcode = '42501';
end;
$$;

create trigger order_profitability_command_update
before update or delete on public.order_profitability
for each row execute function app_private.require_profitability_internal_write();
create trigger profitability_cost_entries_immutable
before update or delete on public.profitability_cost_entries
for each row execute function app_private.reject_profitability_history_mutation();
create trigger profitability_lifecycle_events_immutable
before update or delete on public.profitability_lifecycle_events
for each row execute function app_private.reject_profitability_history_mutation();

create or replace function app_private.refresh_order_profitability(
  p_sales_order_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare profitability_id uuid;
  actual_revenue_amount numeric(20, 2);
  quoted_cost_amount numeric(20, 2);
  committed_cost_amount numeric(20, 2);
  actual_cost_amount numeric(20, 2);
begin
  select id into profitability_id from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if profitability_id is null then
    raise exception 'ORDER_PROFITABILITY_NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(sum(original_amount), 0) into actual_revenue_amount
    from public.receivables
    where sales_order_id = p_sales_order_id and status <> 'REVERSED';
  select
    coalesce(sum(amount) filter (where basis = 'QUOTED'), 0),
    coalesce(sum(amount) filter (where basis = 'COMMITTED'), 0),
    coalesce(sum(amount) filter (where basis = 'ACTUAL'), 0)
    into quoted_cost_amount, committed_cost_amount, actual_cost_amount
    from public.profitability_cost_entries where sales_order_id = p_sales_order_id;
  perform set_config('app.profitability_internal_write', 'on', true);
  update public.order_profitability set
    actual_revenue = actual_revenue_amount,
    quoted_direct_cost = quoted_cost_amount,
    committed_direct_cost = committed_cost_amount,
    actual_direct_cost = actual_cost_amount,
    lifecycle = case
      when lifecycle = 'FINALIZED' then lifecycle
      when actual_revenue_amount > 0 or actual_cost_amount > 0 then 'ACTUAL_OPEN'::public.profitability_lifecycle
      else 'ESTIMATED'::public.profitability_lifecycle end,
    version = version + 1,
    updated_at = now()
  where id = profitability_id;
  return profitability_id;
end;
$$;

create or replace function app_private.initialize_order_profitability(
  p_sales_order_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_order public.sales_orders%rowtype;
  profitability_id uuid;
begin
  select * into target_order from public.sales_orders where id = p_sales_order_id;
  if not found or target_order.status = 'CANCELLED' then
    raise exception 'ACTIVE_SALES_ORDER_REQUIRED' using errcode = '23514';
  end if;
  perform set_config('app.profitability_internal_write', 'on', true);
  insert into public.order_profitability (
    sales_order_id, currency, quoted_revenue, committed_revenue, created_by
  )
  select target_order.id, target_order.currency,
    coalesce(sum(line.ordered_quantity * line.reference_unit_price), 0),
    coalesce(sum(line.line_amount), 0), p_actor_id
  from public.sales_order_lines line where line.sales_order_id = target_order.id
  on conflict (sales_order_id) do update set
    quoted_revenue = excluded.quoted_revenue,
    committed_revenue = excluded.committed_revenue
  returning id into profitability_id;

  insert into public.profitability_cost_entries (
    sales_order_id, basis, category, amount, currency, material_id, supplier_id,
    source_entity_type, source_entity_id, reason, occurred_at, created_by
  )
  select line.sales_order_id, 'QUOTED', 'MATERIAL',
    round(line.ordered_quantity * price.unit_cost, 2), line.currency,
    line.material_id, price.supplier_id, 'SALES_ORDER_LINE', line.id,
    'Giá vật liệu tham chiếu tại thời điểm ước tính', target_order.created_at, p_actor_id
  from public.sales_order_lines line
  join lateral (
    select supplier_price.unit_cost, supplier_price.supplier_id
    from public.supplier_price_history supplier_price
    where supplier_price.material_id = line.material_id
      and supplier_price.uom_id = line.uom_id
      and supplier_price.currency = line.currency
      and supplier_price.valid_from <= target_order.created_at::date
      and (supplier_price.valid_to is null or supplier_price.valid_to >= target_order.created_at::date)
    order by supplier_price.valid_from desc, supplier_price.version desc limit 1
  ) price on true
  where line.sales_order_id = target_order.id
  on conflict (basis, category, source_entity_type, source_entity_id) do nothing;

  insert into public.profitability_cost_entries (
    sales_order_id, basis, category, amount, currency, material_id, supplier_id,
    source_entity_type, source_entity_id, reason, occurred_at, created_by
  )
  select sales_line.sales_order_id, 'COMMITTED', 'MATERIAL', purchase_line.line_amount,
    purchase_line.currency, purchase_line.material_id, purchase_order.supplier_id,
    'PURCHASE_ORDER_LINE', purchase_line.id,
    'Chi phí vật liệu đã cam kết theo đơn mua', purchase_order.created_at, p_actor_id
  from public.purchase_order_lines purchase_line
  join public.sales_order_lines sales_line on sales_line.id = purchase_line.sales_order_line_id
  join public.purchase_orders purchase_order on purchase_order.id = purchase_line.purchase_order_id
  where sales_line.sales_order_id = target_order.id and purchase_order.status <> 'CANCELLED'
  on conflict (basis, category, source_entity_type, source_entity_id) do nothing;

  perform app_private.refresh_order_profitability(target_order.id);
  return profitability_id;
end;
$$;

create or replace function app_private.capture_actual_profitability_for_delivery(
  p_delivery_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_delivery public.deliveries%rowtype;
  profitability_id uuid;
begin
  select * into target_delivery from public.deliveries where id = p_delivery_id;
  if not found or target_delivery.status not in ('CONFIRMED', 'PARTIAL') then
    raise exception 'CONFIRMED_DELIVERY_REQUIRED' using errcode = '23514';
  end if;
  select id into profitability_id from public.order_profitability
    where sales_order_id = target_delivery.sales_order_id;
  if profitability_id is null then
    profitability_id := app_private.initialize_order_profitability(
      target_delivery.sales_order_id, p_actor_id
    );
  end if;

  insert into public.profitability_cost_entries (
    sales_order_id, basis, category, amount, currency, material_id, supplier_id,
    source_entity_type, source_entity_id, reason, occurred_at, created_by
  )
  select target_delivery.sales_order_id, 'ACTUAL', 'MATERIAL',
    round(actual.accepted_quantity * purchase_line.unit_cost, 2), purchase_line.currency,
    line.material_id, purchase_order.supplier_id, 'DELIVERY_ACTUAL', actual.id,
    'Chi phí vật liệu thực tế theo lượng khách chấp nhận', actual.received_at, p_actor_id
  from public.delivery_lines line
  join public.delivery_actuals actual on actual.delivery_line_id = line.id
  join public.supply_allocations allocation on allocation.id = line.supply_allocation_id
  join public.purchase_order_lines purchase_line on purchase_line.id = allocation.purchase_order_line_id
  join public.purchase_orders purchase_order on purchase_order.id = purchase_line.purchase_order_id
  where line.delivery_id = target_delivery.id
  on conflict (basis, category, source_entity_type, source_entity_id) do nothing;

  insert into public.profitability_cost_entries (
    sales_order_id, basis, category, amount, currency, material_id,
    source_entity_type, source_entity_id, reason, occurred_at, created_by
  )
  select target_delivery.sales_order_id, 'ACTUAL', 'MATERIAL',
    abs(movement.inventory_value_delta), sales_order.currency,
    issue_line.material_id, 'INVENTORY_MOVEMENT', movement.id,
    'Giá vốn vật liệu xuất kho theo sổ chuyển động', movement.occurred_at, p_actor_id
  from public.inventory_movements movement
  join public.warehouse_issue_lines issue_line on issue_line.id = movement.source_line_id
  join public.warehouse_issues issue on issue.id = issue_line.warehouse_issue_id
  join public.sales_orders sales_order on sales_order.id = issue.sales_order_id
  where issue.sales_order_id = target_delivery.sales_order_id
    and movement.movement_type = 'ISSUE'
    and movement.inventory_value_delta < 0
  on conflict (basis, category, source_entity_type, source_entity_id) do nothing;

  perform app_private.refresh_order_profitability(target_delivery.sales_order_id);
  return profitability_id;
end;
$$;

create or replace function app_private.on_delivery_completed_capture_profitability()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.event_type = 'DELIVERY_COMPLETED' then
    perform app_private.capture_actual_profitability_for_delivery(
      new.delivery_id, new.created_by
    );
  end if;
  return new;
end;
$$;
-- Runs after the P8 finance-recognition trigger so actual revenue is available.
create trigger zz_delivery_completed_capture_profitability
after insert on public.delivery_readiness_events
for each row execute function app_private.on_delivery_completed_capture_profitability();

create or replace function app_private.record_profitability_direct_cost(
  p_sales_order_id uuid, p_basis public.profitability_basis,
  p_category public.direct_cost_category, p_amount numeric,
  p_material_id uuid, p_supplier_id uuid, p_vehicle_id uuid,
  p_service_reference_id uuid, p_expense_allocation_id uuid,
  p_reason text, p_occurred_at timestamptz, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.order_profitability%rowtype;
  entry_id uuid := gen_random_uuid();
begin
  perform app_private.assert_actor_permission(p_actor_id, 'profitability.manage');
  select * into target from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if not found then raise exception 'ORDER_PROFITABILITY_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.lifecycle = 'FINALIZED' then
    raise exception 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN' using errcode = '23514';
  end if;
  if p_amount <= 0 or char_length(trim(p_reason)) < 10 then
    raise exception 'VALID_DIRECT_COST_REQUIRED' using errcode = '22000';
  end if;
  if p_expense_allocation_id is not null and not exists (
    select 1
    from public.expense_allocations allocation
    join public.expenses expense on expense.id = allocation.expense_id
    where allocation.id = p_expense_allocation_id
      and allocation.allocation_dimension = 'ORDER'
      and allocation.allocation_reference_id = p_sales_order_id
      and allocation.amount = p_amount
      and expense.status = 'POSTED'
      and expense.currency = target.currency
  ) then
    raise exception 'POSTED_ORDER_EXPENSE_ALLOCATION_REQUIRED' using errcode = '23514';
  end if;
  insert into public.profitability_cost_entries (
    id, sales_order_id, basis, category, amount, currency, material_id, supplier_id,
    vehicle_id, service_reference_id, expense_allocation_id,
    source_entity_type, source_entity_id, reason, occurred_at, created_by
  ) values (
    entry_id, target.sales_order_id, p_basis, p_category, p_amount, target.currency,
    p_material_id, p_supplier_id, p_vehicle_id, p_service_reference_id,
    p_expense_allocation_id, 'MANUAL_DIRECT_COST', entry_id, trim(p_reason),
    p_occurred_at, p_actor_id
  );
  perform app_private.refresh_order_profitability(target.sales_order_id);
  return entry_id;
end;
$$;

create or replace function app_private.finalize_order_profitability(
  p_sales_order_id uuid, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.order_profitability%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'profitability.manage');
  if char_length(trim(p_reason)) < 10 then
    raise exception 'FINALIZATION_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into target from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if not found or target.lifecycle <> 'ACTUAL_OPEN' or target.actual_revenue <= 0 then
    raise exception 'ACTUAL_OPEN_PROFITABILITY_REQUIRED' using errcode = '23514';
  end if;
  perform set_config('app.profitability_internal_write', 'on', true);
  update public.order_profitability set lifecycle = 'FINALIZED', finalized_by = p_actor_id,
    finalized_at = now(), version = version + 1, updated_at = now()
    where id = target.id;
  insert into public.profitability_lifecycle_events (
    order_profitability_id, from_lifecycle, to_lifecycle, reason, actor_user_id
  ) values (target.id, target.lifecycle, 'FINALIZED', trim(p_reason), p_actor_id);
  return target.id;
end;
$$;

create or replace function app_private.reopen_order_profitability(
  p_sales_order_id uuid, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.order_profitability%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'profitability.manage');
  if char_length(trim(p_reason)) < 10 then
    raise exception 'REOPEN_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into target from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if not found or target.lifecycle <> 'FINALIZED' then
    raise exception 'FINALIZED_PROFITABILITY_REQUIRED' using errcode = '23514';
  end if;
  perform set_config('app.profitability_internal_write', 'on', true);
  update public.order_profitability set lifecycle = 'ACTUAL_OPEN', finalized_by = null,
    finalized_at = null, reopened_by = p_actor_id, reopened_at = now(),
    reopen_reason = trim(p_reason), version = version + 1, updated_at = now()
    where id = target.id;
  insert into public.profitability_lifecycle_events (
    order_profitability_id, from_lifecycle, to_lifecycle, reason, actor_user_id
  ) values (target.id, target.lifecycle, 'ACTUAL_OPEN', trim(p_reason), p_actor_id);
  return target.id;
end;
$$;

create view public.profitability_order_summary with (security_invoker = true) as
select profitability.id, profitability.sales_order_id, sales_order.sales_order_number,
  sales_order.customer_id, customer.name_vi as customer_name,
  profitability.currency, profitability.lifecycle,
  profitability.quoted_revenue, profitability.committed_revenue,
  profitability.actual_revenue, profitability.quoted_direct_cost,
  profitability.committed_direct_cost, profitability.actual_direct_cost,
  profitability.quoted_contribution_profit, profitability.committed_contribution_profit,
  profitability.actual_contribution_profit,
  round(100 * profitability.quoted_contribution_profit /
    nullif(profitability.quoted_revenue, 0), 2) as quoted_margin_percent,
  round(100 * profitability.committed_contribution_profit /
    nullif(profitability.committed_revenue, 0), 2) as committed_margin_percent,
  round(100 * profitability.actual_contribution_profit /
    nullif(profitability.actual_revenue, 0), 2) as actual_margin_percent,
  round(100 * profitability.actual_contribution_profit /
    nullif(profitability.actual_revenue, 0), 2)
    - round(100 * profitability.quoted_contribution_profit /
      nullif(profitability.quoted_revenue, 0), 2) as margin_variance_points,
  coalesce((
    select material.name_vi from public.profitability_cost_entries cost
    join public.materials material on material.id = cost.material_id
    where cost.sales_order_id = profitability.sales_order_id
    group by material.id order by sum(cost.amount) desc limit 1
  ), 'Chưa xác định') as primary_material,
  coalesce((
    select supplier.name_vi from public.profitability_cost_entries cost
    join public.suppliers supplier on supplier.id = cost.supplier_id
    where cost.sales_order_id = profitability.sales_order_id
    group by supplier.id order by sum(cost.amount) desc limit 1
  ), 'Chưa xác định') as primary_supplier,
  coalesce((
    select vehicle.plate_number from public.delivery_assignments assignment
    join public.deliveries delivery on delivery.id = assignment.delivery_id
    join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
    where delivery.sales_order_id = profitability.sales_order_id
    order by assignment.assigned_at desc limit 1
  ), '—') as vehicle_plate,
  profitability.updated_at
from public.order_profitability profitability
join public.sales_orders sales_order on sales_order.id = profitability.sales_order_id
join public.customers customer on customer.id = sales_order.customer_id;

create view public.profitability_direct_cost_waterfall with (security_invoker = true) as
select cost.category, cost.basis, sum(cost.amount)::numeric(20,2) as amount
from public.profitability_cost_entries cost
group by cost.category, cost.basis;

create view public.profitability_dimension_summary with (security_invoker = true) as
select 'ORDER'::text as dimension, sales_order_id as dimension_id,
  sales_order_number as dimension_name, currency,
  sum(case when actual_revenue > 0 then actual_revenue else committed_revenue end)::numeric(20,2)
    as revenue,
  sum(case when actual_revenue > 0 then actual_direct_cost else committed_direct_cost end)::numeric(20,2)
    as direct_cost,
  sum(case when actual_revenue > 0 then actual_contribution_profit
    else committed_contribution_profit end)::numeric(20,2) as contribution_profit
from public.profitability_order_summary
group by sales_order_id, sales_order_number, currency
union all
select 'CUSTOMER', customer_id, customer_name, currency,
  sum(case when actual_revenue > 0 then actual_revenue else committed_revenue end),
  sum(case when actual_revenue > 0 then actual_direct_cost else committed_direct_cost end),
  sum(case when actual_revenue > 0 then actual_contribution_profit
    else committed_contribution_profit end)
from public.profitability_order_summary
group by customer_id, customer_name, currency
union all
select 'MATERIAL', cost.material_id, material.name_vi, cost.currency,
  0::numeric(20,2), sum(cost.amount)::numeric(20,2),
  (-sum(cost.amount))::numeric(20,2)
from public.profitability_cost_entries cost
join public.materials material on material.id = cost.material_id
where cost.basis = 'ACTUAL'
group by cost.material_id, material.name_vi, cost.currency
union all
select 'SUPPLIER', cost.supplier_id, supplier.name_vi, cost.currency,
  0::numeric(20,2), sum(cost.amount)::numeric(20,2),
  (-sum(cost.amount))::numeric(20,2)
from public.profitability_cost_entries cost
join public.suppliers supplier on supplier.id = cost.supplier_id
where cost.basis = 'ACTUAL'
group by cost.supplier_id, supplier.name_vi, cost.currency
union all
select 'VEHICLE', cost.vehicle_id, vehicle.plate_number, cost.currency,
  0::numeric(20,2), sum(cost.amount)::numeric(20,2),
  (-sum(cost.amount))::numeric(20,2)
from public.profitability_cost_entries cost
join public.vehicles vehicle on vehicle.id = cost.vehicle_id
where cost.basis = 'ACTUAL'
group by cost.vehicle_id, vehicle.plate_number, cost.currency
union all
select 'SERVICE', cost.service_reference_id, 'Dịch vụ ' || left(cost.service_reference_id::text, 8),
  cost.currency, 0::numeric(20,2), sum(cost.amount)::numeric(20,2),
  (-sum(cost.amount))::numeric(20,2)
from public.profitability_cost_entries cost
where cost.basis = 'ACTUAL' and cost.service_reference_id is not null
group by cost.service_reference_id, cost.currency;

create view public.profitability_command_center with (security_invoker = true) as
select current_date as as_of_date,
  coalesce(sum(case when order_summary.actual_revenue > 0
    then order_summary.actual_revenue else order_summary.committed_revenue end), 0)::numeric(20,2)
    as revenue,
  coalesce(sum(case when order_summary.actual_revenue > 0
    then order_summary.actual_contribution_profit
    else order_summary.committed_contribution_profit end), 0)::numeric(20,2)
    as contribution_profit,
  round(100 * coalesce(sum(case when order_summary.actual_revenue > 0
    then order_summary.actual_contribution_profit
    else order_summary.committed_contribution_profit end), 0)
    / nullif(coalesce(sum(case when order_summary.actual_revenue > 0
      then order_summary.actual_revenue else order_summary.committed_revenue end), 0), 0), 2)
    as actual_margin_percent,
  coalesce(max(working.receivables), 0)::numeric(20,2) as receivables,
  coalesce(max(working.payables), 0)::numeric(20,2) as payables,
  coalesce(max(working.cash_balance), 0)::numeric(20,2) as cash_balance,
  coalesce(max(working.cash_balance + working.receivables - working.payables), 0)::numeric(20,2)
    as working_capital,
  count(*) filter (where order_summary.lifecycle = 'ESTIMATED')::integer as estimated_count,
  count(*) filter (where order_summary.lifecycle = 'ACTUAL_OPEN')::integer as actual_open_count,
  count(*) filter (where order_summary.lifecycle = 'FINALIZED')::integer as finalized_count
from public.profitability_order_summary order_summary
cross join public.finance_working_capital_summary working;

alter table public.order_profitability enable row level security;
alter table public.profitability_cost_entries enable row level security;
alter table public.profitability_lifecycle_events enable row level security;
revoke all on public.order_profitability, public.profitability_cost_entries,
  public.profitability_lifecycle_events from anon, authenticated;
grant select on public.order_profitability, public.profitability_cost_entries,
  public.profitability_lifecycle_events to authenticated;
revoke all on public.profitability_order_summary,
  public.profitability_direct_cost_waterfall,
  public.profitability_dimension_summary,
  public.profitability_command_center from anon, authenticated;
grant select on public.profitability_order_summary,
  public.profitability_direct_cost_waterfall,
  public.profitability_dimension_summary,
  public.profitability_command_center to authenticated;

create policy order_profitability_margin_read on public.order_profitability
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('margin.read'))
);
create policy profitability_cost_entries_margin_read on public.profitability_cost_entries
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('margin.read'))
);
create policy profitability_lifecycle_events_margin_read on public.profitability_lifecycle_events
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('margin.read'))
);

revoke all on function app_private.require_profitability_internal_write() from public;
revoke all on function app_private.reject_profitability_history_mutation() from public;
revoke all on function app_private.refresh_order_profitability(uuid) from public, anon, authenticated;
revoke all on function app_private.initialize_order_profitability(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.capture_actual_profitability_for_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.on_delivery_completed_capture_profitability() from public;
revoke all on function app_private.record_profitability_direct_cost(uuid, public.profitability_basis, public.direct_cost_category, numeric, uuid, uuid, uuid, uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function app_private.finalize_order_profitability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.reopen_order_profitability(uuid, text, uuid) from public, anon, authenticated;

insert into public.permissions (code, description_vi) values
  ('profitability.manage', 'Ghi chi phí trực tiếp và chốt hoặc mở lại lợi nhuận')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
cross join public.permissions permission
where role.code in ('OWNER_ADMIN', 'FINANCE')
  and permission.code in (
    'margin.read', 'profitability.manage', 'sales_order.read', 'customer.read',
    'supplier.read', 'inventory.read', 'delivery.read', 'finance.read', 'master_data.read'
  )
on conflict do nothing;

-- Backfill existing orders and their immutable direct-cost evidence.
select app_private.initialize_order_profitability(sales_order.id, sales_order.created_by)
from public.sales_orders sales_order
where sales_order.status <> 'CANCELLED';

select app_private.capture_actual_profitability_for_delivery(
  delivery.id, coalesce(delivery.confirmed_by, delivery.created_by)
)
from public.deliveries delivery
where delivery.status in ('CONFIRMED', 'PARTIAL');
