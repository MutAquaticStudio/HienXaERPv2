-- HIỀN XA ERP CP1 — customer portal projections and support commands.
-- Customer users never receive direct write access to P4, P7, or P8 tables.

create sequence public.customer_quote_request_number_seq;
create sequence public.customer_payment_notice_number_seq;
revoke all on sequence public.customer_quote_request_number_seq,
  public.customer_payment_notice_number_seq from public, anon, authenticated;

create table public.customer_portal_memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  portal_role text not null default 'CONTACT'
    check (portal_role in ('CONTACT', 'BILLING')),
  active boolean not null default true,
  created_by uuid references public.user_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  constraint customer_portal_memberships_active_shape check (
    (active and deactivated_at is null)
    or (not active and deactivated_at is not null)
  )
);
create index customer_portal_memberships_customer_idx
  on public.customer_portal_memberships(customer_id, active);

create table public.customer_portal_quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  quotation_revision_id uuid not null unique
    references public.quotation_revisions(id) on delete restrict,
  accepted_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  accepted_at timestamptz not null default now(),
  unique (accepted_by, idempotency_key)
);
create index customer_portal_quote_acceptances_customer_idx
  on public.customer_portal_quote_acceptances(customer_id, accepted_at desc);

create table public.customer_quote_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_site_id uuid not null references public.customer_sites(id) on delete restrict,
  request_type text not null check (request_type in ('NEW_QUOTE', 'REORDER', 'QUOTE_CHANGE')),
  source_sales_order_id uuid references public.sales_orders(id) on delete restrict,
  source_quotation_revision_id uuid references public.quotation_revisions(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  requested_quantity numeric(20, 6) not null check (requested_quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  note text check (note is null or char_length(trim(note)) between 3 and 500),
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'CLOSED')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  submitted_at timestamptz not null default now(),
  constraint customer_quote_requests_source_shape check (
    (request_type = 'NEW_QUOTE'
      and source_sales_order_id is null and source_quotation_revision_id is null)
    or (request_type = 'REORDER'
      and source_sales_order_id is not null and source_quotation_revision_id is null)
    or (request_type = 'QUOTE_CHANGE'
      and source_sales_order_id is null and source_quotation_revision_id is not null)
  ),
  unique (customer_id, submitted_by, idempotency_key)
);
create index customer_quote_requests_customer_idx
  on public.customer_quote_requests(customer_id, submitted_at desc);
create index customer_quote_requests_status_idx
  on public.customer_quote_requests(status, submitted_at desc);

create table public.customer_delivery_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  acknowledged_by uuid not null references auth.users(id) on delete restrict,
  acknowledged_at timestamptz not null default now()
);
create index customer_delivery_acknowledgements_customer_idx
  on public.customer_delivery_acknowledgements(customer_id, acknowledged_at desc);

create table public.customer_delivery_issues (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  category text not null check (category in (
    'SHORT_DELIVERY', 'WRONG_GOODS', 'NOT_RECEIVED', 'DOCUMENT_INCORRECT', 'OTHER'
  )),
  description text not null check (char_length(trim(description)) between 10 and 500),
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  reported_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  reported_at timestamptz not null default now(),
  unique (delivery_id, reported_by, idempotency_key)
);
create index customer_delivery_issues_customer_idx
  on public.customer_delivery_issues(customer_id, reported_at desc);

create table public.customer_payment_notices (
  id uuid primary key default gen_random_uuid(),
  notice_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null default 'VND' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  transferred_on date not null,
  bank_reference text check (bank_reference is null or char_length(trim(bank_reference)) between 2 and 120),
  note text check (note is null or char_length(trim(note)) between 3 and 500),
  evidence_storage_path text not null unique check (
    char_length(evidence_storage_path) between 38 and 457
    and evidence_storage_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9._/-]+$'
  ),
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED', 'UNDER_REVIEW', 'MATCHED', 'REJECTED')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  submitted_at timestamptz not null default now(),
  unique (customer_id, submitted_by, idempotency_key)
);
create index customer_payment_notices_customer_idx
  on public.customer_payment_notices(customer_id, submitted_at desc);
create index customer_payment_notices_status_idx
  on public.customer_payment_notices(status, submitted_at desc);

create or replace function app_private.customer_portal_customer_id(p_auth_user_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select membership.customer_id
  from public.customer_portal_memberships membership
  join public.customers customer on customer.id = membership.customer_id
  where membership.auth_user_id = p_auth_user_id
    and membership.active
    and customer.is_active
$$;

create or replace function app_private.customer_portal_append_audit(
  p_actor_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, payload
  ) values (
    p_actor_id, p_event_type, p_entity_type, p_entity_id, p_payload
  );
end;
$$;

create or replace function app_private.customer_portal_accept_quotation(
  p_revision_id uuid, p_idempotency_key text, p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  portal_customer_id uuid;
  target_revision public.quotation_revisions%rowtype;
  target_quotation public.quotations%rowtype;
  acceptance_id uuid;
begin
  if coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$' then
    raise exception 'CUSTOMER_PORTAL_IDEMPOTENCY_INVALID' using errcode = '22000';
  end if;
  portal_customer_id := app_private.customer_portal_customer_id(p_actor_id);
  if portal_customer_id is null then
    raise exception 'CUSTOMER_PORTAL_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  select * into target_revision from public.quotation_revisions
    where id = p_revision_id for update;
  if target_revision.id is null then
    raise exception 'QUOTATION_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into target_quotation from public.quotations
    where id = target_revision.quotation_id for update;
  if target_quotation.customer_id <> portal_customer_id
    or target_quotation.active_revision_id <> p_revision_id then
    raise exception 'CUSTOMER_PORTAL_RESOURCE_DENIED' using errcode = '42501';
  end if;
  select id into acceptance_id from public.customer_portal_quote_acceptances
    where quotation_revision_id = p_revision_id;
  if acceptance_id is not null then return acceptance_id; end if;
  if target_revision.status <> 'SENT' then
    raise exception 'CUSTOMER_PORTAL_QUOTATION_NOT_ACCEPTABLE' using errcode = '23514';
  end if;
  update public.quotation_revisions set status = 'ACCEPTED', accepted_at = now()
    where id = p_revision_id;
  update public.quotations set status = 'ACCEPTED'
    where id = target_quotation.id;
  insert into public.customer_portal_quote_acceptances (
    customer_id, quotation_revision_id, accepted_by, idempotency_key
  ) values (portal_customer_id, p_revision_id, p_actor_id, p_idempotency_key)
  returning id into acceptance_id;
  perform app_private.customer_portal_append_audit(
    p_actor_id, 'CUSTOMER_QUOTATION_ACCEPTED', 'quotation_revision', p_revision_id,
    jsonb_build_object('customer_id', portal_customer_id)
  );
  return acceptance_id;
end;
$$;

create or replace function app_private.customer_portal_request_quote(
  p_request_type text, p_customer_site_id uuid, p_material_id uuid,
  p_quantity numeric, p_uom_id uuid, p_note text,
  p_source_sales_order_id uuid, p_source_quotation_revision_id uuid,
  p_idempotency_key text, p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  portal_customer_id uuid;
  request_id uuid;
begin
  portal_customer_id := app_private.customer_portal_customer_id(p_actor_id);
  if portal_customer_id is null then
    raise exception 'CUSTOMER_PORTAL_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if p_request_type not in ('NEW_QUOTE', 'REORDER', 'QUOTE_CHANGE')
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$'
    or p_quantity is null or p_quantity <= 0
    or char_length(trim(coalesce(p_note, ''))) > 500
  then raise exception 'CUSTOMER_PORTAL_QUOTE_REQUEST_INVALID' using errcode = '22000'; end if;
  if not exists (
    select 1 from public.customer_sites
    where id = p_customer_site_id and customer_id = portal_customer_id and is_active
  ) then raise exception 'CUSTOMER_PORTAL_SITE_DENIED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.materials material
    join public.uom_catalog uom on uom.id = material.sales_uom_id
    where material.id = p_material_id and material.is_active and uom.is_active
      and material.sales_uom_id = p_uom_id
  ) then raise exception 'CUSTOMER_PORTAL_MATERIAL_INVALID' using errcode = '23514'; end if;
  if p_request_type = 'REORDER' and not exists (
    select 1 from public.sales_orders where id = p_source_sales_order_id
      and customer_id = portal_customer_id
  ) then raise exception 'CUSTOMER_PORTAL_REORDER_DENIED' using errcode = '42501'; end if;
  if p_request_type = 'QUOTE_CHANGE' and not exists (
    select 1 from public.quotation_revisions revision
    join public.quotations quotation on quotation.id = revision.quotation_id
    where revision.id = p_source_quotation_revision_id
      and quotation.customer_id = portal_customer_id
  ) then raise exception 'CUSTOMER_PORTAL_QUOTE_DENIED' using errcode = '42501'; end if;
  insert into public.customer_quote_requests (
    request_number, customer_id, customer_site_id, request_type,
    source_sales_order_id, source_quotation_revision_id, material_id,
    requested_quantity, uom_id, note, submitted_by, idempotency_key
  ) values (
    'YCBG-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.customer_quote_request_number_seq')::text, 6, '0'),
    portal_customer_id, p_customer_site_id, p_request_type,
    p_source_sales_order_id, p_source_quotation_revision_id, p_material_id,
    p_quantity, p_uom_id, nullif(trim(p_note), ''), p_actor_id, p_idempotency_key
  ) on conflict (customer_id, submitted_by, idempotency_key) do nothing
  returning id into request_id;
  if request_id is null then
    select id into request_id from public.customer_quote_requests
    where customer_id = portal_customer_id and submitted_by = p_actor_id
      and idempotency_key = p_idempotency_key;
  else
    perform app_private.customer_portal_append_audit(
      p_actor_id, 'CUSTOMER_QUOTE_REQUESTED', 'customer_quote_request', request_id,
      jsonb_build_object('customer_id', portal_customer_id, 'request_type', p_request_type)
    );
  end if;
  return request_id;
end;
$$;

create or replace function app_private.customer_portal_acknowledge_delivery(
  p_delivery_id uuid, p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare portal_customer_id uuid; acknowledgement_id uuid;
begin
  portal_customer_id := app_private.customer_portal_customer_id(p_actor_id);
  if portal_customer_id is null then
    raise exception 'CUSTOMER_PORTAL_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.deliveries where id = p_delivery_id
      and customer_id = portal_customer_id
      and status in ('DELIVERED', 'CONFIRMED', 'PARTIAL')
  ) then raise exception 'CUSTOMER_PORTAL_DELIVERY_DENIED' using errcode = '42501'; end if;
  insert into public.customer_delivery_acknowledgements (
    customer_id, delivery_id, acknowledged_by
  ) values (portal_customer_id, p_delivery_id, p_actor_id)
  on conflict (delivery_id) do nothing returning id into acknowledgement_id;
  if acknowledgement_id is null then
    select id into acknowledgement_id from public.customer_delivery_acknowledgements
    where delivery_id = p_delivery_id;
  else
    perform app_private.customer_portal_append_audit(
      p_actor_id, 'CUSTOMER_DELIVERY_ACKNOWLEDGED', 'delivery', p_delivery_id,
      jsonb_build_object('customer_id', portal_customer_id)
    );
  end if;
  return acknowledgement_id;
end;
$$;

create or replace function app_private.customer_portal_report_delivery_issue(
  p_delivery_id uuid, p_category text, p_description text,
  p_idempotency_key text, p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare portal_customer_id uuid; issue_id uuid;
begin
  portal_customer_id := app_private.customer_portal_customer_id(p_actor_id);
  if portal_customer_id is null then
    raise exception 'CUSTOMER_PORTAL_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if p_category not in ('SHORT_DELIVERY', 'WRONG_GOODS', 'NOT_RECEIVED', 'DOCUMENT_INCORRECT', 'OTHER')
    or char_length(trim(coalesce(p_description, ''))) not between 10 and 500
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$'
  then raise exception 'CUSTOMER_PORTAL_DELIVERY_ISSUE_INVALID' using errcode = '22000'; end if;
  if not exists (
    select 1 from public.deliveries where id = p_delivery_id
      and customer_id = portal_customer_id
      and status in ('DELIVERED', 'CONFIRMED', 'PARTIAL')
  ) then raise exception 'CUSTOMER_PORTAL_DELIVERY_DENIED' using errcode = '42501'; end if;
  insert into public.customer_delivery_issues (
    customer_id, delivery_id, category, description, reported_by, idempotency_key
  ) values (
    portal_customer_id, p_delivery_id, p_category, trim(p_description), p_actor_id, p_idempotency_key
  ) on conflict (delivery_id, reported_by, idempotency_key) do nothing
  returning id into issue_id;
  if issue_id is null then
    select id into issue_id from public.customer_delivery_issues
    where delivery_id = p_delivery_id and reported_by = p_actor_id
      and idempotency_key = p_idempotency_key;
  else
    perform app_private.customer_portal_append_audit(
      p_actor_id, 'CUSTOMER_DELIVERY_ISSUE_REPORTED', 'delivery', p_delivery_id,
      jsonb_build_object('customer_id', portal_customer_id, 'category', p_category)
    );
  end if;
  return issue_id;
end;
$$;

create or replace function app_private.customer_portal_submit_payment_notice(
  p_amount numeric, p_transferred_on date, p_bank_reference text, p_note text,
  p_evidence_storage_path text, p_idempotency_key text, p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare portal_customer_id uuid; notice_id uuid;
begin
  portal_customer_id := app_private.customer_portal_customer_id(p_actor_id);
  if portal_customer_id is null then
    raise exception 'CUSTOMER_PORTAL_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_transferred_on is null
    or char_length(trim(coalesce(p_bank_reference, ''))) > 120
    or char_length(trim(coalesce(p_note, ''))) > 500
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$'
    or char_length(coalesce(p_evidence_storage_path, '')) not between 38 and 457
    or coalesce(p_evidence_storage_path, '') !~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9._/-]+$'
  then raise exception 'CUSTOMER_PORTAL_PAYMENT_NOTICE_INVALID' using errcode = '22000'; end if;
  if split_part(p_evidence_storage_path, '/', 1) <> p_actor_id::text
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'customer-evidence'
        and object.name = p_evidence_storage_path
        and object.owner_id = p_actor_id
    ) then raise exception 'CUSTOMER_PORTAL_EVIDENCE_DENIED' using errcode = '42501'; end if;
  insert into public.customer_payment_notices (
    notice_number, customer_id, amount, transferred_on, bank_reference, note,
    evidence_storage_path, submitted_by, idempotency_key
  ) values (
    'TBTT-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.customer_payment_notice_number_seq')::text, 6, '0'),
    portal_customer_id, p_amount, p_transferred_on,
    nullif(trim(p_bank_reference), ''), nullif(trim(p_note), ''),
    p_evidence_storage_path, p_actor_id, p_idempotency_key
  ) on conflict (customer_id, submitted_by, idempotency_key) do nothing
  returning id into notice_id;
  if notice_id is null then
    select id into notice_id from public.customer_payment_notices
    where customer_id = portal_customer_id and submitted_by = p_actor_id
      and idempotency_key = p_idempotency_key;
  else
    perform app_private.customer_portal_append_audit(
      p_actor_id, 'CUSTOMER_PAYMENT_NOTICE_SUBMITTED', 'customer_payment_notice', notice_id,
      jsonb_build_object('customer_id', portal_customer_id, 'amount', p_amount)
    );
  end if;
  return notice_id;
end;
$$;

revoke all on function app_private.customer_portal_customer_id(uuid),
  app_private.customer_portal_append_audit(uuid, text, text, uuid, jsonb),
  app_private.customer_portal_accept_quotation(uuid, text, uuid),
  app_private.customer_portal_request_quote(text, uuid, uuid, numeric, uuid, text, uuid, uuid, text, uuid),
  app_private.customer_portal_acknowledge_delivery(uuid, uuid),
  app_private.customer_portal_report_delivery_issue(uuid, text, text, text, uuid),
  app_private.customer_portal_submit_payment_notice(numeric, date, text, text, text, text, uuid)
from public, anon, authenticated;

alter table public.customer_portal_memberships enable row level security;
alter table public.customer_portal_quote_acceptances enable row level security;
alter table public.customer_quote_requests enable row level security;
alter table public.customer_delivery_acknowledgements enable row level security;
alter table public.customer_delivery_issues enable row level security;
alter table public.customer_payment_notices enable row level security;
revoke all on public.customer_portal_memberships,
  public.customer_portal_quote_acceptances,
  public.customer_quote_requests,
  public.customer_delivery_acknowledgements,
  public.customer_delivery_issues,
  public.customer_payment_notices from anon, authenticated;
grant select on public.customer_portal_memberships,
  public.customer_portal_quote_acceptances,
  public.customer_quote_requests,
  public.customer_delivery_acknowledgements,
  public.customer_delivery_issues,
  public.customer_payment_notices to authenticated;

create policy customer_portal_memberships_read_self
on public.customer_portal_memberships for select to authenticated
using (auth_user_id = (select auth.uid()));
create policy customer_portal_quote_acceptances_read_authorized
on public.customer_portal_quote_acceptances for select to authenticated
using (
  accepted_by = (select auth.uid())
  or (select app_private.has_permission('customer.manage'))
);
create policy customer_quote_requests_read_authorized
on public.customer_quote_requests for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select app_private.has_permission('customer.manage'))
);
create policy customer_delivery_acknowledgements_read_authorized
on public.customer_delivery_acknowledgements for select to authenticated
using (
  acknowledged_by = (select auth.uid())
  or (select app_private.has_permission('delivery.read'))
  or (select app_private.has_permission('customer.manage'))
);
create policy customer_delivery_issues_read_authorized
on public.customer_delivery_issues for select to authenticated
using (
  reported_by = (select auth.uid())
  or (select app_private.has_permission('delivery.read'))
  or (select app_private.has_permission('customer.manage'))
);
create policy customer_payment_notices_read_authorized
on public.customer_payment_notices for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select app_private.has_permission('finance.read'))
  or (select app_private.has_permission('customer.manage'))
);

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'customer-evidence', 'customer-evidence', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy customer_evidence_objects_insert_own_folder
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.customer_portal_memberships membership
    where membership.auth_user_id = (select auth.uid()) and membership.active
  )
);
create policy customer_evidence_objects_read_own_notice
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-evidence'
  and exists (
    select 1 from public.customer_payment_notices notice
    where notice.evidence_storage_path = storage.objects.name
      and notice.submitted_by = (select auth.uid())
  )
);
