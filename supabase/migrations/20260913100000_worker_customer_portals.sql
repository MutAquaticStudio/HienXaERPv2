begin;

insert into public.permissions(code, name) values
  ('finance.payment_notice.review', 'Duyệt thông báo thanh toán của khách hàng')
on conflict (code) do update set name = excluded.name;

create table public.quotation_change_requests (
  id uuid primary key default gen_random_uuid(),
  quotation_revision_id uuid not null references public.quotation_revisions(id) on delete restrict,
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  request_state text not null default 'OPEN' check (request_state in ('OPEN','RESOLVED','CANCELLED')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now()
);

create table public.portal_evidence_objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'portal-evidence' check (bucket_id = 'portal-evidence'),
  object_path text not null unique,
  context_type text not null check (context_type in ('WORK_RESULT','PAYMENT_NOTICE')),
  work_item_id uuid references public.work_items(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  declared_byte_size bigint not null check (declared_byte_size between 1 and 10485760),
  final_byte_size bigint check (final_byte_size between 1 and 10485760),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  object_state text not null default 'PENDING' check (object_state in ('PENDING','READY','REVOKED')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  revoked_at timestamptz,
  check (
    (context_type = 'WORK_RESULT' and work_item_id is not null and customer_id is null)
    or (context_type = 'PAYMENT_NOTICE' and work_item_id is null and customer_id is not null)
  ),
  check ((object_state = 'READY' and finalized_at is not null and final_byte_size is not null and checksum_sha256 is not null) or object_state <> 'READY'),
  check ((object_state = 'REVOKED' and revoked_at is not null) or object_state <> 'REVOKED')
);
create index portal_evidence_work_item_idx on public.portal_evidence_objects(work_item_id) where work_item_id is not null;
create index portal_evidence_customer_idx on public.portal_evidence_objects(customer_id, created_at desc) where customer_id is not null;

create table public.work_result_portal_evidence (
  work_result_id uuid not null references public.work_item_results(id) on delete restrict,
  evidence_id uuid not null unique references public.portal_evidence_objects(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (work_result_id, evidence_id)
);

create table public.payment_notices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  evidence_id uuid not null unique references public.portal_evidence_objects(id) on delete restrict,
  declared_amount_vnd bigint not null check (declared_amount_vnd > 0),
  paid_on date not null,
  payment_reference text check (payment_reference is null or char_length(trim(payment_reference)) between 3 and 120),
  customer_note text check (customer_note is null or char_length(trim(customer_note)) between 3 and 500),
  review_state text not null default 'SUBMITTED' check (review_state in ('SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED')),
  version integer not null default 1 check (version > 0),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(trim(review_note)) between 3 and 500),
  check ((review_state in ('ACCEPTED','REJECTED') and reviewed_by is not null and reviewed_at is not null) or review_state in ('SUBMITTED','UNDER_REVIEW'))
);
create index payment_notices_customer_idx on public.payment_notices(customer_id, submitted_at desc);
create index payment_notices_review_idx on public.payment_notices(branch_id, review_state, submitted_at);

create table public.payment_notice_review_events (
  id uuid primary key default gen_random_uuid(),
  payment_notice_id uuid not null references public.payment_notices(id) on delete restrict,
  from_state text not null,
  to_state text not null,
  review_note text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create or replace function private.portal_customer_role(target_customer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.membership_role::text
  from public.customer_portal_memberships m
  where m.auth_user_id = (select auth.uid())
    and m.customer_id = target_customer_id
    and m.active
  order by m.customer_id
  limit 1
$$;

create or replace function private.is_current_work_assignee(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_item_assignments a
    join public.work_items w on w.id = a.work_item_id
    where a.work_item_id = target_work_item_id
      and a.superseded_at is null
      and a.employee_id = private.current_employee_id()
      and private.has_permission(w.branch_id, 'work.claim')
  )
$$;

create or replace function private.portal_can_access_work_item(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_items w
    where w.id = target_work_item_id
      and (
        private.has_permission(w.branch_id, 'workforce.read')
        or private.is_current_work_assignee(w.id)
        or (w.execution_state = 'AVAILABLE' and private.has_permission(w.branch_id, 'work.claim'))
      )
  )
$$;

create or replace function private.portal_evidence_access(target_evidence_id uuid, require_ready boolean default true)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and (not require_ready or e.object_state = 'READY')
      and e.object_state <> 'REVOKED'
      and (
        private.has_permission(
          coalesce(
            (select w.branch_id from public.work_items w where w.id = e.work_item_id),
            (select c.branch_id from public.customers c where c.id = e.customer_id)
          ),
          'evidence.manage'
        )
        or (e.context_type = 'WORK_RESULT' and private.is_current_work_assignee(e.work_item_id))
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.portal_customer_role(e.customer_id) in ('OWNER','FINANCE_CONTACT')
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.has_permission((select c.branch_id from public.customers c where c.id = e.customer_id), 'finance.payment_notice.review')
        )
      )
  )
$$;

create or replace function private.can_write_portal_evidence_object(target_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.object_path = target_object_path
      and e.uploaded_by = (select auth.uid())
      and e.object_state in ('PENDING','READY')
      and private.portal_evidence_access(e.id, false)
  )
$$;

create or replace function private.can_read_portal_evidence_object(target_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.object_path = target_object_path
      and private.portal_evidence_access(e.id, true)
  )
$$;

create or replace function private.worker_work_item_payload(target_work_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  work_json jsonb;
  service_json jsonb := '{}'::jsonb;
  delivery_json jsonb := '{}'::jsonb;
  order_json jsonb := '{}'::jsonb;
  customer_json jsonb := '{}'::jsonb;
  site_json jsonb := '{}'::jsonb;
  customer_key text;
  site_key text;
  order_key text;
  proofs jsonb;
begin
  select to_jsonb(w) into work_json from public.work_items w where w.id = target_work_item_id;
  if work_json is null then return null; end if;

  if nullif(work_json->>'service_job_id', '') is not null then
    select to_jsonb(s) into service_json from public.service_jobs s where s.id = (work_json->>'service_job_id')::uuid;
  end if;
  service_json := coalesce(service_json, '{}'::jsonb);

  if nullif(work_json->>'delivery_id', '') is not null then
    select to_jsonb(d) into delivery_json from public.deliveries d where d.id = (work_json->>'delivery_id')::uuid;
  end if;
  delivery_json := coalesce(delivery_json, '{}'::jsonb);

  order_key := coalesce(nullif(delivery_json->>'sales_order_id', ''), nullif(delivery_json->>'order_id', ''));
  if order_key is not null then
    select to_jsonb(o) into order_json from public.sales_orders o where o.id = order_key::uuid;
  end if;
  order_json := coalesce(order_json, '{}'::jsonb);

  customer_key := coalesce(nullif(service_json->>'customer_id', ''), nullif(delivery_json->>'customer_id', ''), nullif(order_json->>'customer_id', ''));
  site_key := coalesce(nullif(service_json->>'site_id', ''), nullif(delivery_json->>'site_id', ''), nullif(order_json->>'site_id', ''));
  if customer_key is not null then
    select to_jsonb(c) into customer_json from public.customers c where c.id = customer_key::uuid;
  end if;
  if site_key is not null then
    select to_jsonb(s) into site_json from public.customer_sites s where s.id = site_key::uuid;
  end if;
  customer_json := coalesce(customer_json, '{}'::jsonb);
  site_json := coalesce(site_json, '{}'::jsonb);

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'mime_type', e.mime_type, 'created_at', e.created_at) order by e.created_at desc),
    '[]'::jsonb
  ) into proofs
  from public.portal_evidence_objects e
  where e.work_item_id = target_work_item_id
    and e.object_state = 'READY'
    and e.uploaded_by = (select auth.uid());

  return jsonb_strip_nulls(jsonb_build_object(
    'id', work_json->>'id',
    'number', work_json->>'work_number',
    'kind', coalesce(work_json->>'work_type', work_json->>'source_type'),
    'state', work_json->>'execution_state',
    'version', (work_json->>'version')::integer,
    'title', coalesce(service_json->>'title', service_json->>'service_name', delivery_json->>'delivery_number', work_json->>'work_number'),
    'description', coalesce(service_json->>'work_description', service_json->>'description', delivery_json->>'delivery_note'),
    'scheduled_start', coalesce(service_json->>'scheduled_start', delivery_json->>'scheduled_start', work_json->>'planned_start'),
    'scheduled_end', coalesce(service_json->>'scheduled_end', delivery_json->>'scheduled_end', work_json->>'planned_end'),
    'quantity', coalesce(service_json->>'planned_quantity', delivery_json->>'planned_quantity', delivery_json->>'total_quantity'),
    'unit', coalesce(service_json->>'planned_unit', delivery_json->>'quantity_unit'),
    'customer_name', customer_json->>'display_name',
    'site_name', site_json->>'name',
    'address', coalesce(site_json->>'address_text', delivery_json->>'delivery_address'),
    'receiver_name', coalesce(site_json->>'receiver_name', delivery_json->>'receiver_name'),
    'receiver_phone', coalesce(site_json->>'receiver_phone', delivery_json->>'receiver_phone'),
    'access_note', site_json->>'access_note',
    'receiving_window', site_json->>'receiving_window',
    'proofs', proofs
  ));
end $$;

create or replace function public.worker_portal_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_id uuid := private.current_employee_id();
  employee_json jsonb;
  current_job jsonb;
  next_job jsonb;
  pool_jobs jsonb;
  earnings jsonb;
begin
  if employee_id is null or not exists (
    select 1 from public.employee_branch_access a
    where a.employee_id = employee_id and a.active and private.has_permission(a.branch_id, 'work.claim')
  ) then
    raise exception 'active_worker_access_required' using errcode = '42501';
  end if;

  select jsonb_build_object('id', e.id, 'code', e.code, 'display_name', e.display_name)
  into employee_json from public.employees e where e.id = employee_id;
  if employee_json is null then raise exception 'active_worker_required' using errcode = '42501'; end if;

  select private.worker_work_item_payload(w.id)
  into current_job
  from public.work_items w
  join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
  where a.employee_id = employee_id
    and private.has_permission(w.branch_id, 'work.claim')
    and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
  order by case w.execution_state when 'IN_PROGRESS' then 1 when 'BLOCKED' then 2 else 3 end, w.work_number
  limit 1;

  select private.worker_work_item_payload(w.id)
  into next_job
  from public.work_items w
  join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
  where a.employee_id = employee_id
    and private.has_permission(w.branch_id, 'work.claim')
    and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
    and (current_job is null or w.id <> (current_job->>'id')::uuid)
  order by w.work_number
  limit 1;

  select coalesce(jsonb_agg(private.worker_work_item_payload(w.id) order by w.work_number), '[]'::jsonb)
  into pool_jobs
  from public.work_items w
  where w.execution_state = 'AVAILABLE' and private.has_permission(w.branch_id, 'work.claim');

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', item->>'id',
        'type', item->>'earning_type',
        'state', coalesce(item->>'approval_state', item->>'event_state'),
        'amount_vnd', coalesce(item->>'approved_amount_vnd', item->>'calculated_amount_vnd'),
        'occurred_at', coalesce(item->>'approved_at', item->>'created_at')
      ))
      order by item->>'id'
    ),
    '[]'::jsonb
  )
  into earnings
  from (
    select to_jsonb(e) item
    from public.earning_events e
    where e.employee_id = employee_id and private.has_permission(e.branch_id, 'work.claim')
  ) rows;

  return jsonb_build_object(
    'employee', employee_json,
    'current', current_job,
    'next', next_job,
    'pool', pool_jobs,
    'earnings', earnings
  );
end $$;

create or replace function public.worker_portal_job(target_work_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.portal_can_access_work_item(target_work_item_id) then
    raise exception 'forbidden_or_work_not_found' using errcode = '42501';
  end if;
  return private.worker_work_item_payload(target_work_item_id);
end $$;

create or replace function private.customer_delivery_payload(target_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  delivery_json jsonb;
  site_json jsonb := '{}'::jsonb;
begin
  select to_jsonb(d) into delivery_json from public.deliveries d where d.id = target_delivery_id;
  if delivery_json is null then return null; end if;
  if nullif(delivery_json->>'site_id', '') is not null then
    select to_jsonb(s) into site_json from public.customer_sites s where s.id = (delivery_json->>'site_id')::uuid;
  end if;
  site_json := coalesce(site_json, '{}'::jsonb);
  return jsonb_strip_nulls(jsonb_build_object(
    'id', delivery_json->>'id',
    'number', coalesce(delivery_json->>'delivery_number', delivery_json->>'number'),
    'state', coalesce(delivery_json->>'delivery_state', delivery_json->>'status'),
    'scheduled_at', coalesce(delivery_json->>'scheduled_at', delivery_json->>'scheduled_start'),
    'delivered_at', coalesce(delivery_json->>'delivered_at', delivery_json->>'completed_at'),
    'site_name', site_json->>'name',
    'address', coalesce(site_json->>'address_text', delivery_json->>'delivery_address'),
    'receiver_name', coalesce(site_json->>'receiver_name', delivery_json->>'receiver_name'),
    'receiver_phone', coalesce(site_json->>'receiver_phone', delivery_json->>'receiver_phone'),
    'receiving_window', site_json->>'receiving_window'
  ));
end $$;

create or replace function private.customer_order_payload(target_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  order_json jsonb;
  deliveries_json jsonb;
begin
  select to_jsonb(o) into order_json from public.sales_orders o where o.id = target_order_id;
  if order_json is null then return null; end if;

  select coalesce(
    jsonb_agg(private.customer_delivery_payload((item->>'id')::uuid) order by item->>'id'),
    '[]'::jsonb
  )
  into deliveries_json
  from (
    select to_jsonb(d) item
    from public.deliveries d
    where coalesce(to_jsonb(d)->>'sales_order_id', to_jsonb(d)->>'order_id') = target_order_id::text
  ) delivery_rows;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', order_json->>'id',
    'number', coalesce(order_json->>'order_number', order_json->>'number'),
    'state', coalesce(order_json->>'order_state', order_json->>'status'),
    'ordered_at', coalesce(order_json->>'confirmed_at', order_json->>'created_at'),
    'requested_delivery_date', order_json->>'requested_delivery_date',
    'total_amount_vnd', coalesce(order_json->>'total_amount_vnd', order_json->>'grand_total_vnd'),
    'deliveries', deliveries_json
  ));
end $$;

create or replace function public.customer_portal_snapshot(target_customer_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_customer_id uuid;
  member_role text;
  customer_json jsonb;
  quote_json jsonb;
  orders_json jsonb;
  debt_json jsonb;
  notices_json jsonb;
begin
  select m.customer_id, m.membership_role::text
  into selected_customer_id, member_role
  from public.customer_portal_memberships m
  where m.auth_user_id = (select auth.uid())
    and m.active
    and (target_customer_id is null or m.customer_id = target_customer_id)
  order by m.customer_id
  limit 1;
  if selected_customer_id is null then raise exception 'active_customer_membership_required' using errcode = '42501'; end if;

  select jsonb_build_object('id', c.id, 'code', c.code, 'display_name', c.display_name)
  into customer_json from public.customers c where c.id = selected_customer_id;

  if member_role in ('OWNER','FINANCE_CONTACT') then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', item->>'id',
      'number', coalesce(item->>'quotation_number', item->>'number'),
      'state', coalesce(item->>'quotation_state', item->>'status'),
      'current_revision_id', item->>'current_revision_id',
      'valid_until', item->>'valid_until'
    )) into quote_json
    from (
      select to_jsonb(q) item
      from public.quotations q
      where to_jsonb(q)->>'customer_id' = selected_customer_id::text
      order by to_jsonb(q)->>'created_at' desc nulls last, q.id desc
      limit 1
    ) quote_row;
  end if;

  select coalesce(jsonb_agg(private.customer_order_payload(o.id) order by o.id desc), '[]'::jsonb)
  into orders_json
  from public.sales_orders o
  where to_jsonb(o)->>'customer_id' = selected_customer_id::text;

  if member_role in ('OWNER','FINANCE_CONTACT') then
    select jsonb_build_object(
      'outstanding_amount_vnd', coalesce(sum((item->>'outstanding_amount_vnd')::bigint), 0),
      'overdue_amount_vnd', coalesce(sum((item->>'outstanding_amount_vnd')::bigint) filter (
        where nullif(item->>'due_date', '') is not null and (item->>'due_date')::date < current_date
      ), 0),
      'items', coalesce(
        jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'id', item->>'id',
            'source_type', item->>'source_type',
            'source_number', coalesce(item->>'source_number', item->>'reference_number'),
            'original_amount_vnd', item->>'original_amount_vnd',
            'outstanding_amount_vnd', item->>'outstanding_amount_vnd',
            'due_date', item->>'due_date'
          ))
          order by item->>'due_date' nulls first
        ),
        '[]'::jsonb
      )
    ) into debt_json
    from (
      select to_jsonb(r) item
      from public.receivable_read r
      where to_jsonb(r)->>'customer_id' = selected_customer_id::text
        and coalesce((to_jsonb(r)->>'outstanding_amount_vnd')::bigint, 0) > 0
    ) debt_rows;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'amount_vnd', n.declared_amount_vnd,
      'paid_on', n.paid_on,
      'reference', n.payment_reference,
      'state', n.review_state,
      'version', n.version,
      'submitted_at', n.submitted_at,
      'evidence_id', n.evidence_id,
      'review_note', n.review_note
    ) order by n.submitted_at desc), '[]'::jsonb)
    into notices_json
    from public.payment_notices n
    where n.customer_id = selected_customer_id;
  else
    debt_json := null;
    notices_json := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'customer', customer_json,
    'membership_role', member_role,
    'can_view_debt', member_role in ('OWNER','FINANCE_CONTACT'),
    'quotation', quote_json,
    'orders', orders_json,
    'debt', debt_json,
    'payment_notices', notices_json
  );
end $$;

create or replace function public.customer_portal_order(target_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  order_json jsonb;
  customer_id uuid;
begin
  select to_jsonb(o) into order_json from public.sales_orders o where o.id = target_order_id;
  if order_json is null then raise exception 'order_not_found' using errcode = '23503'; end if;
  customer_id := (order_json->>'customer_id')::uuid;
  if private.portal_customer_role(customer_id) is null then
    raise exception 'forbidden_or_order_not_found' using errcode = '42501';
  end if;
  return private.customer_order_payload(target_order_id);
end $$;

create or replace function public.request_quotation_change(target_revision_id uuid, reason text, operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision_json jsonb;
  quotation_json jsonb;
  quotation_id uuid;
  customer_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  request_id uuid;
begin
  select to_jsonb(r) into revision_json from public.quotation_revisions r where r.id = target_revision_id;
  if revision_json is null then raise exception 'quotation_revision_not_found' using errcode = '23503'; end if;
  quotation_id := (revision_json->>'quotation_id')::uuid;
  select to_jsonb(q) into quotation_json from public.quotations q where q.id = quotation_id;
  customer_id := (quotation_json->>'customer_id')::uuid;
  if coalesce(private.portal_customer_role(customer_id), '') not in ('OWNER','FINANCE_CONTACT') then
    raise exception 'quotation_change_forbidden' using errcode = '42501';
  end if;
  if char_length(trim(reason)) not between 10 and 1000 then raise exception 'invalid_change_reason' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('revision', target_revision_id, 'reason', trim(reason)));
  select * into receipt from public.command_receipts r where r.operation_id = request_quotation_change.operation_id;
  if found then
    if receipt.command_name <> 'request_quotation_change' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if nullif(quotation_json->>'current_revision_id', '')::uuid is distinct from target_revision_id then
    raise exception 'stale_quotation_revision' using errcode = '40001';
  end if;
  insert into public.quotation_change_requests(quotation_revision_id, quotation_id, customer_id, reason, requested_by)
  values(target_revision_id, quotation_id, customer_id, trim(reason), (select auth.uid()))
  returning id into request_id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'request_quotation_change', payload_hash, 'quotation_change_request', request_id, now());
  return request_id;
end $$;

create or replace function public.create_portal_evidence(
  target_context_type text,
  target_work_item_id uuid,
  target_customer_id uuid,
  target_mime_type text,
  target_byte_size bigint,
  operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  evidence public.portal_evidence_objects%rowtype;
  extension text;
  actor_quota bigint;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if target_mime_type not in ('image/jpeg','image/png','application/pdf') or target_byte_size not between 1 and 10485760 then
    raise exception 'unsupported_evidence_file' using errcode = '22023';
  end if;
  if target_context_type = 'WORK_RESULT' then
    if target_work_item_id is null or target_customer_id is not null or not private.is_current_work_assignee(target_work_item_id) then
      raise exception 'work_evidence_forbidden' using errcode = '42501';
    end if;
  elsif target_context_type = 'PAYMENT_NOTICE' then
    if target_customer_id is null or target_work_item_id is not null or coalesce(private.portal_customer_role(target_customer_id), '') not in ('OWNER','FINANCE_CONTACT') then
      raise exception 'payment_evidence_forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'unsupported_evidence_context' using errcode = '22023';
  end if;

  payload_hash := private.command_payload_hash(jsonb_build_object(
    'context', target_context_type,
    'work_item', target_work_item_id,
    'customer', target_customer_id,
    'mime', target_mime_type,
    'bytes', target_byte_size
  ));
  select * into receipt from public.command_receipts r where r.operation_id = create_portal_evidence.operation_id;
  if found then
    if receipt.command_name <> 'create_portal_evidence' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    select * into evidence from public.portal_evidence_objects e where e.id = receipt.result_entity_id;
    return jsonb_build_object('id', evidence.id, 'bucket_id', evidence.bucket_id, 'object_path', evidence.object_path, 'state', evidence.object_state);
  end if;

  select coalesce(sum(coalesce(e.final_byte_size, e.declared_byte_size)), 0)
  into actor_quota
  from public.portal_evidence_objects e
  where e.uploaded_by = (select auth.uid()) and e.object_state <> 'REVOKED';
  if actor_quota + target_byte_size > 104857600 then raise exception 'portal_evidence_quota_exceeded' using errcode = '54000'; end if;

  extension := case target_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.pdf' end;
  evidence.id := gen_random_uuid();
  evidence.object_path := lower(target_context_type) || '/' || evidence.id::text || '-' || gen_random_uuid()::text || extension;
  insert into public.portal_evidence_objects(
    id, object_path, context_type, work_item_id, customer_id, uploaded_by, mime_type, declared_byte_size
  ) values(
    evidence.id, evidence.object_path, target_context_type, target_work_item_id, target_customer_id,
    (select auth.uid()), target_mime_type, target_byte_size
  ) returning * into evidence;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'create_portal_evidence', payload_hash, 'portal_evidence', evidence.id, now());
  return jsonb_build_object('id', evidence.id, 'bucket_id', evidence.bucket_id, 'object_path', evidence.object_path, 'state', evidence.object_state);
end $$;

create or replace function public.finalize_portal_evidence(
  target_evidence_id uuid,
  target_checksum_sha256 text,
  target_byte_size bigint,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence public.portal_evidence_objects%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into evidence from public.portal_evidence_objects e where e.id = target_evidence_id;
  if evidence.id is null or evidence.uploaded_by <> (select auth.uid()) or not private.portal_evidence_access(evidence.id, false) then
    raise exception 'evidence_finalize_forbidden' using errcode = '42501';
  end if;
  if target_byte_size <> evidence.declared_byte_size or target_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'evidence_integrity_mismatch' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('evidence', target_evidence_id, 'checksum', target_checksum_sha256, 'bytes', target_byte_size));
  select * into receipt from public.command_receipts r where r.operation_id = finalize_portal_evidence.operation_id;
  if found then
    if receipt.command_name <> 'finalize_portal_evidence' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if evidence.object_state = 'READY' then
    if evidence.final_byte_size <> target_byte_size or evidence.checksum_sha256 <> target_checksum_sha256 then raise exception 'evidence_already_finalized' using errcode = '23505'; end if;
  elsif evidence.object_state = 'PENDING' then
    update public.portal_evidence_objects set
      final_byte_size = target_byte_size,
      checksum_sha256 = target_checksum_sha256,
      object_state = 'READY',
      finalized_at = now()
    where id = evidence.id;
  else
    raise exception 'evidence_revoked' using errcode = '42501';
  end if;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'finalize_portal_evidence', payload_hash, 'portal_evidence', evidence.id, now());
  return evidence.id;
end $$;

create or replace function public.submit_portal_work_result(
  target_work_item_id uuid,
  actual_quantity numeric,
  note text,
  receiver_name text,
  target_evidence_id uuid,
  expected_version integer,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  result_id uuid;
  nested_operation_id uuid;
begin
  if not private.is_current_work_assignee(target_work_item_id) then raise exception 'work_result_forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'work', target_work_item_id, 'actual', actual_quantity, 'note', nullif(trim(note), ''),
    'receiver', nullif(trim(receiver_name), ''), 'evidence', target_evidence_id, 'version', expected_version
  ));
  select * into receipt from public.command_receipts r where r.operation_id = submit_portal_work_result.operation_id;
  if found then
    if receipt.command_name <> 'submit_portal_work_result' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if target_evidence_id is not null and not exists (
    select 1 from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and e.context_type = 'WORK_RESULT'
      and e.work_item_id = target_work_item_id
      and e.object_state = 'READY'
      and e.uploaded_by = (select auth.uid())
  ) then
    raise exception 'work_result_evidence_invalid' using errcode = '42501';
  end if;

  nested_operation_id := md5(operation_id::text || ':work-result')::uuid;
  result_id := public.submit_work_result(
    target_work_item_id, actual_quantity, nullif(trim(note), ''), nullif(trim(receiver_name), ''), null,
    expected_version, nested_operation_id
  );
  if target_evidence_id is not null then
    insert into public.work_result_portal_evidence(work_result_id, evidence_id)
    values(result_id, target_evidence_id)
    on conflict do nothing;
  end if;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'submit_portal_work_result', payload_hash, 'work_item_result', result_id, now());
  return result_id;
end $$;

create or replace function public.submit_payment_notice(
  target_customer_id uuid,
  target_evidence_id uuid,
  declared_amount_vnd bigint,
  paid_on date,
  payment_reference text,
  customer_note text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_branch_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  notice_id uuid;
begin
  if coalesce(private.portal_customer_role(target_customer_id), '') not in ('OWNER','FINANCE_CONTACT') then
    raise exception 'payment_notice_forbidden' using errcode = '42501';
  end if;
  if declared_amount_vnd <= 0 or paid_on is null then raise exception 'invalid_payment_notice' using errcode = '22023'; end if;
  if nullif(trim(payment_reference), '') is not null and char_length(trim(payment_reference)) not between 3 and 120 then raise exception 'invalid_payment_reference' using errcode = '22023'; end if;
  if nullif(trim(customer_note), '') is not null and char_length(trim(customer_note)) not between 3 and 500 then raise exception 'invalid_payment_note' using errcode = '22023'; end if;
  select c.branch_id into customer_branch_id from public.customers c where c.id = target_customer_id;
  if not exists (
    select 1 from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and e.context_type = 'PAYMENT_NOTICE'
      and e.customer_id = target_customer_id
      and e.object_state = 'READY'
      and e.uploaded_by = (select auth.uid())
  ) then
    raise exception 'payment_notice_evidence_invalid' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'customer', target_customer_id, 'evidence', target_evidence_id, 'amount', declared_amount_vnd,
    'paid_on', paid_on, 'reference', nullif(trim(payment_reference), ''), 'note', nullif(trim(customer_note), '')
  ));
  select * into receipt from public.command_receipts r where r.operation_id = submit_payment_notice.operation_id;
  if found then
    if receipt.command_name <> 'submit_payment_notice' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  insert into public.payment_notices(
    branch_id, customer_id, evidence_id, declared_amount_vnd, paid_on, payment_reference, customer_note, submitted_by
  ) values(
    customer_branch_id, target_customer_id, target_evidence_id, declared_amount_vnd, paid_on,
    nullif(trim(payment_reference), ''), nullif(trim(customer_note), ''), (select auth.uid())
  ) returning id into notice_id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'submit_payment_notice', payload_hash, 'payment_notice', notice_id, now());
  return notice_id;
end $$;

create or replace function public.review_payment_notice(
  target_payment_notice_id uuid,
  target_state text,
  target_review_note text,
  expected_version integer,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notice public.payment_notices%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id;
  if notice.id is null or not private.has_permission(notice.branch_id, 'finance.payment_notice.review') then
    raise exception 'payment_notice_review_forbidden' using errcode = '42501';
  end if;
  if target_state not in ('UNDER_REVIEW','ACCEPTED','REJECTED') then raise exception 'invalid_review_state' using errcode = '22023'; end if;
  if nullif(trim(target_review_note), '') is not null and char_length(trim(target_review_note)) not between 3 and 500 then raise exception 'invalid_review_note' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'notice', target_payment_notice_id, 'state', target_state, 'note', nullif(trim(target_review_note), ''), 'version', expected_version
  ));
  select * into receipt from public.command_receipts r where r.operation_id = review_payment_notice.operation_id;
  if found then
    if receipt.command_name <> 'review_payment_notice' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id for update;
  if notice.version <> expected_version then raise exception 'stale_payment_notice_version' using errcode = '40001'; end if;
  insert into public.payment_notice_review_events(payment_notice_id, from_state, to_state, review_note, reviewed_by)
  values(notice.id, notice.review_state, target_state, nullif(trim(target_review_note), ''), (select auth.uid()));
  update public.payment_notices set
    review_state = target_state,
    version = version + 1,
    review_note = nullif(trim(target_review_note), ''),
    reviewed_by = case when target_state in ('ACCEPTED','REJECTED') then (select auth.uid()) else reviewed_by end,
    reviewed_at = case when target_state in ('ACCEPTED','REJECTED') then now() else reviewed_at end
  where id = notice.id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'review_payment_notice', payload_hash, 'payment_notice', notice.id, now());
  return notice.id;
end $$;

create or replace function public.get_portal_evidence_for_signing(target_evidence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  evidence public.portal_evidence_objects%rowtype;
begin
  if not private.portal_evidence_access(target_evidence_id, true) then
    raise exception 'evidence_access_denied' using errcode = '42501';
  end if;
  select * into evidence from public.portal_evidence_objects e where e.id = target_evidence_id;
  return jsonb_build_object(
    'id', evidence.id,
    'bucket_id', evidence.bucket_id,
    'object_path', evidence.object_path,
    'mime_type', evidence.mime_type
  );
end $$;

create or replace function public.admin_payment_notice_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'branch_id', n.branch_id,
    'customer_id', n.customer_id,
    'customer_name', c.display_name,
    'amount_vnd', n.declared_amount_vnd,
    'paid_on', n.paid_on,
    'reference', n.payment_reference,
    'note', n.customer_note,
    'state', n.review_state,
    'version', n.version,
    'submitted_at', n.submitted_at,
    'evidence_id', n.evidence_id,
    'review_note', n.review_note
  ) order by n.submitted_at desc), '[]'::jsonb)
  from public.payment_notices n
  join public.customers c on c.id = n.customer_id
  where private.has_permission(n.branch_id, 'finance.payment_notice.review')
$$;

alter table public.quotation_change_requests enable row level security;
alter table public.portal_evidence_objects enable row level security;
alter table public.work_result_portal_evidence enable row level security;
alter table public.payment_notices enable row level security;
alter table public.payment_notice_review_events enable row level security;

drop policy if exists work_items_read on public.work_items;
drop policy if exists work_assignments_read on public.work_item_assignments;
drop policy if exists work_results_read on public.work_item_results;
drop policy if exists work_heartbeats_read on public.work_item_heartbeats;
drop policy if exists work_verifications_read on public.work_item_verifications;
drop policy if exists earning_events_read on public.earning_events;

create policy work_items_read on public.work_items for select to authenticated
using (private.portal_can_access_work_item(id));
create policy work_assignments_read on public.work_item_assignments for select to authenticated
using (
  employee_id = private.current_employee_id()
  or exists(select 1 from public.work_items w where w.id = work_item_id and private.has_permission(w.branch_id, 'workforce.read'))
);
create policy work_results_read on public.work_item_results for select to authenticated
using (
  private.is_current_work_assignee(work_item_id)
  or exists(select 1 from public.work_items w where w.id = work_item_id and private.has_permission(w.branch_id, 'workforce.read'))
);
create policy work_heartbeats_read on public.work_item_heartbeats for select to authenticated
using (
  private.is_current_work_assignee(work_item_id)
  or exists(select 1 from public.work_items w where w.id = work_item_id and private.has_permission(w.branch_id, 'workforce.read'))
);
create policy work_verifications_read on public.work_item_verifications for select to authenticated
using (
  private.is_current_work_assignee(work_item_id)
  or exists(select 1 from public.work_items w where w.id = work_item_id and private.has_permission(w.branch_id, 'workforce.read'))
);
create policy earning_events_read on public.earning_events for select to authenticated
using (
  private.has_permission(branch_id, 'compensation.read')
  or (employee_id = private.current_employee_id() and private.has_permission(branch_id, 'work.claim'))
);

create policy quotation_change_requests_read on public.quotation_change_requests for select to authenticated
using (
  private.portal_customer_role(customer_id) in ('OWNER','FINANCE_CONTACT')
  or private.has_permission((select c.branch_id from public.customers c where c.id = customer_id), 'quotation.read')
);
create policy portal_evidence_read on public.portal_evidence_objects for select to authenticated
using (private.portal_evidence_access(id, true));
create policy work_result_portal_evidence_read on public.work_result_portal_evidence for select to authenticated
using (private.portal_evidence_access(evidence_id, true));
create policy payment_notices_read on public.payment_notices for select to authenticated
using (
  private.portal_customer_role(customer_id) in ('OWNER','FINANCE_CONTACT')
  or private.has_permission(branch_id, 'finance.payment_notice.review')
);
create policy payment_notice_review_events_read on public.payment_notice_review_events for select to authenticated
using (exists(
  select 1
  from public.payment_notices n
  where n.id = payment_notice_id
    and (
      private.portal_customer_role(n.customer_id) in ('OWNER','FINANCE_CONTACT')
      or private.has_permission(n.branch_id, 'finance.payment_notice.review')
    )
));

revoke all on table public.quotation_change_requests, public.portal_evidence_objects, public.work_result_portal_evidence, public.payment_notices, public.payment_notice_review_events from anon, authenticated;
grant select on table public.quotation_change_requests, public.portal_evidence_objects, public.work_result_portal_evidence, public.payment_notices, public.payment_notice_review_events to authenticated;

revoke all on function private.portal_customer_role(uuid), private.is_current_work_assignee(uuid), private.portal_can_access_work_item(uuid), private.portal_evidence_access(uuid, boolean), private.can_write_portal_evidence_object(text), private.can_read_portal_evidence_object(text), private.worker_work_item_payload(uuid), private.customer_delivery_payload(uuid), private.customer_order_payload(uuid) from public, anon, authenticated;
grant execute on function private.portal_customer_role(uuid), private.is_current_work_assignee(uuid), private.portal_can_access_work_item(uuid), private.portal_evidence_access(uuid, boolean), private.can_write_portal_evidence_object(text), private.can_read_portal_evidence_object(text) to authenticated;

revoke all on function public.worker_portal_snapshot(), public.worker_portal_job(uuid), public.customer_portal_snapshot(uuid), public.customer_portal_order(uuid), public.request_quotation_change(uuid, text, uuid), public.create_portal_evidence(text, uuid, uuid, text, bigint, uuid), public.finalize_portal_evidence(uuid, text, bigint, uuid), public.submit_portal_work_result(uuid, numeric, text, text, uuid, integer, uuid), public.submit_payment_notice(uuid, uuid, bigint, date, text, text, uuid), public.review_payment_notice(uuid, text, text, integer, uuid), public.get_portal_evidence_for_signing(uuid), public.admin_payment_notice_snapshot() from public, anon, authenticated;
grant execute on function public.worker_portal_snapshot(), public.worker_portal_job(uuid), public.customer_portal_snapshot(uuid), public.customer_portal_order(uuid), public.request_quotation_change(uuid, text, uuid), public.create_portal_evidence(text, uuid, uuid, text, bigint, uuid), public.finalize_portal_evidence(uuid, text, bigint, uuid), public.submit_portal_work_result(uuid, numeric, text, text, uuid, integer, uuid), public.submit_payment_notice(uuid, uuid, bigint, date, text, text, uuid), public.review_payment_notice(uuid, text, text, integer, uuid), public.get_portal_evidence_for_signing(uuid), public.admin_payment_notice_snapshot() to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    execute $sql$
      insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
      values('portal-evidence', 'portal-evidence', false, 10485760, array['image/jpeg','image/png','application/pdf']::text[])
      on conflict (id) do update set
        public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types
    $sql$;
    execute 'drop policy if exists r9_portal_evidence_insert on storage.objects';
    execute 'drop policy if exists r9_portal_evidence_update on storage.objects';
    execute 'drop policy if exists r9_portal_evidence_select on storage.objects';
    execute $policy$
      create policy r9_portal_evidence_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'portal-evidence' and private.can_write_portal_evidence_object(name))
    $policy$;
    execute $policy$
      create policy r9_portal_evidence_update on storage.objects for update to authenticated
      using (bucket_id = 'portal-evidence' and private.can_write_portal_evidence_object(name))
      with check (bucket_id = 'portal-evidence' and private.can_write_portal_evidence_object(name))
    $policy$;
    execute $policy$
      create policy r9_portal_evidence_select on storage.objects for select to authenticated
      using (
        bucket_id = 'portal-evidence'
        and (
          private.can_read_portal_evidence_object(name)
          or private.can_write_portal_evidence_object(name)
        )
      )
    $policy$;
  end if;
end
$storage$;

commit;
