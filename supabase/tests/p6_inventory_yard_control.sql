begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '61000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'p6-owner@example.test', '', now(),
  now(), now(), '{}'::jsonb, '{"display_name":"Quản trị P6"}'::jsonb
);

update public.user_profiles set status = 'ACTIVE', activated_at = now()
where user_id = '61000000-0000-4000-8000-000000000001';
insert into public.user_roles (user_id, role_id)
select '61000000-0000-4000-8000-000000000001', id
from public.roles where code = 'OWNER_ADMIN';

insert into public.material_groups (id, code, name_vi) values (
  '62000000-0000-4000-8000-000000000001', 'P6-SAND', 'Cát kiểm thử P6'
);
insert into public.materials (
  id, material_group_id, code, name_vi, base_uom_id, purchase_uom_id,
  sales_uom_id
) values (
  '62000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000001',
  'P6-SAND-YELLOW', 'Cát vàng P6',
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'KG'),
  (select id from public.uom_catalog where code = 'KG')
);
insert into public.warehouses (id, code, name_vi) values (
  '62000000-0000-4000-8000-000000000003', 'P6-WH', 'Kho kiểm thử P6'
);
insert into public.evidence (
  id, owner_user_id, storage_path, entity_type, content_type, byte_size
) values (
  '62000000-0000-4000-8000-000000000004',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001/stock-counts/P6-count.jpg',
  'STOCK_COUNT', 'image/jpeg', 2048
);

select has_table('public', 'inventory_movements', 'InventoryMovement ledger exists');
select has_table('public', 'stock_reservations', 'StockReservation exists');
select has_table('public', 'warehouse_receipts', 'WarehouseReceipt exists');
select has_table('public', 'warehouse_issues', 'WarehouseIssue exists');
select has_table('public', 'stock_counts', 'StockCount exists');
select has_table('public', 'stock_adjustments', 'StockAdjustment exists');

insert into public.warehouse_receipts (
  id, receipt_number, warehouse_id, status, received_at, notes, created_by
) values (
  '63000000-0000-4000-8000-000000000001', 'RCV-P6-0001',
  '62000000-0000-4000-8000-000000000003', 'DRAFT', now(),
  'Nhập tồn đã đối chiếu', '61000000-0000-4000-8000-000000000001'
);
insert into public.warehouse_receipt_lines (
  id, warehouse_receipt_id, line_number, material_id,
  material_code_snapshot, material_name_snapshot,
  document_quantity, document_uom_id, document_uom_symbol_snapshot,
  base_quantity, base_uom_id, base_uom_symbol_snapshot, conversion_snapshot,
  document_unit_cost, base_unit_cost, currency, line_amount
) values (
  '63000000-0000-4000-8000-000000000002',
  '63000000-0000-4000-8000-000000000001', 1,
  '62000000-0000-4000-8000-000000000002', 'P6-SAND-YELLOW', 'Cát vàng P6',
  100, (select id from public.uom_catalog where code = 'KG'), 'kg',
  100, (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"method":"BASE_UOM_IDENTITY","version":1}', 10, 10, 'VND', 1000
);
select lives_ok(
  $$select app_private.confirm_warehouse_receipt(
    '63000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001')$$,
  'Confirmed receipt posts inventory'
);

insert into public.warehouse_receipts (
  id, receipt_number, warehouse_id, status, received_at, notes, created_by
) values (
  '63000000-0000-4000-8000-000000000003', 'RCV-P6-0002',
  '62000000-0000-4000-8000-000000000003', 'DRAFT', now(),
  'Nhập bổ sung có giá mới', '61000000-0000-4000-8000-000000000001'
);
insert into public.warehouse_receipt_lines (
  id, warehouse_receipt_id, line_number, material_id,
  material_code_snapshot, material_name_snapshot,
  document_quantity, document_uom_id, document_uom_symbol_snapshot,
  base_quantity, base_uom_id, base_uom_symbol_snapshot, conversion_snapshot,
  document_unit_cost, base_unit_cost, currency, line_amount
) values (
  '63000000-0000-4000-8000-000000000004',
  '63000000-0000-4000-8000-000000000003', 1,
  '62000000-0000-4000-8000-000000000002', 'P6-SAND-YELLOW', 'Cát vàng P6',
  50, (select id from public.uom_catalog where code = 'KG'), 'kg',
  50, (select id from public.uom_catalog where code = 'KG'), 'kg',
  '{"method":"BASE_UOM_IDENTITY","version":1}', 14, 14, 'VND', 700
);
select lives_ok(
  $$select app_private.confirm_warehouse_receipt(
    '63000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000001')$$,
  'Second receipt posts inventory'
);
select is(
  (select on_hand_quantity from app_private.inventory_positions
   where warehouse_id = '62000000-0000-4000-8000-000000000003'
     and material_id = '62000000-0000-4000-8000-000000000002'),
  150.000000::numeric, 'On Hand is derived from receipt movements'
);
select is(
  (select moving_average_cost from app_private.inventory_positions
   where warehouse_id = '62000000-0000-4000-8000-000000000003'
     and material_id = '62000000-0000-4000-8000-000000000002'),
  11.333333::numeric, 'Moving weighted average is recalculated on receipt'
);

insert into public.inventory_reorder_policies (
  warehouse_id, material_id, base_uom_id, minimum_quantity, target_quantity,
  change_reason, created_by, updated_by
) values (
  '62000000-0000-4000-8000-000000000003',
  '62000000-0000-4000-8000-000000000002',
  (select id from public.uom_catalog where code = 'KG'), 150, 300,
  'Thiết lập ngưỡng kiểm thử P6',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001'
);
select ok(
  (select is_low_stock from public.inventory_stock_status
   where warehouse_id = '62000000-0000-4000-8000-000000000003'
     and material_id = '62000000-0000-4000-8000-000000000002'),
  'Low-stock flag is derived from available quantity and policy'
);

insert into public.warehouse_issues (
  id, issue_number, warehouse_id, status, issued_at, reason, created_by
) values (
  '64000000-0000-4000-8000-000000000001', 'ISS-P6-0001',
  '62000000-0000-4000-8000-000000000003', 'DRAFT', now(),
  'Xuất vượt tồn để kiểm tra chặn', '61000000-0000-4000-8000-000000000001'
);
insert into public.warehouse_issue_lines (
  id, warehouse_issue_id, line_number, material_id, material_code_snapshot,
  material_name_snapshot, base_quantity, base_uom_id, base_uom_symbol_snapshot
) values (
  '64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000001', 1,
  '62000000-0000-4000-8000-000000000002', 'P6-SAND-YELLOW', 'Cát vàng P6',
  151, (select id from public.uom_catalog where code = 'KG'), 'kg'
);
select throws_ok(
  $$select app_private.confirm_warehouse_issue(
    '64000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001')$$,
  '23514', 'INSUFFICIENT_AVAILABLE_INVENTORY',
  'Warehouse issue cannot oversell available stock'
);

insert into public.stock_counts (
  id, count_number, warehouse_id, status, count_reason, counted_at, created_by
) values (
  '65000000-0000-4000-8000-000000000001', 'CNT-P6-0001',
  '62000000-0000-4000-8000-000000000003', 'DRAFT',
  'Kiểm kê đối chiếu cuối ca', now(), '61000000-0000-4000-8000-000000000001'
);
insert into public.stock_count_lines (
  id, stock_count_id, line_number, material_id, material_code_snapshot,
  material_name_snapshot, base_uom_id, base_uom_symbol_snapshot, counted_quantity
) values (
  '65000000-0000-4000-8000-000000000002',
  '65000000-0000-4000-8000-000000000001', 1,
  '62000000-0000-4000-8000-000000000002', 'P6-SAND-YELLOW', 'Cát vàng P6',
  (select id from public.uom_catalog where code = 'KG'), 'kg', 149
);
select lives_ok(
  $$select app_private.capture_stock_count(
    '65000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001')$$,
  'StockCount captures the locked system quantity'
);
select is(
  (select variance_quantity from public.stock_count_lines
   where id = '65000000-0000-4000-8000-000000000002'),
  (-1.000000)::numeric, 'StockCount stores the counted variance'
);
select lives_ok(
  $$select app_private.approve_stock_adjustment(
    '65000000-0000-4000-8000-000000000001',
    'Duyệt chênh lệch có biên bản kiểm kê',
    '62000000-0000-4000-8000-000000000004',
    '61000000-0000-4000-8000-000000000001')$$,
  'Approved variance creates a StockAdjustment'
);
select is(
  (select status::text from public.stock_counts
   where id = '65000000-0000-4000-8000-000000000001'),
  'ADJUSTED', 'StockCount reaches ADJUSTED only through approval'
);
select is(
  (select count(*) from public.inventory_movements
   where source_entity_type = 'STOCK_ADJUSTMENT'),
  1::bigint, 'StockAdjustment posts exactly one InventoryMovement'
);
select throws_ok(
  $$update public.inventory_movements set reason = 'Sửa trực tiếp'
    where source_entity_type = 'STOCK_ADJUSTMENT'$$,
  '22000', 'HISTORICAL_RECORD_IMMUTABLE',
  'InventoryMovement ledger is immutable'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_movements', 'INSERT')
    and not has_table_privilege('authenticated', 'public.stock_reservations', 'UPDATE'),
  'Browser clients cannot mutate inventory or reservations directly'
);

select * from finish(true);
rollback;
