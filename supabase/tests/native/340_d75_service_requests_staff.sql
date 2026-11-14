-- D75: "Yêu cầu từ khách", staff side. Scheduling a request uses the existing schedule_service_job and links the two in one
-- transaction (service.manage in the request's branch, version-checked, replay-safe); a request that was scheduled, cancelled
-- or rejected is no longer open; the customer follows the linked job to the end and sees the verified amount, not the staff's data.
insert into auth.users(id, email) values
  ('7f750000-0000-4000-8000-0000000000a1', 'chu7502@example.test'),
  ('7f750000-0000-4000-8000-0000000000a2', 'nhan7502@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type, phone) values
  ('7f750000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH7511', 'Khách dịch vụ 7502', 'BUSINESS', '0901750001');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f750000-0000-4000-8000-000000000041', '7f750000-0000-4000-8000-000000000040', 'CT1', 'Công trình Q.7', '12 Nguyễn Văn Linh, Quận 7');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f750000-0000-4000-8000-0000000000a1', '7f750000-0000-4000-8000-000000000040', 'OWNER'),
  ('7f750000-0000-4000-8000-0000000000a2', '7f750000-0000-4000-8000-000000000040', 'RECEIVER');
insert into public.vehicles(id, branch_id, code, plate_number) values
  ('7f750000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_XDV75', '99C-750.01');
insert into public.machines(id, branch_id, code, name, machine_type) values
  ('7f750000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_MDV75', 'Máy xúc thử 75', 'Máy xúc');
insert into public.service_types(id, branch_id, code, name, unit_label, default_price_vnd, resource_kind, active, portal_visible, portal_group) values
  ('7f750000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'CHAC-GACH-TO', 'Chạc gạch', 'xe cn to', 340000, 'VEHICLE', true, true, 'Chạc'),
  ('7f750000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-00000000000a', 'MAY-XUC', 'Máy xúc', 'ca', 2500000, 'MACHINE', true, true, 'Máy');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  customer constant uuid := '7f750000-0000-4000-8000-000000000040';
  site constant uuid := '7f750000-0000-4000-8000-000000000041';
  vehicle constant uuid := '7f750000-0000-4000-8000-000000000003';
  machine constant uuid := '7f750000-0000-4000-8000-000000000004';
  type_to constant uuid := '7f750000-0000-4000-8000-000000000012';
  type_may constant uuid := '7f750000-0000-4000-8000-000000000013';
  worker constant uuid := '30000000-0000-4000-8000-000000000001';
  tomorrow constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1;
  start_at constant timestamptz := now() + interval '1 day';
  first_request uuid;
  second_request uuid;
  third_request uuid;
  job uuid;
  job2 uuid;
  work uuid;
  job_row public.service_jobs%rowtype;
  work_row public.work_items%rowtype;
  detail jsonb;
  failed text;
begin
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  first_request := public.submit_service_request(customer, site, null, type_to, 2, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901 234 567', 'Hẻm nhỏ', '7f750000-0000-4000-8000-0000000000b1');
  second_request := public.submit_service_request(customer, site, null, type_to, 1, tomorrow, 'AFTERNOON', null, 'Anh Tuấn', '0901 234 567', null, '7f750000-0000-4000-8000-0000000000b2');
  third_request := public.submit_service_request(customer, site, null, type_may, 1, tomorrow + 1, 'MORNING', null, 'Anh Tuấn', '0901 234 567', null, '7f750000-0000-4000-8000-0000000000b3');

  -- Who may schedule: service.manage in the branch only (a reader and another branch's staff cannot; the customer cannot).
  foreach failed in array array['10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '7f750000-0000-4000-8000-0000000000a1'] loop
    perform pg_temp.act_as(failed::uuid);
    begin
      perform public.schedule_service_request(first_request, 1, null, start_at, start_at + interval '4 hours', 2, null, null, vehicle, null, gen_random_uuid());
      failed := 'accepted';
    exception when insufficient_privilege then failed := 'refused'; end;
    assert failed = 'refused', 'only service.manage in the branch schedules a request';
  end loop;

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- A stale version is refused and nothing changes; a vehicle type does not take a machine and the request stays open.
  failed := null;
  begin perform public.schedule_service_request(first_request, 7, null, start_at, start_at + interval '4 hours', 2, null, null, vehicle, null, gen_random_uuid());
  exception when others then failed := sqlstate || ':' || sqlerrm; end;
  assert failed = 'PT409:stale_service_request', format('stale version, got %s', failed);
  failed := null;
  begin perform public.schedule_service_request(first_request, 1, null, start_at, start_at + interval '4 hours', 2, null, null, null, machine, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'service_resource_mismatch', format('machine on a vehicle type, got %s', failed);
  failed := null;
  begin perform public.schedule_service_request(first_request, 1, null, start_at + interval '4 hours', start_at, 2, null, null, vehicle, null, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_service_job', format('end before start, got %s', failed);
  assert (select state = 'SUBMITTED' and service_job_id is null and version = 1 from public.service_requests where id = first_request), 'still open after refusals';

  -- Schedule: a service job with the type's snapshot, linked one to one; replay returns the same job.
  job := public.schedule_service_request(first_request, 1, null, start_at, start_at + interval '4 hours', 2, 'Chạc gạch vỡ ở cổng', null, vehicle, null, '7f750000-0000-4000-8000-0000000000d1');
  assert public.schedule_service_request(first_request, 1, null, start_at, start_at + interval '4 hours', 2, 'Chạc gạch vỡ ở cổng', null, vehicle, null, '7f750000-0000-4000-8000-0000000000d1') = job, 'replay';
  failed := null;
  begin perform public.schedule_service_request(first_request, 1, null, start_at, start_at + interval '5 hours', 2, 'Chạc gạch vỡ ở cổng', null, vehicle, null, '7f750000-0000-4000-8000-0000000000d1');
  exception when unique_violation then failed := 'conflict'; end;
  assert failed = 'conflict', 'same operation, other payload';
  select * into job_row from public.service_jobs where id = job;
  assert job_row.customer_id = customer and job_row.site_id = site and job_row.service_type = 'Chạc gạch' and job_row.unit_label = 'xe cn to' and job_row.unit_price_vnd = 340000
    and job_row.planned_quantity = 2 and job_row.vehicle_id = vehicle and job_row.execution_state = 'SCHEDULED' and job_row.description = 'Chạc gạch vỡ ở cổng', format('job %s', to_jsonb(job_row));
  assert (select state = 'SCHEDULED' and service_job_id = job and version = 2 and decided_by = '10000000-0000-4000-8000-000000000001' from public.service_requests where id = first_request), 'linked';
  assert exists (select 1 from public.audit_events e where e.entity_id = first_request and e.action = 'service_request.scheduled'), 'audited';
  failed := null;
  begin perform public.schedule_service_request(first_request, 2, null, start_at, start_at + interval '4 hours', 2, null, null, vehicle, null, gen_random_uuid());
  exception when check_violation then failed := 'closed'; end;
  assert failed = 'closed', 'a scheduled request is no longer open';
  failed := null;
  begin perform public.reject_service_request(first_request, 'Không nhận được', 2, gen_random_uuid()); exception when check_violation then failed := 'closed'; end;
  assert failed = 'closed', 'a scheduled request cannot be rejected';

  -- The customer sees it scheduled and can no longer cancel it from the portal.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  detail := public.customer_portal_service_request(first_request);
  assert detail->>'stage' = 'SCHEDULED' and not (detail->>'can_cancel')::boolean and (detail->>'scheduled_start')::timestamptz = start_at, format('scheduled view %s', detail);
  failed := null;
  begin perform public.cancel_service_request(first_request, 'Muốn hủy', gen_random_uuid()); exception when check_violation then failed := 'refused'; end;
  assert failed = 'refused', 'a scheduled request is not cancelled from the portal';

  -- The linked job runs to the end: the customer follows it and sees the verified amount (owner), not the receiver.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  work := public.publish_work_item(branch, 'SERVICE_JOB', job, 'DIRECT', worker, '7f750000-0000-4000-8000-0000000000e1');
  select * into work_row from public.work_items where id = work;
  perform public.start_work_item(work, work_row.version, '7f750000-0000-4000-8000-0000000000e2');
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  assert public.customer_portal_service_request(first_request)->>'stage' = 'IN_PROGRESS', 'worker started';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select * into work_row from public.work_items where id = work;
  perform public.submit_work_result(work, 2, null, 'Chủ nhà', null, work_row.version, '7f750000-0000-4000-8000-0000000000e3');
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  assert public.customer_portal_service_request(first_request)->>'stage' = 'CONFIRMING', 'result waits for the office';
  assert not (public.customer_portal_service_request(first_request) ? 'final_amount_vnd'), 'no final amount before verification';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select * into job_row from public.service_jobs where id = job;
  select * into work_row from public.work_items where id = work;
  perform public.verify_service_job(job, 2, 2, 680000, current_date + 7, 'Đã đối chiếu sản lượng thực tế', job_row.version, work_row.version, '7f750000-0000-4000-8000-0000000000e4');
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  detail := public.customer_portal_service_request(first_request);
  assert detail->>'stage' = 'DONE' and detail->>'final_amount_vnd' = '680000' and detail->>'billable_quantity' = '2' and detail ? 'verified_at', format('done %s', detail);
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a2');
  detail := public.customer_portal_service_request(first_request);
  assert detail->>'stage' = 'DONE' and not (detail ? 'final_amount_vnd') and not (detail ? 'estimate_vnd') and detail->>'billable_quantity' = '2', 'receiver sees completion without money';

  -- Another type and quantity may be chosen when scheduling; a job the store cancels shows as such to the customer.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  job2 := public.schedule_service_request(second_request, 1, type_may, start_at + interval '1 day', start_at + interval '1 day 8 hours', 1, null, null, null, machine, gen_random_uuid());
  select * into job_row from public.service_jobs where id = job2;
  assert job_row.service_type = 'Máy xúc' and job_row.unit_label = 'ca' and job_row.unit_price_vnd = 2500000 and job_row.machine_id = machine
    and job_row.description = 'Dịch vụ Máy xúc', format('another type %s', to_jsonb(job_row));
  perform public.cancel_scheduled_service_job(job2, job_row.version, 'Máy hỏng', gen_random_uuid());
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  assert public.customer_portal_service_request(second_request)->>'stage' = 'SCHEDULE_CANCELLED', 'the store cancelled the schedule';

  -- Reject: a reason is required; the customer sees it; it cannot be rejected twice or scheduled afterwards.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.reject_service_request(third_request, 'Hết máy trong ngày', 1, gen_random_uuid()); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'a reader cannot reject';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.reject_service_request(third_request, 'ab', 1, gen_random_uuid()); exception when invalid_parameter_value then failed := 'refused'; end;
  assert failed = 'refused', 'a reason is required';
  failed := null;
  begin perform public.reject_service_request(third_request, 'Hết máy trong ngày', 5, gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', 'stale version';
  perform public.reject_service_request(third_request, 'Hết máy trong ngày', 1, '7f750000-0000-4000-8000-0000000000f1');
  assert public.reject_service_request(third_request, 'Hết máy trong ngày', 1, '7f750000-0000-4000-8000-0000000000f1') = third_request, 'reject replay';
  failed := null;
  begin perform public.schedule_service_request(third_request, 2, null, start_at, start_at + interval '4 hours', 1, null, null, null, machine, gen_random_uuid()); exception when check_violation then failed := 'closed'; end;
  assert failed = 'closed', 'a rejected request cannot be scheduled';
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  detail := public.customer_portal_service_request(third_request);
  assert detail->>'stage' = 'REJECTED' and detail->>'decision_reason' = 'Hết máy trong ngày' and not (detail->>'can_cancel')::boolean, format('rejected view %s', detail);
  assert jsonb_array_length(public.customer_portal_service_requests(null, 100)->'requests') = 3, 'all three are listed';

  -- Scheduling does not read a request of another branch and a missing request is "forbidden", not a leak.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.schedule_service_request(gen_random_uuid(), 1, null, start_at, start_at + interval '4 hours', 1, null, null, vehicle, null, gen_random_uuid()); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'unknown request';

  -- Anonymous callers have no access at all.
  perform pg_temp.act_as_admin();
  set local role anon;
  failed := null;
  begin perform public.schedule_service_request(first_request, 1, null, start_at, start_at + interval '4 hours', 1, null, null, vehicle, null, gen_random_uuid()); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'anon schedule';
  failed := null;
  begin perform public.reject_service_request(first_request, 'Không nhận', 1, gen_random_uuid()); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'anon reject';
  reset role;
end
$test$;
