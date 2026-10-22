-- FB7: the worker loads the truck ("Đã lấy hàng lên xe" + photos) and reports "Đã giao" (+ photos); the report is the
-- verification (receivable, revenue, cost), goods not delivered return to their warehouse, the job is verified.
-- A delivery handled on the office page no longer leaves the worker's job open.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000240');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000240', '10000000-0000-4000-8000-000000000240', 'NT_W240', 'Thợ thử 240');
insert into public.roles(id, code, name) values ('40000000-0000-4000-8000-000000000240', 'nt_worker240', 'Thợ thử 240');
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000240', 'work.read'), ('40000000-0000-4000-8000-000000000240', 'work.claim');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000240', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000240');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f240000-0000-4000-8000-000000000031', 'nt_kg240', 'Kilôgam thử 240', 'kg'),
  ('7f240000-0000-4000-8000-000000000032', 'nt_bao240', 'Bao thử 240', 'bao');
insert into public.material_groups(id, code, name) values ('7f241000-0000-4000-8000-000000000031', 'NT_G240', 'Nhóm thử 240');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f242000-0000-4000-8000-000000000031', '7f241000-0000-4000-8000-000000000031', 'NT_XM240', 'Xi măng thử 240', '7f240000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f248000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH240', 'Khách thử 240', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f248000-0000-4000-8000-000000000002', '7f248000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử 240', 'Địa chỉ thử', 'Anh Nhận', '0901000240');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f248000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K2401', 'Kho thử 240');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, created_by, confirmed_at) values
  ('7f248000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-2401', '7f248000-0000-4000-8000-000000000001',
   '7f248000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 240', 'Công trình thử 240', 'Địa chỉ thử', 'Anh Nhận', '0901000240',
   '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of 50 kg sold at 90 000 ₫ a bao.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f248000-0000-4000-8000-000000000020', '7f248000-0000-4000-8000-000000000010', 1, '7f242000-0000-4000-8000-000000000031', 'Xi măng thử 240',
   '7f240000-0000-4000-8000-000000000032', '7f240000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
insert into public.credit_commitments(id, branch_id, customer_id, source_type, source_key, amount_vnd, created_by, sales_order_id) values
  ('7f248000-0000-4000-8000-000000000050', '20000000-0000-4000-8000-00000000000a', '7f248000-0000-4000-8000-000000000001', 'SALES_ORDER',
   '7f248000-0000-4000-8000-000000000010', 900000, '10000000-0000-4000-8000-000000000001', '7f248000-0000-4000-8000-000000000010');
-- 500 kg on hand at 1 500 ₫/kg.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f248000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f248000-0000-4000-8000-000000000003', 'NT-KK-2401', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f248000-0000-4000-8000-000000000031', '7f248000-0000-4000-8000-000000000030', '7f242000-0000-4000-8000-000000000031', 0, 500, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f242000-0000-4000-8000-000000000031', '7f240000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f248000-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 500, 750000, 1500, '7f248000-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id) values
  ('7f248000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE240', '99C-240.01', 1000, '7f240000-0000-4000-8000-000000000031');
select set_config('request.jwt.claim.sub', '', true);

create function pg_temp.photo240(target_id uuid, target_work uuid) returns void language sql as $$
  insert into public.portal_evidence_objects(id, object_path, context_type, work_item_id, uploaded_by, mime_type, declared_byte_size, final_byte_size, checksum_sha256, object_state, finalized_at)
  values (target_id, 'nt240/' || target_id || '.jpg', 'WORK_RESULT', target_work, '10000000-0000-4000-8000-000000000240', 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now());
$$;
create function pg_temp.warehouse240() returns numeric language sql as $$
  select coalesce(sum(base_quantity_delta), 0) from public.inventory_movements
  where warehouse_id = '7f248000-0000-4000-8000-000000000003' and material_id = '7f242000-0000-4000-8000-000000000031';
$$;

do $test$
declare
  orders constant uuid := '7f248000-0000-4000-8000-000000000010';
  line constant uuid := '7f248000-0000-4000-8000-000000000020';
  w1 constant uuid := '7f248000-0000-4000-8000-000000000003';
  worker constant uuid := '30000000-0000-4000-8000-000000000240';
  worker_login constant uuid := '10000000-0000-4000-8000-000000000240';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  truck constant uuid := '7f248000-0000-4000-8000-000000000040';
  start_at constant timestamptz := date_trunc('hour', now()) + interval '1 hour';
  result jsonb; delivery uuid; work uuid; job jsonb; handoff uuid; failed text; failed_message text; done_id uuid;
begin
  -- 1. Partial delivery: 2 bao (100 kg) loaded, 60 kg delivered.
  perform pg_temp.act_as(owner_login);
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), start_at,
    jsonb_build_object('employee_id', worker, 'vehicle_id', truck, 'scheduled_start', start_at), '7f249000-0000-4000-8000-000000000001');
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;

  -- Someone who is not the assignee sees whose job it is and cannot load.
  job := public.worker_portal_job(work);
  assert not (job->>'is_assignee')::boolean and not (job->'delivery'->>'can_load')::boolean and job->>'assignee_name' = 'Thợ thử 240',
    format('viewer who is not the assignee %s', job);

  perform pg_temp.act_as(worker_login);
  job := public.worker_portal_job(work);
  assert (job->>'is_assignee')::boolean and (job->'delivery'->>'can_load')::boolean and not (job->'delivery'->>'can_submit_result')::boolean,
    format('assignee can load before handoff %s', job);
  failed_message := null;
  begin perform public.portal_delivery_loaded(work, null, '{}', (job->>'version')::integer, (job->'delivery'->>'version')::integer,
      (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-0000000000a1');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'handoff_photo_required', format('loading needs a photo, got %s', failed_message);

  perform pg_temp.act_as_admin();
  perform pg_temp.photo240('7f249000-0000-4000-8000-0000000000e1', work);
  perform pg_temp.photo240('7f249000-0000-4000-8000-0000000000e2', work);

  perform pg_temp.act_as(owner_login);
  failed := null;
  begin perform public.portal_delivery_loaded(work, null, array['7f249000-0000-4000-8000-0000000000e1'::uuid], (job->>'version')::integer,
      (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('only the assignee loads, got %s', failed);

  perform pg_temp.act_as(worker_login);
  handoff := public.portal_delivery_loaded(work, null, array['7f249000-0000-4000-8000-0000000000e1'::uuid], (job->>'version')::integer,
    (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-000000000002');
  assert public.portal_delivery_loaded(work, null, array['7f249000-0000-4000-8000-0000000000e1'::uuid], (job->>'version')::integer,
    (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-000000000002') = handoff, 'loading replay';
  job := public.worker_portal_job(work);
  assert job->>'state' = 'IN_PROGRESS' and (job->'delivery'->>'can_submit_result')::boolean and not (job->'delivery'->>'can_load')::boolean,
    format('loaded: on the way %s', job);

  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery) = 'DISPATCHED', 'delivery on the truck';
  assert pg_temp.warehouse240() = 400, format('100 kg left the warehouse, %s left', pg_temp.warehouse240());
  assert (select count(*) from public.delivery_handoff_portal_evidence where delivery_handoff_id = handoff) = 1, 'loading photo kept';

  -- The loading photo cannot be reused for the delivery.
  perform pg_temp.act_as(worker_login);
  failed := null;
  begin perform public.submit_portal_delivery_done(work, null, null, null, array['7f249000-0000-4000-8000-0000000000e1'::uuid], (job->>'version')::integer,
      (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('loading photo reused, got %s', failed);

  done_id := public.submit_portal_delivery_done(work,
    jsonb_build_array(jsonb_build_object('delivery_line_id', job->'delivery'->'lines'->0->>'id', 'actual_base_quantity', '60')),
    null, null, array['7f249000-0000-4000-8000-0000000000e2'::uuid], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
    (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  assert (select execution_state || ':' || result_kind from public.deliveries where id = delivery) = 'VERIFIED:PARTIAL', 'partial delivery verified';
  assert (select execution_state from public.work_items where id = work) = 'VERIFIED', 'job verified with the delivery';
  -- 60 kg = 1,2 bao × 90 000 ₫.
  assert (select r.original_amount_vnd from public.receivable_obligations r join public.delivery_verifications v on v.id = r.delivery_verification_id
    where v.delivery_id = delivery) = 108000, 'receivable for what was delivered';
  assert (select amount_delta_vnd from public.direct_cost_entries c join public.delivery_verifications v on v.id = c.delivery_verification_id
    where v.delivery_id = delivery) = 90000, 'cost of 60 kg';
  assert pg_temp.warehouse240() = 440, format('40 kg back in the warehouse, %s', pg_temp.warehouse240());
  assert (select base_quantity from private.delivery_line_transit_position((select id from public.delivery_lines where delivery_id = delivery))) = 0, 'nothing left on the truck';
  assert (select state from public.return_cases where delivery_line_id = (select id from public.delivery_lines where delivery_id = delivery)) = 'RETURNED', 'remainder case closed';
  assert exists (select 1 from public.notifications where entity_id = delivery and title like 'Giao thiếu % — phần còn lại đã về kho'), 'office told';
  assert not exists (select 1 from public.notifications where entity_id = delivery and title like '%chờ xác minh%'), 'no verification request';

  -- 2. Not delivered: no photo, no note, nothing billed, everything back.
  perform pg_temp.act_as(owner_login);
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1')), start_at,
    jsonb_build_object('employee_id', worker, 'vehicle_id', truck, 'schedule_mode', 'NOW'), '7f249000-0000-4000-8000-000000000004');
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;
  perform pg_temp.act_as_admin();
  perform pg_temp.photo240('7f249000-0000-4000-8000-0000000000e3', work);
  perform pg_temp.act_as(worker_login);
  job := public.worker_portal_job(work);
  perform public.portal_delivery_loaded(work, null, array['7f249000-0000-4000-8000-0000000000e3'::uuid], (job->>'version')::integer,
    (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-000000000005');
  job := public.worker_portal_job(work);
  perform public.submit_portal_delivery_done(work,
    jsonb_build_array(jsonb_build_object('delivery_line_id', job->'delivery'->'lines'->0->>'id', 'actual_base_quantity', '0')),
    null, null, '{}', (job->>'version')::integer, (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer,
    '7f249000-0000-4000-8000-000000000006');
  perform pg_temp.act_as_admin();
  assert (select execution_state || ':' || result_kind from public.deliveries where id = delivery) = 'VERIFIED:FAILED', 'failed delivery verified';
  assert not exists (select 1 from public.receivable_obligations r join public.delivery_verifications v on v.id = r.delivery_verification_id
    where v.delivery_id = delivery), 'nothing billed';
  assert pg_temp.warehouse240() = 440, format('all 50 kg back, %s', pg_temp.warehouse240());

  -- 3. Not enough credit left: the report stays for the office, the worker is not refused.
  perform set_config('request.jwt.claim.sub', owner_login::text, true);
  update public.credit_commitments set amount_vnd = consumed_vnd + 1000 where id = '7f248000-0000-4000-8000-000000000050';
  perform pg_temp.act_as(owner_login);
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1')), start_at,
    jsonb_build_object('employee_id', worker, 'vehicle_id', truck, 'schedule_mode', 'NOW'), '7f249000-0000-4000-8000-000000000007');
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;
  perform pg_temp.act_as_admin();
  perform pg_temp.photo240('7f249000-0000-4000-8000-0000000000e4', work);
  perform pg_temp.photo240('7f249000-0000-4000-8000-0000000000e5', work);
  perform pg_temp.act_as(worker_login);
  job := public.worker_portal_job(work);
  perform public.portal_delivery_loaded(work, null, array['7f249000-0000-4000-8000-0000000000e4'::uuid], (job->>'version')::integer,
    (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-000000000008');
  job := public.worker_portal_job(work);
  perform public.submit_portal_delivery_done(work, null, null, null, array['7f249000-0000-4000-8000-0000000000e5'::uuid], (job->>'version')::integer,
    (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer, '7f249000-0000-4000-8000-000000000009');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.deliveries where id = delivery) = 'RESULT_SUBMITTED', 'waits for the office';
  assert (select execution_state from public.work_items where id = work) = 'DONE', 'job done';
  assert exists (select 1 from public.notifications where entity_id = delivery and title like 'Cần xác minh tay %' and required_permission = 'delivery.verify'),
    'office asked to verify';
  -- The office verifies once credit allows: the job follows.
  perform set_config('request.jwt.claim.sub', owner_login::text, true);
  update public.credit_commitments set amount_vnd = 900000 where id = '7f248000-0000-4000-8000-000000000050';
  perform pg_temp.act_as(owner_login);
  perform public.verify_delivery((select id from public.delivery_results where delivery_id = delivery),
    (select jsonb_agg(jsonb_build_object('delivery_line_id', delivery_line_id, 'accepted_base_quantity', trim_scale(actual_base_quantity)::text,
      'billable_base_quantity', trim_scale(actual_base_quantity)::text)) from public.delivery_result_lines rl
      join public.delivery_results r on r.id = rl.delivery_result_id where r.delivery_id = delivery),
    (select version from public.deliveries where id = delivery), '7f249000-0000-4000-8000-000000000010');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.work_items where id = work) = 'VERIFIED', 'job verified with the office verification';

  -- 4. Handled on the office page instead of the worker: the job is not left open.
  perform pg_temp.act_as(owner_login);
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1')), start_at,
    jsonb_build_object('employee_id', worker, 'vehicle_id', truck, 'schedule_mode', 'NOW'), '7f249000-0000-4000-8000-000000000011');
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;
  perform public.handoff_delivery_actual(delivery, (select version from public.deliveries where id = delivery), now(), '7f249000-0000-4000-8000-000000000012',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = delivery), 'loaded_base_quantity', '50')));
  perform public.submit_delivery_result(delivery, 'FULL',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = delivery), 'actual_base_quantity', '50')),
    'Anh Nhận', null, 'Báo thay thợ', null, (select version from public.deliveries where id = delivery), '7f249000-0000-4000-8000-000000000013');
  perform pg_temp.act_as_admin();
  assert (select execution_state from public.work_items where id = work) = 'DONE', 'job closed by the office report';
  assert (select note from public.work_item_results where work_item_id = work) = 'Nhân viên báo thay thợ', 'office report recorded on the job';
  perform pg_temp.act_as(worker_login);
  job := public.worker_portal_job(work);
  assert not (job->'delivery'->>'can_submit_result')::boolean and not (job->'delivery'->>'can_load')::boolean, 'worker has nothing left to do';
end
$test$;
