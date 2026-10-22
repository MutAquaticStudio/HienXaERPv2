-- FB3 A3: the assigned worker reports "Đã giao" with photos (or a short / failed delivery) through submit_portal_delivery_done;
-- the job payload shows sold units and whether the warehouse has handed the goods over yet.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f180000-0000-4000-8000-000000000031', 'nt_kg180', 'Kilôgam thử 4', 'kg'),
  ('7f180000-0000-4000-8000-000000000032', 'nt_bao180', 'Bao thử 4', 'bao');
insert into public.material_groups(id, code, name) values ('7f181000-0000-4000-8000-000000000031', 'NT_G180', 'Nhóm thử 4');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f182000-0000-4000-8000-000000000031', '7f181000-0000-4000-8000-000000000031', 'NT_XM180', 'Xi măng thử 4', '7f180000-0000-4000-8000-000000000031');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f188000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH180', 'Khách thử 4', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f188000-0000-4000-8000-000000000002', '7f188000-0000-4000-8000-000000000001', 'CT1', 'Công trình thử', 'Địa chỉ thử');
update public.customer_sites set receiver_name = 'Anh Nhận', receiver_phone = '0901000180' where id = '7f188000-0000-4000-8000-000000000002';
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f188000-0000-4000-8000-000000000005', '7f188000-0000-4000-8000-000000000001', 'CT2', 'Công trình chưa có người nhận', 'Địa chỉ thử 2');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f188000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_K1801', 'Kho thử 1'),
  ('7f188000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_K1802', 'Kho thử 2');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by, confirmed_at) values
  ('7f188000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1801', '7f188000-0000-4000-8000-000000000001',
   '7f188000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thử 4', 'Công trình thử', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001', now()),
  ('7f188000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT-SO-1802', '7f188000-0000-4000-8000-000000000001',
   '7f188000-0000-4000-8000-000000000005', 'CONFIRMED', 'Khách thử 4', 'Công trình chưa có người nhận', 'Địa chỉ thử 2', '10000000-0000-4000-8000-000000000001', now());
-- 10 bao of 50 kg (= 500 kg) sold, plus one line on the draft order.
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f188000-0000-4000-8000-000000000020', '7f188000-0000-4000-8000-000000000010', 1, '7f182000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '7f180000-0000-4000-8000-000000000032', '7f180000-0000-4000-8000-000000000031', 10, 50, 1, 'HALF_UP', 90000, 900000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f188000-0000-4000-8000-000000000021', '7f188000-0000-4000-8000-000000000011', 1, '7f182000-0000-4000-8000-000000000031', 'Xi măng thử 4',
   '7f180000-0000-4000-8000-000000000032', '7f180000-0000-4000-8000-000000000031', 1, 50, 1, 'HALF_UP', 90000, 90000, 'MANUAL_APPROVED',
   '10000000-0000-4000-8000-000000000001', 'Giá thử');
-- 400 kg on hand in warehouse 1 (from an approved count), nothing in warehouse 2.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f188000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-00000000000a', '7f188000-0000-4000-8000-000000000003', 'NT-KK-1801', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f188000-0000-4000-8000-000000000031', '7f188000-0000-4000-8000-000000000030', '7f182000-0000-4000-8000-000000000031', 0, 400, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f182000-0000-4000-8000-000000000031', '7f180000-0000-4000-8000-000000000031', 'WAREHOUSE',
   '7f188000-0000-4000-8000-000000000003', 'STOCK_ADJUSTMENT', 400, 600000, 1500, '7f188000-0000-4000-8000-000000000031', now(), '10000000-0000-4000-8000-000000000001');

-- The order carries the receiver it was sold with; the other order has none.
update public.sales_orders set receiver_name_snapshot = 'Anh Nhận', receiver_phone_snapshot = '0901000180' where id = '7f188000-0000-4000-8000-000000000010';
-- A truck of 1 000 kg with verified capacity.
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id, capacity_source_note, capacity_verified_at, capacity_verified_by) values
  ('7f188000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_XE180', '99C-180.01', 1000, '7f180000-0000-4000-8000-000000000031',
   'Đăng kiểm thử', now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);


do $test$
declare
  orders constant uuid := '7f188000-0000-4000-8000-000000000010';
  line constant uuid := '7f188000-0000-4000-8000-000000000020';
  w1 constant uuid := '7f188000-0000-4000-8000-000000000003';
  driver constant uuid := '30000000-0000-4000-8000-000000000001';
  truck constant uuid := '7f188000-0000-4000-8000-000000000040';
  start_at constant timestamptz := date_trunc('hour', now()) + interval '1 hour';
  photo1 constant uuid := '7f189000-0000-4000-8000-0000000000e1';
  photo2 constant uuid := '7f189000-0000-4000-8000-0000000000e2';
  stranger_photo constant uuid := '7f189000-0000-4000-8000-0000000000e3';
  result jsonb;
  delivery uuid;
  second_delivery uuid;
  work uuid;
  second_work uuid;
  job jsonb;
  done_id uuid;
  failed text;
  failed_message text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '2')), start_at,
    jsonb_build_object('employee_id', driver, 'vehicle_id', truck, 'scheduled_start', start_at), '7f189000-0000-4000-8000-000000000001');
  delivery := (result->>'delivery_id')::uuid;
  select id into work from public.work_items where delivery_id = delivery;

  -- Before the warehouse hands the goods over, the worker is told to wait and cannot report.
  job := public.worker_portal_job(work);
  assert (job->'delivery'->>'awaiting_handoff')::boolean and not (job->'delivery'->>'can_submit_result')::boolean, format('job before handoff %s', job);
  assert job->'delivery'->'lines'->0->>'sold_unit' = 'bao' and (job->'delivery'->'lines'->0->>'sold_numerator')::numeric = 50, 'sold unit shown';
  failed := null;
  begin perform public.submit_portal_delivery_done(work, null, null, null, array[photo1], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
      (job->'delivery'->>'assignment_version')::integer, '7f189000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '55000', format('report before handoff must wait, got %s', failed);

  perform public.handoff_delivery_actual(delivery, (select version from public.deliveries where id = delivery), now(), '7f189000-0000-4000-8000-000000000002',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = delivery), 'loaded_base_quantity', '100')));
  job := public.worker_portal_job(work);
  assert job->>'state' = 'CLAIMED' and (job->'delivery'->>'can_submit_result')::boolean, format('reportable after handoff without "Bắt đầu" %s', job);

  -- Photos uploaded through the portal (stand-ins for the storage step); one belongs to someone else.
  perform pg_temp.act_as_admin();
  insert into public.portal_evidence_objects(id, object_path, context_type, work_item_id, uploaded_by, mime_type, declared_byte_size, final_byte_size, checksum_sha256, object_state, finalized_at) values
    (photo1, 'nt180/a.jpg', 'WORK_RESULT', work, '10000000-0000-4000-8000-000000000001', 'image/jpeg', 1000, 1000, repeat('a', 64), 'READY', now()),
    (photo2, 'nt180/b.jpg', 'WORK_RESULT', work, '10000000-0000-4000-8000-000000000001', 'image/jpeg', 1000, 1000, repeat('b', 64), 'READY', now()),
    (stranger_photo, 'nt180/c.jpg', 'WORK_RESULT', work, '10000000-0000-4000-8000-000000000002', 'image/jpeg', 1000, 1000, repeat('c', 64), 'READY', now());
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Delivered needs a photo, and only the worker's own photos of this job.
  failed_message := null;
  begin perform public.submit_portal_delivery_done(work, null, null, null, '{}', (job->>'version')::integer, (job->'delivery'->>'version')::integer,
      (job->'delivery'->>'assignment_version')::integer, '7f189000-0000-4000-8000-0000000000a2');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'delivery_photo_required', format('photo required, got %s', failed_message);
  failed := null;
  begin perform public.submit_portal_delivery_done(work, null, null, null, array[photo1, stranger_photo], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
      (job->'delivery'->>'assignment_version')::integer, '7f189000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('someone else''s photo must be refused, got %s', failed);

  -- "Đã giao" with two photos: delivered as loaded, arrival and start implied, receiver from the delivery.
  -- This order has no credit commitment, so the automatic verification (FB7) leaves it for the office.
  done_id := public.submit_portal_delivery_done(work, null, null, null, array[photo2, photo1], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
    (job->'delivery'->>'assignment_version')::integer, '7f189000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  assert (select execution_state || ':' || result_kind from public.deliveries where id = delivery) = 'RESULT_SUBMITTED:FULL', 'delivery waits for verification';
  assert (select execution_state from public.work_items where id = work) = 'DONE' and (select started_at from public.work_items where id = work) is not null, 'work done';
  assert (select trim_scale(actual_base_quantity) from public.delivery_result_lines rl join public.delivery_results r on r.id = rl.delivery_result_id
    where r.delivery_id = delivery) = 100, 'reported as loaded';
  assert (select receiver_name from public.delivery_results where delivery_id = delivery) = 'Anh Nhận', 'receiver from the delivery';
  assert (select count(*) from public.work_result_portal_evidence where work_result_id = done_id) = 2, 'both photos linked';

  -- Replay returns the same result; another payload under the same operation conflicts.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.submit_portal_delivery_done(work, null, null, null, array[photo1, photo2], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
    (job->'delivery'->>'assignment_version')::integer, '7f189000-0000-4000-8000-000000000003') = done_id, 'replay';
  failed := null;
  begin perform public.submit_portal_delivery_done(work, null, 'Người khác', null, array[photo1, photo2], (job->>'version')::integer, (job->'delivery'->>'version')::integer,
      (job->'delivery'->>'assignment_version')::integer, '7f189000-0000-4000-8000-000000000003');
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict, got %s', failed);

  -- Not delivered: no photo needed, and since FB7 no note either (one is still kept when given).
  result := public.create_delivery_for_order(orders, w1, jsonb_build_array(jsonb_build_object('sales_order_line_id', line, 'quantity', '1')), start_at,
    jsonb_build_object('employee_id', driver, 'vehicle_id', truck, 'schedule_mode', 'NOW'), '7f189000-0000-4000-8000-000000000004');
  second_delivery := (result->>'delivery_id')::uuid;
  select id into second_work from public.work_items where delivery_id = second_delivery;
  perform public.handoff_delivery_actual(second_delivery, (select version from public.deliveries where id = second_delivery), now(), '7f189000-0000-4000-8000-000000000005',
    jsonb_build_array(jsonb_build_object('delivery_line_id', (select id from public.delivery_lines where delivery_id = second_delivery), 'loaded_base_quantity', '50')));
  job := public.worker_portal_job(second_work);
  perform public.submit_portal_delivery_done(second_work, jsonb_build_array(jsonb_build_object('delivery_line_id', job->'delivery'->'lines'->0->>'id', 'actual_base_quantity', '0')),
    null, 'Khách đi vắng, không nhận', '{}', (job->>'version')::integer, (job->'delivery'->>'version')::integer, (job->'delivery'->>'assignment_version')::integer,
    '7f189000-0000-4000-8000-000000000006');
  perform pg_temp.act_as_admin();
  assert (select result_kind from public.deliveries where id = second_delivery) = 'FAILED', 'not delivered';
  assert (select note from public.delivery_results where delivery_id = second_delivery) = 'Khách đi vắng, không nhận', 'note kept';

  -- Someone else cannot report the job.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.submit_portal_delivery_done(work, null, null, null, array[photo1], 1, 1, 1, '7f189000-0000-4000-8000-0000000000a5');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('non-assignee must be refused, got %s', failed);
end
$test$;
