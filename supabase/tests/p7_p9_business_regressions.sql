begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'remediation-owner@example.test', '', now(),
  now(), now(), '{}'::jsonb, '{"display_name":"Remediation owner"}'::jsonb
);
update public.user_profiles set status = 'ACTIVE', activated_at = now()
where user_id = 'a0000000-0000-4000-8000-000000000001';
insert into public.user_roles (user_id, role_id)
select 'a0000000-0000-4000-8000-000000000001', id
from public.roles where code = 'OWNER_ADMIN';

insert into public.material_groups (id, code, name_vi) values
  ('a1000000-0000-4000-8000-000000000001', 'REMED-GROUP', 'Nhóm kiểm thử khắc phục');
insert into public.materials (
  id, material_group_id, code, name_vi, base_uom_id, purchase_uom_id, sales_uom_id
) values (
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001', 'REMED-MAT', 'Vật liệu khắc phục',
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'KG')
);
insert into public.customers (id, code, name_vi, tier) values
  ('a2000000-0000-4000-8000-000000000001', 'REMED-CUSTOMER', 'Khách kiểm thử', 'GOLD');
insert into public.customer_sites (id, customer_id, code, name_vi, address, is_default) values (
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000001', 'REMED-SITE', 'Công trình kiểm thử',
  'Đông Anh, Hà Nội', true
);
insert into public.customer_price_rules (
  id, scope, customer_id, material_id, unit_price, currency, uom_id,
  valid_from, version, change_reason, created_by
) values (
  'a2000000-0000-4000-8000-000000000003', 'CUSTOMER_MATERIAL',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002', 18000, 'VND',
  (select id from public.uom_catalog where code = 'KG'), '2026-01-01', 1,
  'Giá bán dùng cho kiểm thử khắc phục', 'a0000000-0000-4000-8000-000000000001'
);
insert into public.selling_price_snapshots (
  id, source_price_rule_id, transaction_ref, customer_id, customer_code,
  customer_name_vi, material_id, material_code, material_name_vi, scope,
  unit_price, currency, uom_id, uom_symbol, rule_version, rule_valid_from, captured_by
) values (
  'a2000000-0000-4000-8000-000000000004',
  'a2000000-0000-4000-8000-000000000003', 'REMED-QUOTE-LINE',
  'a2000000-0000-4000-8000-000000000001', 'REMED-CUSTOMER', 'Khách kiểm thử',
  'a1000000-0000-4000-8000-000000000002', 'REMED-MAT', 'Vật liệu khắc phục',
  'CUSTOMER_MATERIAL', 18000, 'VND',
  (select id from public.uom_catalog where code = 'KG'), 'kg', 1, '2026-01-01',
  'a0000000-0000-4000-8000-000000000001'
);

insert into public.quotations (
  id, quotation_number, customer_id, customer_site_id, owner_user_id, created_by
) values (
  'a3000000-0000-4000-8000-000000000001', 'BG-REMED-0001',
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.quotation_revisions (
  id, quotation_id, revision_number, valid_until, created_by
) values (
  'a3000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001', 1, '2026-12-31',
  'a0000000-0000-4000-8000-000000000001'
);
update public.quotations set active_revision_id = 'a3000000-0000-4000-8000-000000000002'
where id = 'a3000000-0000-4000-8000-000000000001';
insert into public.quotation_lines (
  id, revision_id, line_number, material_id, material_code_snapshot,
  material_name_snapshot, quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
  price_rule_id, price_snapshot_id, reference_unit_price, unit_price, currency,
  price_safety_status, created_by
) values (
  'a3000000-0000-4000-8000-000000000003',
  'a3000000-0000-4000-8000-000000000002', 1,
  'a1000000-0000-4000-8000-000000000002', 'REMED-MAT', 'Vật liệu khắc phục', 10,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"code":"KG","name":"Kilôgam","symbol":"kg","decimalScale":3}'::jsonb,
  'a2000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000004', 18000, 18000, 'VND', 'RULE_MATCH',
  'a0000000-0000-4000-8000-000000000001'
);
update public.quotation_revisions
set status = 'SENT', sent_at = now(), locked_at = now()
where id = 'a3000000-0000-4000-8000-000000000002';
update public.quotation_revisions set status = 'ACCEPTED', accepted_at = now()
where id = 'a3000000-0000-4000-8000-000000000002';
update public.quotations set status = 'ACCEPTED'
where id = 'a3000000-0000-4000-8000-000000000001';
insert into public.sales_orders (
  id, sales_order_number, quotation_id, quotation_revision_id, customer_id,
  customer_code_snapshot, customer_name_snapshot, customer_site_id,
  customer_site_name_snapshot, status, currency, total_amount, credit_status,
  credit_decision_snapshot, confirmed_by, confirmed_at, created_by
) values (
  'a4000000-0000-4000-8000-000000000001', 'SO-REMED-0001',
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000001', 'REMED-CUSTOMER', 'Khách kiểm thử',
  'a2000000-0000-4000-8000-000000000002', 'Công trình kiểm thử',
  'CONFIRMED', 'VND', 180000, 'CLEAR', '{"decision":"CLEAR"}'::jsonb,
  'a0000000-0000-4000-8000-000000000001', now(),
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.sales_order_lines (
  id, sales_order_id, source_quotation_line_id, line_number, material_id,
  material_code_snapshot, material_name_snapshot, ordered_quantity, uom_id,
  uom_symbol_snapshot, uom_snapshot, price_rule_id, price_snapshot_id,
  reference_unit_price, unit_price, currency, line_amount, price_safety_status
) values (
  'a4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003', 1,
  'a1000000-0000-4000-8000-000000000002', 'REMED-MAT', 'Vật liệu khắc phục', 10,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"code":"KG","name":"Kilôgam","symbol":"kg","decimalScale":3}'::jsonb,
  'a2000000-0000-4000-8000-000000000003',
  'a2000000-0000-4000-8000-000000000004', 18000, 18000, 'VND', 180000, 'RULE_MATCH'
);
insert into public.fulfillment_requirements (
  id, sales_order_id, sales_order_line_id, status, required_quantity, uom_id,
  uom_symbol_snapshot, customer_site_id
) values (
  'a4000000-0000-4000-8000-000000000003',
  'a4000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002', 'READY', 10,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  'a2000000-0000-4000-8000-000000000002'
);

insert into public.suppliers (id, code, name_vi, tax_code, address, created_by) values (
  'a5000000-0000-4000-8000-000000000001', 'REMED-SUPPLIER', 'Nhà cung cấp kiểm thử',
  '0109999999', 'Hải Phòng', 'a0000000-0000-4000-8000-000000000001'
);
insert into public.supplier_price_history (
  id, supplier_id, material_id, uom_id, unit_cost, currency, valid_from,
  version, change_reason, created_by
) values (
  'a5000000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  (select id from public.uom_catalog where code = 'KG'), 15000, 'VND', '2026-01-01', 1,
  'Giá mua dùng cho kiểm thử khắc phục', 'a0000000-0000-4000-8000-000000000001'
);
insert into public.purchase_cost_snapshots (
  id, source_supplier_price_id, supplier_id, supplier_code_snapshot,
  supplier_name_snapshot, material_id, material_code_snapshot, material_name_snapshot,
  uom_id, uom_symbol_snapshot, unit_cost, currency, supplier_price_version, captured_by
) values (
  'a5000000-0000-4000-8000-000000000003',
  'a5000000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000001', 'REMED-SUPPLIER', 'Nhà cung cấp kiểm thử',
  'a1000000-0000-4000-8000-000000000002', 'REMED-MAT', 'Vật liệu khắc phục',
  (select id from public.uom_catalog where code = 'KG'), 'kg', 15000, 'VND', 1,
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.supply_allocations (
  id, fulfillment_requirement_id, sales_order_line_id, sourcing_mode,
  supplier_id, direct_customer_id, direct_customer_site_id, allocated_quantity,
  uom_id, uom_symbol_snapshot, created_by
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000003',
  'a4000000-0000-4000-8000-000000000002', 'SUPPLIER_DIRECT',
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002', 10,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.purchase_orders (
  id, purchase_order_number, supplier_id, supplier_code_snapshot,
  supplier_name_snapshot, status, currency, total_amount, delivery_mode,
  direct_customer_id, direct_customer_site_id, confirmed_by, confirmed_at,
  sent_by, sent_at, acknowledged_at, created_by
) values (
  'a6000000-0000-4000-8000-000000000002', 'PO-REMED-0001',
  'a5000000-0000-4000-8000-000000000001', 'REMED-SUPPLIER', 'Nhà cung cấp kiểm thử',
  'ACKNOWLEDGED', 'VND', 150000, 'SUPPLIER_DIRECT',
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001', now(),
  'a0000000-0000-4000-8000-000000000001', now(), now(),
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.purchase_order_lines (
  id, purchase_order_id, sales_order_line_id, supply_allocation_id, line_number,
  material_id, material_code_snapshot, material_name_snapshot, ordered_quantity,
  uom_id, uom_symbol_snapshot, uom_snapshot, purchase_cost_snapshot_id,
  unit_cost, currency, line_amount
) values (
  'a6000000-0000-4000-8000-000000000003',
  'a6000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000002',
  'a6000000-0000-4000-8000-000000000001', 1,
  'a1000000-0000-4000-8000-000000000002', 'REMED-MAT', 'Vật liệu khắc phục', 10,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"code":"KG","name":"Kilôgam","symbol":"kg","decimalScale":3}'::jsonb,
  'a5000000-0000-4000-8000-000000000003', 15000, 'VND', 150000
);
update public.supply_allocations
set purchase_order_line_id = 'a6000000-0000-4000-8000-000000000003'
where id = 'a6000000-0000-4000-8000-000000000001';

insert into public.vehicles (id, code, plate_number, vehicle_type) values
  ('a7000000-0000-4000-8000-000000000001', 'REMED-TRUCK', '29C-999.99', 'Xe tải');
insert into public.deliveries (
  id, delivery_number, sales_order_id, customer_id, customer_code_snapshot,
  customer_name_snapshot, customer_site_id, customer_site_name_snapshot,
  sourcing_mode, supplier_id, pickup_address_snapshot, drop_address_snapshot,
  scheduled_date, status, confirmed_at, confirmed_by, created_by
) values (
  'a7000000-0000-4000-8000-000000000002', 'DLV-REMED-0001',
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001', 'REMED-CUSTOMER', 'Khách kiểm thử',
  'a2000000-0000-4000-8000-000000000002', 'Công trình kiểm thử',
  'SUPPLIER_DIRECT', 'a5000000-0000-4000-8000-000000000001',
  'Kho nhà cung cấp Hải Phòng', 'Công trình Đông Anh, Hà Nội', current_date,
  'CONFIRMED', now(), 'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.delivery_lines (
  id, delivery_id, line_number, supply_allocation_id, sales_order_line_id,
  material_id, material_code_snapshot, material_name_snapshot, planned_quantity,
  uom_id, uom_symbol_snapshot
) values (
  'a7000000-0000-4000-8000-000000000003',
  'a7000000-0000-4000-8000-000000000002', 1,
  'a6000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000002', 'REMED-MAT', 'Vật liệu khắc phục', 10,
  (select id from public.uom_catalog where code = 'KG'), 'kg'
);
insert into public.delivery_assignments (
  id, assignment_number, delivery_id, vehicle_id, driver_user_id, status, assigned_by
) values (
  'a7000000-0000-4000-8000-000000000004', 'ASG-REMED-0001',
  'a7000000-0000-4000-8000-000000000002',
  'a7000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', 'COMPLETED',
  'a0000000-0000-4000-8000-000000000001'
);
insert into public.delivery_actuals (
  id, delivery_id, delivery_line_id, actual_quantity, accepted_quantity,
  receiver_name, received_at, recorded_by
) values (
  'a7000000-0000-4000-8000-000000000005',
  'a7000000-0000-4000-8000-000000000002',
  'a7000000-0000-4000-8000-000000000003', 10, 10, 'Người nhận', now(),
  'a0000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$select app_private.initialize_order_profitability(
    'a4000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001')$$,
  'Profitability initializes from commercial truth'
);
select lives_ok(
  $$select app_private.capture_actual_profitability_for_delivery(
    'a7000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001')$$,
  'Confirmed delivery captures actual profitability'
);
select lives_ok(
  $$select app_private.capture_actual_profitability_for_delivery(
    'a7000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001')$$,
  'Repeated capture is idempotent'
);
select is(
  (select count(*) from public.profitability_cost_entries
   where source_entity_id = 'a7000000-0000-4000-8000-000000000005'),
  1::bigint,
  'Repeated capture does not duplicate actual direct cost'
);
select results_eq(
  $$select dimension collate "C" from public.profitability_revenue_allocations
    where source_entity_id = 'a7000000-0000-4000-8000-000000000005'
    order by dimension$$,
  $$values ('MATERIAL'::text collate "C"), ('SUPPLIER'::text collate "C"),
    ('VEHICLE'::text collate "C")$$,
  'Material, supplier and vehicle receive actual revenue attribution'
);
select lives_ok(
  $$select app_private.finalize_order_profitability(
    'a4000000-0000-4000-8000-000000000001',
    'Khóa kết quả kiểm thử sau giao hàng',
    'a0000000-0000-4000-8000-000000000001')$$,
  'Actual profitability can be finalized'
);
select throws_ok(
  $$select app_private.capture_actual_profitability_for_delivery(
    'a7000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001')$$,
  '23514', 'FINALIZED_PROFITABILITY_REQUIRES_REOPEN',
  'Late automatic capture cannot mutate finalized profitability'
);
select lives_ok(
  $$select app_private.reopen_order_profitability(
    'a4000000-0000-4000-8000-000000000001',
    'Mở lại để kiểm thử chi phí phân bổ',
    'a0000000-0000-4000-8000-000000000001')$$,
  'Explicit reopen restores controlled mutation'
);
select lives_ok(
  $$select app_private.create_financial_account(
    'REMED-CASH', 'Quỹ kiểm thử', 'CASH', 'VND', null, null,
    'a0000000-0000-4000-8000-000000000001')$$,
  'Matching-currency account can be created'
);
select lives_ok(
  $$select app_private.create_expense(
    (select id from public.financial_accounts where account_code = 'REMED-CASH'),
    current_date, 'Vận tải', 'Chi phí vận tải phân bổ cho đơn hàng', 'VND', 100000,
    'a0000000-0000-4000-8000-000000000001')$$,
  'Draft expense can be created'
);
select lives_ok(
  $$select app_private.allocate_expense(
    (select id from public.expenses where category = 'Vận tải' order by created_at desc limit 1),
    'ORDER', 'a4000000-0000-4000-8000-000000000001', 40, 'TRANSPORT',
    'Phân bổ vận tải trực tiếp cho đơn hàng',
    'a0000000-0000-4000-8000-000000000001')$$,
  'Expense allocation is an operable command'
);
select is(
  (select amount from public.expense_allocations
   where allocation_reference_id = 'a4000000-0000-4000-8000-000000000001'),
  40000::numeric,
  'Allocation amount is derived from the requested percentage'
);
select lives_ok(
  $$select app_private.post_expense(
    (select id from public.expenses where category = 'Vận tải' order by created_at desc limit 1),
    'a0000000-0000-4000-8000-000000000001')$$,
  'Posting an allocated expense captures order direct cost atomically'
);
select throws_ok(
  $$select app_private.create_expense(
    (select id from public.financial_accounts where account_code = 'REMED-CASH'),
    current_date, 'Vận tải', 'Chi phí sai loại tiền cần bị chặn', 'USD', 100,
    'a0000000-0000-4000-8000-000000000001')$$,
  '23514', 'ACTIVE_ACCOUNT_WITH_MATCHING_CURRENCY_REQUIRED',
  'Expense currency cannot diverge from its financial account'
);

select * from finish(true);
rollback;
