-- HIỀN XA ERP P2 — master data and construction UOM.
-- Conversions are material-specific, versioned, and always point to the
-- material base UOM. This star topology prevents conversion cycles by design.

create type public.uom_dimension as enum (
  'MASS',
  'VOLUME',
  'COUNT',
  'LENGTH',
  'AREA',
  'OTHER'
);

create type public.conversion_method as enum (
  'EXACT',
  'PACKAGING',
  'ESTIMATED',
  'MEASURED'
);

create type public.worker_skill_level as enum (
  'BASIC',
  'QUALIFIED',
  'ADVANCED',
  'EXPERT'
);

create table public.material_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 160),
  description text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_groups_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create table public.uom_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 24),
  symbol text not null check (char_length(trim(symbol)) between 1 and 16),
  name_vi text not null check (char_length(trim(name_vi)) between 1 and 120),
  dimension public.uom_dimension not null,
  decimal_scale smallint not null default 3 check (decimal_scale between 0 and 6),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uom_catalog_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create unique index uom_catalog_symbol_dimension_unique
  on public.uom_catalog(lower(symbol), dimension);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  material_group_id uuid not null references public.material_groups(id) on delete restrict,
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 2 and 40),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 180),
  base_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  purchase_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  sales_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index materials_group_id_idx on public.materials(material_group_id);
create index materials_base_uom_id_idx on public.materials(base_uom_id);
create index materials_purchase_uom_id_idx on public.materials(purchase_uom_id);
create index materials_sales_uom_id_idx on public.materials(sales_uom_id);

create table public.material_uom_conversions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  from_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  to_uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  source_quantity numeric(20, 6) not null check (source_quantity > 0),
  target_quantity numeric(20, 6) not null check (target_quantity > 0),
  method public.conversion_method not null,
  rounding_scale smallint not null default 3 check (rounding_scale between 0 and 6),
  version integer not null check (version > 0),
  is_current boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid references public.user_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint material_uom_conversion_distinct_uoms check (from_uom_id <> to_uom_id),
  constraint material_uom_conversion_current_state check (
    (is_current and valid_to is null)
    or (not is_current and valid_to is not null and valid_to >= valid_from)
  ),
  unique (material_id, from_uom_id, version)
);

create unique index material_uom_conversions_one_current
  on public.material_uom_conversions(material_id, from_uom_id)
  where is_current;
create index material_uom_conversions_material_idx
  on public.material_uom_conversions(material_id, is_current);
create index material_uom_conversions_from_uom_idx
  on public.material_uom_conversions(from_uom_id);
create index material_uom_conversions_to_uom_idx
  on public.material_uom_conversions(to_uom_id);
create index material_uom_conversions_created_by_idx
  on public.material_uom_conversions(created_by);

create table public.uom_conversion_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_conversion_id uuid not null references public.material_uom_conversions(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code text not null,
  material_name_vi text not null,
  from_uom_code text not null,
  from_uom_symbol text not null,
  to_uom_code text not null,
  to_uom_symbol text not null,
  source_quantity numeric(20, 6) not null check (source_quantity > 0),
  target_quantity numeric(20, 6) not null check (target_quantity > 0),
  method public.conversion_method not null,
  rounding_scale smallint not null check (rounding_scale between 0 and 6),
  conversion_version integer not null check (conversion_version > 0),
  transaction_ref text,
  captured_by uuid references public.user_profiles(user_id) on delete set null,
  captured_at timestamptz not null default now()
);

create index uom_conversion_snapshots_conversion_idx
  on public.uom_conversion_snapshots(source_conversion_id);
create index uom_conversion_snapshots_material_idx
  on public.uom_conversion_snapshots(material_id, captured_at desc);
create index uom_conversion_snapshots_captured_by_idx
  on public.uom_conversion_snapshots(captured_by);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 160),
  address text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  plate_number text not null unique check (char_length(trim(plate_number)) between 5 and 20),
  vehicle_type text not null check (char_length(trim(vehicle_type)) between 2 and 80),
  home_warehouse_id uuid references public.warehouses(id) on delete restrict,
  max_payload_kg numeric(14, 3) check (max_payload_kg is null or max_payload_kg > 0),
  max_volume_m3 numeric(14, 3) check (max_volume_m3 is null or max_volume_m3 > 0),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index vehicles_home_warehouse_id_idx on public.vehicles(home_warehouse_id);

create table public.vehicle_load_profiles (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  material_id uuid references public.materials(id) on delete restrict,
  material_group_id uuid references public.material_groups(id) on delete restrict,
  planned_quantity numeric(20, 6) not null check (planned_quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  profile_kind text not null default 'PLANNING_CAPACITY' check (profile_kind = 'PLANNING_CAPACITY'),
  notes text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_load_profiles_target check (
    (material_id is not null and material_group_id is null)
    or (material_id is null and material_group_id is not null)
  ),
  constraint vehicle_load_profiles_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index vehicle_load_profiles_vehicle_idx
  on public.vehicle_load_profiles(vehicle_id, is_active);
create index vehicle_load_profiles_material_idx
  on public.vehicle_load_profiles(material_id)
  where material_id is not null;
create index vehicle_load_profiles_group_idx
  on public.vehicle_load_profiles(material_group_id)
  where material_group_id is not null;
create index vehicle_load_profiles_uom_idx on public.vehicle_load_profiles(uom_id);

create table public.employee_operational_profiles (
  user_id uuid primary key references public.user_profiles(user_id) on delete restrict,
  employee_code text not null unique check (employee_code = upper(trim(employee_code)) and char_length(employee_code) between 2 and 32),
  home_warehouse_id uuid references public.warehouses(id) on delete restrict,
  job_title text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_operational_profiles_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index employee_operational_profiles_warehouse_idx
  on public.employee_operational_profiles(home_warehouse_id);

create table public.worker_skill_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 2 and 32),
  name_vi text not null check (char_length(trim(name_vi)) between 2 and 140),
  description text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_skill_catalog_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create table public.worker_skills (
  user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  skill_id uuid not null references public.worker_skill_catalog(id) on delete restrict,
  level public.worker_skill_level not null default 'BASIC',
  certified_at date,
  expires_at date,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id),
  constraint worker_skills_certification_dates check (
    expires_at is null or certified_at is null or expires_at >= certified_at
  ),
  constraint worker_skills_active_state check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index worker_skills_skill_id_idx on public.worker_skills(skill_id);

create or replace function app_private.set_master_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.is_active and not old.is_active then
    new.deactivated_at = null;
  elsif not new.is_active and old.is_active then
    new.deactivated_at = now();
  end if;
  return new;
end;
$$;

create trigger material_groups_updated_at
before update on public.material_groups
for each row execute function app_private.set_master_updated_at();
create trigger uom_catalog_updated_at
before update on public.uom_catalog
for each row execute function app_private.set_master_updated_at();
create trigger materials_updated_at
before update on public.materials
for each row execute function app_private.set_master_updated_at();
create trigger warehouses_updated_at
before update on public.warehouses
for each row execute function app_private.set_master_updated_at();
create trigger vehicles_updated_at
before update on public.vehicles
for each row execute function app_private.set_master_updated_at();
create trigger vehicle_load_profiles_updated_at
before update on public.vehicle_load_profiles
for each row execute function app_private.set_master_updated_at();
create trigger employee_operational_profiles_updated_at
before update on public.employee_operational_profiles
for each row execute function app_private.set_master_updated_at();
create trigger worker_skill_catalog_updated_at
before update on public.worker_skill_catalog
for each row execute function app_private.set_master_updated_at();
create trigger worker_skills_updated_at
before update on public.worker_skills
for each row execute function app_private.set_master_updated_at();

create or replace function app_private.validate_material_conversion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  material_base_uom uuid;
  from_dimension public.uom_dimension;
  to_dimension public.uom_dimension;
begin
  select material.base_uom_id
  into material_base_uom
  from public.materials as material
  where material.id = new.material_id;

  if material_base_uom is null or new.to_uom_id <> material_base_uom then
    raise exception 'CONVERSION_MUST_TARGET_MATERIAL_BASE_UOM'
      using errcode = '23514';
  end if;

  select unit.dimension into from_dimension
  from public.uom_catalog as unit where unit.id = new.from_uom_id;
  select unit.dimension into to_dimension
  from public.uom_catalog as unit where unit.id = new.to_uom_id;

  if new.method = 'EXACT' and from_dimension <> to_dimension then
    raise exception 'EXACT_CONVERSION_REQUIRES_SAME_DIMENSION'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger material_uom_conversions_validate
before insert on public.material_uom_conversions
for each row execute function app_private.validate_material_conversion();

create or replace function app_private.prevent_conversion_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.material_id is distinct from old.material_id
    or new.from_uom_id is distinct from old.from_uom_id
    or new.to_uom_id is distinct from old.to_uom_id
    or new.source_quantity is distinct from old.source_quantity
    or new.target_quantity is distinct from old.target_quantity
    or new.method is distinct from old.method
    or new.rounding_scale is distinct from old.rounding_scale
    or new.version is distinct from old.version
    or new.valid_from is distinct from old.valid_from
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'CONVERSION_VERSION_IMMUTABLE' using errcode = '22000';
  end if;

  if not old.is_current or new.is_current or new.valid_to is null then
    raise exception 'CONVERSION_CAN_ONLY_BE_CLOSED' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger material_uom_conversions_immutable
before update on public.material_uom_conversions
for each row execute function app_private.prevent_conversion_rewrite();

create or replace function app_private.prevent_immutable_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'HISTORICAL_RECORD_IMMUTABLE' using errcode = '22000';
end;
$$;

create trigger material_uom_conversions_no_delete
before delete on public.material_uom_conversions
for each row execute function app_private.prevent_immutable_delete();
create trigger uom_conversion_snapshots_no_update_or_delete
before update or delete on public.uom_conversion_snapshots
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.prevent_material_base_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.base_uom_id is distinct from old.base_uom_id
    and exists (
      select 1 from public.material_uom_conversions as conversion
      where conversion.material_id = old.id
    )
  then
    raise exception 'MATERIAL_BASE_UOM_LOCKED_BY_HISTORY' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger materials_base_uom_history_guard
before update on public.materials
for each row execute function app_private.prevent_material_base_change();

create or replace function app_private.assert_actor_permission(
  actor_user_id uuid,
  permission_code text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.user_profiles as profile
    join public.user_roles as user_role on user_role.user_id = profile.user_id
    join public.role_permissions as role_permission on role_permission.role_id = user_role.role_id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where profile.user_id = actor_user_id
      and profile.status = 'ACTIVE'
      and permission.code = permission_code
  ) then
    raise exception 'ACTOR_PERMISSION_DENIED' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.set_master_updated_at() from public;
revoke all on function app_private.validate_material_conversion() from public;
revoke all on function app_private.prevent_conversion_rewrite() from public;
revoke all on function app_private.prevent_immutable_delete() from public;
revoke all on function app_private.prevent_material_base_change() from public;
revoke all on function app_private.assert_actor_permission(uuid, text) from public, anon, authenticated;

alter table public.material_groups enable row level security;
alter table public.uom_catalog enable row level security;
alter table public.materials enable row level security;
alter table public.material_uom_conversions enable row level security;
alter table public.uom_conversion_snapshots enable row level security;
alter table public.warehouses enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_load_profiles enable row level security;
alter table public.employee_operational_profiles enable row level security;
alter table public.worker_skill_catalog enable row level security;
alter table public.worker_skills enable row level security;

revoke all on public.material_groups from anon, authenticated;
revoke all on public.uom_catalog from anon, authenticated;
revoke all on public.materials from anon, authenticated;
revoke all on public.material_uom_conversions from anon, authenticated;
revoke all on public.uom_conversion_snapshots from anon, authenticated;
revoke all on public.warehouses from anon, authenticated;
revoke all on public.vehicles from anon, authenticated;
revoke all on public.vehicle_load_profiles from anon, authenticated;
revoke all on public.employee_operational_profiles from anon, authenticated;
revoke all on public.worker_skill_catalog from anon, authenticated;
revoke all on public.worker_skills from anon, authenticated;

grant select on public.material_groups to authenticated;
grant select on public.uom_catalog to authenticated;
grant select on public.materials to authenticated;
grant select on public.material_uom_conversions to authenticated;
grant select on public.uom_conversion_snapshots to authenticated;
grant select on public.warehouses to authenticated;
grant select on public.vehicles to authenticated;
grant select on public.vehicle_load_profiles to authenticated;
grant select on public.employee_operational_profiles to authenticated;
grant select on public.worker_skill_catalog to authenticated;
grant select on public.worker_skills to authenticated;

create policy material_groups_read_authorized
on public.material_groups for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy uom_catalog_read_authorized
on public.uom_catalog for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy materials_read_authorized
on public.materials for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy material_uom_conversions_read_authorized
on public.material_uom_conversions for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy uom_conversion_snapshots_read_authorized
on public.uom_conversion_snapshots for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy warehouses_read_authorized
on public.warehouses for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy vehicles_read_authorized
on public.vehicles for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy vehicle_load_profiles_read_authorized
on public.vehicle_load_profiles for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy employee_operational_profiles_read_authorized
on public.employee_operational_profiles for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy worker_skill_catalog_read_authorized
on public.worker_skill_catalog for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);
create policy worker_skills_read_authorized
on public.worker_skills for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('master_data.read'))
    or (select app_private.has_permission('master_data.manage'))
  )
);

insert into public.permissions (code, description_vi) values
  ('master_data.read', 'Xem dữ liệu danh mục và quy đổi đơn vị'),
  ('master_data.manage', 'Quản lý dữ liệu danh mục và quy đổi đơn vị')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'master_data.read',
  'master_data.manage'
)
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code = 'master_data.read'
where role.code in (
  'PURCHASING_SOURCING',
  'DISPATCHER',
  'WAREHOUSE',
  'SUPERVISOR',
  'AUDITOR_VIEWER'
)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code = 'master_data.manage'
where role.code in ('PURCHASING_SOURCING', 'WAREHOUSE')
on conflict do nothing;

insert into public.uom_catalog (
  code,
  symbol,
  name_vi,
  dimension,
  decimal_scale
) values
  ('KG', 'kg', 'Kilôgam', 'MASS', 3),
  ('TON', 'tấn', 'Tấn', 'MASS', 3),
  ('M3', 'm³', 'Mét khối', 'VOLUME', 3),
  ('BAG', 'bao', 'Bao', 'COUNT', 0),
  ('PCS', 'cái', 'Cái', 'COUNT', 0),
  ('M', 'm', 'Mét', 'LENGTH', 3),
  ('M2', 'm²', 'Mét vuông', 'AREA', 3)
on conflict (code) do nothing;

insert into public.worker_skill_catalog (code, name_vi, description) values
  ('DRIVE_HEAVY', 'Lái xe tải nặng', 'Năng lực lái xe tải phục vụ giao nhận'),
  ('FORKLIFT', 'Vận hành xe nâng', 'Năng lực vận hành xe nâng tại kho/bãi'),
  ('LOAD_UNLOAD', 'Bốc xếp vật liệu', 'Năng lực bốc xếp an toàn'),
  ('MATERIAL_MEASURE', 'Đo lường vật liệu', 'Năng lực cân, đo thể tích và ghi nhận số liệu')
on conflict (code) do nothing;
