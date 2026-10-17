-- FB4 D23: service types are a branch catalogue (save/delete through the catalog commands, service.manage) and a scheduled
-- job keeps the chosen type's name, unit and price; the type decides which resource may be attached.
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7e000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KHDV', 'Khách dịch vụ', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7e000000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-000000000001', 'CT1', 'Công trình dịch vụ', 'Địa chỉ thử');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7e000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_XDV', '99C-160.01');
insert into public.machines(id, branch_id, code, name, machine_type) values
  ('7e000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_MDV', 'Máy xúc thử', 'Máy xúc');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  other_branch constant uuid := '20000000-0000-4000-8000-00000000000b';
  customer constant uuid := '7e000000-0000-4000-8000-000000000001';
  site constant uuid := '7e000000-0000-4000-8000-000000000002';
  vehicle constant uuid := '7e000000-0000-4000-8000-000000000003';
  machine constant uuid := '7e000000-0000-4000-8000-000000000004';
  trip_type constant uuid := '7e000000-0000-4000-8000-000000000010';
  digger_type constant uuid := '7e000000-0000-4000-8000-000000000011';
  labour_type constant uuid := '7e000000-0000-4000-8000-000000000012';
  unused_type constant uuid := '7e000000-0000-4000-8000-000000000013';
  start_at constant timestamptz := now() + interval '1 day';
  job uuid;
  job2 uuid;
  row_count integer;
  saved public.service_jobs%rowtype;
  failed text;
  failed_message text;
begin
  -- Only service.manage in the branch may create a type; a reader neither creates nor sees one.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin
    perform public.save_catalog_record('service_types', trip_type, branch,
      '{"code":"XE-CHUYEN","name":"Xe chở hàng","unit_label":"chuyến","default_price_vnd":"450000","resource_kind":"VEHICLE","active":true}', null,
      'Tạo loại dịch vụ', '7e000000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must not create a service type, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_catalog_record('service_types', trip_type, branch,
    '{"code":"XE-CHUYEN","name":"Xe chở hàng","unit_label":"chuyến","default_price_vnd":"450000","resource_kind":"VEHICLE","active":true}', null,
    'Tạo loại dịch vụ', '7e000000-0000-4000-8000-0000000000a2');
  perform public.save_catalog_record('service_types', digger_type, branch,
    '{"code":"MAY-XUC","name":"Máy xúc","unit_label":"giờ","default_price_vnd":"800000","resource_kind":"MACHINE","active":true}', null,
    'Tạo loại dịch vụ', '7e000000-0000-4000-8000-0000000000a3');
  perform public.save_catalog_record('service_types', labour_type, branch,
    '{"code":"BOC-XEP","name":"Bốc xếp","unit_label":"công","default_price_vnd":null,"resource_kind":"NONE","active":true}', null,
    'Tạo loại dịch vụ', '7e000000-0000-4000-8000-0000000000a4');
  perform public.save_catalog_record('service_types', unused_type, branch,
    '{"code":"CHUA-DUNG","name":"Loại chưa dùng","unit_label":"ngày","resource_kind":"NONE","active":true}', null,
    'Tạo loại dịch vụ', '7e000000-0000-4000-8000-0000000000a5');
  select count(*) into row_count from public.service_types where branch_id = branch;
  assert row_count = 4, format('four types in the branch, got %s', row_count);
  assert (select default_price_vnd from public.service_types where id = trip_type) = 450000, 'price saved as whole VND';

  -- Same code twice in the branch is refused; the other branch cannot edit or see this branch's type.
  failed := null;
  begin
    perform public.save_catalog_record('service_types', '7e000000-0000-4000-8000-000000000019', branch,
      '{"code":"XE-CHUYEN","name":"Trùng mã","unit_label":"chuyến","resource_kind":"NONE","active":true}', null, 'Tạo trùng', '7e000000-0000-4000-8000-0000000000a6');
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('duplicate code must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin
    perform public.save_catalog_record('service_types', trip_type, other_branch, '{"default_price_vnd":"1"}', '{"default_price_vnd":450000}',
      'Sửa giá', '7e000000-0000-4000-8000-0000000000a7');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('another branch must not edit the type, got %s', failed);
  select count(*) into row_count from public.service_types where id = trip_type;
  assert row_count = 0, 'another branch must not read the type';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  select count(*) into row_count from public.service_types;
  assert row_count = 0, 'a reader without service.read sees no type';

  -- Scheduling copies the type onto the job; replays return the same job.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  job := public.schedule_service_job(branch, customer, site, trip_type, 'Chở cát lên công trình', start_at, start_at + interval '3 hours', 2,
    null, vehicle, null, '7e000000-0000-4000-8000-0000000000b1');
  select * into saved from public.service_jobs where id = job;
  assert saved.service_type = 'Xe chở hàng' and saved.unit_label = 'chuyến' and saved.unit_price_vnd = 450000 and saved.service_type_id = trip_type
    and saved.vehicle_id = vehicle and saved.execution_state = 'SCHEDULED', 'job keeps the type name, unit and price';
  job2 := public.schedule_service_job(branch, customer, site, trip_type, 'Chở cát lên công trình', start_at, start_at + interval '3 hours', 2,
    null, vehicle, null, '7e000000-0000-4000-8000-0000000000b1');
  assert job2 = job, 'replay returns the same job';
  select count(*) into row_count from public.service_jobs where customer_id = customer;
  assert row_count = 1, 'replay schedules nothing new';
  failed := null;
  begin
    perform public.schedule_service_job(branch, customer, site, trip_type, 'Chở cát lên công trình', start_at, start_at + interval '3 hours', 3,
      null, vehicle, null, '7e000000-0000-4000-8000-0000000000b1');
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('same operation with other values must conflict, got %s', failed);

  -- The type decides the resource: no vehicle on a machine type, nothing on a type that needs none.
  failed_message := null;
  begin
    perform public.schedule_service_job(branch, customer, site, digger_type, 'Đào móng', start_at, start_at + interval '2 hours', 2,
      null, vehicle, null, '7e000000-0000-4000-8000-0000000000b2');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'service_resource_mismatch', format('machine type must refuse a vehicle, got %s', failed_message);
  failed_message := null;
  begin
    perform public.schedule_service_job(branch, customer, site, labour_type, 'Bốc xếp gạch', start_at, start_at + interval '2 hours', 4,
      null, null, machine, '7e000000-0000-4000-8000-0000000000b3');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'service_resource_mismatch', format('type without resource must refuse a machine, got %s', failed_message);
  job2 := public.schedule_service_job(branch, customer, site, digger_type, 'Đào móng', start_at, start_at + interval '2 hours', 2.5,
    null, null, machine, '7e000000-0000-4000-8000-0000000000b4');
  select * into saved from public.service_jobs where id = job2;
  assert saved.unit_label = 'giờ' and saved.unit_price_vnd = 800000 and saved.machine_id = machine, 'machine type takes a machine';
  job2 := public.schedule_service_job(branch, customer, site, labour_type, 'Bốc xếp gạch', start_at, start_at + interval '2 hours', 4,
    null, null, null, '7e000000-0000-4000-8000-0000000000b5');
  assert (select unit_price_vnd from public.service_jobs where id = job2) is null, 'type without a price leaves the job price empty';

  -- Changing or stopping the type later does not touch scheduled jobs; a stopped type cannot be scheduled.
  perform public.save_catalog_record('service_types', trip_type, branch, '{"default_price_vnd":"500000","active":false}',
    '{"default_price_vnd":450000,"active":true}', 'Đổi giá và ngừng', '7e000000-0000-4000-8000-0000000000a8');
  assert (select unit_price_vnd from public.service_jobs where id = job) = 450000, 'job keeps the price it was scheduled with';
  failed_message := null;
  begin
    perform public.schedule_service_job(branch, customer, site, trip_type, 'Chở đá', start_at, start_at + interval '3 hours', 1,
      null, null, null, '7e000000-0000-4000-8000-0000000000b6');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'invalid_service_type', format('stopped type must be refused, got %s', failed_message);
  failed := null;
  begin
    perform public.save_catalog_record('service_types', digger_type, branch, '{"default_price_vnd":"1"}', '{"default_price_vnd":1}',
      'Sửa giá cũ', '7e000000-0000-4000-8000-0000000000a9');
  exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale edit must reload, got %s', failed);

  -- A type a job uses stays; an unused one is deleted.
  failed_message := null;
  begin perform public.delete_catalog_record('service_types', digger_type, branch, 'Tạo nhầm', '7e000000-0000-4000-8000-0000000000c1');
  exception when others then failed_message := sqlerrm; end;
  assert failed_message = 'catalog_record_in_use', format('used type must stay, got %s', failed_message);
  perform public.delete_catalog_record('service_types', unused_type, branch, 'Tạo nhầm', '7e000000-0000-4000-8000-0000000000c2');
  assert not exists(select 1 from public.service_types where id = unused_type), 'unused type is deleted';
  assert exists(select 1 from public.audit_events where trace_id = '7e000000-0000-4000-8000-0000000000c2' and action = 'catalog.delete'), 'delete is audited';

  -- The earlier free-text command still schedules a job without a type.
  job2 := public.create_service_job(branch, customer, site, 'Dịch vụ khác', 'Việc ghi tay', start_at, start_at + interval '1 hour', 1, 'giờ',
    null, null, null, '7e000000-0000-4000-8000-0000000000b7');
  assert (select service_type_id from public.service_jobs where id = job2) is null, 'free-text job has no type';

  -- Readers cannot schedule.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin
    perform public.schedule_service_job(branch, customer, site, labour_type, 'Bốc xếp gạch', start_at, start_at + interval '2 hours', 4,
      null, null, null, '7e000000-0000-4000-8000-0000000000b8');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must not schedule, got %s', failed);
end
$test$;
