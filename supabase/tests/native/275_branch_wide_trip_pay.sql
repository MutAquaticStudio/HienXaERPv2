-- D31: a rule for every worker (no employee, e.g. CHUYEN 30 000 ₫ a trip), once approved for "work verified", pays the
-- worker of each delivery finished after the approval — here from the worker's own "Đã giao" report. A worker's own
-- approved rule comes first; a rule for every worker cannot be approved for sales commission.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000275'), ('10000000-0000-4000-8000-000000000276');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000275', '10000000-0000-4000-8000-000000000275', 'NT_W275', 'Tài xế thử 275'),
  ('30000000-0000-4000-8000-000000000276', '10000000-0000-4000-8000-000000000276', 'NT_W276', 'Tài xế thử 276');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000275', 'nt_worker275', 'Thợ thử 275');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000275', 'work.read'), ('40000000-0000-4000-8000-000000000275', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000275', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000275'),
  ('30000000-0000-4000-8000-000000000276', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000275');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f275000-0000-4000-8000-000000000031', 'nt_kg275', 'Kilôgam thử 275', 'kg'),
  ('7f275000-0000-4000-8000-000000000032', 'nt_bao275', 'Bao thử 275', 'bao');
insert into public.material_groups(id, code, name) values ('7f275100-0000-4000-8000-000000000031', 'NT_G275', 'Nhóm thử 275');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f275200-0000-4000-8000-000000000031', '7f275100-0000-4000-8000-000000000031', 'NT_XM275', 'Xi măng thử 275', '7f275000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f275800-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH275', 'Khách thử 275', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f275800-0000-4000-8000-000000000002', '7f275800-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 275', 'Địa chỉ thử', 'Anh Nhận', '0901000275');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f275800-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K2751', 'Kho thử 275');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f275800-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2751', '7f275800-0000-4000-8000-000000000001',
   '7f275800-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 275', 'Công trình thử 275', 'Địa chỉ thử', 'Anh Nhận', '0901000275',
   '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of 50 kg of cement at 90 000 ₫ a bao.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f275800-0000-4000-8000-000000000020', '7f275800-0000-4000-8000-000000000010', 1, '7f275200-0000-4000-8000-000000000031', 'Xi măng thử 275',
   '7f275000-0000-4000-8000-000000000032', '7f275000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f275800-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', '7f275800-0000-4000-8000-000000000001', 'SALES_ORDER',
   '7f275800-0000-4000-8000-000000000010', 900000, '10000000-0000-4000-8000-000000000001', '7f275800-0000-4000-8000-000000000010');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f275800-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f275800-0000-4000-8000-000000000003', 'NT-KK-2751', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f275800-0000-4000-8000-000000000031', '7f275800-0000-4000-8000-000000000030', '7f275200-0000-4000-8000-000000000031', 0, 500, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f275200-0000-4000-8000-000000000031', '7f275000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f275800-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 500, 750000, 1500, '7f275800-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f275800-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE275', '99C-275.01', 1000, '7f275000-0000-4000-8000-000000000031');
-- CHUYEN: 30 000 ₫ a trip for every worker; CHUYEN_RIENG: 45 000 ₫ a trip for 276 only; HH: a commission for everyone.
insert into public.compensation_rules(id, branch_id, code, name, version, employee_id, earning_type, calculation_kind, rate_vnd_per_unit, rate_bps,
  classification, effective_from, effective_to, created_by) values
  ('7f275900-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-00000000000a', 'NT_CHUYEN', 'Tiền chuyến', 1, null, 'PER_TRIP', 'FIXED_PER_BASIS',
   30000, null, 'DIRECT_LABOR', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1, null, '10000000-0000-4000-8000-000000000001'),
  ('7f275900-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-00000000000a', 'NT_CHUYEN_RIENG', 'Tiền chuyến riêng', 1,
   '30000000-0000-4000-8000-000000000276', 'PER_TRIP', 'FIXED_PER_BASIS', 45000, null, 'DIRECT_LABOR',
   (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1, null, '10000000-0000-4000-8000-000000000001'),
  ('7f275900-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-00000000000a', 'NT_HH', 'Hoa hồng chung', 1, null, 'SALES_COMMISSION', 'PERCENT_BPS',
   null, 100, 'SALES_COMMISSION', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1, null, '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

-- One trip of 1 bao by the given worker: the office dispatches it, the worker loads (photo) and reports "Đã giao" (photo).
create function pg_temp.trip275(worker uuid, worker_login uuid) returns uuid language plpgsql as $$
declare result jsonb; delivery uuid; work uuid; job jsonb; loaded uuid := gen_random_uuid(); delivered uuid := gen_random_uuid();
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order('7f275800-0000-4000-8000-000000000010', '7f275800-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f275800-0000-4000-8000-000000000020', 'quantity', '1')), now(),
    jsonb_build_object('employee_id', worker, 'vehicle_id', '7f275800-0000-4000-8000-000000000040', 'schedule_mode', 'NOW'), gen_random_uuid());
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;
  perform pg_temp.act_as_admin();
  insert into public.portal_evidence_objects(id, object_path, context_type, work_item_id, uploaded_by, mime_type, declared_byte_size, final_byte_size, checksum_sha256, object_state, finalized_at)
  values (loaded, 'nt275/' || loaded || '.jpg', 'WORK_RESULT', work, worker_login, 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now()),
         (delivered, 'nt275/' || delivered || '.jpg', 'WORK_RESULT', work, worker_login, 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now());
  perform pg_temp.act_as(worker_login);
  job := public.worker_portal_job(work);
  perform public.portal_delivery_loaded(work, null, array[loaded], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
    (job->'delivery'->>'assignment_version')::integer, gen_random_uuid());
  job := public.worker_portal_job(work);
  perform public.submit_portal_delivery_done(work, null, null, null, array[delivered], (job->>'version')::integer,
    (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.work_items where id = work) = 'VERIFIED', 'trip verified from the worker report';
  return work;
end $$;

do $test$
declare
  everyone constant uuid := '7f275900-0000-4000-8000-0000000000c1';
  own constant uuid := '7f275900-0000-4000-8000-0000000000c2';
  commission constant uuid := '7f275900-0000-4000-8000-0000000000c3';
  driver constant uuid := '30000000-0000-4000-8000-000000000275';
  driver_login constant uuid := '10000000-0000-4000-8000-000000000275';
  other constant uuid := '30000000-0000-4000-8000-000000000276';
  other_login constant uuid := '10000000-0000-4000-8000-000000000276';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  work uuid; failed text; earning public.earning_events%rowtype; mine jsonb;
begin
  -- 1. Before the approval a trip earns nothing.
  work := pg_temp.trip275(driver, driver_login);
  assert not exists (select 1 from public.earning_events where employee_id = driver), 'no earning before the approval';

  -- 2. The owner approves the rule for every worker; a commission for everyone is refused.
  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.configure_compensation_recognition(commission, 'AR_PAYMENT_ALLOCATION', now(), '7f275a00-0000-4000-8000-000000000001');
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_recognition_policy', format('commission for everyone refused, got %s', failed);
  assert public.configure_compensation_recognition(everyone, 'WORK_ITEM_VERIFICATION', now(), '7f275a00-0000-4000-8000-000000000002') = everyone, 'approved';
  assert public.configure_compensation_recognition(everyone, 'WORK_ITEM_VERIFICATION', now(), '7f275a00-0000-4000-8000-000000000002') = everyone, 'approval replay';
  assert public.configure_compensation_recognition(own, 'WORK_ITEM_VERIFICATION', now(), '7f275a00-0000-4000-8000-000000000003') = own, 'own rule approved';
  perform pg_temp.act_as_admin();
  assert (select employee_id is null from public.compensation_recognition_policies where rule_id = everyone), 'policy for every worker';

  -- 3. The driver's next trip earns 30 000 ₫, approved and payable, and shows in the driver's portal.
  work := pg_temp.trip275(driver, driver_login);
  select e.* into earning from public.earning_events e join public.work_item_verifications v on v.id = e.work_item_verification_id
  where v.work_item_id = work;
  assert earning.employee_id = driver and earning.rule_id = everyone and earning.earning_type = 'PER_TRIP'
    and earning.calculated_amount_vnd = 30000 and earning.approved_amount_vnd = 30000 and earning.approval_state = 'APPROVED',
    format('trip pay for the driver %s', to_jsonb(earning));
  assert (select original_amount_vnd from public.payable_obligations where id = earning.payable_obligation_id and employee_id = driver) = 30000,
    'owed to the driver';
  assert (select count(*) from public.earning_events where employee_id = driver) = 1, 'one earning per trip';
  perform pg_temp.act_as(driver_login);
  mine := public.worker_portal_snapshot()->'earnings';
  perform pg_temp.act_as_admin();
  assert jsonb_array_length(mine) = 1 and mine->0->>'amount_vnd' = '30000' and mine->0->>'type' = 'PER_TRIP', format('driver sees it %s', mine);

  -- 4. A worker with an own approved rule earns by it, not by the rule for every worker.
  work := pg_temp.trip275(other, other_login);
  assert (select string_agg(e.rule_id::text || ':' || e.calculated_amount_vnd, ',') from public.earning_events e where e.employee_id = other)
    = own::text || ':45000', 'own rule first';

  -- 5. The office cannot add the same trip again by hand.
  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.calculate_earning_event(everyone, 'WORK_ITEM_VERIFICATION',
      (select id from public.work_item_verifications where work_item_id = work), '7f275a00-0000-4000-8000-000000000004');
  exception when others then failed := sqlstate; end;
  perform pg_temp.act_as_admin();
  assert failed is not null, 'no manual earning on an automatic rule';
end
$test$;
