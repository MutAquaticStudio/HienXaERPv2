-- FB3 P1: delete_catalog_record removes a catalog record (with its own set-up: units, prices, thresholds, sites)
-- only while no document uses it; otherwise nothing is removed and the caller is told it is in use.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7d000000-0000-4000-8000-000000000001', 'nt_kg15', 'Kilôgam thử 15', 'kg'),
  ('7d000000-0000-4000-8000-000000000002', 'nt_bao15', 'Bao thử 15', 'bao');
insert into public.material_groups(id, code, name) values ('7d000000-0000-4000-8000-000000000003', 'NT_G15', 'Nhóm thử 15');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7d000000-0000-4000-8000-000000000010', '7d000000-0000-4000-8000-000000000003', 'NT_DEL1', 'Vật tư chưa dùng', '7d000000-0000-4000-8000-000000000001'),
  ('7d000000-0000-4000-8000-000000000011', '7d000000-0000-4000-8000-000000000003', 'NT_DEL2', 'Vật tư đã bán', '7d000000-0000-4000-8000-000000000001');
insert into public.warehouses(id, branch_id, code, name) values
  ('7d000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_KD1', 'Kho thử xóa');
-- The unused material has a selling unit, a price, a purchase price and a stock threshold of its own.
insert into public.material_uom_conversions(id, material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type) values
  ('7d000000-0000-4000-8000-000000000030', '7d000000-0000-4000-8000-000000000010', '7d000000-0000-4000-8000-000000000002', '7d000000-0000-4000-8000-000000000001', 50, 1, 'PACKAGING');
insert into public.pricing_rules(id, branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('7d000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7d000000-0000-4000-8000-000000000010', '7d000000-0000-4000-8000-000000000001', 2000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
insert into public.suppliers(id, branch_id, code, name) values
  ('7d000000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_NCCX', 'NCC chưa dùng');
insert into public.supplier_contacts(supplier_id, name) values ('7d000000-0000-4000-8000-000000000040', 'Người liên hệ');
insert into public.purchase_price_rules(branch_id, supplier_id, material_id, purchase_uom_id, unit_cost_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', '7d000000-0000-4000-8000-000000000040', '7d000000-0000-4000-8000-000000000010', '7d000000-0000-4000-8000-000000000001', 1500, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_stock_thresholds(branch_id, warehouse_id, material_id, threshold_base_quantity, created_by, updated_by) values
  ('20000000-0000-4000-8000-00000000000a', '7d000000-0000-4000-8000-000000000020', '7d000000-0000-4000-8000-000000000010', 10, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
-- One customer never ordered (site + own price), one customer with an order on the used material.
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7d000000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', 'NT_KHX1', 'Khách chưa mua', 'BUSINESS'),
  ('7d000000-0000-4000-8000-000000000051', '20000000-0000-4000-8000-00000000000a', 'NT_KHX2', 'Khách đã mua', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7d000000-0000-4000-8000-000000000052', '7d000000-0000-4000-8000-000000000050', 'CT1', 'Công trình chưa dùng', 'Địa chỉ thử'),
  ('7d000000-0000-4000-8000-000000000053', '7d000000-0000-4000-8000-000000000051', 'CT1', 'Công trình đã giao', 'Địa chỉ thử');
insert into public.pricing_rules(branch_id, scope_type, customer_id, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'CUSTOMER_MATERIAL', '7d000000-0000-4000-8000-000000000050', '7d000000-0000-4000-8000-000000000011', '7d000000-0000-4000-8000-000000000001', 1900, 1, 'CONTRACT', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by) values
  ('7d000000-0000-4000-8000-000000000060', '20000000-0000-4000-8000-00000000000a', 'NT-SO-DEL', '7d000000-0000-4000-8000-000000000051',
   '7d000000-0000-4000-8000-000000000053', 'DRAFT', 'Khách đã mua', 'Công trình đã giao', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001');
insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7d000000-0000-4000-8000-000000000060', 1, '7d000000-0000-4000-8000-000000000011', 'Vật tư đã bán', '7d000000-0000-4000-8000-000000000001',
   '7d000000-0000-4000-8000-000000000001', 3, 1, 1, 'HALF_UP', 2000, 6000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  unused_material constant uuid := '7d000000-0000-4000-8000-000000000010';
  sold_material constant uuid := '7d000000-0000-4000-8000-000000000011';
  op constant uuid := '7d000000-0000-4000-8000-0000000000f1';
  failed text;
  failed_message text;
begin
  -- Readers, other branches and unknown kinds are refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.delete_catalog_record('materials', unused_material, branch, 'Tạo nhầm', op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.delete_catalog_record('customers', '7d000000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000b', 'Tạo nhầm', op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('customer of another branch must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.delete_catalog_record('branches', branch, branch, 'Tạo nhầm', op); exception when others then failed := sqlstate; end;
  assert failed = '22023', format('branches are not deletable here, got %s', failed);
  failed := null;
  begin perform public.delete_catalog_record('materials', unused_material, branch, ' ', op); exception when others then failed := sqlstate; end;
  assert failed = '22023', format('reason required, got %s', failed);

  -- A record a document uses stays, with all of its set-up.
  failed := null;
  begin perform public.delete_catalog_record('materials', sold_material, branch, 'Tạo nhầm', '7d000000-0000-4000-8000-0000000000f2');
  exception when others then failed := sqlstate; failed_message := sqlerrm; end;
  assert failed = '23503' and failed_message = 'catalog_record_in_use', format('used material must stay, got %s %s', failed, failed_message);
  failed := null;
  begin perform public.delete_catalog_record('customers', '7d000000-0000-4000-8000-000000000051', branch, 'Tạo nhầm', '7d000000-0000-4000-8000-0000000000f3');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'catalog_record_in_use', format('customer with an order must stay, got %s', failed_message);
  failed_message := null;
  begin perform public.delete_catalog_record('units', '7d000000-0000-4000-8000-000000000002', branch, 'Tạo nhầm', '7d000000-0000-4000-8000-0000000000f4');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'catalog_record_in_use', format('a unit a material sells in must stay, got %s', failed_message);
  failed_message := null;
  begin perform public.delete_catalog_record('groups', '7d000000-0000-4000-8000-000000000003', branch, 'Tạo nhầm', '7d000000-0000-4000-8000-0000000000f5');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'catalog_record_in_use', format('a group with materials must stay, got %s', failed_message);

  -- Unused records go, with their own units, prices and thresholds; replay is idempotent.
  assert public.delete_catalog_record('materials', unused_material, branch, 'Tạo nhầm', op) = unused_material, 'material deleted';
  assert public.delete_catalog_record('materials', unused_material, branch, 'Tạo nhầm', op) = unused_material, 'replay';
  failed := null;
  begin perform public.delete_catalog_record('materials', unused_material, branch, 'Lý do khác', op); exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict, got %s', failed);
  failed := null;
  begin perform public.delete_catalog_record('materials', unused_material, branch, 'Tạo nhầm', '7d000000-0000-4000-8000-0000000000f6'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('already deleted, got %s', failed);
  assert public.delete_catalog_record('customers', '7d000000-0000-4000-8000-000000000050', branch, 'Khách thử', '7d000000-0000-4000-8000-0000000000f7') is not null, 'customer deleted';
  assert public.delete_catalog_record('suppliers', '7d000000-0000-4000-8000-000000000040', branch, 'NCC thử', '7d000000-0000-4000-8000-0000000000f8') is not null, 'supplier deleted';
  assert public.delete_catalog_record('warehouses', '7d000000-0000-4000-8000-000000000020', branch, 'Kho thử', '7d000000-0000-4000-8000-0000000000f9') is not null, 'warehouse deleted';

  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.materials where id = unused_material), 'material row gone';
  assert not exists (select 1 from public.material_uom_conversions where material_id = unused_material), 'its units gone';
  assert not exists (select 1 from public.pricing_rules where material_id = unused_material), 'its prices gone';
  assert not exists (select 1 from public.purchase_price_rules where material_id = unused_material), 'its purchase prices gone';
  assert not exists (select 1 from public.inventory_stock_thresholds where material_id = unused_material), 'its thresholds gone';
  assert not exists (select 1 from public.customer_sites where customer_id = '7d000000-0000-4000-8000-000000000050'), 'customer sites gone';
  assert not exists (select 1 from public.pricing_rules where customer_id = '7d000000-0000-4000-8000-000000000050'), 'customer prices gone';
  assert not exists (select 1 from public.supplier_contacts where supplier_id = '7d000000-0000-4000-8000-000000000040'), 'supplier contacts gone';
  assert exists (select 1 from public.materials where id = sold_material), 'used material kept';
  assert exists (select 1 from public.customer_sites where id = '7d000000-0000-4000-8000-000000000053'), 'used customer site kept';
  assert (select count(*) from public.audit_events where action = 'catalog.delete') = 4, 'four audited deletes';
  assert (select reason from public.audit_events where action = 'catalog.delete' and entity_id = unused_material) = 'Tạo nhầm · đã xóa NT_DEL1 Vật tư chưa dùng',
    'audit keeps what was deleted';
  assert not has_function_privilege('anon', 'public.delete_catalog_record(text, uuid, uuid, text, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
