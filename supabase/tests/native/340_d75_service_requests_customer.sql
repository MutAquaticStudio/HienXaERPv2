-- D75: "Đặt dịch vụ" on the customer portal, customer side. The catalog shows only the types the owner turned on, merged by
-- name with one option per unit; only the owner of the account sends or cancels a request; the store is told; the request is
-- replay-safe; money shows for the owner and the finance contact only; and nothing is readable straight from the table.
insert into auth.users(id, email) values
  ('7f750000-0000-4000-8000-0000000000a1', 'chu750@example.test'),
  ('7f750000-0000-4000-8000-0000000000a2', 'nhan750@example.test'),
  ('7f750000-0000-4000-8000-0000000000a3', 'khac750@example.test'),
  ('7f750000-0000-4000-8000-0000000000a4', 'ketoan750@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type, phone) values
  ('7f750000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH7501', 'Khách dịch vụ 750', 'BUSINESS', '0901750001'),
  ('7f750000-0000-4000-8000-000000000042', '20000000-0000-4000-8000-00000000000a', 'NT_KH7502', 'Khách khác 750', 'BUSINESS', null);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f750000-0000-4000-8000-000000000041', '7f750000-0000-4000-8000-000000000040', 'CT1', 'Công trình Q.7', '12 Nguyễn Văn Linh, Quận 7', 'Anh Nhận', '0901750099'),
  ('7f750000-0000-4000-8000-000000000043', '7f750000-0000-4000-8000-000000000042', 'CT1', 'Công trình khác 750', 'Địa chỉ khác', null, null);
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f750000-0000-4000-8000-0000000000a1', '7f750000-0000-4000-8000-000000000040', 'OWNER'),
  ('7f750000-0000-4000-8000-0000000000a2', '7f750000-0000-4000-8000-000000000040', 'RECEIVER'),
  ('7f750000-0000-4000-8000-0000000000a3', '7f750000-0000-4000-8000-000000000042', 'OWNER'),
  ('7f750000-0000-4000-8000-0000000000a4', '7f750000-0000-4000-8000-000000000040', 'FINANCE_CONTACT');
-- Types: "Chạc gạch" in two units (shown), "Máy xúc" without a price (shown), one hidden, one stopped, one in the other branch.
insert into public.service_types(id, branch_id, code, name, unit_label, default_price_vnd, resource_kind, active, portal_visible, portal_group) values
  ('7f750000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'CHAC-GACH-XE', 'Chạc gạch', 'xe', 170000, 'VEHICLE', true, true, 'Chạc'),
  ('7f750000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'CHAC-GACH-TO', 'Chạc gạch', 'xe cn to', 340000, 'VEHICLE', true, true, 'Chạc'),
  ('7f750000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-00000000000a', 'MAY-XUC', 'Máy xúc', 'ca', null, 'MACHINE', true, true, 'Máy'),
  ('7f750000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-00000000000a', 'AN-NOI-BO', 'Vận chuyển nội bộ', 'lượt', 150000, 'VEHICLE', true, false, 'Vận chuyển'),
  ('7f750000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-00000000000a', 'DA-NGUNG', 'Dịch vụ đã ngừng', 'giờ', 100000, 'NONE', false, true, 'Nhân công'),
  ('7f750000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-00000000000b', 'CHI-NHANH-B', 'Dịch vụ chi nhánh B', 'giờ', 100000, 'NONE', true, true, 'Nhân công');

do $test$
declare
  customer constant uuid := '7f750000-0000-4000-8000-000000000040';
  site constant uuid := '7f750000-0000-4000-8000-000000000041';
  other_site constant uuid := '7f750000-0000-4000-8000-000000000043';
  type_xe constant uuid := '7f750000-0000-4000-8000-000000000011';
  type_to constant uuid := '7f750000-0000-4000-8000-000000000012';
  type_may constant uuid := '7f750000-0000-4000-8000-000000000013';
  type_hidden constant uuid := '7f750000-0000-4000-8000-000000000014';
  type_stopped constant uuid := '7f750000-0000-4000-8000-000000000015';
  type_other_branch constant uuid := '7f750000-0000-4000-8000-000000000016';
  tomorrow constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1;
  catalog jsonb;
  request uuid;
  second uuid;
  detail jsonb;
  failed text;
  listing jsonb;
begin
  -- Catalog: groups, merged names, options by unit with the owner's price; hidden, stopped and other-branch types never show.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  catalog := public.customer_portal_service_catalog(null);
  assert jsonb_array_length(catalog->'groups') = 2, format('two groups, got %s', catalog->'groups');
  assert catalog->'groups'->0->>'name' = 'Chạc' and catalog->'groups'->1->>'name' = 'Máy', 'group names';
  assert jsonb_array_length(catalog->'groups'->0->'services') = 1 and catalog->'groups'->0->'services'->0->>'name' = 'Chạc gạch', 'merged by name';
  assert (select array_agg(o->>'unit_label' order by ord) from jsonb_array_elements(catalog->'groups'->0->'services'->0->'options') with ordinality as t(o, ord)) = array['xe', 'xe cn to']
    and catalog->'groups'->0->'services'->0->'options'->0->>'unit_price_vnd' = '170000'
    and catalog->'groups'->0->'services'->0->'options'->1->>'unit_price_vnd' = '340000', 'one option per unit, cheapest first';
  assert (catalog->'groups'->1->'services'->0->'options'->0->'unit_price_vnd') = 'null'::jsonb, 'no price: the store quotes';
  assert catalog::text not like '%nội bộ%' and catalog::text not like '%ngừng%' and catalog::text not like '%chi nhánh B%', 'only what is turned on';
  assert catalog->'contact'->>'phone' = '0901750001' and catalog->'sites'->0->>'id' = site::text, 'contact and own sites';
  -- Only the owner of the account may order: not the receiver, not the finance contact, not staff, not an outsider.
  foreach failed in array array['7f750000-0000-4000-8000-0000000000a2', '7f750000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000001'] loop
    perform pg_temp.act_as(failed::uuid);
    begin perform public.customer_portal_service_catalog(null); failed := 'allowed';
    exception when insufficient_privilege then failed := 'refused'; end;
    assert failed = 'refused', 'only the owner reads the ordering catalog';
  end loop;

  -- Submit: replay-safe, server-checked, with a new site made from the details.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  request := public.submit_service_request(customer, site, null, type_to, 2, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901 234 567', 'Hẻm nhỏ', '7f750000-0000-4000-8000-0000000000b1');
  assert public.submit_service_request(customer, site, null, type_to, 2, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901 234 567', 'Hẻm nhỏ', '7f750000-0000-4000-8000-0000000000b1') = request, 'replay';
  failed := null;
  begin perform public.submit_service_request(customer, site, null, type_to, 3, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901 234 567', 'Hẻm nhỏ', '7f750000-0000-4000-8000-0000000000b1');
  exception when unique_violation then failed := 'conflict'; end;
  assert failed = 'conflict', 'same operation, other payload';
  perform pg_temp.act_as_admin();
  assert (select state = 'SUBMITTED' and version = 1 and quantity = 2 and unit_price_snapshot_vnd = 340000 and service_name_snapshot = 'Chạc gạch' and unit_label_snapshot = 'xe cn to'
    and site_name_snapshot = 'Công trình Q.7' and customer_name_snapshot = 'Khách dịch vụ 750' and request_number like 'YC-%' and preferred_slot = 'MORNING' and preferred_time is null
    and submitted_by = '7f750000-0000-4000-8000-0000000000a1' from public.service_requests where id = request), 'stored with snapshots, no service job yet';
  assert not exists (select 1 from public.service_jobs where customer_id = customer), 'a customer request creates no service job';
  assert exists (select 1 from public.notifications n where n.kind = 'service_request.submitted' and n.entity_id = request and n.required_permission = 'service.manage'
    and n.link = '/admin/service-jobs/requests/' || request), 'the store is told';
  assert exists (select 1 from public.audit_events e where e.entity_id = request and e.action = 'service_request.submitted'), 'audited';

  -- A specific time needs a time; a morning or afternoon slot takes none.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  second := public.submit_service_request(customer, null, jsonb_build_object('name', 'Nhà mới', 'address', '9 Nguyễn Trãi, Hà Nội'), type_may, 1, tomorrow + 3, 'TIME', '13:30',
    'Chị Lan', '0912345678', null, '7f750000-0000-4000-8000-0000000000b2');
  perform pg_temp.act_as_admin();
  assert (select s.name = 'Nhà mới' and s.customer_id = customer and s.code like 'DV-%' and s.receiver_phone = '0912345678' and r.preferred_time = '13:30'::time and r.unit_price_snapshot_vnd is null
    from public.service_requests r join public.customer_sites s on s.id = r.site_id where r.id = second), 'new site from the request, no price kept for a quoted service';
  -- One transaction has one clock: make the first request older so "newest first" is testable.
  update public.service_requests set created_at = created_at - interval '1 hour' where id = request;

  -- Refusals: bad slot / time, date out of range, bad contact, bad quantity, hidden / stopped / other-branch type, another customer's site, wrong role.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  foreach failed in array array['slot_time_missing', 'slot_time_extra', 'slot_unknown', 'past', 'far', 'phone', 'name', 'two_sites', 'no_site'] loop
    begin
      perform public.submit_service_request(customer, case failed when 'two_sites' then site when 'no_site' then null else site end,
        case failed when 'two_sites' then '{"name":"A B","address":"Địa chỉ đủ dài"}'::jsonb else null end,
        type_xe, 1,
        case failed when 'past' then tomorrow - 2 when 'far' then tomorrow + 130 else tomorrow end,
        case failed when 'slot_time_missing' then 'TIME' when 'slot_unknown' then 'EVENING' else 'MORNING' end,
        case failed when 'slot_time_extra' then '08:00'::time else null end,
        case failed when 'name' then 'A' else 'Anh Tuấn' end, case failed when 'phone' then '12ab' else '0901234567' end, null, gen_random_uuid());
      failed := failed || ' was accepted';
    exception when invalid_parameter_value then failed := 'refused';
    end;
    assert failed = 'refused', format('refused input: %s', failed);
  end loop;
  foreach failed in array array['0', '-1', '1.1234567'] loop
    begin
      perform public.submit_service_request(customer, site, null, type_xe, failed::numeric, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901234567', null, gen_random_uuid());
      failed := 'accepted';
    exception when invalid_parameter_value then failed := 'refused'; end;
    assert failed = 'refused', 'quantity must be exact and positive';
  end loop;
  foreach failed in array array[type_hidden::text, type_stopped::text, type_other_branch::text] loop
    begin
      perform public.submit_service_request(customer, site, null, failed::uuid, 1, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901234567', null, gen_random_uuid());
      failed := 'accepted';
    exception when foreign_key_violation then failed := 'refused'; end;
    assert failed = 'refused', 'a type that is not offered cannot be requested';
  end loop;
  begin perform public.submit_service_request(customer, other_site, null, type_xe, 1, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901234567', null, gen_random_uuid()); failed := 'accepted';
  exception when foreign_key_violation then failed := 'refused'; end;
  assert failed = 'refused', 'site of another customer';
  foreach failed in array array['7f750000-0000-4000-8000-0000000000a2', '7f750000-0000-4000-8000-0000000000a4', '7f750000-0000-4000-8000-0000000000a3'] loop
    perform pg_temp.act_as(failed::uuid);
    begin perform public.submit_service_request(customer, site, null, type_xe, 1, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901234567', null, gen_random_uuid()); failed := 'accepted';
    exception when insufficient_privilege then failed := 'refused'; end;
    assert failed = 'refused', 'only the owner of this customer sends a request';
  end loop;

  -- The customer's view: owner and finance contact see money, the receiver does not; another customer sees nothing.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  detail := public.customer_portal_service_request(request);
  assert detail->>'stage' = 'SUBMITTED' and (detail->>'can_cancel')::boolean and detail->>'estimate_vnd' = '680000' and detail->>'unit_price_vnd' = '340000'
    and detail->>'quantity' = '2' and detail->>'contact_phone' = '0901 234 567' and detail->>'note' = 'Hẻm nhỏ' and detail->>'preferred_slot' = 'MORNING', format('owner view %s', detail);
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a4');
  detail := public.customer_portal_service_request(request);
  assert detail->>'estimate_vnd' = '680000' and not (detail->>'can_cancel')::boolean, 'finance contact sees the estimate, cannot cancel';
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a2');
  detail := public.customer_portal_service_request(request);
  assert not (detail ? 'estimate_vnd') and not (detail ? 'unit_price_vnd') and not (detail ? 'final_amount_vnd') and not (detail->>'can_cancel')::boolean
    and detail->>'service_name' = 'Chạc gạch', format('receiver follows without money %s', detail);
  listing := public.customer_portal_service_requests(null, 100);
  assert listing->>'membership_role' = 'RECEIVER' and jsonb_array_length(listing->'requests') = 2 and listing->'requests'->0->>'id' = second::text, 'receiver lists, newest first';
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a3');
  failed := null;
  begin perform public.customer_portal_service_request(request); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'another customer cannot read it';
  assert jsonb_array_length(public.customer_portal_service_requests(null, 100)->'requests') = 0, 'another customer lists none of them';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.customer_portal_service_requests(null, 100); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'staff have no customer';

  -- Nothing readable straight from the table by customers; staff with service access read it.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  assert (select count(*) from public.service_requests) = 0, 'the table is not readable by the customer';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.service_requests) = 0, 'staff without service.read see none';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert (select count(*) from public.service_requests) = 2, 'staff with service access see them';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert (select count(*) from public.service_requests) = 0, 'another branch sees none';

  -- Cancel: the owner only, while it still waits; replay-safe; then it cannot be cancelled again.
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a2');
  failed := null;
  begin perform public.cancel_service_request(request, 'Không cần nữa', '7f750000-0000-4000-8000-0000000000c1'); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'receiver cannot cancel';
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a3');
  failed := null;
  begin perform public.cancel_service_request(request, 'Không cần nữa', '7f750000-0000-4000-8000-0000000000c2'); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'another customer cannot cancel';
  perform pg_temp.act_as('7f750000-0000-4000-8000-0000000000a1');
  perform public.cancel_service_request(request, null, '7f750000-0000-4000-8000-0000000000c3');
  assert public.cancel_service_request(request, null, '7f750000-0000-4000-8000-0000000000c3') = request, 'cancel replay';
  detail := public.customer_portal_service_request(request);
  assert detail->>'stage' = 'CANCELLED' and detail->>'decision_reason' = 'Khách hủy yêu cầu' and not (detail->>'can_cancel')::boolean, format('cancelled %s', detail);
  failed := null;
  begin perform public.cancel_service_request(request, 'Lần nữa', '7f750000-0000-4000-8000-0000000000c4'); exception when check_violation then failed := 'refused'; end;
  assert failed = 'refused', 'already cancelled';
  perform pg_temp.act_as_admin();
  assert exists (select 1 from public.notifications n where n.kind = 'service_request.cancelled' and n.entity_id = request), 'the store sees the cancel';

  -- Anonymous callers have no access at all.
  set local role anon;
  failed := null;
  begin perform public.customer_portal_service_catalog(null); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'anon catalog';
  failed := null;
  begin perform public.submit_service_request(customer, site, null, type_xe, 1, tomorrow, 'MORNING', null, 'Anh Tuấn', '0901234567', null, gen_random_uuid()); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'anon submit';
  failed := null;
  begin perform public.customer_portal_service_requests(null, 10); exception when insufficient_privilege then failed := 'refused'; end;
  assert failed = 'refused', 'anon list';
  reset role;
end
$test$;
