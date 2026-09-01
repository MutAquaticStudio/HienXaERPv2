-- HIỀN XA ERP remediation before P10.
-- This migration is additive/backward-compatible with the deployed P8/P9 app.
-- It makes ExpenseAllocation operable, keeps currency ledgers coherent, blocks
-- late changes to finalized profitability, and attributes dimension revenue.

alter table public.expense_allocations
  add column created_by uuid references public.user_profiles(user_id) on delete restrict,
  add column reason text,
  add column direct_cost_category public.direct_cost_category;

alter table public.expense_allocations
  add constraint expense_allocation_reason_check
    check (reason is null or char_length(trim(reason)) between 10 and 500) not valid,
  add constraint expense_allocation_reference_shape
    check (
      (allocation_dimension = 'GENERAL' and allocation_reference_id is null)
      or (allocation_dimension <> 'GENERAL' and allocation_reference_id is not null)
    ) not valid,
  add constraint expense_allocation_direct_cost_shape
    check (
      (allocation_dimension = 'ORDER' and direct_cost_category is not null)
      or (allocation_dimension <> 'ORDER' and direct_cost_category is null)
    ) not valid;

create unique index profitability_cost_expense_allocation_unique
  on public.profitability_cost_entries(expense_allocation_id)
  where expense_allocation_id is not null;

create or replace function app_private.allocate_expense(
  p_expense_id uuid,
  p_allocation_dimension text,
  p_allocation_reference_id uuid,
  p_allocation_percent numeric,
  p_direct_cost_category public.direct_cost_category,
  p_reason text,
  p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  expense public.expenses%rowtype;
  allocated_percent numeric(7, 4);
  allocated_amount numeric(20, 2);
  allocation_amount numeric(20, 2);
  allocation_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'expense.manage');
  select * into expense from public.expenses where id = p_expense_id for update;
  if not found or expense.status <> 'DRAFT' then
    raise exception 'DRAFT_EXPENSE_REQUIRED' using errcode = '23514';
  end if;
  if p_allocation_dimension not in ('ORDER', 'CUSTOMER', 'VEHICLE', 'SERVICE_JOB', 'GENERAL') then
    raise exception 'EXPENSE_ALLOCATION_DIMENSION_INVALID' using errcode = '22000';
  end if;
  if (p_allocation_dimension = 'GENERAL' and p_allocation_reference_id is not null)
    or (p_allocation_dimension <> 'GENERAL' and p_allocation_reference_id is null) then
    raise exception 'EXPENSE_ALLOCATION_REFERENCE_INVALID' using errcode = '22000';
  end if;
  if (p_allocation_dimension = 'ORDER' and p_direct_cost_category is null)
    or (p_allocation_dimension <> 'ORDER' and p_direct_cost_category is not null) then
    raise exception 'ORDER_DIRECT_COST_CATEGORY_REQUIRED' using errcode = '22000';
  end if;
  if p_allocation_dimension = 'ORDER' and not exists (
    select 1 from public.sales_orders where id = p_allocation_reference_id and status <> 'CANCELLED'
  ) then raise exception 'ACTIVE_SALES_ORDER_REQUIRED' using errcode = '23514'; end if;
  if p_allocation_dimension = 'CUSTOMER' and not exists (
    select 1 from public.customers where id = p_allocation_reference_id and is_active
  ) then raise exception 'ACTIVE_CUSTOMER_REQUIRED' using errcode = '23514'; end if;
  if p_allocation_dimension = 'VEHICLE' and not exists (
    select 1 from public.vehicles where id = p_allocation_reference_id and is_active
  ) then raise exception 'ACTIVE_VEHICLE_REQUIRED' using errcode = '23514'; end if;
  if p_allocation_percent <= 0 or p_allocation_percent > 100 then
    raise exception 'EXPENSE_ALLOCATION_PERCENT_INVALID' using errcode = '22000';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'EXPENSE_ALLOCATION_REASON_REQUIRED' using errcode = '22000';
  end if;

  select coalesce(sum(allocation_percent), 0), coalesce(sum(amount), 0)
    into allocated_percent, allocated_amount
  from public.expense_allocations where expense_id = expense.id;
  allocation_amount := round(expense.amount * p_allocation_percent / 100, 2);
  if allocation_amount <= 0
    or allocated_percent + p_allocation_percent > 100
    or allocated_amount + allocation_amount > expense.amount then
    raise exception 'EXPENSE_ALLOCATION_EXCEEDS_EXPENSE' using errcode = '23514';
  end if;

  insert into public.expense_allocations (
    expense_id, allocation_dimension, allocation_reference_id,
    allocation_percent, amount, direct_cost_category, reason, created_by
  ) values (
    expense.id, p_allocation_dimension, p_allocation_reference_id,
    p_allocation_percent, allocation_amount, p_direct_cost_category,
    trim(p_reason), p_actor_id
  ) returning id into allocation_id;
  return allocation_id;
end;
$$;

create or replace function app_private.require_matching_financial_account_currency()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.financial_accounts account
    where account.id = new.financial_account_id and account.currency = new.currency
  ) then
    raise exception 'FINANCIAL_ACCOUNT_CURRENCY_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger expenses_account_currency_guard
before insert or update of financial_account_id, currency on public.expenses
for each row execute function app_private.require_matching_financial_account_currency();
create trigger financial_movements_account_currency_guard
before insert or update of financial_account_id, currency on public.financial_movements
for each row execute function app_private.require_matching_financial_account_currency();
create trigger bank_transactions_account_currency_guard
before insert or update of financial_account_id, currency on public.bank_transactions
for each row execute function app_private.require_matching_financial_account_currency();

create or replace function app_private.create_expense(
  p_account_id uuid, p_expense_date date, p_category text, p_description text,
  p_currency text, p_amount numeric, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare expense_id uuid;
  normalized_currency text := upper(trim(p_currency));
begin
  perform app_private.assert_actor_permission(p_actor_id, 'expense.manage');
  if not exists (
    select 1 from public.financial_accounts
    where id = p_account_id and is_active and currency = normalized_currency
  ) then
    raise exception 'ACTIVE_ACCOUNT_WITH_MATCHING_CURRENCY_REQUIRED' using errcode = '23514';
  end if;
  insert into public.expenses (
    expense_number, financial_account_id, expense_date, category,
    description, currency, amount, created_by
  ) values (
    'EXP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.expense_number_seq')::text, 6, '0'),
    p_account_id, p_expense_date, trim(p_category), trim(p_description),
    normalized_currency, p_amount, p_actor_id
  ) returning id into expense_id;
  return expense_id;
end;
$$;

create or replace function app_private.record_bank_transaction(
  p_account_id uuid, p_external_id text, p_transaction_date date,
  p_amount numeric, p_currency text, p_description text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare transaction_id uuid;
  normalized_currency text := upper(trim(p_currency));
begin
  perform app_private.assert_actor_permission(p_actor_id, 'reconciliation.manage');
  if not exists (
    select 1 from public.financial_accounts
    where id = p_account_id and account_type = 'BANK' and is_active
      and currency = normalized_currency
  ) then
    raise exception 'ACTIVE_BANK_ACCOUNT_WITH_MATCHING_CURRENCY_REQUIRED' using errcode = '23514';
  end if;
  insert into public.bank_transactions (
    financial_account_id, external_transaction_id, transaction_date,
    amount, currency, description, imported_by
  ) values (
    p_account_id, trim(p_external_id), p_transaction_date, p_amount,
    normalized_currency, trim(p_description), p_actor_id
  ) returning id into transaction_id;
  return transaction_id;
end;
$$;

create table public.profitability_revenue_allocations (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  dimension text not null check (dimension in ('MATERIAL', 'SUPPLIER', 'VEHICLE', 'SERVICE')),
  dimension_id uuid not null,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  source_entity_type text not null check (
    source_entity_type in ('DELIVERY_ACTUAL', 'MANUAL_SERVICE_REVENUE')
  ),
  source_entity_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (dimension, source_entity_type, source_entity_id)
);
create index profitability_revenue_allocations_order_idx
  on public.profitability_revenue_allocations(sales_order_id, dimension, dimension_id);

create or replace function app_private.refresh_order_profitability(
  p_sales_order_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.order_profitability%rowtype;
  actual_revenue_amount numeric(20, 2);
  quoted_cost_amount numeric(20, 2);
  committed_cost_amount numeric(20, 2);
  actual_cost_amount numeric(20, 2);
begin
  select * into target from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if not found then
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
  if target.lifecycle = 'FINALIZED' and (
    actual_revenue_amount is distinct from target.actual_revenue
    or quoted_cost_amount is distinct from target.quoted_direct_cost
    or committed_cost_amount is distinct from target.committed_direct_cost
    or actual_cost_amount is distinct from target.actual_direct_cost
  ) then
    raise exception 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN' using errcode = '23514';
  end if;
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
  where id = target.id;
  return target.id;
end;
$$;

create or replace function app_private.capture_actual_profitability_for_delivery(
  p_delivery_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_delivery public.deliveries%rowtype;
  target_profitability public.order_profitability%rowtype;
begin
  select * into target_delivery from public.deliveries where id = p_delivery_id;
  if not found or target_delivery.status not in ('CONFIRMED', 'PARTIAL') then
    raise exception 'CONFIRMED_DELIVERY_REQUIRED' using errcode = '23514';
  end if;
  select * into target_profitability from public.order_profitability
    where sales_order_id = target_delivery.sales_order_id for update;
  if not found then
    perform app_private.initialize_order_profitability(target_delivery.sales_order_id, p_actor_id);
    select * into target_profitability from public.order_profitability
      where sales_order_id = target_delivery.sales_order_id for update;
  end if;
  if target_profitability.lifecycle = 'FINALIZED' then
    raise exception 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN' using errcode = '23514';
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

  insert into public.profitability_revenue_allocations (
    sales_order_id, dimension, dimension_id, amount, currency,
    source_entity_type, source_entity_id, reason, created_by
  )
  select target_delivery.sales_order_id, 'MATERIAL', line.material_id,
    round(actual.accepted_quantity * sales_line.unit_price, 2), sales_line.currency,
    'DELIVERY_ACTUAL', actual.id, 'Doanh thu thực tế theo vật liệu đã nghiệm thu', p_actor_id
  from public.delivery_lines line
  join public.delivery_actuals actual on actual.delivery_line_id = line.id
  join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
  where line.delivery_id = target_delivery.id and actual.accepted_quantity > 0
  on conflict (dimension, source_entity_type, source_entity_id) do nothing;

  insert into public.profitability_revenue_allocations (
    sales_order_id, dimension, dimension_id, amount, currency,
    source_entity_type, source_entity_id, reason, created_by
  )
  select target_delivery.sales_order_id, 'SUPPLIER', allocation.supplier_id,
    round(actual.accepted_quantity * sales_line.unit_price, 2), sales_line.currency,
    'DELIVERY_ACTUAL', actual.id, 'Doanh thu thực tế theo nguồn nhà cung cấp', p_actor_id
  from public.delivery_lines line
  join public.delivery_actuals actual on actual.delivery_line_id = line.id
  join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
  join public.supply_allocations allocation on allocation.id = line.supply_allocation_id
  where line.delivery_id = target_delivery.id and allocation.supplier_id is not null
    and actual.accepted_quantity > 0
  on conflict (dimension, source_entity_type, source_entity_id) do nothing;

  insert into public.profitability_revenue_allocations (
    sales_order_id, dimension, dimension_id, amount, currency,
    source_entity_type, source_entity_id, reason, created_by
  )
  select target_delivery.sales_order_id, 'VEHICLE', assignment.vehicle_id,
    round(actual.accepted_quantity * sales_line.unit_price, 2), sales_line.currency,
    'DELIVERY_ACTUAL', actual.id, 'Doanh thu thực tế theo phương tiện giao hàng', p_actor_id
  from public.delivery_lines line
  join public.delivery_actuals actual on actual.delivery_line_id = line.id
  join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
  join lateral (
    select delivery_assignment.vehicle_id
    from public.delivery_assignments delivery_assignment
    where delivery_assignment.delivery_id = line.delivery_id
    order by delivery_assignment.assigned_at desc, delivery_assignment.id desc limit 1
  ) assignment on true
  where line.delivery_id = target_delivery.id and actual.accepted_quantity > 0
  on conflict (dimension, source_entity_type, source_entity_id) do nothing;

  perform app_private.refresh_order_profitability(target_delivery.sales_order_id);
  return target_profitability.id;
end;
$$;

create or replace function app_private.record_profitability_revenue_allocation(
  p_sales_order_id uuid, p_service_reference_id uuid, p_amount numeric,
  p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.order_profitability%rowtype;
  allocated numeric(20, 2);
  allocation_id uuid := gen_random_uuid();
begin
  perform app_private.assert_actor_permission(p_actor_id, 'profitability.manage');
  select * into target from public.order_profitability
    where sales_order_id = p_sales_order_id for update;
  if not found then raise exception 'ORDER_PROFITABILITY_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.lifecycle = 'FINALIZED' then
    raise exception 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN' using errcode = '23514';
  end if;
  if target.actual_revenue <= 0 then
    raise exception 'ACTUAL_REVENUE_REQUIRED' using errcode = '23514';
  end if;
  if p_service_reference_id is null or p_amount <= 0
    or char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'VALID_SERVICE_REVENUE_ALLOCATION_REQUIRED' using errcode = '22000';
  end if;
  select coalesce(sum(amount), 0) into allocated
  from public.profitability_revenue_allocations
  where sales_order_id = p_sales_order_id and dimension = 'SERVICE';
  if allocated + p_amount > target.actual_revenue then
    raise exception 'SERVICE_REVENUE_ALLOCATION_EXCEEDS_ACTUAL' using errcode = '23514';
  end if;
  insert into public.profitability_revenue_allocations (
    id, sales_order_id, dimension, dimension_id, amount, currency,
    source_entity_type, source_entity_id, reason, created_by
  ) values (
    allocation_id, target.sales_order_id, 'SERVICE', p_service_reference_id,
    p_amount, target.currency, 'MANUAL_SERVICE_REVENUE', allocation_id,
    trim(p_reason), p_actor_id
  );
  return allocation_id;
end;
$$;

create or replace function app_private.post_expense(
  p_expense_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare expense public.expenses%rowtype;
  allocation public.expense_allocations%rowtype;
  profitability public.order_profitability%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'expense.manage');
  perform set_config('app.finance_internal_write', 'on', true);
  select * into expense from public.expenses where id = p_expense_id for update;
  if not found or expense.status <> 'DRAFT' then
    raise exception 'DRAFT_EXPENSE_REQUIRED' using errcode = '23514';
  end if;
  insert into public.financial_movements (
    financial_account_id, movement_type, amount, currency, expense_id,
    description, occurred_at, created_by
  ) values (
    expense.financial_account_id, 'EXPENSE', expense.amount, expense.currency,
    expense.id, expense.description, expense.expense_date::timestamptz, p_actor_id
  );
  for allocation in select * from public.expense_allocations
    where expense_id = expense.id and allocation_dimension = 'ORDER'
      and direct_cost_category is not null order by created_at, id
  loop
    select * into profitability from public.order_profitability
      where sales_order_id = allocation.allocation_reference_id for update;
    if not found then
      perform app_private.initialize_order_profitability(allocation.allocation_reference_id, p_actor_id);
      select * into profitability from public.order_profitability
        where sales_order_id = allocation.allocation_reference_id for update;
    end if;
    if profitability.lifecycle = 'FINALIZED' then
      raise exception 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN' using errcode = '23514';
    end if;
    insert into public.profitability_cost_entries (
      sales_order_id, basis, category, amount, currency, expense_allocation_id,
      source_entity_type, source_entity_id, reason, occurred_at, created_by
    ) values (
      profitability.sales_order_id, 'ACTUAL', allocation.direct_cost_category,
      allocation.amount, expense.currency, allocation.id,
      'EXPENSE_ALLOCATION', allocation.id, allocation.reason,
      expense.expense_date::timestamptz, p_actor_id
    ) on conflict (expense_allocation_id) where expense_allocation_id is not null do nothing;
    perform app_private.refresh_order_profitability(profitability.sales_order_id);
  end loop;
  update public.expenses set status = 'POSTED', posted_by = p_actor_id, posted_at = now()
    where id = expense.id;
  return expense.id;
end;
$$;

-- Attribute existing confirmed delivery revenue before making this ledger immutable.
insert into public.profitability_revenue_allocations (
  sales_order_id, dimension, dimension_id, amount, currency,
  source_entity_type, source_entity_id, reason, created_by
)
select delivery.sales_order_id, 'MATERIAL', line.material_id,
  round(actual.accepted_quantity * sales_line.unit_price, 2), sales_line.currency,
  'DELIVERY_ACTUAL', actual.id, 'Doanh thu thực tế theo vật liệu đã nghiệm thu', actual.recorded_by
from public.deliveries delivery
join public.delivery_lines line on line.delivery_id = delivery.id
join public.delivery_actuals actual on actual.delivery_line_id = line.id
join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
where delivery.status in ('CONFIRMED', 'PARTIAL') and actual.accepted_quantity > 0
on conflict (dimension, source_entity_type, source_entity_id) do nothing;

insert into public.profitability_revenue_allocations (
  sales_order_id, dimension, dimension_id, amount, currency,
  source_entity_type, source_entity_id, reason, created_by
)
select delivery.sales_order_id, 'SUPPLIER', allocation.supplier_id,
  round(actual.accepted_quantity * sales_line.unit_price, 2), sales_line.currency,
  'DELIVERY_ACTUAL', actual.id, 'Doanh thu thực tế theo nguồn nhà cung cấp', actual.recorded_by
from public.deliveries delivery
join public.delivery_lines line on line.delivery_id = delivery.id
join public.delivery_actuals actual on actual.delivery_line_id = line.id
join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
join public.supply_allocations allocation on allocation.id = line.supply_allocation_id
where delivery.status in ('CONFIRMED', 'PARTIAL') and allocation.supplier_id is not null
  and actual.accepted_quantity > 0
on conflict (dimension, source_entity_type, source_entity_id) do nothing;

insert into public.profitability_revenue_allocations (
  sales_order_id, dimension, dimension_id, amount, currency,
  source_entity_type, source_entity_id, reason, created_by
)
select delivery.sales_order_id, 'VEHICLE', assignment.vehicle_id,
  round(actual.accepted_quantity * sales_line.unit_price, 2), sales_line.currency,
  'DELIVERY_ACTUAL', actual.id, 'Doanh thu thực tế theo phương tiện giao hàng', actual.recorded_by
from public.deliveries delivery
join public.delivery_lines line on line.delivery_id = delivery.id
join public.delivery_actuals actual on actual.delivery_line_id = line.id
join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
join lateral (
  select delivery_assignment.vehicle_id
  from public.delivery_assignments delivery_assignment
  where delivery_assignment.delivery_id = delivery.id
  order by delivery_assignment.assigned_at desc, delivery_assignment.id desc limit 1
) assignment on true
where delivery.status in ('CONFIRMED', 'PARTIAL') and actual.accepted_quantity > 0
on conflict (dimension, source_entity_type, source_entity_id) do nothing;

create trigger profitability_revenue_allocations_immutable
before update or delete on public.profitability_revenue_allocations
for each row execute function app_private.reject_profitability_history_mutation();

create or replace view public.profitability_direct_cost_waterfall
with (security_invoker = true) as
select cost.category, cost.basis, sum(cost.amount)::numeric(20,2) as amount, cost.currency
from public.profitability_cost_entries cost
group by cost.category, cost.basis, cost.currency;

create or replace view public.profitability_dimension_summary
with (security_invoker = true) as
with revenue as (
  select allocation.dimension, allocation.dimension_id, allocation.currency,
    sum(allocation.amount)::numeric(20,2) as amount
  from public.profitability_revenue_allocations allocation
  group by allocation.dimension, allocation.dimension_id, allocation.currency
), cost as (
  select 'MATERIAL'::text as dimension, material_id as dimension_id, currency,
    sum(amount)::numeric(20,2) as amount
  from public.profitability_cost_entries
  where basis = 'ACTUAL' and material_id is not null group by material_id, currency
  union all
  select 'SUPPLIER', supplier_id, currency, sum(amount)::numeric(20,2)
  from public.profitability_cost_entries
  where basis = 'ACTUAL' and supplier_id is not null group by supplier_id, currency
  union all
  select 'VEHICLE', vehicle_id, currency, sum(amount)::numeric(20,2)
  from public.profitability_cost_entries
  where basis = 'ACTUAL' and vehicle_id is not null group by vehicle_id, currency
  union all
  select 'SERVICE', service_reference_id, currency, sum(amount)::numeric(20,2)
  from public.profitability_cost_entries
  where basis = 'ACTUAL' and service_reference_id is not null
  group by service_reference_id, currency
), dimension_values as (
  select coalesce(revenue.dimension, cost.dimension) as dimension,
    coalesce(revenue.dimension_id, cost.dimension_id) as dimension_id,
    coalesce(revenue.currency, cost.currency) as currency,
    coalesce(revenue.amount, 0)::numeric(20,2) as revenue,
    coalesce(cost.amount, 0)::numeric(20,2) as direct_cost
  from revenue full join cost
    on cost.dimension = revenue.dimension and cost.dimension_id = revenue.dimension_id
      and cost.currency = revenue.currency
)
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
select value.dimension, value.dimension_id,
  case value.dimension
    when 'MATERIAL' then material.name_vi
    when 'SUPPLIER' then supplier.name_vi
    when 'VEHICLE' then vehicle.plate_number
    else 'Dịch vụ ' || left(value.dimension_id::text, 8)
  end,
  value.currency, value.revenue, value.direct_cost,
  (value.revenue - value.direct_cost)::numeric(20,2)
from dimension_values value
left join public.materials material
  on value.dimension = 'MATERIAL' and material.id = value.dimension_id
left join public.suppliers supplier
  on value.dimension = 'SUPPLIER' and supplier.id = value.dimension_id
left join public.vehicles vehicle
  on value.dimension = 'VEHICLE' and vehicle.id = value.dimension_id;

create or replace view public.finance_working_capital_summary
with (security_invoker = true) as
with currencies as (
  select currency from public.receivables union select currency from public.payables
  union select currency from public.financial_movements
  union select currency from public.customer_advances
  union select currency from public.supplier_advances
  union select 'VND'::text
), receivable_totals as (
  select currency,
    sum(outstanding_amount) filter (where status in ('OPEN', 'PARTIALLY_SETTLED')) as receivables,
    sum(outstanding_amount) filter (
      where status in ('OPEN', 'PARTIALLY_SETTLED') and due_date < current_date
    ) as overdue_receivables
  from public.receivables group by currency
), payable_totals as (
  select currency,
    sum(outstanding_amount) filter (where status in ('OPEN', 'PARTIALLY_SETTLED')) as payables,
    sum(outstanding_amount) filter (
      where status in ('OPEN', 'PARTIALLY_SETTLED') and due_date < current_date
    ) as overdue_payables
  from public.payables group by currency
), cash_totals as (
  select movement.currency, sum(case
    when movement.reversal_of_id is null
      and movement.movement_type in ('RECEIPT', 'TRANSFER_IN') then movement.amount
    when movement.reversal_of_id is null then -movement.amount
    when original.movement_type in ('RECEIPT', 'TRANSFER_IN') then -movement.amount
    else movement.amount end) as cash_balance
  from public.financial_movements movement
  left join public.financial_movements original on original.id = movement.reversal_of_id
  group by movement.currency
), customer_advance_totals as (
  select currency, sum(remaining_amount) as amount from public.customer_advances
  where status in ('OPEN', 'PARTIALLY_APPLIED') group by currency
), supplier_advance_totals as (
  select currency, sum(remaining_amount) as amount from public.supplier_advances
  where status in ('OPEN', 'PARTIALLY_APPLIED') group by currency
)
select current_date as as_of_date,
  coalesce(receivable.receivables, 0)::numeric(20,2) as receivables,
  coalesce(receivable.overdue_receivables, 0)::numeric(20,2) as overdue_receivables,
  coalesce(payable.payables, 0)::numeric(20,2) as payables,
  coalesce(payable.overdue_payables, 0)::numeric(20,2) as overdue_payables,
  coalesce(cash.cash_balance, 0)::numeric(20,2) as cash_balance,
  coalesce(customer_advance.amount, 0)::numeric(20,2) as customer_advances,
  coalesce(supplier_advance.amount, 0)::numeric(20,2) as supplier_advances,
  currencies.currency
from currencies
left join receivable_totals receivable using (currency)
left join payable_totals payable using (currency)
left join cash_totals cash using (currency)
left join customer_advance_totals customer_advance using (currency)
left join supplier_advance_totals supplier_advance using (currency);

create or replace view public.profitability_command_center
with (security_invoker = true) as
with currencies as (
  select currency from public.profitability_order_summary
  union select currency from public.finance_working_capital_summary
), order_totals as (
  select currency,
    sum(case when actual_revenue > 0 then actual_revenue else committed_revenue end) as revenue,
    sum(case when actual_revenue > 0 then actual_contribution_profit
      else committed_contribution_profit end) as contribution_profit,
    count(*) filter (where lifecycle = 'ESTIMATED')::integer as estimated_count,
    count(*) filter (where lifecycle = 'ACTUAL_OPEN')::integer as actual_open_count,
    count(*) filter (where lifecycle = 'FINALIZED')::integer as finalized_count
  from public.profitability_order_summary group by currency
)
select current_date as as_of_date,
  coalesce(orders.revenue, 0)::numeric(20,2) as revenue,
  coalesce(orders.contribution_profit, 0)::numeric(20,2) as contribution_profit,
  round(100 * coalesce(orders.contribution_profit, 0)
    / nullif(coalesce(orders.revenue, 0), 0), 2) as actual_margin_percent,
  coalesce(working.receivables, 0)::numeric(20,2) as receivables,
  coalesce(working.payables, 0)::numeric(20,2) as payables,
  coalesce(working.cash_balance, 0)::numeric(20,2) as cash_balance,
  coalesce(working.cash_balance + working.receivables - working.payables, 0)::numeric(20,2)
    as working_capital,
  coalesce(orders.estimated_count, 0)::integer as estimated_count,
  coalesce(orders.actual_open_count, 0)::integer as actual_open_count,
  coalesce(orders.finalized_count, 0)::integer as finalized_count,
  currencies.currency
from currencies
left join order_totals orders using (currency)
left join public.finance_working_capital_summary working using (currency);

alter table public.profitability_revenue_allocations enable row level security;
revoke all on public.profitability_revenue_allocations from anon, authenticated;
grant select on public.profitability_revenue_allocations to authenticated;
create policy profitability_revenue_allocations_margin_read
on public.profitability_revenue_allocations for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('margin.read'))
);

revoke all on function app_private.allocate_expense(
  uuid, text, uuid, numeric, public.direct_cost_category, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.require_matching_financial_account_currency() from public;
revoke all on function app_private.record_profitability_revenue_allocation(
  uuid, uuid, numeric, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.refresh_order_profitability(uuid) from public, anon, authenticated;
revoke all on function app_private.capture_actual_profitability_for_delivery(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.post_expense(uuid, uuid) from public, anon, authenticated;
