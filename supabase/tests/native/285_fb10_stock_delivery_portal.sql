-- FB10: stock count with a device clock ahead; office-verified partial delivery returns the rest; a declined plan can be
-- cancelled; a customer's accountant cannot order.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000285');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000285', '10000000-0000-4000-8000-000000000285', 'NT_W285', 'Thợ thử 285');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000285', 'nt_worker285', 'Thợ thử 285');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000285', 'work.read'), ('40000000-0000-4000-8000-000000000285', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000285', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000285');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f2a0000-0000-4000-8000-000000000031', 'nt_kg285', 'Kilôgam thử 285', 'kg'),
  ('7f2a0000-0000-4000-8000-000000000032', 'nt_bao285', 'Bao thử 285', 'bao');
insert into public.material_groups(id, code, name) values ('7f2a1000-0000-4000-8000-000000000031', 'NT_G285', 'Nhóm thử 285');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f2a2000-0000-4000-8000-000000000031', '7f2a1000-0000-4000-8000-000000000031', 'NT_XM285', 'Xi măng thử 285', '7f2a0000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f2a8000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH285', 'Khách thử 285', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f2a8000-0000-4000-8000-000000000002', '7f2a8000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 285', 'Địa chỉ thử', 'Anh Nhận', '0901000285');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f2a8000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K2851', 'Kho thử 285');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f2a8000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2851', '7f2a8000-0000-4000-8000-000000000001',
   '7f2a8000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 285', 'Công trình thử 285', 'Địa chỉ thử', 'Anh Nhận', '0901000285',
   '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of 50 kg sold at 90 000 ₫ a bao.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f2a8000-0000-4000-8000-000000000020', '7f2a8000-0000-4000-8000-000000000010', 1, '7f2a2000-0000-4000-8000-000000000031', 'Xi măng thử 285',
   '7f2a0000-0000-4000-8000-000000000032', '7f2a0000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f2a8000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', '7f2a8000-0000-4000-8000-000000000001', 'SALES_ORDER',
   '7f2a8000-0000-4000-8000-000000000010', 900000, '10000000-0000-4000-8000-000000000001', '7f2a8000-0000-4000-8000-000000000010');
-- 500 kg on hand at 1 500 ₫/kg.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f2a8000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f2a8000-0000-4000-8000-000000000003', 'NT-KK-2851', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f2a8000-0000-4000-8000-000000000031', '7f2a8000-0000-4000-8000-000000000030', '7f2a2000-0000-4000-8000-000000000031', 0, 500, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f2a2000-0000-4000-8000-000000000031', '7f2a0000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f2a8000-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 500, 750000, 1500, '7f2a8000-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f2a8000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE285', '99C-285.01', 1000, '7f2a0000-0000-4000-8000-000000000031');
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.photo285(target_id uuid, target_work uuid) returns void language sql as $$
  insert into public.portal_evidence_objects(id, object_path, context_type, work_item_id, uploaded_by, mime_type, declared_byte_size, final_byte_size, checksum_sha256, object_state, finalized_at)
  values (target_id, 'nt285/' || target_id || '.jpg', 'WORK_RESULT', target_work, '10000000-0000-4000-8000-000000000285', 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now());
$$;
create function pg_temp.warehouse285() returns numeric language sql as $$
  select coalesce(sum(base_quantity_delta), 0) from public.inventory_movements
  where warehouse_id = '7f2a8000-0000-4000-8000-000000000003' and material_id = '7f2a2000-0000-4000-8000-000000000031';
$$;


-- A customer whose accountant only follows orders and debts.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000286');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('10000000-0000-4000-8000-000000000286', '7f2a8000-0000-4000-8000-000000000001', 'FINANCE_CONTACT');

do $test$
declare
  orders constant uuid := '7f2a8000-0000-4000-8000-000000000010';
  line constant uuid := '7f2a8000-0000-4000-8000-000000000020';
  w1 constant uuid := '7f2a8000-0000-4000-8000-000000000003';
  worker constant uuid := '30000000-0000-4000-8000-000000000285';
  worker_login constant uuid := '10000000-0000-4000-8000-000000000285';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  truck constant uuid := '7f2a8000-0000-4000-8000-000000000040';
  result jsonb; delivery uuid; work uuid; job jsonb; failed text; count_id uuid; version_now integer;
begin
  -- 5.3 A device clock a minute ahead still opens a stock count, cut off at the database's now.
  perform pg_temp.act_as(owner_login);
  count_id := public.open_stock_count('20000000-0000-4000-8000-00000000000a', w1, now() + interval '1 minute', '7f2a9000-0000-4000-8000-000000000001');
  perform pg_temp.act_as_admin();
  assert (select cutoff_at <= now() from public.stock_counts where id = count_id), 'cut-off not in the future';
  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.open_stock_count('20000000-0000-4000-8000-00000000000a', w1, now() + interval '1 hour', '7f2a9000-0000-4000-8000-000000000002');
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_stock_count_scope', format('an hour ahead is still refused, got %s', failed);

  -- 6.5 Partial delivery reported and verified on the office page: the rest goes back to the warehouse.
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), now(),
    jsonb_build_object('employee_id', worker, 'vehicle_id', truck, 'schedule_mode', 'NOW'), '7f2a9000-0000-4000-8000-000000000003');
  delivery := (result->>'delivery_id')::uuid;
  perform public.handoff_delivery_actual(delivery, (select version from public.deliveries where id = delivery), now(), '7f2a9000-0000-4000-8000-000000000004',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = delivery), 'loaded_base_quantity', '100')));
  perform public.submit_delivery_result(delivery, 'PARTIAL',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = delivery), 'actual_base_quantity', '60')),
    'Anh Nhận', null, 'Báo thay thợ', null, (select version from public.deliveries where id = delivery), '7f2a9000-0000-4000-8000-000000000005');
  perform public.verify_delivery((select id from public.delivery_results where delivery_id = delivery),
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = delivery),
      'accepted_base_quantity', '60', 'billable_base_quantity', '60')),
    (select version from public.deliveries where id = delivery), '7f2a9000-0000-4000-8000-000000000006');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery) = 'VERIFIED', 'verified';
  assert (select base_quantity from private.delivery_line_transit_position((select id from public.delivery_lines where delivery_id = delivery))) = 0,
    'nothing left on the truck';
  assert pg_temp.warehouse285() = 440, format('40 kg back in the warehouse, %s', pg_temp.warehouse285());
  assert not private.delivery_has_unresolved_exception(delivery), 'no longer an exception on the dispatch board';

  -- 6.9 A worker declines a planned delivery; the office can still cancel it, and the job closes.
  perform pg_temp.act_as(owner_login);
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1')), now() + interval '1 hour',
    jsonb_build_object('employee_id', worker, 'vehicle_id', truck, 'scheduled_start', date_trunc('hour', now()) + interval '2 hours'), '7f2a9000-0000-4000-8000-000000000007');
  delivery := (result->>'delivery_id')::uuid;
  select w.id, w.version into work, version_now from public.work_items w where w.delivery_id = delivery;
  perform pg_temp.act_as(worker_login);
  perform public.decline_portal_work_item(work, 'Xe hỏng', version_now, '7f2a9000-0000-4000-8000-000000000008');
  perform pg_temp.act_as(owner_login);
  perform public.cancel_planned_delivery(delivery, (select version from public.deliveries where id = delivery), 'Khách hoãn', '7f2a9000-0000-4000-8000-000000000009');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery) = 'CANCELLED', 'declined plan cancelled';
  assert (select execution_state from public.work_items where id = work) = 'CANCELLED', 'job closed';

  -- 9. The accountant cannot order.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000286');
  failed := null;
  begin perform public.submit_portal_order('7f2a8000-0000-4000-8000-000000000001', '7f2a8000-0000-4000-8000-000000000002', null, null,
      jsonb_build_array(jsonb_build_object('material_id', '7f2a2000-0000-4000-8000-000000000031', 'uom_id', '7f2a0000-0000-4000-8000-000000000032', 'quantity', '1')),
      null, '7f2a9000-0000-4000-8000-00000000000a');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'forbidden', format('accountant may not order, got %s', failed);
end
$test$;
