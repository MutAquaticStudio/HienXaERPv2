-- D70: trip pay by vehicle. Each kind of vehicle has its own price per trip; a price without a vehicle pays the trips of vehicles that have none.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000332'), ('10000000-0000-4000-8000-000000000276');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000332', '10000000-0000-4000-8000-000000000332', 'NT_W332', 'Tài xế thử 332'),
  ('30000000-0000-4000-8000-000000000276', '10000000-0000-4000-8000-000000000276', 'NT_W276', 'Tài xế thử 276');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000332', 'nt_worker332', 'Thợ thử 332');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000332', 'work.read'), ('40000000-0000-4000-8000-000000000332', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000332', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000332'),
  ('30000000-0000-4000-8000-000000000276', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000332');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f332000-0000-4000-8000-000000000031', 'nt_kg332', 'Kilôgam thử 332', 'kg'),
  ('7f332000-0000-4000-8000-000000000032', 'nt_bao332', 'Bao thử 332', 'bao');
insert into public.material_groups(id, code, name) values ('7f332100-0000-4000-8000-000000000031', 'NT_G332', 'Nhóm thử 332');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f332200-0000-4000-8000-000000000031', '7f332100-0000-4000-8000-000000000031', 'NT_XM332', 'Xi măng thử 332', '7f332000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f332800-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH332', 'Khách thử 332', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f332800-0000-4000-8000-000000000002', '7f332800-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 332', 'Địa chỉ thử', 'Anh Nhận', '0901000332');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f332800-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K3321', 'Kho thử 332');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f332800-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-3321', '7f332800-0000-4000-8000-000000000001',
   '7f332800-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 332', 'Công trình thử 332', 'Địa chỉ thử', 'Anh Nhận', '0901000332',
   '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of 50 kg of cement at 90 000 ₫ a bao.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f332800-0000-4000-8000-000000000020', '7f332800-0000-4000-8000-000000000010', 1, '7f332200-0000-4000-8000-000000000031', 'Xi măng thử 332',
   '7f332000-0000-4000-8000-000000000032', '7f332000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f332800-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', '7f332800-0000-4000-8000-000000000001', 'SALES_ORDER',
   '7f332800-0000-4000-8000-000000000010', 900000, '10000000-0000-4000-8000-000000000001', '7f332800-0000-4000-8000-000000000010');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f332800-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f332800-0000-4000-8000-000000000003', 'NT-KK-3321', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f332800-0000-4000-8000-000000000031', '7f332800-0000-4000-8000-000000000030', '7f332200-0000-4000-8000-000000000031', 0, 500, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f332200-0000-4000-8000-000000000031', '7f332000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f332800-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 500, 750000, 1500, '7f332800-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f332800-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE332', '99C-332.01', 1000, '7f332000-0000-4000-8000-000000000031');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f332800-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT_XE332B', '99C-332.02', 1000, '7f332000-0000-4000-8000-000000000031');
select set_config('request.jwt.claim.sub', '', true);


-- One trip of 1 bao by the given worker: the office dispatches it, the worker loads (photo) and reports "Đã giao" (photo).
create function pg_temp.trip332(worker uuid, worker_login uuid, vehicle uuid) returns uuid language plpgsql as $$
declare result jsonb; delivery uuid; work uuid; job jsonb; loaded uuid := gen_random_uuid(); delivered uuid := gen_random_uuid();
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order('7f332800-0000-4000-8000-000000000010', '7f332800-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object('sales_order_line_id', '7f332800-0000-4000-8000-000000000020', 'quantity', '1')), now(),
    jsonb_build_object('employee_id', worker, 'vehicle_id', vehicle, 'schedule_mode', 'NOW'), gen_random_uuid());
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;
  perform pg_temp.act_as_admin();
  insert into public.portal_evidence_objects(id, object_path, context_type, work_item_id, uploaded_by, mime_type, declared_byte_size, final_byte_size, checksum_sha256, object_state, finalized_at)
  values (loaded, 'nt332/' || loaded || '.jpg', 'WORK_RESULT', work, worker_login, 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now()),
         (delivered, 'nt332/' || delivered || '.jpg', 'WORK_RESULT', work, worker_login, 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now());
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
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  driver constant uuid := '30000000-0000-4000-8000-000000000332';
  driver_login constant uuid := '10000000-0000-4000-8000-000000000332';
  small constant uuid := '7f332800-0000-4000-8000-000000000040';
  car constant uuid := '7f332800-0000-4000-8000-000000000041';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  today constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  failed text; period uuid; line public.payroll_lines%rowtype; car_rate uuid;
begin
  -- Three verified trips: two with the small vehicle, one with the car.
  perform pg_temp.trip332(driver, driver_login, small);
  perform pg_temp.trip332(driver, driver_login, small);
  perform pg_temp.trip332(driver, driver_login, car);
  perform pg_temp.act_as(owner_login);
  perform public.save_salary_profile(branch, driver, 'FIXED', 0, false, null, 150, 200, 300, 7, true, gen_random_uuid());

  -- 1. A price per vehicle: 30 000 ₫ a trip with the small one, 50 000 ₫ with the car.
  perform public.save_payroll_component(branch, null, 'XE-NHO', 'Tiền chuyến xe nhỏ', 'BONUS', 'PER_TRIP', 30000, null, null, true, gen_random_uuid(), small);
  car_rate := public.save_payroll_component(branch, null, 'XE-OTO', 'Tiền chuyến ô tô', 'BONUS', 'PER_TRIP', 50000, null, null, true, gen_random_uuid(), car);
  period := public.create_payroll(branch, date_trunc('month', today)::date, (date_trunc('month', today) + interval '1 month - 1 day')::date,
    'Lương thử 332', gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.base_amount_vnd = 0 and line.bonus_vnd = 110000 and line.net_pay_vnd = 110000
    and line.details @> '[{"code": "XE-NHO", "quantity": 2, "amount_vnd": "60000", "vehicle_name": "NT_XE332"}]'
    and line.details @> '[{"code": "XE-OTO", "quantity": 1, "amount_vnd": "50000", "vehicle_name": "NT_XE332B"}]', format('price per vehicle %s', row_to_json(line));

  -- 2. A price without a vehicle pays only the trips of vehicles that have no price of their own: none yet, so nothing changes.
  perform public.save_payroll_component(branch, null, 'CHUYEN', 'Tiền chuyến chung', 'BONUS', 'PER_TRIP', 10000, null, null, true, gen_random_uuid());
  perform public.recalculate_payroll(period, (select version from public.payroll_periods where id = period), gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.bonus_vnd = 110000, format('general price pays nothing extra %s', row_to_json(line));

  -- 3. Without the car's own price the car trip falls to the general price (10 000 ₫).
  perform public.save_payroll_component(branch, car_rate, 'XE-OTO', 'Tiền chuyến ô tô', 'BONUS', 'PER_TRIP', 50000, null, null, false, gen_random_uuid(), car);
  perform public.recalculate_payroll(period, (select version from public.payroll_periods where id = period), gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.bonus_vnd = 70000 and line.details @> '[{"code": "CHUYEN", "quantity": 1, "amount_vnd": "10000"}]', format('car falls to the general price %s', row_to_json(line));

  -- 4. Guards: one price per vehicle, a vehicle price is for everyone and only for trips, the vehicle must exist.
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'XE-NHO2', 'Trùng xe', 'BONUS', 'PER_TRIP', 1000, null, null, true, gen_random_uuid(), small);
  exception when others then failed := sqlerrm; end;
  assert failed like '%duplicate key%', format('two prices for one vehicle refused, got %s', failed);
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'XE-RIENG', 'Riêng', 'BONUS', 'PER_TRIP', 1000, null, driver, true, gen_random_uuid(), car);
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payroll_component', format('vehicle price for one person refused, got %s', failed);
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'XE-VIEC', 'Sai cách tính', 'BONUS', 'PER_JOB', 1000, null, null, true, gen_random_uuid(), car);
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payroll_component', format('vehicle price for a job refused, got %s', failed);
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'XE-MA', 'Xe lạ', 'BONUS', 'PER_TRIP', 1000, null, null, true, gen_random_uuid(), gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payroll_component', format('unknown vehicle refused, got %s', failed);
  perform pg_temp.act_as_admin();
end
$test$;
