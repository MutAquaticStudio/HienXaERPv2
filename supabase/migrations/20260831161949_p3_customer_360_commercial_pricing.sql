-- HIỀN XA ERP P3 — Customer 360 and commercial pricing.
-- Customer prices and credit policies are effective-dated immutable versions.
-- Browser roles receive SELECT only; all writes use authenticated server commands.

create type public.customer_tier as enum (
  'STANDARD',
  'SILVER',
  'GOLD',
  'STRATEGIC'
);

create type public.price_rule_scope as enum (
  'CUSTOMER_MATERIAL',
  'CUSTOMER_MATERIAL_GROUP',
  'CUSTOMER_TIER',
  'DEFAULT'
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = upper(trim(code)) and char_length(code) between 2 and 40),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 180),
  legal_name text check (legal_name is null or char_length(trim(legal_name)) between 2 and 240),
  tax_code text,
  phone text,
  email text,
  tier public.customer_tier not null default 'STANDARD',
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create unique index customers_tax_code_unique
  on public.customers(tax_code) where tax_code is not null;

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  role_name text,
  phone text,
  email text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_channel check (
    phone is not null or email is not null
  ),
  constraint customer_contacts_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index customer_contacts_customer_idx
  on public.customer_contacts(customer_id, is_active);
create unique index customer_contacts_one_primary
  on public.customer_contacts(customer_id) where is_primary and is_active;

create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  code text not null
    check (code = upper(trim(code)) and char_length(code) between 2 and 40),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 180),
  address text not null check (char_length(trim(address)) between 5 and 500),
  delivery_notes text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, code),
  constraint customer_sites_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index customer_sites_customer_idx
  on public.customer_sites(customer_id, is_active);
create unique index customer_sites_one_default
  on public.customer_sites(customer_id) where is_default and is_active;

create table public.customer_price_rules (
  id uuid primary key default gen_random_uuid(),
  scope public.price_rule_scope not null,
  customer_id uuid references public.customers(id) on delete restrict,
  customer_tier public.customer_tier,
  material_id uuid references public.materials(id) on delete restrict,
  material_group_id uuid references public.material_groups(id) on delete restrict,
  unit_price numeric(20, 2) not null check (unit_price > 0),
  currency text not null default 'VND'
    check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  version integer not null check (version > 0),
  change_reason text not null check (char_length(trim(change_reason)) between 5 and 500),
  created_by uuid references public.user_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_price_rules_dates check (
    valid_to is null or valid_to >= valid_from
  ),
  constraint customer_price_rules_target check (
    (
      scope = 'CUSTOMER_MATERIAL'
      and customer_id is not null and material_id is not null
      and customer_tier is null and material_group_id is null
    )
    or (
      scope = 'CUSTOMER_MATERIAL_GROUP'
      and customer_id is not null and material_group_id is not null
      and customer_tier is null and material_id is null
    )
    or (
      scope = 'CUSTOMER_TIER'
      and customer_tier is not null and material_id is not null
      and customer_id is null and material_group_id is null
    )
    or (
      scope = 'DEFAULT'
      and material_id is not null
      and customer_id is null and customer_tier is null
      and material_group_id is null
    )
  )
);

create unique index customer_price_rules_version_unique
  on public.customer_price_rules (
    scope, customer_id, customer_tier, material_id, material_group_id, version
  ) nulls not distinct;
create index customer_price_rules_resolution_idx
  on public.customer_price_rules(scope, valid_from, valid_to);
create index customer_price_rules_customer_idx
  on public.customer_price_rules(customer_id) where customer_id is not null;
create index customer_price_rules_material_idx
  on public.customer_price_rules(material_id) where material_id is not null;
create index customer_price_rules_group_idx
  on public.customer_price_rules(material_group_id)
  where material_group_id is not null;
create index customer_price_rules_uom_idx on public.customer_price_rules(uom_id);
create index customer_price_rules_created_by_idx
  on public.customer_price_rules(created_by);

create table public.selling_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_price_rule_id uuid not null
    references public.customer_price_rules(id) on delete restrict,
  transaction_ref text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_code text not null,
  customer_name_vi text not null,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code text not null,
  material_name_vi text not null,
  scope public.price_rule_scope not null,
  unit_price numeric(20, 2) not null check (unit_price > 0),
  currency text not null,
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol text not null,
  rule_version integer not null check (rule_version > 0),
  rule_valid_from date not null,
  rule_valid_to date,
  captured_by uuid references public.user_profiles(user_id) on delete set null,
  captured_at timestamptz not null default now()
);

create index selling_price_snapshots_rule_idx
  on public.selling_price_snapshots(source_price_rule_id);
create index selling_price_snapshots_customer_idx
  on public.selling_price_snapshots(customer_id, captured_at desc);
create index selling_price_snapshots_material_idx
  on public.selling_price_snapshots(material_id, captured_at desc);
create index selling_price_snapshots_captured_by_idx
  on public.selling_price_snapshots(captured_by);

create table public.customer_credit_policies (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  credit_limit numeric(20, 2) not null check (credit_limit >= 0),
  allowed_overdue_days smallint not null default 0
    check (allowed_overdue_days between 0 and 365),
  valid_from date not null,
  valid_to date,
  version integer not null check (version > 0),
  change_reason text not null check (char_length(trim(change_reason)) between 5 and 500),
  created_by uuid references public.user_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_credit_policies_dates check (
    valid_to is null or valid_to >= valid_from
  ),
  unique (customer_id, version)
);

create index customer_credit_policies_effective_idx
  on public.customer_credit_policies(customer_id, valid_from, valid_to);
create index customer_credit_policies_created_by_idx
  on public.customer_credit_policies(created_by);

-- Finance owns ledger truth in P8. These P3 tables are read models only and
-- deliberately keep customer advances separate from receivables.
create table public.customer_credit_exposures (
  customer_id uuid primary key references public.customers(id) on delete restrict,
  receivable_amount numeric(20, 2) not null default 0 check (receivable_amount >= 0),
  uninvoiced_order_amount numeric(20, 2) not null default 0
    check (uninvoiced_order_amount >= 0),
  overdue_amount numeric(20, 2) not null default 0 check (overdue_amount >= 0),
  oldest_overdue_days integer not null default 0 check (oldest_overdue_days >= 0),
  customer_advance_amount numeric(20, 2) not null default 0
    check (customer_advance_amount >= 0),
  calculated_at timestamptz not null default now()
);

create table public.customer_finance_summaries (
  customer_id uuid primary key references public.customers(id) on delete restrict,
  lifetime_revenue numeric(20, 2) not null default 0 check (lifetime_revenue >= 0),
  receivable_amount numeric(20, 2) not null default 0 check (receivable_amount >= 0),
  overdue_amount numeric(20, 2) not null default 0 check (overdue_amount >= 0),
  customer_advance_amount numeric(20, 2) not null default 0
    check (customer_advance_amount >= 0),
  last_sale_at timestamptz,
  refreshed_at timestamptz not null default now()
);

create table public.customer_credit_override_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  policy_id uuid references public.customer_credit_policies(id) on delete restrict,
  order_amount numeric(20, 2) not null check (order_amount > 0),
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  exposure_snapshot jsonb not null,
  approved_by uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz not null default now()
);

create index customer_credit_override_customer_idx
  on public.customer_credit_override_events(customer_id, approved_at desc);
create index customer_credit_override_policy_idx
  on public.customer_credit_override_events(policy_id)
  where policy_id is not null;
create index customer_credit_override_approved_by_idx
  on public.customer_credit_override_events(approved_by);

create table public.customer_timeline_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  event_type text not null check (char_length(trim(event_type)) between 3 and 80),
  title text not null check (char_length(trim(title)) between 3 and 180),
  detail text,
  source_entity_type text,
  source_entity_id uuid,
  actor_user_id uuid references public.user_profiles(user_id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index customer_timeline_customer_idx
  on public.customer_timeline_events(customer_id, occurred_at desc);
create index customer_timeline_actor_idx
  on public.customer_timeline_events(actor_user_id);

create trigger customers_updated_at
before update on public.customers
for each row execute function app_private.set_master_updated_at();
create trigger customer_contacts_updated_at
before update on public.customer_contacts
for each row execute function app_private.set_master_updated_at();
create trigger customer_sites_updated_at
before update on public.customer_sites
for each row execute function app_private.set_master_updated_at();

create or replace function app_private.validate_price_rule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.customer_price_rules as existing
    where existing.scope = new.scope
      and existing.customer_id is not distinct from new.customer_id
      and existing.customer_tier is not distinct from new.customer_tier
      and existing.material_id is not distinct from new.material_id
      and existing.material_group_id is not distinct from new.material_group_id
      and daterange(existing.valid_from, coalesce(existing.valid_to, 'infinity'::date), '[]')
        && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'PRICE_RULE_EFFECTIVE_PERIOD_OVERLAP' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger customer_price_rules_validate_version
before insert on public.customer_price_rules
for each row execute function app_private.validate_price_rule_version();

create or replace function app_private.prevent_price_rule_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.scope is distinct from old.scope
    or new.customer_id is distinct from old.customer_id
    or new.customer_tier is distinct from old.customer_tier
    or new.material_id is distinct from old.material_id
    or new.material_group_id is distinct from old.material_group_id
    or new.unit_price is distinct from old.unit_price
    or new.currency is distinct from old.currency
    or new.uom_id is distinct from old.uom_id
    or new.valid_from is distinct from old.valid_from
    or new.version is distinct from old.version
    or new.change_reason is distinct from old.change_reason
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'PRICE_RULE_VERSION_IMMUTABLE' using errcode = '22000';
  end if;
  if old.valid_to is not null or new.valid_to is null then
    raise exception 'PRICE_RULE_CAN_ONLY_BE_CLOSED' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger customer_price_rules_immutable
before update on public.customer_price_rules
for each row execute function app_private.prevent_price_rule_rewrite();
create trigger customer_price_rules_no_delete
before delete on public.customer_price_rules
for each row execute function app_private.prevent_immutable_delete();
create trigger selling_price_snapshots_no_update_or_delete
before update or delete on public.selling_price_snapshots
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.validate_credit_policy_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.customer_credit_policies as existing
    where existing.customer_id = new.customer_id
      and daterange(existing.valid_from, coalesce(existing.valid_to, 'infinity'::date), '[]')
        && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'CREDIT_POLICY_EFFECTIVE_PERIOD_OVERLAP' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger customer_credit_policies_validate_version
before insert on public.customer_credit_policies
for each row execute function app_private.validate_credit_policy_version();

create or replace function app_private.prevent_credit_policy_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.customer_id is distinct from old.customer_id
    or new.credit_limit is distinct from old.credit_limit
    or new.allowed_overdue_days is distinct from old.allowed_overdue_days
    or new.valid_from is distinct from old.valid_from
    or new.version is distinct from old.version
    or new.change_reason is distinct from old.change_reason
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'CREDIT_POLICY_VERSION_IMMUTABLE' using errcode = '22000';
  end if;
  if old.valid_to is not null or new.valid_to is null then
    raise exception 'CREDIT_POLICY_CAN_ONLY_BE_CLOSED' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger customer_credit_policies_immutable
before update on public.customer_credit_policies
for each row execute function app_private.prevent_credit_policy_rewrite();
create trigger customer_credit_policies_no_delete
before delete on public.customer_credit_policies
for each row execute function app_private.prevent_immutable_delete();
create trigger customer_credit_override_events_no_update_or_delete
before update or delete on public.customer_credit_override_events
for each row execute function app_private.prevent_immutable_delete();
create trigger customer_timeline_events_no_update_or_delete
before update or delete on public.customer_timeline_events
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.resolve_customer_price(
  p_customer_id uuid,
  p_material_id uuid,
  p_effective_date date default current_date
)
returns table (
  rule_id uuid,
  scope public.price_rule_scope,
  unit_price numeric,
  currency text,
  uom_id uuid,
  uom_symbol text,
  rule_version integer,
  valid_from date,
  valid_to date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select rule.id, rule.scope, rule.unit_price, rule.currency,
    rule.uom_id, uom.symbol, rule.version, rule.valid_from, rule.valid_to
  from public.customers as customer
  join public.materials as material on material.id = p_material_id
  join public.customer_price_rules as rule on (
    (rule.scope = 'CUSTOMER_MATERIAL'
      and rule.customer_id = customer.id and rule.material_id = material.id)
    or (rule.scope = 'CUSTOMER_MATERIAL_GROUP'
      and rule.customer_id = customer.id
      and rule.material_group_id = material.material_group_id)
    or (rule.scope = 'CUSTOMER_TIER'
      and rule.customer_tier = customer.tier and rule.material_id = material.id)
    or (rule.scope = 'DEFAULT' and rule.material_id = material.id)
  )
  join public.uom_catalog as uom on uom.id = rule.uom_id
  where customer.id = p_customer_id
    and customer.is_active
    and material.is_active
    and p_effective_date between rule.valid_from
      and coalesce(rule.valid_to, 'infinity'::date)
  order by case rule.scope
    when 'CUSTOMER_MATERIAL' then 1
    when 'CUSTOMER_MATERIAL_GROUP' then 2
    when 'CUSTOMER_TIER' then 3
    when 'DEFAULT' then 4
  end, rule.version desc
  limit 1;
$$;

create or replace function app_private.capture_selling_price_snapshot(
  p_customer_id uuid,
  p_material_id uuid,
  p_effective_date date,
  p_transaction_ref text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved record;
  snapshot_id uuid;
begin
  select * into resolved
  from app_private.resolve_customer_price(
    p_customer_id, p_material_id, p_effective_date
  );
  if resolved.rule_id is null then
    raise exception 'NO_EFFECTIVE_SELLING_PRICE' using errcode = 'P0002';
  end if;

  insert into public.selling_price_snapshots (
    source_price_rule_id, transaction_ref, customer_id, customer_code,
    customer_name_vi, material_id, material_code, material_name_vi, scope,
    unit_price, currency, uom_id, uom_symbol, rule_version,
    rule_valid_from, rule_valid_to, captured_by
  )
  select resolved.rule_id, p_transaction_ref, customer.id, customer.code,
    customer.name_vi, material.id, material.code, material.name_vi,
    resolved.scope, resolved.unit_price, resolved.currency, resolved.uom_id,
    resolved.uom_symbol, resolved.rule_version, resolved.valid_from,
    resolved.valid_to, p_actor_id
  from public.customers as customer
  join public.materials as material on material.id = p_material_id
  where customer.id = p_customer_id
  returning id into snapshot_id;

  return snapshot_id;
end;
$$;

revoke all on function app_private.validate_price_rule_version() from public;
revoke all on function app_private.prevent_price_rule_rewrite() from public;
revoke all on function app_private.validate_credit_policy_version() from public;
revoke all on function app_private.prevent_credit_policy_rewrite() from public;
revoke all on function app_private.resolve_customer_price(uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function app_private.capture_selling_price_snapshot(uuid, uuid, date, text, uuid)
  from public, anon, authenticated;

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_sites enable row level security;
alter table public.customer_price_rules enable row level security;
alter table public.selling_price_snapshots enable row level security;
alter table public.customer_credit_policies enable row level security;
alter table public.customer_credit_exposures enable row level security;
alter table public.customer_finance_summaries enable row level security;
alter table public.customer_credit_override_events enable row level security;
alter table public.customer_timeline_events enable row level security;

revoke all on public.customers from anon, authenticated;
revoke all on public.customer_contacts from anon, authenticated;
revoke all on public.customer_sites from anon, authenticated;
revoke all on public.customer_price_rules from anon, authenticated;
revoke all on public.selling_price_snapshots from anon, authenticated;
revoke all on public.customer_credit_policies from anon, authenticated;
revoke all on public.customer_credit_exposures from anon, authenticated;
revoke all on public.customer_finance_summaries from anon, authenticated;
revoke all on public.customer_credit_override_events from anon, authenticated;
revoke all on public.customer_timeline_events from anon, authenticated;

grant select on public.customers to authenticated;
grant select on public.customer_contacts to authenticated;
grant select on public.customer_sites to authenticated;
grant select on public.customer_price_rules to authenticated;
grant select on public.selling_price_snapshots to authenticated;
grant select on public.customer_credit_policies to authenticated;
grant select on public.customer_credit_exposures to authenticated;
grant select on public.customer_finance_summaries to authenticated;
grant select on public.customer_credit_override_events to authenticated;
grant select on public.customer_timeline_events to authenticated;

create policy customers_read_authorized
on public.customers for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer.read'))
    or (select app_private.has_permission('customer.manage'))
  )
);
create policy customer_contacts_read_authorized
on public.customer_contacts for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer.read'))
    or (select app_private.has_permission('customer.manage'))
  )
);
create policy customer_sites_read_authorized
on public.customer_sites for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer.read'))
    or (select app_private.has_permission('customer.manage'))
  )
);
create policy customer_timeline_events_read_authorized
on public.customer_timeline_events for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer.read'))
    or (select app_private.has_permission('customer.manage'))
  )
);
create policy customer_price_rules_read_authorized
on public.customer_price_rules for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('pricing.read'))
    or (select app_private.has_permission('pricing.manage'))
  )
);
create policy selling_price_snapshots_read_authorized
on public.selling_price_snapshots for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('pricing.read'))
    or (select app_private.has_permission('pricing.manage'))
  )
);
create policy customer_credit_policies_read_authorized
on public.customer_credit_policies for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer_credit.read'))
    or (select app_private.has_permission('customer_credit.manage'))
    or (select app_private.has_permission('customer_credit.override'))
  )
);
create policy customer_credit_exposures_read_authorized
on public.customer_credit_exposures for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer_credit.read'))
    or (select app_private.has_permission('customer_credit.manage'))
    or (select app_private.has_permission('customer_credit.override'))
  )
);
create policy customer_finance_summaries_read_authorized
on public.customer_finance_summaries for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer_credit.read'))
    or (select app_private.has_permission('customer_credit.manage'))
    or (select app_private.has_permission('customer_credit.override'))
  )
);
create policy customer_credit_override_events_read_authorized
on public.customer_credit_override_events for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('customer_credit.read'))
    or (select app_private.has_permission('customer_credit.manage'))
    or (select app_private.has_permission('customer_credit.override'))
  )
);

insert into public.permissions (code, description_vi) values
  ('customer.read', 'Xem hồ sơ và dòng thời gian khách hàng'),
  ('customer.manage', 'Quản lý hồ sơ, liên hệ và địa điểm khách hàng'),
  ('pricing.read', 'Xem quy tắc và lịch sử giá bán'),
  ('pricing.manage', 'Tạo version quy tắc giá bán'),
  ('customer_credit.read', 'Xem chính sách và mức sử dụng tín dụng khách hàng'),
  ('customer_credit.manage', 'Tạo version chính sách tín dụng khách hàng'),
  ('customer_credit.override', 'Phê duyệt vượt chặn tín dụng có lý do')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'customer.read',
  'customer.manage',
  'pricing.read',
  'pricing.manage',
  'customer_credit.read',
  'customer_credit.manage',
  'customer_credit.override'
)
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'customer.read',
  'customer.manage',
  'pricing.read',
  'customer_credit.read'
)
where role.code = 'SALES'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'customer.read',
  'customer.manage',
  'pricing.read',
  'pricing.manage',
  'customer_credit.read',
  'customer_credit.override'
)
where role.code = 'SUPERVISOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'customer.read',
  'pricing.read',
  'customer_credit.read',
  'customer_credit.manage',
  'customer_credit.override'
)
where role.code = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'customer.read',
  'pricing.read',
  'customer_credit.read'
)
where role.code = 'AUDITOR_VIEWER'
on conflict do nothing;
