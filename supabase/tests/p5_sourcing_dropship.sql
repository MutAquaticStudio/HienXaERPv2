begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '50000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'p5-owner@example.test', '', now(),
  now(), now(), '{}'::jsonb, '{"display_name":"Quản trị P5"}'::jsonb
);

update public.user_profiles
set status = 'ACTIVE', activated_at = now()
where user_id = '50000000-0000-4000-8000-000000000001';

insert into public.user_roles (user_id, role_id)
select '50000000-0000-4000-8000-000000000001', id
from public.roles where code = 'OWNER_ADMIN';

insert into public.material_groups (id, code, name_vi) values (
  '51000000-0000-4000-8000-000000000001', 'P5-STEEL', 'Thép xây dựng P5'
);
insert into public.materials (
  id, material_group_id, code, name_vi, base_uom_id, purchase_uom_id,
  sales_uom_id
) values (
  '51000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000001',
  'P5-STEEL-D16', 'Thép D16 P5',
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'KG')
);
insert into public.warehouses (id, code, name_vi, address) values (
  '51000000-0000-4000-8000-000000000003',
  'P5-WH', 'Kho P5', 'Đông Anh, Hà Nội'
);

insert into public.customers (id, code, name_vi, tier) values (
  '52000000-0000-4000-8000-000000000001',
  'P5-CUSTOMER', 'Khách hàng P5', 'GOLD'
);
insert into public.customer_sites (
  id, customer_id, code, name_vi, address, is_default
) values (
  '52000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001',
  'P5-SITE', 'Công trình P5', 'Gia Lâm, Hà Nội', true
);
insert into public.customer_price_rules (
  id, scope, customer_id, material_id, unit_price, currency, uom_id,
  valid_from, version, change_reason, created_by
) values (
  '52000000-0000-4000-8000-000000000003', 'CUSTOMER_MATERIAL',
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  18000, 'VND', (select id from public.uom_catalog where code = 'KG'),
  '2026-01-01', 1, 'Giá bán dùng cho kiểm thử P5',
  '50000000-0000-4000-8000-000000000001'
);
insert into public.selling_price_snapshots (
  id, source_price_rule_id, transaction_ref, customer_id, customer_code,
  customer_name_vi, material_id, material_code, material_name_vi, scope,
  unit_price, currency, uom_id, uom_symbol, rule_version, rule_valid_from,
  captured_by
) values (
  '52000000-0000-4000-8000-000000000004',
  '52000000-0000-4000-8000-000000000003', 'P5-QUOTE-LINE-001',
  '52000000-0000-4000-8000-000000000001', 'P5-CUSTOMER', 'Khách hàng P5',
  '51000000-0000-4000-8000-000000000002', 'P5-STEEL-D16', 'Thép D16 P5',
  'CUSTOMER_MATERIAL', 18000, 'VND',
  (select id from public.uom_catalog where code = 'KG'), 'kg', 1,
  '2026-01-01', '50000000-0000-4000-8000-000000000001'
);

insert into public.quotations (
  id, quotation_number, customer_id, customer_site_id, owner_user_id, created_by
) values (
  '53000000-0000-4000-8000-000000000001', 'BG-P5-0001',
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001'
);
insert into public.quotation_revisions (
  id, quotation_id, revision_number, valid_until, created_by
) values (
  '53000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000001', 1, '2026-12-31',
  '50000000-0000-4000-8000-000000000001'
);
update public.quotations
set active_revision_id = '53000000-0000-4000-8000-000000000002'
where id = '53000000-0000-4000-8000-000000000001';
insert into public.quotation_lines (
  id, revision_id, line_number, material_id, material_code_snapshot,
  material_name_snapshot, quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
  price_rule_id, price_snapshot_id, reference_unit_price, unit_price, currency,
  price_safety_status, created_by
) values (
  '53000000-0000-4000-8000-000000000003',
  '53000000-0000-4000-8000-000000000002', 1,
  '51000000-0000-4000-8000-000000000002', 'P5-STEEL-D16', 'Thép D16 P5', 100,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"code":"KG","name":"Kilôgam","symbol":"kg","decimalScale":3}'::jsonb,
  '52000000-0000-4000-8000-000000000003',
  '52000000-0000-4000-8000-000000000004',
  18000, 18000, 'VND', 'RULE_MATCH',
  '50000000-0000-4000-8000-000000000001'
);
update public.quotation_revisions
set status = 'SENT', sent_at = now(), locked_at = now()
where id = '53000000-0000-4000-8000-000000000002';
update public.quotation_revisions
set status = 'ACCEPTED', accepted_at = now()
where id = '53000000-0000-4000-8000-000000000002';
update public.quotations set status = 'ACCEPTED'
where id = '53000000-0000-4000-8000-000000000001';

insert into public.sales_orders (
  id, sales_order_number, quotation_id, quotation_revision_id, customer_id,
  customer_code_snapshot, customer_name_snapshot, customer_site_id,
  customer_site_name_snapshot, status, currency, total_amount, credit_status,
  credit_decision_snapshot, confirmed_by, confirmed_at, created_by
) values (
  '54000000-0000-4000-8000-000000000001', 'SO-P5-0001',
  '53000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001', 'P5-CUSTOMER', 'Khách hàng P5',
  '52000000-0000-4000-8000-000000000002', 'Công trình P5',
  'CONFIRMED', 'VND', 1800000, 'CLEAR', '{"decision":"CLEAR"}'::jsonb,
  '50000000-0000-4000-8000-000000000001', now(),
  '50000000-0000-4000-8000-000000000001'
);
insert into public.sales_order_lines (
  id, sales_order_id, source_quotation_line_id, line_number, material_id,
  material_code_snapshot, material_name_snapshot, ordered_quantity, uom_id,
  uom_symbol_snapshot, uom_snapshot, price_rule_id, price_snapshot_id,
  reference_unit_price, unit_price, currency, line_amount, price_safety_status
) values (
  '54000000-0000-4000-8000-000000000002',
  '54000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000003', 1,
  '51000000-0000-4000-8000-000000000002', 'P5-STEEL-D16', 'Thép D16 P5', 100,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"code":"KG","name":"Kilôgam","symbol":"kg","decimalScale":3}'::jsonb,
  '52000000-0000-4000-8000-000000000003',
  '52000000-0000-4000-8000-000000000004',
  18000, 18000, 'VND', 1800000, 'RULE_MATCH'
);
insert into public.fulfillment_requirements (
  id, sales_order_id, sales_order_line_id, status, required_quantity, uom_id,
  uom_symbol_snapshot, customer_site_id
) values (
  '54000000-0000-4000-8000-000000000003',
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000002', 'READY', 100,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '52000000-0000-4000-8000-000000000002'
);

insert into public.suppliers (
  id, code, name_vi, tax_code, address, created_by
) values (
  '55000000-0000-4000-8000-000000000001',
  'P5-SUPPLIER', 'Nhà cung cấp P5', '0101234567', 'Hải Phòng',
  '50000000-0000-4000-8000-000000000001'
);
insert into public.supplier_price_history (
  id, supplier_id, material_id, uom_id, unit_cost, currency, valid_from,
  version, change_reason, created_by
) values (
  '55000000-0000-4000-8000-000000000002',
  '55000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  (select id from public.uom_catalog where code = 'KG'),
  15000, 'VND', '2026-01-01', 1,
  'Giá mua hiệu lực cho kiểm thử P5',
  '50000000-0000-4000-8000-000000000001'
);

insert into public.supply_allocations (
  id, fulfillment_requirement_id, sales_order_line_id, sourcing_mode,
  warehouse_id, allocated_quantity, uom_id, uom_symbol_snapshot, created_by
) values (
  '56000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000003',
  '54000000-0000-4000-8000-000000000002', 'WAREHOUSE',
  '51000000-0000-4000-8000-000000000003', 40,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '50000000-0000-4000-8000-000000000001'
);
insert into public.supply_allocations (
  id, fulfillment_requirement_id, sales_order_line_id, sourcing_mode,
  supplier_id, direct_customer_id, direct_customer_site_id, allocated_quantity,
  uom_id, uom_symbol_snapshot, created_by
) values (
  '56000000-0000-4000-8000-000000000002',
  '54000000-0000-4000-8000-000000000003',
  '54000000-0000-4000-8000-000000000002', 'SUPPLIER_DIRECT',
  '55000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002', 60,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '50000000-0000-4000-8000-000000000001'
);

select is(
  (select count(*) from public.supply_allocations
   where sales_order_line_id = '54000000-0000-4000-8000-000000000002'),
  2::bigint,
  'One Sales Order line can use split sourcing'
);
select is(
  (select sum(allocated_quantity) from public.supply_allocations
   where sales_order_line_id = '54000000-0000-4000-8000-000000000002'),
  100::numeric,
  'Split allocations exactly cover the ordered quantity'
);
select throws_ok(
  $$insert into public.supply_allocations (
      fulfillment_requirement_id, sales_order_line_id, sourcing_mode,
      supplier_id, direct_customer_id, direct_customer_site_id,
      allocated_quantity, uom_id, uom_symbol_snapshot, created_by
    ) values (
      '54000000-0000-4000-8000-000000000003',
      '54000000-0000-4000-8000-000000000002', 'SUPPLIER_DIRECT',
      '55000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002', 1,
      (select id from public.uom_catalog where code = 'KG'), 'kg',
      '50000000-0000-4000-8000-000000000001'
    )$$,
  '23514', 'SUPPLY_ALLOCATION_EXCEEDS_ORDERED_QUANTITY',
  'Database prevents concurrent-style over-allocation'
);
select throws_ok(
  $$insert into public.supply_allocations (
      fulfillment_requirement_id, sales_order_line_id, sourcing_mode,
      supplier_id, warehouse_id, direct_customer_id, direct_customer_site_id,
      allocated_quantity, uom_id, uom_symbol_snapshot, status, created_by
    ) values (
      '54000000-0000-4000-8000-000000000003',
      '54000000-0000-4000-8000-000000000002', 'SUPPLIER_DIRECT',
      '55000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000003',
      '52000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002', 1,
      (select id from public.uom_catalog where code = 'KG'), 'kg', 'CANCELLED',
      '50000000-0000-4000-8000-000000000001'
    )$$,
  '23514'
);
select is(
  (select warehouse_id from public.supply_allocations
   where id = '56000000-0000-4000-8000-000000000002'),
  null::uuid,
  'Supplier-direct allocation has no fake warehouse movement'
);
select is(
  (select direct_customer_site_id from public.supply_allocations
   where id = '56000000-0000-4000-8000-000000000002'),
  '52000000-0000-4000-8000-000000000002'::uuid,
  'Supplier-direct allocation retains the real delivery site'
);

update public.supply_allocations
set supplier_delivered_qty = 60,
    customer_accepted_qty = 55,
    customer_billable_qty = 50
where id = '56000000-0000-4000-8000-000000000002';
select results_eq(
  $$select supplier_delivered_qty, customer_accepted_qty, customer_billable_qty
    from public.supply_allocations
    where id = '56000000-0000-4000-8000-000000000002'$$,
  $$values (60::numeric, 55::numeric, 50::numeric)$$,
  'Delivered, accepted, and billable quantities remain separate'
);
select throws_ok(
  $$update public.supply_allocations
    set customer_billable_qty = 56
    where id = '56000000-0000-4000-8000-000000000002'$$,
  '23514'
);

insert into public.purchase_cost_snapshots (
  id, source_supplier_price_id, supplier_id, supplier_code_snapshot,
  supplier_name_snapshot, material_id, material_code_snapshot,
  material_name_snapshot, uom_id, uom_symbol_snapshot, unit_cost, currency,
  supplier_price_version, captured_by
) values (
  '57000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000002',
  '55000000-0000-4000-8000-000000000001', 'P5-SUPPLIER', 'Nhà cung cấp P5',
  '51000000-0000-4000-8000-000000000002', 'P5-STEEL-D16', 'Thép D16 P5',
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  15000, 'VND', 1, '50000000-0000-4000-8000-000000000001'
);
insert into public.purchase_orders (
  id, purchase_order_number, supplier_id, supplier_code_snapshot,
  supplier_name_snapshot, currency, total_amount, delivery_mode,
  direct_customer_id, direct_customer_site_id, created_by
) values (
  '57000000-0000-4000-8000-000000000002', 'PO-P5-0001',
  '55000000-0000-4000-8000-000000000001', 'P5-SUPPLIER', 'Nhà cung cấp P5',
  'VND', 900000, 'SUPPLIER_DIRECT',
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001'
);
insert into public.purchase_order_lines (
  id, purchase_order_id, sales_order_line_id, supply_allocation_id, line_number,
  material_id, material_code_snapshot, material_name_snapshot, ordered_quantity,
  uom_id, uom_symbol_snapshot, uom_snapshot, purchase_cost_snapshot_id,
  unit_cost, currency, line_amount
) values (
  '57000000-0000-4000-8000-000000000003',
  '57000000-0000-4000-8000-000000000002',
  '54000000-0000-4000-8000-000000000002',
  '56000000-0000-4000-8000-000000000002', 1,
  '51000000-0000-4000-8000-000000000002', 'P5-STEEL-D16', 'Thép D16 P5', 60,
  (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"code":"KG","name":"Kilôgam","symbol":"kg","decimalScale":3}'::jsonb,
  '57000000-0000-4000-8000-000000000001', 15000, 'VND', 900000
);
update public.supply_allocations
set purchase_order_line_id = '57000000-0000-4000-8000-000000000003',
    status = 'ORDERED'
where id = '56000000-0000-4000-8000-000000000002';

select is(
  (select sales_order_line_id from public.purchase_order_lines
   where id = '57000000-0000-4000-8000-000000000003'),
  '54000000-0000-4000-8000-000000000002'::uuid,
  'Purchase Order line remains linked to its Sales Order line'
);
select throws_ok(
  $$update public.purchase_cost_snapshots set unit_cost = 14900
    where id = '57000000-0000-4000-8000-000000000001'$$,
  '22000', 'HISTORICAL_RECORD_IMMUTABLE',
  'Purchase-cost snapshot is immutable'
);
select throws_ok(
  $$update public.purchase_order_lines set unit_cost = 14900
    where id = '57000000-0000-4000-8000-000000000003'$$,
  '22000', 'HISTORICAL_RECORD_IMMUTABLE',
  'Purchase Order line snapshot is immutable'
);

insert into public.evidence (
  id, owner_user_id, storage_path, entity_type, entity_id, content_type, byte_size
) values (
  '58000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001/purchase-orders/PO-P5-0001.pdf',
  'PURCHASE_ORDER', '57000000-0000-4000-8000-000000000002',
  'application/pdf', 1024
);
insert into public.purchase_order_evidence (
  purchase_order_id, evidence_id, label, linked_by
) values (
  '57000000-0000-4000-8000-000000000002',
  '58000000-0000-4000-8000-000000000001', 'Xác nhận đơn mua P5',
  '50000000-0000-4000-8000-000000000001'
);
select is(
  (select count(*) from public.purchase_order_evidence
   where purchase_order_id = '57000000-0000-4000-8000-000000000002'),
  1::bigint,
  'Purchase Order carries immutable evidence'
);

select lives_ok(
  $$select app_private.transition_purchase_order(
    '57000000-0000-4000-8000-000000000002', 'CONFIRMED',
    '50000000-0000-4000-8000-000000000001', null
  )$$,
  'Authorized actor can confirm a Purchase Order with lines'
);
select is(
  (select status::text from public.purchase_orders
   where id = '57000000-0000-4000-8000-000000000002'),
  'CONFIRMED'::text,
  'Purchase Order reaches CONFIRMED state'
);
select throws_ok(
  $$select app_private.transition_purchase_order(
    '57000000-0000-4000-8000-000000000002', 'DELIVERED',
    '50000000-0000-4000-8000-000000000001', null
  )$$,
  '23514', 'INVALID_PURCHASE_ORDER_TRANSITION',
  'Purchase Order cannot skip its state machine'
);
select is(
  (select count(*) from public.purchase_order_state_transitions
   where purchase_order_id = '57000000-0000-4000-8000-000000000002'),
  1::bigint,
  'Successful Purchase Order transition is audited once'
);
select ok(
  to_regclass('public.payables') is null
    and to_regclass('public.ap_ledger') is null,
  'Purchase Order confirmation creates no AP source of truth'
);
select ok(
  to_regclass('public.inventory_movements') is null,
  'Supplier-direct confirmation creates no inventory movement'
);
select ok(
  not has_table_privilege('authenticated', 'public.purchase_orders', 'INSERT')
    and not has_table_privilege('authenticated', 'public.purchase_orders', 'UPDATE'),
  'Browser clients cannot create or transition Purchase Orders directly'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '50000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*) from public.purchase_orders),
  1::bigint,
  'Authorized owner can read Purchase Orders through RLS'
);

select * from finish(true);
rollback;
