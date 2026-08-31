begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'p3-owner@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{"display_name":"Quản trị P3"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'p3-sales@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{"display_name":"Nhân viên bán hàng P3"}'::jsonb
  );

update public.user_profiles
set status = 'ACTIVE', activated_at = now()
where user_id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002'
);

insert into public.user_roles (user_id, role_id)
select '30000000-0000-4000-8000-000000000001', id
from public.roles where code = 'OWNER_ADMIN';
insert into public.user_roles (user_id, role_id)
select '30000000-0000-4000-8000-000000000002', id
from public.roles where code = 'SALES';

insert into public.material_groups (id, code, name_vi) values
  ('31000000-0000-4000-8000-000000000001', 'P3-CEMENT', 'Xi măng P3'),
  ('31000000-0000-4000-8000-000000000002', 'P3-SAND', 'Cát P3');

insert into public.materials (
  id, material_group_id, code, name_vi, base_uom_id, purchase_uom_id,
  sales_uom_id
) values
  (
    '32000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'P3-CEMENT-A', 'Xi măng P3 A',
    (select id from public.uom_catalog where code = 'KG'),
    (select id from public.uom_catalog where code = 'BAG'),
    (select id from public.uom_catalog where code = 'BAG')
  ),
  (
    '32000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000002',
    'P3-SAND-A', 'Cát P3 A',
    (select id from public.uom_catalog where code = 'M3'),
    (select id from public.uom_catalog where code = 'M3'),
    (select id from public.uom_catalog where code = 'M3')
  );

insert into public.customers (
  id, code, name_vi, tier
) values
  ('33000000-0000-4000-8000-000000000001', 'P3-AN-PHAT', 'An Phát P3', 'GOLD'),
  ('33000000-0000-4000-8000-000000000002', 'P3-GOLD-B', 'Khách Vàng B', 'GOLD'),
  ('33000000-0000-4000-8000-000000000003', 'P3-STANDARD-C', 'Khách Tiêu chuẩn C', 'STANDARD');

insert into public.customer_contacts (
  customer_id, name, role_name, phone, is_primary
) values (
  '33000000-0000-4000-8000-000000000001',
  'Chị Lan P3', 'Mua hàng', '0901000000', true
);
insert into public.customer_sites (
  customer_id, code, name_vi, address, is_default
) values (
  '33000000-0000-4000-8000-000000000001',
  'P3-SITE-A', 'Công trình P3', 'Đông Anh, Hà Nội', true
);

insert into public.customer_price_rules (
  id, scope, customer_id, customer_tier, material_id, material_group_id,
  unit_price, currency, uom_id, valid_from, version, change_reason, created_by
) values
  (
    '34000000-0000-4000-8000-000000000001', 'CUSTOMER_MATERIAL',
    '33000000-0000-4000-8000-000000000001', null,
    '32000000-0000-4000-8000-000000000001', null,
    82000, 'VND', (select id from public.uom_catalog where code = 'BAG'),
    '2026-01-01', 1, 'Giá riêng khách và vật liệu',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '34000000-0000-4000-8000-000000000002', 'CUSTOMER_MATERIAL_GROUP',
    '33000000-0000-4000-8000-000000000001', null, null,
    '31000000-0000-4000-8000-000000000002',
    325000, 'VND', (select id from public.uom_catalog where code = 'M3'),
    '2026-01-01', 1, 'Giá riêng khách và nhóm vật liệu',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '34000000-0000-4000-8000-000000000003', 'CUSTOMER_TIER', null,
    'GOLD', '32000000-0000-4000-8000-000000000001', null,
    84000, 'VND', (select id from public.uom_catalog where code = 'BAG'),
    '2026-01-01', 1, 'Bảng giá hạng Vàng',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '34000000-0000-4000-8000-000000000004', 'DEFAULT', null, null,
    '32000000-0000-4000-8000-000000000001', null,
    87000, 'VND', (select id from public.uom_catalog where code = 'BAG'),
    '2026-01-01', 1, 'Giá mặc định xi măng',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '34000000-0000-4000-8000-000000000005', 'DEFAULT', null, null,
    '32000000-0000-4000-8000-000000000002', null,
    350000, 'VND', (select id from public.uom_catalog where code = 'M3'),
    '2026-01-01', 1, 'Giá mặc định cát',
    '30000000-0000-4000-8000-000000000001'
  );

select is(
  (select unit_price from app_private.resolve_customer_price(
    '33000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001', '2026-08-31'
  )), 82000::numeric,
  'Customer and material price has first priority'
);
select is(
  (select unit_price from app_private.resolve_customer_price(
    '33000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000002', '2026-08-31'
  )), 325000::numeric,
  'Customer and material-group price has second priority'
);
select is(
  (select unit_price from app_private.resolve_customer_price(
    '33000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000001', '2026-08-31'
  )), 84000::numeric,
  'Customer-tier price has third priority'
);
select is(
  (select unit_price from app_private.resolve_customer_price(
    '33000000-0000-4000-8000-000000000003',
    '32000000-0000-4000-8000-000000000001', '2026-08-31'
  )), 87000::numeric,
  'Default material price is the final fallback'
);

select lives_ok(
  $$select app_private.capture_selling_price_snapshot(
    '33000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    '2026-08-31', 'P3-PRICE-001',
    '30000000-0000-4000-8000-000000000001'
  )$$,
  'Effective selling price can be captured as a transaction snapshot'
);

update public.customer_price_rules
set valid_to = '2026-09-30'
where id = '34000000-0000-4000-8000-000000000001';
insert into public.customer_price_rules (
  scope, customer_id, material_id, unit_price, currency, uom_id,
  valid_from, version, change_reason, created_by
) values (
  'CUSTOMER_MATERIAL', '33000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001', 85000, 'VND',
  (select id from public.uom_catalog where code = 'BAG'),
  '2026-10-01', 2, 'Giá riêng mới cho quý IV',
  '30000000-0000-4000-8000-000000000001'
);

select is(
  (select unit_price from app_private.resolve_customer_price(
    '33000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001', '2026-10-01'
  )), 85000::numeric,
  'Future resolution uses the new effective version'
);
select is(
  (select unit_price from public.selling_price_snapshots
    where transaction_ref = 'P3-PRICE-001'),
  82000::numeric,
  'Historical selling price remains unchanged after master update'
);
select throws_ok(
  $$update public.selling_price_snapshots set unit_price = 85000
    where transaction_ref = 'P3-PRICE-001'$$,
  '22000', 'HISTORICAL_RECORD_IMMUTABLE',
  'Selling-price snapshots are immutable'
);
select throws_ok(
  $$update public.customer_price_rules set unit_price = 86000
    where id = '34000000-0000-4000-8000-000000000001'$$,
  '22000', 'PRICE_RULE_VERSION_IMMUTABLE',
  'Price rule versions cannot be rewritten'
);
select throws_ok(
  $$insert into public.customer_price_rules (
      scope, material_id, unit_price, currency, uom_id, valid_from,
      version, change_reason
    ) values (
      'DEFAULT', '32000000-0000-4000-8000-000000000001', 88000, 'VND',
      (select id from public.uom_catalog where code = 'BAG'),
      '2026-06-01', 2, 'Giá chồng lấn không hợp lệ'
    )$$,
  '23514', 'PRICE_RULE_EFFECTIVE_PERIOD_OVERLAP',
  'Effective price periods cannot overlap at one resolution level'
);

insert into public.customer_credit_policies (
  id, customer_id, credit_limit, allowed_overdue_days, valid_from, version,
  change_reason, created_by
) values (
  '35000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  100000000, 7, '2026-01-01', 1, 'Hạn mức P3 đã duyệt',
  '30000000-0000-4000-8000-000000000001'
);
insert into public.customer_credit_exposures (
  customer_id, receivable_amount, uninvoiced_order_amount, overdue_amount,
  oldest_overdue_days, customer_advance_amount
) values (
  '33000000-0000-4000-8000-000000000001',
  90000000, 25000000, 18000000, 21, 5000000
);
insert into public.customer_finance_summaries (
  customer_id, lifetime_revenue, receivable_amount, overdue_amount,
  customer_advance_amount
) values (
  '33000000-0000-4000-8000-000000000001',
  500000000, 90000000, 18000000, 5000000
);

select ok(
  not exists (
    select 1
    from public.roles as role
    join public.role_permissions as role_permission on role_permission.role_id = role.id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.code = 'SALES' and permission.code = 'customer_credit.override'
  ),
  'Sales role cannot bypass credit without explicit override permission'
);
select ok(
  exists (
    select 1
    from public.roles as role
    join public.role_permissions as role_permission on role_permission.role_id = role.id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where role.code = 'OWNER_ADMIN'
      and permission.code = 'customer_credit.override'
  ),
  'Owner has explicit credit override permission'
);
select throws_ok(
  $$insert into public.customer_credit_override_events (
      customer_id, policy_id, order_amount, reason, exposure_snapshot, approved_by
    ) values (
      '33000000-0000-4000-8000-000000000001',
      '35000000-0000-4000-8000-000000000001',
      10000000, 'Ngắn', '{}'::jsonb,
      '30000000-0000-4000-8000-000000000001'
    )$$,
  '23514', null,
  'Credit override requires a meaningful reason'
);
select results_eq(
  $$select receivable_amount, customer_advance_amount
    from public.customer_finance_summaries
    where customer_id = '33000000-0000-4000-8000-000000000001'$$,
  $$values (90000000::numeric, 5000000::numeric)$$,
  'Customer advance remains separate from receivables'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.customers),
  3::bigint,
  'Authorized sales user can read Customer 360 through RLS'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.customer_credit_override_events', 'INSERT'
  ),
  'Browser clients cannot insert credit overrides directly'
);

select * from finish(true);
rollback;
