-- D75 (Owner 14/11/2026): "Đặt dịch vụ" trên cổng khách. Phần 2: yêu cầu dịch vụ của khách.
-- * Khách (chủ tài khoản) KHÔNG tự tạo Việc dịch vụ: khách gửi một yêu cầu (service_requests) với dịch vụ, khối lượng, ngày + buổi
--   MONG MUỐN, người liên hệ và ghi chú. Chưa tính tiền; số tiền tạm tính chỉ để xem (đơn giá mặc định × số lượng).
-- * Nhân viên có quyền service.manage duyệt: "Xếp lịch" gọi đúng schedule_service_job hiện có rồi nối yêu cầu với việc vừa tạo
--   (cùng một giao dịch); hoặc "Từ chối" kèm lý do. Khách hủy được khi yêu cầu còn "Đã gửi" (chưa xếp lịch).
-- * Cổng khách đọc / ghi qua RPC SECURITY DEFINER có kiểm quyền thành viên cổng; bảng không cấp quyền cho khách và anon.
-- * Tiến trình hiện cho khách lấy từ việc dịch vụ nối với yêu cầu (đã xếp lịch / thợ làm / chờ xác nhận khối lượng / hoàn tất).
--   Số tiền cuối là số của khối lượng đã xác minh (verify_service_job), chỉ chủ tài khoản và kế toán thấy; người nhận không thấy tiền.
begin;

create sequence public.service_request_number_seq;

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  request_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  service_type_id uuid not null references public.service_types(id) on delete restrict,
  customer_name_snapshot text not null,
  site_name_snapshot text not null,
  site_address_snapshot text not null,
  service_name_snapshot text not null,
  unit_label_snapshot text not null,
  unit_price_snapshot_vnd bigint check (unit_price_snapshot_vnd is null or unit_price_snapshot_vnd >= 0),
  quantity numeric(20,6) not null check (quantity > 0),
  preferred_date date not null,
  preferred_slot text not null check (preferred_slot in ('MORNING', 'AFTERNOON', 'TIME')),
  preferred_time time,
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  contact_phone text not null check (char_length(trim(contact_phone)) between 6 and 30),
  note text check (note is null or char_length(note) <= 1000),
  state text not null default 'SUBMITTED' check (state in ('SUBMITTED', 'SCHEDULED', 'CANCELLED', 'REJECTED')),
  version integer not null default 1 check (version > 0),
  service_job_id uuid unique references public.service_jobs(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete restrict,
  decision_reason text check (decision_reason is null or char_length(decision_reason) between 3 and 300),
  check ((preferred_slot = 'TIME') = (preferred_time is not null)),
  check ((state = 'SCHEDULED') = (service_job_id is not null)),
  check ((state = 'SUBMITTED') = (decided_at is null)),
  check (state not in ('CANCELLED', 'REJECTED') or decision_reason is not null)
);
create index service_requests_customer_idx on public.service_requests(customer_id, created_at desc);
create index service_requests_open_idx on public.service_requests(branch_id, created_at desc) where state = 'SUBMITTED';

alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
create policy service_requests_staff_read on public.service_requests for select to authenticated
  using ((select private.has_permission(branch_id, 'service.read')) or (select private.has_permission(branch_id, 'service.manage')));

-- The customer of this login for the portal, whatever the membership role (the owner first when there are several).
create or replace function private.portal_member(target_customer_id uuid, out member_customer_id uuid, out member_role text)
language sql stable security definer set search_path = '' as $$
  select m.customer_id, m.membership_role::text from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id
  where m.auth_user_id = (select auth.uid()) and m.active and c.active and (target_customer_id is null or m.customer_id = target_customer_id)
    and private.auth_actor_active()
  order by m.customer_id, (m.membership_role = 'OWNER') desc, m.membership_role limit 1
$$;
revoke all on function private.portal_member(uuid) from public, anon, authenticated, service_role;

-- What a customer sees of one request. Money only for the owner and the finance contact; never anything internal.
create or replace function private.service_request_payload(target_request_id uuid, member_role text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', r.id, 'number', r.request_number, 'state', r.state, 'member_role', member_role,
    'stage', case r.state
      when 'SUBMITTED' then 'SUBMITTED' when 'CANCELLED' then 'CANCELLED' when 'REJECTED' then 'REJECTED'
      else case j.execution_state when 'IN_PROGRESS' then 'IN_PROGRESS' when 'RESULT_SUBMITTED' then 'CONFIRMING'
        when 'VERIFIED' then 'DONE' when 'CANCELLED' then 'SCHEDULE_CANCELLED' else 'SCHEDULED' end end,
    'service_name', r.service_name_snapshot, 'unit_label', r.unit_label_snapshot, 'quantity', trim_scale(r.quantity)::text,
    'site_name', r.site_name_snapshot, 'site_address', r.site_address_snapshot,
    'preferred_date', r.preferred_date, 'preferred_slot', r.preferred_slot, 'preferred_time', to_char(r.preferred_time, 'HH24:MI'),
    'contact_name', r.contact_name, 'contact_phone', r.contact_phone, 'note', r.note,
    'submitted_at', r.created_at,
    'scheduled_at', case when r.state = 'SCHEDULED' then r.decided_at end,
    'scheduled_start', j.scheduled_start, 'started_at', w.started_at, 'result_at', w.completed_at, 'verified_at', j.verified_at,
    'decision_reason', case when r.state in ('CANCELLED', 'REJECTED') then r.decision_reason end,
    'can_cancel', r.state = 'SUBMITTED' and member_role = 'OWNER',
    'unit_price_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') then r.unit_price_snapshot_vnd::text end,
    'estimate_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') and r.unit_price_snapshot_vnd is not null
      then round(r.quantity * r.unit_price_snapshot_vnd)::bigint::text end,
    'billable_quantity', trim_scale(sv.billable_quantity)::text,
    'final_amount_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') then sv.billable_amount_vnd::text end))
  from public.service_requests r
  left join public.service_jobs j on j.id = r.service_job_id
  left join public.work_items w on w.service_job_id = j.id
  left join public.service_verifications sv on sv.service_job_id = j.id
  where r.id = target_request_id
$$;
revoke all on function private.service_request_payload(uuid, text) from public, anon, authenticated, service_role;

-- "Đặt dịch vụ": what the customer may request, grouped as the owner set it up (service_types.portal_visible / portal_group),
-- merged by name; the options of one service are its types, one per unit (xe, xe cn to, ca, giờ…).
create or replace function public.customer_portal_service_catalog(target_customer_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  customer public.customers%rowtype;
  groups_json jsonb;
begin
  select c.* into customer from public.customers c where c.id = private.portal_ordering_customer(target_customer_id);
  if customer.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  with eligible as (
    select t.id, trim(t.name) as name, coalesce(nullif(trim(t.portal_group), ''), 'Khác') as grp, trim(t.unit_label) as unit_label, t.default_price_vnd
    from public.service_types t where t.branch_id = customer.branch_id and t.active and t.portal_visible
  ), by_service as (
    select e.grp, lower(e.name) as service_key, min(e.name) as name,
      jsonb_agg(jsonb_build_object('id', e.id, 'unit_label', e.unit_label, 'unit_price_vnd', e.default_price_vnd::text)
        order by e.default_price_vnd nulls last, e.unit_label, e.id) as options
    from eligible e group by e.grp, lower(e.name)
  ), by_group as (
    select s.grp, jsonb_agg(jsonb_build_object('name', s.name, 'options', s.options) order by s.name, s.service_key) as services
    from by_service s group by s.grp
  )
  select coalesce(jsonb_agg(jsonb_build_object('name', g.grp, 'services', g.services) order by g.grp), '[]'::jsonb) into groups_json from by_group g;
  return jsonb_build_object(
    'customer', jsonb_build_object('id', customer.id, 'code', customer.code, 'display_name', customer.display_name),
    'contact', jsonb_strip_nulls(jsonb_build_object('name', customer.display_name, 'phone', customer.phone)),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'address_text', s.address_text,
      'receiver_name', s.receiver_name, 'receiver_phone', s.receiver_phone) order by s.name, s.id)
      from public.customer_sites s where s.customer_id = customer.id and s.active), '[]'::jsonb),
    'groups', groups_json);
end
$function$;
revoke all on function public.customer_portal_service_catalog(uuid) from public, anon;
grant execute on function public.customer_portal_service_catalog(uuid) to authenticated;

create or replace function public.submit_service_request(target_customer_id uuid, target_site_id uuid, new_site jsonb, target_service_type_id uuid,
  requested_quantity numeric, requested_date date, requested_slot text, requested_time time, contact_name text, contact_phone text,
  request_note text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  customer public.customers%rowtype;
  site public.customer_sites%rowtype;
  chosen public.service_types%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  created uuid;
  clean_name text := trim(coalesce(contact_name, ''));
  clean_phone text := trim(coalesce(contact_phone, ''));
  clean_note text := nullif(trim(coalesce(request_note, '')), '');
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select c.* into customer from public.customers c where c.id = private.portal_ordering_customer(target_customer_id);
  if me is null or submit_service_request.operation_id is null or target_customer_id is null or customer.id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_service_type_id is null or requested_date is null or requested_date not between today and today + 120
    or requested_slot is null or requested_slot not in ('MORNING', 'AFTERNOON', 'TIME') or (requested_slot = 'TIME') <> (requested_time is not null)
    or char_length(clean_name) not between 2 and 120 or char_length(clean_phone) not between 6 and 30
    or char_length(regexp_replace(clean_phone, '\D', '', 'g')) not between 8 and 15
    or char_length(coalesce(clean_note, '')) > 1000 or (target_site_id is null) = (new_site is null) then
    raise exception 'portal_service_request_invalid' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('customer', customer.id, 'site', target_site_id, 'new_site', new_site, 'type', target_service_type_id,
    'quantity', requested_quantity, 'date', requested_date, 'slot', requested_slot, 'time', requested_time, 'name', clean_name, 'phone', clean_phone, 'note', clean_note));
  perform pg_advisory_xact_lock(hashtextextended(submit_service_request.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = submit_service_request.operation_id;
  if found then
    if receipt.command_name <> 'submit_service_request' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  perform private.require_exact_quantity(requested_quantity, false);

  select * into chosen from public.service_types t
  where t.id = target_service_type_id and t.branch_id = customer.branch_id and t.active and t.portal_visible;
  if chosen.id is null then raise exception 'service_type_unavailable' using errcode = '23503'; end if;

  if target_site_id is not null then
    select * into site from public.customer_sites s where s.id = target_site_id and s.customer_id = customer.id and s.active;
    if site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  else
    if char_length(trim(coalesce(new_site->>'name', ''))) not between 2 and 160 or char_length(trim(coalesce(new_site->>'address', ''))) not between 5 and 300 then
      raise exception 'portal_service_request_invalid' using errcode = '22023';
    end if;
    insert into public.customer_sites(customer_id, code, name, address_text, receiver_name, receiver_phone)
    values (customer.id, 'DV-' || upper(substr(md5(submit_service_request.operation_id::text), 1, 8)), trim(new_site->>'name'), trim(new_site->>'address'),
      clean_name, clean_phone)
    returning * into site;
  end if;

  insert into public.service_requests(branch_id, request_number, customer_id, site_id, service_type_id, customer_name_snapshot, site_name_snapshot,
    site_address_snapshot, service_name_snapshot, unit_label_snapshot, unit_price_snapshot_vnd, quantity, preferred_date, preferred_slot, preferred_time,
    contact_name, contact_phone, note, submitted_by)
  values (customer.branch_id, 'YC-' || to_char(today, 'YYYYMM') || '-' || lpad(nextval('public.service_request_number_seq')::text, 6, '0'),
    customer.id, site.id, chosen.id, customer.display_name, site.name, site.address_text, trim(chosen.name), trim(chosen.unit_label), chosen.default_price_vnd,
    requested_quantity, requested_date, requested_slot, requested_time, clean_name, clean_phone, clean_note, me)
  returning id into created;

  insert into public.command_receipts values (submit_service_request.operation_id, me, 'submit_service_request', hash, 'service_request', created, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, customer.branch_id, 'service_request.submitted', 'service_request', created, submit_service_request.operation_id,
    array['service_request'], 'Khách gửi yêu cầu dịch vụ trên cổng khách');
  perform private.notify(customer.branch_id, 'service_request.submitted', 'service_request', created, 'Yêu cầu dịch vụ mới từ khách: ' || customer.display_name,
    trim(chosen.name) || ' · ' || trim_scale(requested_quantity)::text || ' ' || trim(chosen.unit_label) || ' · ' || site.name || ' — chờ xác nhận lịch',
    '/admin/service-jobs/requests/' || created, 'service.manage', null, 'service_request.submitted:' || created);
  return created;
end
$function$;
revoke all on function public.submit_service_request(uuid, uuid, jsonb, uuid, numeric, date, text, time, text, text, text, uuid) from public, anon;
grant execute on function public.submit_service_request(uuid, uuid, jsonb, uuid, numeric, date, text, time, text, text, text, uuid) to authenticated;

-- "Hủy yêu cầu": only the owner of the account and only while the store has not scheduled it.
create or replace function public.cancel_service_request(target_request_id uuid, reason text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  req public.service_requests%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  clean_reason text := coalesce(nullif(trim(coalesce(reason, '')), ''), 'Khách hủy yêu cầu');
begin
  select * into req from public.service_requests r where r.id = target_request_id for update;
  if me is null or req.id is null or cancel_service_request.operation_id is null
    or private.portal_ordering_customer(req.customer_id) is distinct from req.customer_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_reason) not between 3 and 300 then raise exception 'cancel_reason_invalid' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('request', req.id, 'reason', clean_reason));
  select * into receipt from public.command_receipts r where r.operation_id = cancel_service_request.operation_id;
  if found then
    if receipt.command_name <> 'cancel_service_request' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if req.state <> 'SUBMITTED' then raise exception 'service_request_not_cancellable' using errcode = '23514'; end if;
  update public.service_requests set state = 'CANCELLED', decided_at = now(), decided_by = me, decision_reason = clean_reason, version = version + 1
  where id = req.id;
  insert into public.command_receipts values (cancel_service_request.operation_id, me, 'cancel_service_request', hash, 'service_request', req.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, req.branch_id, 'service_request.cancelled', 'service_request', req.id, cancel_service_request.operation_id, array['state'], 'Khách hủy: ' || clean_reason);
  perform private.notify(req.branch_id, 'service_request.cancelled', 'service_request', req.id, 'Khách hủy yêu cầu dịch vụ ' || req.request_number,
    req.customer_name_snapshot || ' · ' || req.service_name_snapshot || ' · ' || clean_reason, '/admin/service-jobs/requests/' || req.id,
    'service.read', null, 'service_request.cancelled:' || req.id);
  return req.id;
end
$function$;
revoke all on function public.cancel_service_request(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_service_request(uuid, text, uuid) to authenticated;

-- The customer's own requests (newest first) and one request, for every role of the account; money only for owner and finance.
create or replace function public.customer_portal_service_requests(target_customer_id uuid default null, page_limit integer default 100)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  pm record;
begin
  select * into pm from private.portal_member(target_customer_id);
  if pm.member_customer_id is null then raise exception 'active_customer_membership_required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'customer_id', pm.member_customer_id, 'membership_role', pm.member_role,
    'requests', coalesce((select jsonb_agg(private.service_request_payload(x.id, pm.member_role) order by x.created_at desc, x.id desc)
      from (select r.id, r.created_at from public.service_requests r where r.customer_id = pm.member_customer_id
        order by r.created_at desc, r.id desc limit greatest(1, least(coalesce(page_limit, 100), 200))) x), '[]'::jsonb));
end
$function$;
revoke all on function public.customer_portal_service_requests(uuid, integer) from public, anon;
grant execute on function public.customer_portal_service_requests(uuid, integer) to authenticated;

create or replace function public.customer_portal_service_request(target_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  owner_customer uuid;
  pm record;
begin
  select r.customer_id into owner_customer from public.service_requests r where r.id = target_request_id;
  select * into pm from private.portal_member(owner_customer);
  if owner_customer is null or pm.member_customer_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.service_request_payload(target_request_id, pm.member_role);
end
$function$;
revoke all on function public.customer_portal_service_request(uuid) from public, anon;
grant execute on function public.customer_portal_service_request(uuid) to authenticated;

-- Staff: "Xếp lịch" turns the request into a service job with the existing schedule_service_job (same checks, same snapshot
-- of the type's name, unit and price) and links the two in one transaction. The staff may pick another type, change the
-- quantity and assign the vehicle or machine; the customer's wish for the day is only a wish.
create or replace function public.schedule_service_request(target_request_id uuid, expected_version integer, target_service_type_id uuid,
  job_start timestamptz, job_end timestamptz, job_quantity numeric, job_description text, target_sales_employee_id uuid,
  target_vehicle_id uuid, target_machine_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  req public.service_requests%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  job_id uuid;
begin
  select * into req from public.service_requests r where r.id = target_request_id for update;
  if me is null or req.id is null or schedule_service_request.operation_id is null or not private.has_permission(req.branch_id, 'service.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('request', req.id, 'version', expected_version, 'type', coalesce(target_service_type_id, req.service_type_id),
    'start', job_start, 'end', job_end, 'quantity', job_quantity, 'description', nullif(trim(coalesce(job_description, '')), ''), 'sales', target_sales_employee_id,
    'vehicle', target_vehicle_id, 'machine', target_machine_id));
  perform pg_advisory_xact_lock(hashtextextended(schedule_service_request.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = schedule_service_request.operation_id;
  if found then
    if receipt.command_name <> 'schedule_service_request' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if req.version <> expected_version then raise exception 'stale_service_request' using errcode = 'PT409'; end if;
  if req.state <> 'SUBMITTED' then raise exception 'service_request_not_open' using errcode = '23514'; end if;

  job_id := public.schedule_service_job(req.branch_id, req.customer_id, req.site_id, coalesce(target_service_type_id, req.service_type_id),
    coalesce(job_description, ''), job_start, job_end, job_quantity, target_sales_employee_id, target_vehicle_id, target_machine_id,
    md5('d75:schedule:' || schedule_service_request.operation_id::text)::uuid);
  update public.service_requests set state = 'SCHEDULED', service_job_id = job_id, decided_at = now(), decided_by = me, version = version + 1 where id = req.id;
  insert into public.command_receipts values (schedule_service_request.operation_id, me, 'schedule_service_request', hash, 'service_job', job_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, req.branch_id, 'service_request.scheduled', 'service_request', req.id, schedule_service_request.operation_id,
    array['state', 'service_job_id'], left('Xếp lịch cho yêu cầu ' || req.request_number, 500));
  return job_id;
end
$function$;
revoke all on function public.schedule_service_request(uuid, integer, uuid, timestamptz, timestamptz, numeric, text, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.schedule_service_request(uuid, integer, uuid, timestamptz, timestamptz, numeric, text, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.reject_service_request(target_request_id uuid, reject_reason text, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  req public.service_requests%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  clean_reason text := trim(coalesce(reject_reason, ''));
begin
  select * into req from public.service_requests r where r.id = target_request_id for update;
  if me is null or req.id is null or reject_service_request.operation_id is null or not private.has_permission(req.branch_id, 'service.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_reason) not between 3 and 300 then raise exception 'reject_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('request', req.id, 'version', expected_version, 'reason', clean_reason));
  select * into receipt from public.command_receipts r where r.operation_id = reject_service_request.operation_id;
  if found then
    if receipt.command_name <> 'reject_service_request' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if req.version <> expected_version then raise exception 'stale_service_request' using errcode = 'PT409'; end if;
  if req.state <> 'SUBMITTED' then raise exception 'service_request_not_open' using errcode = '23514'; end if;
  update public.service_requests set state = 'REJECTED', decided_at = now(), decided_by = me, decision_reason = clean_reason, version = version + 1 where id = req.id;
  insert into public.command_receipts values (reject_service_request.operation_id, me, 'reject_service_request', hash, 'service_request', req.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, req.branch_id, 'service_request.rejected', 'service_request', req.id, reject_service_request.operation_id, array['state'], left('Từ chối: ' || clean_reason, 500));
  return req.id;
end
$function$;
revoke all on function public.reject_service_request(uuid, text, integer, uuid) from public, anon;
grant execute on function public.reject_service_request(uuid, text, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
