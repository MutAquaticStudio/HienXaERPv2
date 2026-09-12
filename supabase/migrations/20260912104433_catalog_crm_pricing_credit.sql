create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{1,20}$'),
  name text not null check (char_length(name) between 1 and 80),
  symbol text not null check (char_length(symbol) between 1 and 16),
  decimal_scale smallint not null default 3 check (decimal_scale between 0 and 6),
  active boolean not null default true
);

create table public.material_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (char_length(name) between 2 and 120),
  active boolean not null default true
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.material_groups(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,32}$'),
  name text not null check (char_length(name) between 2 and 160),
  base_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  specification text,
  sale_enabled boolean not null default true,
  purchase_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (sale_enabled or purchase_enabled)
);

create table public.material_uom_conversions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.materials(id) on delete restrict,
  from_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  to_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  numerator numeric(20,6) not null check (numerator > 0),
  denominator numeric(20,6) not null check (denominator > 0),
  conversion_type text not null check (conversion_type in ('EXACT','PACKAGING','ESTIMATED','MEASURED','VEHICLE_LOAD')),
  settlement_allowed boolean not null default true,
  rounding_scale smallint not null default 6 check (rounding_scale between 0 and 6),
  rounding_mode text not null default 'HALF_UP' check (rounding_mode in ('HALF_UP','DOWN')),
  source_note text,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  check (from_uom_id <> to_uom_id),
  check (effective_to is null or effective_to > effective_from),
  check (conversion_type <> 'VEHICLE_LOAD' or settlement_allowed = false),
  check (conversion_type not in ('ESTIMATED','MEASURED') or source_note is not null)
);

create unique index material_uom_conversion_version
  on public.material_uom_conversions(
    coalesce(material_id, '00000000-0000-0000-0000-000000000000'::uuid),
    from_uom_id, to_uom_id, effective_from
  );

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null check (char_length(name) between 2 and 120),
  address_text text,
  active boolean not null default true,
  unique (branch_id, code)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  plate_number text not null unique,
  capacity_quantity numeric(20,6) check (capacity_quantity is null or capacity_quantity > 0),
  capacity_uom_id uuid references public.units_of_measure(id) on delete restrict,
  active boolean not null default true,
  unique (branch_id, code),
  check ((capacity_quantity is null) = (capacity_uom_id is null))
);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null check (char_length(name) between 2 and 120),
  machine_type text not null check (char_length(machine_type) between 2 and 60),
  active boolean not null default true,
  unique (branch_id, code)
);

alter table public.customers
  add column customer_type text not null default 'BUSINESS' check (customer_type in ('INDIVIDUAL','BUSINESS')),
  add column phone text,
  add column email text,
  add column address_text text,
  add column tax_code text,
  add column sales_owner_employee_id uuid references public.employees(id) on delete set null,
  add column tier_code text,
  add column payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 365),
  add column credit_limit_vnd bigint check (credit_limit_vnd is null or credit_limit_vnd >= 0),
  add column internal_note text;

create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  code text not null,
  name text not null check (char_length(name) between 2 and 160),
  address_text text not null check (char_length(address_text) between 3 and 500),
  receiver_name text,
  receiver_phone text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  access_note text,
  receiving_window text,
  sales_owner_employee_id uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (customer_id, code),
  check ((latitude is null) = (longitude is null))
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null check (char_length(name) between 2 and 160),
  phone text,
  email text,
  tax_code text,
  address_text text,
  payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  phone text,
  email text,
  role_label text,
  active boolean not null default true
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  scope_type text not null check (scope_type in ('CUSTOMER_MATERIAL','CUSTOMER_GROUP','CUSTOMER_TIER','DEFAULT')),
  customer_id uuid references public.customers(id) on delete restrict,
  material_id uuid references public.materials(id) on delete restrict,
  material_group_id uuid references public.material_groups(id) on delete restrict,
  customer_tier_code text,
  price_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  unit_price_vnd bigint not null check (unit_price_vnd > 0),
  version integer not null check (version > 0),
  source_type text not null check (source_type in ('LIST','CONTRACT','MANUAL_APPROVED')),
  effective_from timestamptz not null,
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (
    (scope_type = 'CUSTOMER_MATERIAL' and customer_id is not null and material_id is not null and material_group_id is null and customer_tier_code is null)
    or (scope_type = 'CUSTOMER_GROUP' and customer_id is not null and material_id is null and material_group_id is not null and customer_tier_code is null)
    or (scope_type = 'CUSTOMER_TIER' and customer_id is null and material_id is not null and material_group_id is null and customer_tier_code is not null)
    or (scope_type = 'DEFAULT' and customer_id is null and material_id is not null and material_group_id is null and customer_tier_code is null)
  )
);

create unique index pricing_customer_material_version on public.pricing_rules(customer_id, material_id, price_uom_id, version) where scope_type = 'CUSTOMER_MATERIAL';
create unique index pricing_customer_group_version on public.pricing_rules(customer_id, material_group_id, price_uom_id, version) where scope_type = 'CUSTOMER_GROUP';
create unique index pricing_customer_tier_version on public.pricing_rules(customer_tier_code, material_id, price_uom_id, version) where scope_type = 'CUSTOMER_TIER';
create unique index pricing_default_version on public.pricing_rules(material_id, price_uom_id, version) where scope_type = 'DEFAULT';
create index pricing_effective_lookup_idx on public.pricing_rules(branch_id, material_id, price_uom_id, active, effective_from desc);

create table public.opening_balance_sources (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  side text not null check (side in ('RECEIVABLE','PAYABLE')),
  source_ref text not null,
  note text not null check (char_length(note) between 3 and 500),
  recorded_at timestamptz not null default now(),
  unique (branch_id, side, source_ref)
);

create table public.receivable_obligations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid references public.customer_sites(id) on delete restrict,
  opening_source_id uuid not null unique references public.opening_balance_sources(id) on delete restrict,
  original_amount_vnd bigint not null check (original_amount_vnd > 0),
  due_date date not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict
);

create table public.receivable_adjustments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.receivable_obligations(id) on delete restrict,
  amount_delta_vnd bigint not null check (amount_delta_vnd <> 0),
  reason text not null check (char_length(reason) between 3 and 500),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict
);

create table public.payable_obligations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  opening_source_id uuid not null unique references public.opening_balance_sources(id) on delete restrict,
  original_amount_vnd bigint not null check (original_amount_vnd > 0),
  due_date date not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict
);

create table public.payable_adjustments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.payable_obligations(id) on delete restrict,
  amount_delta_vnd bigint not null check (amount_delta_vnd <> 0),
  reason text not null check (char_length(reason) between 3 and 500),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict
);

create table public.credit_commitments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_type text not null check (source_type = 'LOCAL_FIXTURE'),
  source_key text not null,
  amount_vnd bigint not null check (amount_vnd > 0),
  consumed_vnd bigint not null default 0 check (consumed_vnd >= 0),
  released_vnd bigint not null default 0 check (released_vnd >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (consumed_vnd + released_vnd <= amount_vnd),
  unique (source_type, source_key)
);

create or replace function private.reject_immutable_finance_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'posted financial rows are append-only' using errcode = '55000';
end
$$;

create trigger receivable_obligations_immutable before update or delete on public.receivable_obligations for each row execute function private.reject_immutable_finance_mutation();
create trigger receivable_adjustments_immutable before update or delete on public.receivable_adjustments for each row execute function private.reject_immutable_finance_mutation();
create trigger payable_obligations_immutable before update or delete on public.payable_obligations for each row execute function private.reject_immutable_finance_mutation();
create trigger payable_adjustments_immutable before update or delete on public.payable_adjustments for each row execute function private.reject_immutable_finance_mutation();

create view public.customer_credit_exposure
with (security_invoker = true)
as
select
  c.id as customer_id,
  c.branch_id,
  c.credit_limit_vnd,
  coalesce(ar.receivable_vnd, 0)::bigint as receivable_vnd,
  coalesce(cc.committed_vnd, 0)::bigint as committed_vnd,
  (coalesce(ar.receivable_vnd, 0) + coalesce(cc.committed_vnd, 0))::bigint as exposure_vnd,
  case when c.credit_limit_vnd is null then null
       else (c.credit_limit_vnd - coalesce(ar.receivable_vnd, 0) - coalesce(cc.committed_vnd, 0))::bigint
  end as available_vnd
from public.customers c
left join (
  select o.customer_id, sum(o.original_amount_vnd + coalesce(a.adjustment_vnd, 0)) as receivable_vnd
  from public.receivable_obligations o
  left join (select obligation_id, sum(amount_delta_vnd) as adjustment_vnd from public.receivable_adjustments group by obligation_id) a on a.obligation_id = o.id
  group by o.customer_id
) ar on ar.customer_id = c.id
left join (
  select customer_id, sum(amount_vnd - consumed_vnd - released_vnd) as committed_vnd
  from public.credit_commitments
  group by customer_id
) cc on cc.customer_id = c.id;

create view public.receivable_obligation_read
with (security_invoker = true)
as
select
  o.id, o.branch_id, o.customer_id, o.site_id, o.due_date, o.recorded_at,
  o.original_amount_vnd::text as original_amount_vnd,
  coalesce(a.adjustment_vnd, 0)::bigint::text as adjustment_vnd,
  (o.original_amount_vnd + coalesce(a.adjustment_vnd, 0))::bigint::text as outstanding_vnd
from public.receivable_obligations o
left join (select obligation_id, sum(amount_delta_vnd) as adjustment_vnd from public.receivable_adjustments group by obligation_id) a on a.obligation_id = o.id;

create view public.payable_obligation_read
with (security_invoker = true)
as
select
  o.id, o.branch_id, o.supplier_id, o.due_date, o.recorded_at,
  o.original_amount_vnd::text as original_amount_vnd,
  coalesce(a.adjustment_vnd, 0)::bigint::text as adjustment_vnd,
  (o.original_amount_vnd + coalesce(a.adjustment_vnd, 0))::bigint::text as outstanding_vnd
from public.payable_obligations o
left join (select obligation_id, sum(amount_delta_vnd) as adjustment_vnd from public.payable_adjustments group by obligation_id) a on a.obligation_id = o.id;

create view public.pricing_rule_read
with (security_invoker = true)
as
select
  id, branch_id, scope_type, customer_id, material_id, material_group_id, customer_tier_code,
  price_uom_id, unit_price_vnd::text as unit_price_vnd, version, source_type,
  effective_from, effective_to, active
from public.pricing_rules;

create or replace function private.reserve_fixture_credit(
  target_customer_id uuid,
  target_branch_id uuid,
  requested_amount_vnd bigint,
  fixture_source_key text,
  actor_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_limit bigint;
  current_exposure bigint;
  existing public.credit_commitments%rowtype;
  commitment_id uuid;
begin
  if requested_amount_vnd <= 0 then
    raise exception 'credit_amount_must_be_positive' using errcode = '22023';
  end if;

  select * into existing from public.credit_commitments
  where source_type = 'LOCAL_FIXTURE' and source_key = fixture_source_key;
  if found then
    if existing.customer_id <> target_customer_id or existing.branch_id <> target_branch_id or existing.amount_vnd <> requested_amount_vnd then
      raise exception 'credit_source_payload_conflict' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select credit_limit_vnd into customer_limit
  from public.customers
  where id = target_customer_id and branch_id = target_branch_id and active
  for update;

  if not found then raise exception 'customer_not_found_in_branch' using errcode = '23503'; end if;
  if customer_limit is null then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;

  if exists (
    select 1 from public.receivable_obligations o
    left join (select obligation_id, sum(amount_delta_vnd) as delta from public.receivable_adjustments group by obligation_id) a on a.obligation_id = o.id
    where o.customer_id = target_customer_id and o.due_date < current_date
      and o.original_amount_vnd + coalesce(a.delta, 0) > 0
  ) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;

  select coalesce(exposure_vnd, 0) into current_exposure
  from public.customer_credit_exposure where customer_id = target_customer_id;
  if current_exposure + requested_amount_vnd > customer_limit then
    raise exception 'credit_limit_exceeded' using errcode = '23514';
  end if;

  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by)
  values (target_branch_id, target_customer_id, 'LOCAL_FIXTURE', fixture_source_key, requested_amount_vnd, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;

revoke all on function private.reserve_fixture_credit(uuid, uuid, bigint, text, uuid) from public, anon, authenticated;

insert into public.permissions(code, name) values
  ('catalog.read', 'Xem vật tư và đơn vị'),
  ('catalog.manage', 'Quản lý vật tư và đơn vị'),
  ('customers.manage', 'Quản lý hồ sơ khách hàng'),
  ('suppliers.read', 'Xem nhà cung cấp'),
  ('suppliers.manage', 'Quản lý nhà cung cấp'),
  ('pricing.read', 'Xem giá bán được phép'),
  ('pricing.manage', 'Quản lý chính sách giá'),
  ('orders.confirm', 'Xác nhận đơn bán')
on conflict (code) do nothing;

alter table public.units_of_measure enable row level security;
alter table public.material_groups enable row level security;
alter table public.materials enable row level security;
alter table public.material_uom_conversions enable row level security;
alter table public.warehouses enable row level security;
alter table public.vehicles enable row level security;
alter table public.machines enable row level security;
alter table public.customer_sites enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.opening_balance_sources enable row level security;
alter table public.receivable_obligations enable row level security;
alter table public.receivable_adjustments enable row level security;
alter table public.payable_obligations enable row level security;
alter table public.payable_adjustments enable row level security;
alter table public.credit_commitments enable row level security;

revoke all on table public.units_of_measure, public.material_groups, public.materials, public.material_uom_conversions,
  public.warehouses, public.vehicles, public.machines, public.customer_sites, public.suppliers, public.supplier_contacts,
  public.pricing_rules, public.opening_balance_sources, public.receivable_obligations, public.receivable_adjustments,
  public.payable_obligations, public.payable_adjustments, public.credit_commitments from anon, authenticated;
revoke all on table public.customer_credit_exposure, public.receivable_obligation_read,
  public.payable_obligation_read, public.pricing_rule_read from anon, authenticated;

grant select on table public.units_of_measure, public.material_groups, public.materials, public.material_uom_conversions to authenticated;
grant select on table public.warehouses, public.vehicles, public.machines, public.customer_sites, public.suppliers, public.supplier_contacts to authenticated;
grant select on table public.pricing_rules, public.opening_balance_sources, public.receivable_obligations, public.receivable_adjustments,
  public.payable_obligations, public.payable_adjustments, public.credit_commitments, public.customer_credit_exposure to authenticated;
grant select on table public.receivable_obligation_read, public.payable_obligation_read, public.pricing_rule_read to authenticated;

create policy uom_select on public.units_of_measure for select to authenticated using ((select private.current_employee_id()) is not null);
create policy material_groups_select on public.material_groups for select to authenticated using ((select private.current_employee_id()) is not null);
create policy materials_select on public.materials for select to authenticated using ((select private.current_employee_id()) is not null);
create policy conversions_select on public.material_uom_conversions for select to authenticated using ((select private.current_employee_id()) is not null);
create policy warehouses_select on public.warehouses for select to authenticated using ((select private.has_branch_access(branch_id)));
create policy vehicles_select on public.vehicles for select to authenticated using ((select private.has_branch_access(branch_id)));
create policy machines_select on public.machines for select to authenticated using ((select private.has_branch_access(branch_id)));
create policy customer_sites_select on public.customer_sites for select to authenticated using (
  exists (select 1 from public.customers c where c.id = customer_id and ((select private.has_permission(c.branch_id, 'customers.read')) or (select private.has_customer_membership(c.id, null))))
);
create policy suppliers_select on public.suppliers for select to authenticated using ((select private.has_permission(branch_id, 'suppliers.read')));
create policy supplier_contacts_select on public.supplier_contacts for select to authenticated using (
  exists (select 1 from public.suppliers s where s.id = supplier_id and (select private.has_permission(s.branch_id, 'suppliers.read')))
);
create policy pricing_rules_select on public.pricing_rules for select to authenticated using ((select private.has_permission(branch_id, 'pricing.read')));
create policy opening_sources_select on public.opening_balance_sources for select to authenticated using ((select private.has_permission(branch_id, case when side = 'RECEIVABLE' then 'finance.ar.read' else 'suppliers.read' end)));
create policy receivable_obligations_select on public.receivable_obligations for select to authenticated using ((select private.has_permission(branch_id, 'finance.ar.read')) or (select private.has_customer_membership(customer_id, array['OWNER','FINANCE_CONTACT'])));
create policy receivable_adjustments_select on public.receivable_adjustments for select to authenticated using (exists (select 1 from public.receivable_obligations o where o.id = obligation_id));
create policy payable_obligations_select on public.payable_obligations for select to authenticated using ((select private.has_permission(branch_id, 'suppliers.read')));
create policy payable_adjustments_select on public.payable_adjustments for select to authenticated using (exists (select 1 from public.payable_obligations o where o.id = obligation_id));
create policy credit_commitments_select on public.credit_commitments for select to authenticated using ((select private.has_permission(branch_id, 'finance.ar.read')) or (select private.has_customer_membership(customer_id, array['OWNER','FINANCE_CONTACT'])));
