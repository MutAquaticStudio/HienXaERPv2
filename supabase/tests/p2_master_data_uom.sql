begin;

-- The acceptance suite is self-contained on hosted Supabase. When pgTAP is not
-- already enabled, extension creation is rolled back with the test transaction.
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'p2-owner@example.test',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{"display_name":"Quản trị P2"}'::jsonb
);

update public.user_profiles
set status = 'ACTIVE', activated_at = now()
where user_id = '20000000-0000-4000-8000-000000000001';

insert into public.user_roles (user_id, role_id)
select '20000000-0000-4000-8000-000000000001', id
from public.roles where code = 'OWNER_ADMIN';

insert into public.material_groups (id, code, name_vi) values
  ('21000000-0000-4000-8000-000000000001', 'CEMENT', 'Xi măng');

insert into public.materials (
  id,
  material_group_id,
  code,
  name_vi,
  base_uom_id,
  purchase_uom_id,
  sales_uom_id
) values
  (
    '22000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'CEMENT-A',
    'Xi măng A',
    (select id from public.uom_catalog where code = 'KG'),
    (select id from public.uom_catalog where code = 'BAG'),
    (select id from public.uom_catalog where code = 'BAG')
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    'CEMENT-B',
    'Xi măng B',
    (select id from public.uom_catalog where code = 'KG'),
    (select id from public.uom_catalog where code = 'BAG'),
    (select id from public.uom_catalog where code = 'BAG')
  );

insert into public.material_uom_conversions (
  id,
  material_id,
  from_uom_id,
  to_uom_id,
  source_quantity,
  target_quantity,
  method,
  version,
  created_by
) values
  (
    '23000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    (select id from public.uom_catalog where code = 'BAG'),
    (select id from public.uom_catalog where code = 'KG'),
    1,
    50,
    'PACKAGING',
    1,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    (select id from public.uom_catalog where code = 'BAG'),
    (select id from public.uom_catalog where code = 'KG'),
    1,
    40,
    'PACKAGING',
    1,
    '20000000-0000-4000-8000-000000000001'
  );

select results_eq(
  $$
    select target_quantity::numeric
    from public.material_uom_conversions
    where is_current order by material_id
  $$,
  'values (50::numeric), (40::numeric)',
  'Packaging conversion is material-specific'
);

insert into public.uom_conversion_snapshots (
  source_conversion_id,
  material_id,
  material_code,
  material_name_vi,
  from_uom_code,
  from_uom_symbol,
  to_uom_code,
  to_uom_symbol,
  source_quantity,
  target_quantity,
  method,
  rounding_scale,
  conversion_version,
  transaction_ref,
  captured_by
)
select
  conversion.id,
  material.id,
  material.code,
  material.name_vi,
  source_uom.code,
  source_uom.symbol,
  target_uom.code,
  target_uom.symbol,
  conversion.source_quantity,
  conversion.target_quantity,
  conversion.method,
  conversion.rounding_scale,
  conversion.version,
  'P2-TEST-001',
  '20000000-0000-4000-8000-000000000001'
from public.material_uom_conversions as conversion
join public.materials as material on material.id = conversion.material_id
join public.uom_catalog as source_uom on source_uom.id = conversion.from_uom_id
join public.uom_catalog as target_uom on target_uom.id = conversion.to_uom_id
where conversion.id = '23000000-0000-4000-8000-000000000001';

update public.material_uom_conversions
set is_current = false, valid_to = now()
where id = '23000000-0000-4000-8000-000000000001';

insert into public.material_uom_conversions (
  material_id,
  from_uom_id,
  to_uom_id,
  source_quantity,
  target_quantity,
  method,
  version,
  created_by
) values (
  '22000000-0000-4000-8000-000000000001',
  (select id from public.uom_catalog where code = 'BAG'),
  (select id from public.uom_catalog where code = 'KG'),
  1,
  48,
  'MEASURED',
  2,
  '20000000-0000-4000-8000-000000000001'
);

select is(
  (
    select target_quantity
    from public.uom_conversion_snapshots
    where transaction_ref = 'P2-TEST-001'
  ),
  50::numeric,
  'Historical snapshot remains unchanged after master edit'
);

select throws_ok(
  $$
    update public.uom_conversion_snapshots
    set target_quantity = 48
    where transaction_ref = 'P2-TEST-001'
  $$,
  '22000',
  'HISTORICAL_RECORD_IMMUTABLE',
  'Historical snapshots are immutable'
);

select throws_ok(
  $$
    update public.materials
    set base_uom_id = (select id from public.uom_catalog where code = 'TON')
    where id = '22000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'MATERIAL_BASE_UOM_LOCKED_BY_HISTORY',
  'Material base UOM cannot change after conversion history exists'
);

select throws_ok(
  $$
    insert into public.material_uom_conversions (
      material_id, from_uom_id, to_uom_id, source_quantity, target_quantity,
      method, version
    ) values (
      '22000000-0000-4000-8000-000000000001',
      (select id from public.uom_catalog where code = 'M3'),
      (select id from public.uom_catalog where code = 'KG'),
      1, 1.4, 'EXACT', 1
    )
  $$,
  '23514',
  'EXACT_CONVERSION_REQUIRES_SAME_DIMENSION',
  'Cross-dimension conversion cannot be labelled exact'
);

select throws_ok(
  $$
    insert into public.material_uom_conversions (
      material_id, from_uom_id, to_uom_id, source_quantity, target_quantity,
      method, version
    ) values (
      '22000000-0000-4000-8000-000000000001',
      (select id from public.uom_catalog where code = 'TON'),
      (select id from public.uom_catalog where code = 'BAG'),
      1, 20, 'PACKAGING', 1
    )
  $$,
  '23514',
  'CONVERSION_MUST_TARGET_MATERIAL_BASE_UOM',
  'Conversion graph cannot point away from the material base UOM'
);

update public.uom_catalog
set is_active = false
where code = 'BAG';

select ok(
  exists (select 1 from public.uom_catalog where code = 'BAG' and not is_active),
  'A used UOM can be deactivated without deleting history'
);

insert into public.warehouses (id, code, name_vi) values
  ('24000000-0000-4000-8000-000000000001', 'WH-HX', 'Kho Hiền Xạ');
insert into public.vehicles (
  id, code, plate_number, vehicle_type, home_warehouse_id, max_payload_kg
) values (
  '25000000-0000-4000-8000-000000000001',
  'TRUCK-01',
  '29C-12345',
  'Xe tải ben',
  '24000000-0000-4000-8000-000000000001',
  15000
);
insert into public.vehicle_load_profiles (
  vehicle_id, material_group_id, planned_quantity, uom_id
) values (
  '25000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  12,
  (select id from public.uom_catalog where code = 'TON')
);

select results_eq(
  $$select distinct profile_kind from public.vehicle_load_profiles$$,
  $$values ('PLANNING_CAPACITY'::text)$$,
  'Vehicle load profile remains planning data, not a UOM conversion'
);

insert into public.employee_operational_profiles (
  user_id, employee_code, home_warehouse_id, job_title
) values (
  '20000000-0000-4000-8000-000000000001',
  'EMP-P2-01',
  '24000000-0000-4000-8000-000000000001',
  'Quản trị dữ liệu'
);
insert into public.worker_skills (user_id, skill_id, level)
select
  '20000000-0000-4000-8000-000000000001',
  id,
  'QUALIFIED'
from public.worker_skill_catalog where code = 'MATERIAL_MEASURE';

select ok(
  exists (
    select 1
    from public.worker_skills as worker_skill
    join public.worker_skill_catalog as skill on skill.id = worker_skill.skill_id
    where worker_skill.user_id = '20000000-0000-4000-8000-000000000001'
      and skill.code = 'MATERIAL_MEASURE'
  ),
  'Worker skill baseline is operational'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.materials),
  2::bigint,
  'Authorized active owner can read material master data through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.materials', 'INSERT'),
  'Authenticated clients cannot bypass server commands with direct inserts'
);

select ok(
  exists (select 1 from public.uom_catalog where code = 'BAG' and not is_active),
  'Inactive used UOM remains historically readable through RLS'
);

select ok(
  app_private.has_permission('master_data.manage'),
  'Owner receives P2 master-data management permission'
);

select * from finish();
rollback;
