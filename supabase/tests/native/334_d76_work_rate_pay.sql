-- D76: pay by a rate per unit of the work done. A WORK_RATE component pays, for the verified deliveries a person delivered and the verified
-- service jobs they did in the period, quantity × rate; goods and services without a rate are listed, never guessed.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000334'), ('10000000-0000-4000-8000-000000000335');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000334', '10000000-0000-4000-8000-000000000334', 'NT_W334', 'Tài xế thử 334'),
  ('30000000-0000-4000-8000-000000000335', '10000000-0000-4000-8000-000000000335', 'NT_W335', 'Thợ khác 334');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000334', 'nt_worker334', 'Thợ thử 334');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000334', 'work.read'), ('40000000-0000-4000-8000-000000000334', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000334', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000334'),
  ('30000000-0000-4000-8000-000000000335', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000334');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f334000-0000-4000-8000-000000000031', 'nt_kg334', 'Kilôgam thử 334', 'kg'),
  ('7f334000-0000-4000-8000-000000000032', 'nt_bao334', 'Bao thử 334', 'bao'),
  ('7f334000-0000-4000-8000-000000000033', 'nt_cay334', 'Cây thử 334', 'cây');
insert into public.material_groups(id, code, name) values ('7f334100-0000-4000-8000-000000000031', 'NT_G334', 'Nhóm thử 334');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f334200-0000-4000-8000-000000000031', '7f334100-0000-4000-8000-000000000031', 'NT_XM334', 'Xi măng thử 334', '7f334000-0000-4000-8000-000000000031'),
  ('7f334200-0000-4000-8000-000000000032', '7f334100-0000-4000-8000-000000000031', 'NT_TH334', 'Thép thử 334', '7f334000-0000-4000-8000-000000000031');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type) values
  ('7f334200-0000-4000-8000-000000000031', '7f334000-0000-4000-8000-000000000032', '7f334000-0000-4000-8000-000000000031', 50, 1, 'PACKAGING');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f334800-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH334', 'Khách thử 334', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f334800-0000-4000-8000-000000000002', '7f334800-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 334', 'Địa chỉ thử', 'Anh Nhận', '0901000334');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f334800-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K3341', 'Kho thử 334');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f334800-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-3341', '7f334800-0000-4000-8000-000000000001',
   '7f334800-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 334', 'Công trình thử 334', 'Địa chỉ thử', 'Anh Nhận', '0901000334',
   '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of cement (50 kg a bao) at 90 000 ₫, and 100 kg of steel at 20 000 ₫.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f334800-0000-4000-8000-000000000020', '7f334800-0000-4000-8000-000000000010', 1, '7f334200-0000-4000-8000-000000000031', 'Xi măng thử 334',
   '7f334000-0000-4000-8000-000000000032', '7f334000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f334800-0000-4000-8000-000000000021', '7f334800-0000-4000-8000-000000000010', 2, '7f334200-0000-4000-8000-000000000032', 'Thép thử 334',
   '7f334000-0000-4000-8000-000000000031', '7f334000-0000-4000-8000-000000000031', 100, 1, 1, 'HALF_UP', 20000, 2000000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f334800-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', '7f334800-0000-4000-8000-000000000001', 'SALES_ORDER',
   '7f334800-0000-4000-8000-000000000010', 2900000, '10000000-0000-4000-8000-000000000001', '7f334800-0000-4000-8000-000000000010');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f334800-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f334800-0000-4000-8000-000000000003', 'NT-KK-3341', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f334800-0000-4000-8000-000000000031', '7f334800-0000-4000-8000-000000000030', '7f334200-0000-4000-8000-000000000031', 0, 500, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f334800-0000-4000-8000-000000000032', '7f334800-0000-4000-8000-000000000030', '7f334200-0000-4000-8000-000000000032', 0, 500, 15000, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f334200-0000-4000-8000-000000000031', '7f334000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f334800-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 500, 750000, 1500, '7f334800-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f334200-0000-4000-8000-000000000032', '7f334000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f334800-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 500, 7500000, 15000, '7f334800-0000-4000-8000-000000000032', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f334800-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE334', '99C-334.01', 1000, '7f334000-0000-4000-8000-000000000031');
select set_config('request.jwt.claim.sub', '', true);


-- One verified delivery of a line of the order, done from the office (no photo): assigned to the worker with the vehicle, loaded, reported and verified.
create function pg_temp.trip334(line_id uuid, qty text, worker uuid, vehicle uuid) returns uuid language plpgsql as $$
declare res jsonb; delivery uuid; dline uuid; v integer; base text; result uuid;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  res := public.create_delivery_for_order('7f334800-0000-4000-8000-000000000010', '7f334800-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object('sales_order_line_id', line_id, 'quantity', qty)), now(),
    jsonb_build_object('employee_id', worker, 'vehicle_id', vehicle, 'schedule_mode', 'NOW'), gen_random_uuid());
  delivery := (res->>'delivery_id')::uuid;
  select l.id, trim_scale(l.planned_base_quantity)::text into dline, base from public.delivery_lines l where l.delivery_id = delivery;
  select version into v from public.deliveries where id = delivery;
  perform public.handoff_delivery_actual(delivery, v, now() - interval '1 minute', gen_random_uuid(), jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'loaded_base_quantity', base)));
  select version into v from public.deliveries where id = delivery;
  result := public.submit_delivery_result(delivery, 'FULL', jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'actual_base_quantity', base)),
    'Anh Nhận', 'Giao thử', 'Nhập bù thử', null, v, gen_random_uuid());
  select version into v from public.deliveries where id = delivery;
  perform public.verify_delivery(result, jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'accepted_base_quantity', base, 'billable_base_quantity', base)), v, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery) = 'VERIFIED', 'delivery verified from the office';
  return delivery;
end $$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  driver constant uuid := '30000000-0000-4000-8000-000000000334';
  other constant uuid := '30000000-0000-4000-8000-000000000335';
  small constant uuid := '7f334800-0000-4000-8000-000000000040';
  cement constant uuid := '7f334200-0000-4000-8000-000000000031';
  steel constant uuid := '7f334200-0000-4000-8000-000000000032';
  bao constant uuid := '7f334000-0000-4000-8000-000000000032';
  cay constant uuid := '7f334000-0000-4000-8000-000000000033';
  kg constant uuid := '7f334000-0000-4000-8000-000000000031';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  customer constant uuid := '7f334800-0000-4000-8000-000000000001';
  site constant uuid := '7f334800-0000-4000-8000-000000000002';
  today constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  failed text; period uuid; line public.payroll_lines%rowtype; component uuid; svc_type constant uuid := '7f334800-0000-4000-8000-0000000000a0';
  job uuid; work uuid; saved public.service_jobs%rowtype; work_row public.work_items%rowtype;
begin
  -- Deliveries of the driver: 3 + 1 bao of cement (priced), 40 kg of steel (no rate).
  perform pg_temp.trip334('7f334800-0000-4000-8000-000000000020', '3', driver, small);
  perform pg_temp.trip334('7f334800-0000-4000-8000-000000000020', '1', driver, small);
  perform pg_temp.trip334('7f334800-0000-4000-8000-000000000021', '40', driver, small);
  perform pg_temp.act_as(owner_login);
  perform public.save_salary_profile(branch, driver, 'FIXED', 0, false, null, 150, 200, 300, 7, true, gen_random_uuid());
  perform public.save_salary_profile(branch, other, 'FIXED', 0, false, null, 150, 200, 300, 7, true, gen_random_uuid());

  -- 1. A price per bao and the component: 4 bao × 2 000 ₫; the steel has no price and is listed.
  perform public.save_transport_pay_rate(branch, cement, bao, 2000, true, gen_random_uuid());
  component := public.save_payroll_component(branch, null, 'CONG-VIEC', 'Tiền công theo đơn giá', 'BONUS', 'WORK_RATE', null, null, null, true, gen_random_uuid());
  period := public.create_payroll(branch, date_trunc('month', today)::date, (date_trunc('month', today) + interval '1 month - 1 day')::date, 'Lương thử 334', gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.base_amount_vnd = 0 and line.bonus_vnd = 8000 and line.net_pay_vnd = 8000
    and line.details @> '[{"code": "CONG-VIEC", "method": "WORK_RATE", "amount_vnd": "8000"}]'
    and line.details->0->'items' @> '[{"kind": "GOODS", "uom": "bao", "quantity": "4", "rate_vnd": "2000", "amount_vnd": "8000"}]'
    and line.details->0->'unpriced' @> '[{"kind": "GOODS", "uom": "kg", "quantity": "40"}]', format('goods priced and listed %s', row_to_json(line));
  -- Someone who delivered nothing has no such line.
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = other;
  assert line.bonus_vnd = 0 and line.details = '[]'::jsonb, format('nothing delivered, nothing paid %s', row_to_json(line));

  -- 2. A price for the steel (per kg) and a changed price for the cement are used on the next calculation.
  perform public.save_transport_pay_rate(branch, steel, kg, 50, true, gen_random_uuid());
  perform public.save_transport_pay_rate(branch, cement, bao, 2500, true, gen_random_uuid());
  perform public.recalculate_payroll(period, (select version from public.payroll_periods where id = period), gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.bonus_vnd = 12000 and line.details->0->'unpriced' = '[]'::jsonb, format('both priced %s', row_to_json(line));   -- 4 × 2 500 + 40 × 50

  -- 3. A service job the driver did: per unit, then as a share of what the job was billed.
  perform public.save_catalog_record('service_types', svc_type, branch,
    '{"code":"DV334","name":"Dịch vụ thử 334","unit_label":"chuyến","default_price_vnd":"450000","resource_kind":"NONE","active":true}', null, 'Tạo loại dịch vụ', '7f334800-0000-4000-8000-0000000000a1');
  job := public.schedule_service_job(branch, customer, site, svc_type, '', now() + interval '1 day', now() + interval '1 day 4 hours', null, null, null, null, '7f334800-0000-4000-8000-0000000000b1');
  work := public.publish_work_item(branch, 'SERVICE_JOB', job, 'DIRECT', driver, '7f334800-0000-4000-8000-0000000000c1');
  select * into work_row from public.work_items where id = work;
  perform public.start_work_item(work, work_row.version, '7f334800-0000-4000-8000-0000000000c2');
  select * into work_row from public.work_items where id = work;
  perform public.submit_work_result(work, 5, null, 'Chủ nhà', null, work_row.version, '7f334800-0000-4000-8000-0000000000c3');
  select * into saved from public.service_jobs where id = job;
  select * into work_row from public.work_items where id = work;
  perform public.verify_service_job(job, 5, 5, 2250000, current_date + 7, 'Đã đối chiếu', saved.version, work_row.version, '7f334800-0000-4000-8000-0000000000c4');
  perform public.recalculate_payroll(period, (select version from public.payroll_periods where id = period), gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.bonus_vnd = 12000 and line.details->0->'unpriced' @> '[{"kind": "SERVICE", "label": "Dịch vụ thử 334", "quantity": "5"}]', format('service without a rate is listed %s', row_to_json(line));
  perform public.save_service_pay_rate(branch, svc_type, 100000, null, true, gen_random_uuid());
  perform public.recalculate_payroll(period, (select version from public.payroll_periods where id = period), gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.bonus_vnd = 512000 and line.details->0->'items' @> '[{"kind": "SERVICE", "uom": "chuyến", "quantity": "5", "rate_vnd": "100000", "amount_vnd": "500000"}]', format('service per unit %s', row_to_json(line));
  perform public.save_service_pay_rate(branch, svc_type, null, 2000, true, gen_random_uuid());   -- 20 % of 2 250 000
  perform public.recalculate_payroll(period, (select version from public.payroll_periods where id = period), gen_random_uuid());
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = driver;
  assert line.bonus_vnd = 462000 and line.details->0->'items' @> '[{"kind": "SERVICE", "rate_bps": 2000, "amount_vnd": "450000"}]', format('service by share %s', row_to_json(line));

  -- 4. Guards.
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'CONG-VIEC2', 'Thứ hai', 'BONUS', 'WORK_RATE', null, null, null, true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed like '%duplicate key%', format('one active component per branch, got %s', failed);
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'CONG-RIENG', 'Riêng', 'BONUS', 'WORK_RATE', null, null, driver, false, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payroll_component', format('for one person refused, got %s', failed);
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'CONG-TRU', 'Trừ', 'DEDUCTION', 'WORK_RATE', null, null, null, false, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payroll_component', format('a deduction refused, got %s', failed);
  failed := null;
  begin perform public.save_transport_pay_rate(branch, cement, cay, 1000, true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_work_rate', format('a unit the material is not sold in, got %s', failed);
  failed := null;
  begin perform public.save_transport_pay_rate(branch, cement, bao, 0, true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_work_rate', format('a zero rate, got %s', failed);
  failed := null;
  begin perform public.save_service_pay_rate(branch, svc_type, 1000, 500, true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_work_rate', format('amount and share together, got %s', failed);
  -- An ordinary employee cannot read or change the rates.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000334');
  assert (select count(*) from public.transport_pay_rates) = 0, 'a worker does not see the rates';
  failed := null;
  begin perform public.save_transport_pay_rate(branch, cement, bao, 1, true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('a worker cannot change rates, got %s', failed);
  perform pg_temp.act_as_admin();
end
$test$;
