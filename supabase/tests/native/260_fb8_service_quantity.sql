-- FB8 item 1: a service by trip may be scheduled without knowing how many trips (planned quantity empty = "Tính theo thực
-- tế") and without a description; the worker reports the count when finishing and the office verifies and bills it.
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KHDV8', 'Khách dịch vụ FB8', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f000000-0000-4000-8000-000000000002', '7f000000-0000-4000-8000-000000000001', 'CT8', 'Công trình FB8', 'Địa chỉ thử');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7f000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_XDV8', '99C-260.01');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  customer constant uuid := '7f000000-0000-4000-8000-000000000001';
  site constant uuid := '7f000000-0000-4000-8000-000000000002';
  vehicle constant uuid := '7f000000-0000-4000-8000-000000000003';
  trip_type constant uuid := '7f000000-0000-4000-8000-000000000010';
  worker constant uuid := '30000000-0000-4000-8000-000000000001';
  start_at constant timestamptz := now() + interval '1 day';
  job uuid; again uuid; work uuid; saved public.service_jobs%rowtype; work_row public.work_items%rowtype; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_catalog_record('service_types', trip_type, branch,
    '{"code":"XE-CHUYEN8","name":"Xe chở hàng","unit_label":"chuyến","default_price_vnd":"450000","resource_kind":"VEHICLE","active":true}', null,
    'Tạo loại dịch vụ', '7f000000-0000-4000-8000-0000000000a1');

  -- No planned quantity and no description: kept empty / named after the type; replay returns the same job.
  job := public.schedule_service_job(branch, customer, site, trip_type, '', start_at, start_at + interval '4 hours', null,
    null, vehicle, null, '7f000000-0000-4000-8000-0000000000b1');
  select * into saved from public.service_jobs where id = job;
  assert saved.planned_quantity is null and saved.description = 'Dịch vụ Xe chở hàng' and saved.unit_label = 'chuyến'
    and saved.unit_price_vnd = 450000, format('job without quantity %s', to_jsonb(saved));
  again := public.schedule_service_job(branch, customer, site, trip_type, '', start_at, start_at + interval '4 hours', null,
    null, vehicle, null, '7f000000-0000-4000-8000-0000000000b1');
  assert again = job, 'replay returns the same job';
  assert (select planned_quantity from public.service_job_read where id = job limit 1) is null, 'read view keeps it empty';

  -- An estimate is still accepted; zero or a negative estimate is refused.
  job := public.schedule_service_job(branch, customer, site, trip_type, 'Chở cát', start_at, start_at + interval '4 hours', 3,
    null, vehicle, null, '7f000000-0000-4000-8000-0000000000b2');
  assert (select planned_quantity from public.service_jobs where id = job) = 3, 'estimate kept';
  failed := null;
  begin
    perform public.schedule_service_job(branch, customer, site, trip_type, 'Chở cát', start_at, start_at + interval '4 hours', 0,
      null, vehicle, null, '7f000000-0000-4000-8000-0000000000b3');
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_service_job', format('zero estimate, got %s', failed);
  perform pg_temp.act_as_admin();
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  failed := null;
  begin
    insert into public.service_jobs(branch_id, job_number, customer_id, site_id, service_type, description, scheduled_start, scheduled_end,
      planned_quantity, unit_label, created_by)
    values (branch, 'NT-SRV-NEG', customer, site, 'Xe chở hàng', 'Âm', start_at, start_at + interval '1 hour', -1, 'chuyến',
      '10000000-0000-4000-8000-000000000001');
  exception when check_violation then failed := 'check'; end;
  assert failed = 'check', 'a negative planned quantity is refused by the table';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- The job without an estimate runs end to end: the count reported when finishing is what is verified and billed.
  select id into job from public.service_jobs where description = 'Dịch vụ Xe chở hàng' and customer_id = customer;
  work := public.publish_work_item(branch, 'SERVICE_JOB', job, 'DIRECT', worker, '7f000000-0000-4000-8000-0000000000c1');
  select * into work_row from public.work_items where id = work;
  perform public.start_work_item(work, work_row.version, '7f000000-0000-4000-8000-0000000000c2');
  select * into work_row from public.work_items where id = work;
  perform public.submit_work_result(work, 5, null, 'Chủ nhà', null, work_row.version, '7f000000-0000-4000-8000-0000000000c3');
  select * into saved from public.service_jobs where id = job;
  select * into work_row from public.work_items where id = work;
  assert saved.execution_state = 'RESULT_SUBMITTED' and work_row.execution_state = 'DONE', format('reported %s / %s', saved.execution_state, work_row.execution_state);
  perform public.verify_service_job(job, 5, 5, 2250000, current_date + 7, 'Đã đối chiếu sản lượng thực tế', saved.version, work_row.version,
    '7f000000-0000-4000-8000-0000000000c4');
  assert (select execution_state from public.service_jobs where id = job) = 'VERIFIED', 'verified';
  assert (select billable_quantity from public.service_verifications where service_job_id = job) = 5, 'billed the reported count';
  assert (select original_amount_vnd from public.receivable_obligations r join public.service_verifications v on v.id = r.service_verification_id
    where v.service_job_id = job) = 2250000, 'receivable 5 × 450.000';
end
$test$;
