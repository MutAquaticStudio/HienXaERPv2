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
    '40000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'p4-owner@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{"display_name":"Quản trị P4"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'p4-sales@example.test', '', now(),
    now(), now(), '{}'::jsonb, '{"display_name":"Nhân viên bán hàng P4"}'::jsonb
  );

update public.user_profiles
set status = 'ACTIVE', activated_at = now()
where user_id in (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002'
);

insert into public.user_roles (user_id, role_id)
select '40000000-0000-4000-8000-000000000001', id
from public.roles where code = 'OWNER_ADMIN';
insert into public.user_roles (user_id, role_id)
select '40000000-0000-4000-8000-000000000002', id
from public.roles where code = 'SALES';

insert into public.material_groups (id, code, name_vi) values (
  '41000000-0000-4000-8000-000000000001', 'P4-CEMENT', 'Xi măng P4'
);
insert into public.materials (
  id, material_group_id, code, name_vi, base_uom_id, purchase_uom_id,
  sales_uom_id
) values (
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'P4-CEMENT-A', 'Xi măng P4 A',
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'BAG'),
  (select id from public.uom_catalog where code = 'BAG')
);

insert into public.customers (id, code, name_vi, tier) values (
  '43000000-0000-4000-8000-000000000001',
  'P4-AN-PHAT', 'An Phát P4', 'GOLD'
);
insert into public.customer_sites (
  id, customer_id, code, name_vi, address, is_default
) values (
  '43000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001',
  'P4-SITE', 'Công trình P4', 'Đông Anh, Hà Nội', true
);
insert into public.customer_price_rules (
  id, scope, customer_id, material_id, unit_price, currency, uom_id,
  valid_from, version, change_reason, created_by
) values (
  '44000000-0000-4000-8000-000000000001', 'CUSTOMER_MATERIAL',
  '43000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  82000, 'VND', (select id from public.uom_catalog where code = 'BAG'),
  '2026-01-01', 1, 'Giá riêng dùng cho kiểm thử P4',
  '40000000-0000-4000-8000-000000000001'
);
insert into public.customer_credit_policies (
  id, customer_id, credit_limit, allowed_overdue_days, valid_from, version,
  change_reason, created_by
) values (
  '44000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001',
  500000000, 15, '2026-01-01', 1, 'Hạn mức dùng cho kiểm thử P4',
  '40000000-0000-4000-8000-000000000001'
);
insert into public.customer_credit_exposures (
  customer_id, receivable_amount, uninvoiced_order_amount, overdue_amount,
  oldest_overdue_days, customer_advance_amount
) values (
  '43000000-0000-4000-8000-000000000001',
  10000000, 20000000, 0, 0, 5000000
);

insert into public.quotations (
  id, quotation_number, customer_id, customer_site_id, owner_user_id, created_by
) values (
  '45000000-0000-4000-8000-000000000001', 'BG-P4-0001',
  '43000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002'
);
insert into public.quotation_revisions (
  id, quotation_id, revision_number, valid_until, created_by
) values (
  '45000000-0000-4000-8000-000000000002',
  '45000000-0000-4000-8000-000000000001', 1, '2026-12-31',
  '40000000-0000-4000-8000-000000000002'
);
update public.quotations
set active_revision_id = '45000000-0000-4000-8000-000000000002'
where id = '45000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select app_private.capture_selling_price_snapshot(
    '43000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '2026-09-01', 'P4-QUOTE-LINE-001',
    '40000000-0000-4000-8000-000000000002'
  )$$,
  'Draft quote line can capture the effective selling-price snapshot'
);

insert into public.quotation_lines (
  id, revision_id, line_number, material_id, material_code_snapshot,
  material_name_snapshot, quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
  price_rule_id, price_snapshot_id, reference_unit_price, unit_price, currency,
  price_safety_status, created_by
) values (
  '45000000-0000-4000-8000-000000000003',
  '45000000-0000-4000-8000-000000000002', 1,
  '42000000-0000-4000-8000-000000000001', 'P4-CEMENT-A', 'Xi măng P4 A', 100,
  (select id from public.uom_catalog where code = 'BAG'), 'bao',
  '{"code":"BAG","name":"Bao","symbol":"bao","decimalScale":0}'::jsonb,
  '44000000-0000-4000-8000-000000000001',
  (select id from public.selling_price_snapshots where transaction_ref = 'P4-QUOTE-LINE-001'),
  82000, 82000, 'VND', 'RULE_MATCH',
  '40000000-0000-4000-8000-000000000002'
);

select is(
  (select total_amount from public.quotation_revisions
   where id = '45000000-0000-4000-8000-000000000002'),
  8200000::numeric,
  'Draft revision total is derived from its lines'
);

update public.quotation_revisions
set status = 'SENT', sent_at = now(), locked_at = now()
where id = '45000000-0000-4000-8000-000000000002';
update public.quotations set status = 'SENT'
where id = '45000000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.quotation_lines set unit_price = 80000
    where id = '45000000-0000-4000-8000-000000000003'$$,
  '22000', 'QUOTATION_REVISION_LOCKED',
  'Sent quotation lines are immutable'
);
select throws_ok(
  $$update public.quotation_revisions set valid_until = '2027-01-31'
    where id = '45000000-0000-4000-8000-000000000002'$$,
  '22000', 'QUOTATION_REVISION_LOCKED',
  'Sent quotation revision values are immutable'
);

insert into public.price_approval_events (
  id, quotation_line_id, reference_unit_price, approved_unit_price,
  discount_percent, reason, approved_by
) values (
  '45000000-0000-4000-8000-000000000004',
  '45000000-0000-4000-8000-000000000003',
  82000, 80000, 2.4390, 'Giảm giá theo khối lượng đã được duyệt.',
  '40000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$delete from public.price_approval_events
    where id = '45000000-0000-4000-8000-000000000004'$$,
  '22000', 'HISTORICAL_RECORD_IMMUTABLE',
  'Price approval evidence is immutable'
);

update public.quotation_revisions
set status = 'ACCEPTED', accepted_at = now()
where id = '45000000-0000-4000-8000-000000000002';
update public.quotations set status = 'ACCEPTED'
where id = '45000000-0000-4000-8000-000000000001';

insert into public.sales_orders (
  id, sales_order_number, quotation_id, quotation_revision_id, customer_id,
  customer_code_snapshot, customer_name_snapshot, customer_site_id,
  customer_site_name_snapshot, currency, total_amount, created_by
) values (
  '46000000-0000-4000-8000-000000000001', 'SO-P4-0001',
  '45000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001', 'P4-AN-PHAT', 'An Phát P4',
  '43000000-0000-4000-8000-000000000002', 'Công trình P4',
  'VND', 8200000, '40000000-0000-4000-8000-000000000002'
);
insert into public.sales_order_lines (
  id, sales_order_id, source_quotation_line_id, line_number, material_id,
  material_code_snapshot, material_name_snapshot, ordered_quantity,
  uom_id, uom_symbol_snapshot, uom_snapshot, price_rule_id, price_snapshot_id,
  reference_unit_price, unit_price, currency, line_amount, price_safety_status
) select
  '46000000-0000-4000-8000-000000000002',
  '46000000-0000-4000-8000-000000000001', line.id, line.line_number,
  line.material_id, line.material_code_snapshot, line.material_name_snapshot,
  line.quantity, line.uom_id, line.uom_symbol_snapshot, line.uom_snapshot,
  line.price_rule_id, line.price_snapshot_id, line.reference_unit_price,
  line.unit_price, line.currency, line.line_amount, line.price_safety_status
from public.quotation_lines as line
where line.id = '45000000-0000-4000-8000-000000000003';

select is(
  (select unit_price from public.sales_order_lines
   where id = '46000000-0000-4000-8000-000000000002'),
  82000::numeric,
  'Sales Order copies the accepted quotation price snapshot'
);
select is(
  (select uom_symbol_snapshot from public.sales_order_lines
   where id = '46000000-0000-4000-8000-000000000002'),
  'bao'::text,
  'Sales Order copies the accepted quotation UOM snapshot'
);
select throws_ok(
  $$update public.sales_order_lines set unit_price = 81000
    where id = '46000000-0000-4000-8000-000000000002'$$,
  '22000', 'SALES_ORDER_LINE_IMMUTABLE',
  'Sales Order line price and UOM snapshots are immutable'
);

select lives_ok(
  $$select app_private.confirm_sales_order(
    '46000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', null
  )$$,
  'Authorized confirmation passes credit and runs atomically'
);
select is(
  (select status::text from public.sales_orders
   where id = '46000000-0000-4000-8000-000000000001'),
  'CONFIRMED'::text,
  'Sales Order reaches CONFIRMED state'
);
select is(
  (select count(*) from public.fulfillment_requirements
   where sales_order_id = '46000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Confirmation creates one fulfillment requirement per order line'
);
select results_eq(
  $$select receivable_amount, uninvoiced_order_amount
    from public.customer_credit_exposures
    where customer_id = '43000000-0000-4000-8000-000000000001'$$,
  $$values (10000000::numeric, 28200000::numeric)$$,
  'Confirmation increases uninvoiced exposure but does not create customer debt'
);
select results_eq(
  $$select count(*), to_regclass('public.ar_ledger') is null
    from public.receivables
    where sales_order_id = '46000000-0000-4000-8000-000000000001'$$,
  $$values (0::bigint, true)$$,
  'P4 confirmation creates no receivable or legacy AR entry before delivery acceptance'
);
select ok(
  not exists (
    select 1
    from public.roles as role
    join public.role_permissions as rp on rp.role_id = role.id
    join public.permissions as permission on permission.id = rp.permission_id
    where role.code = 'SALES' and permission.code = 'price.override'
  ),
  'Sales role cannot approve a below-rule price'
);
select ok(
  not has_table_privilege('authenticated', 'public.sales_orders', 'INSERT')
    and not has_table_privilege('authenticated', 'public.sales_orders', 'UPDATE'),
  'Browser clients cannot create or confirm Sales Orders directly'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*) from public.quotations),
  1::bigint,
  'Authorized sales user can read quotations through RLS'
);

select * from finish(true);
rollback;
