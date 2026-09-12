create sequence public.quotation_number_seq;
create sequence public.sales_order_number_seq;

create table public.command_receipts (
  operation_id uuid primary key,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  command_name text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result_type text not null,
  result_entity_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  quotation_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  sales_owner_employee_id uuid references public.employees(id) on delete set null,
  current_revision_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.quotation_revisions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  state text not null default 'DRAFT' check (state in ('DRAFT','SENT','ACCEPTED','EXPIRED','SUPERSEDED','CANCELLED')),
  customer_name_snapshot text not null,
  site_name_snapshot text not null,
  delivery_address_snapshot text not null,
  receiver_name_snapshot text,
  receiver_phone_snapshot text,
  commercial_terms text,
  total_vnd bigint not null default 0 check (total_vnd >= 0),
  expires_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  supersedes_revision_id uuid references public.quotation_revisions(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quotation_id, revision_number)
);

alter table public.quotations add constraint quotations_current_revision_fk
  foreign key (current_revision_id) references public.quotation_revisions(id) on delete restrict;

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.quotation_revisions(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_name_snapshot text not null,
  ordered_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  base_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  quantity numeric(20,6) not null check (quantity > 0),
  conversion_numerator numeric(20,6) not null check (conversion_numerator > 0),
  conversion_denominator numeric(20,6) not null check (conversion_denominator > 0),
  rounding_mode text not null check (rounding_mode in ('HALF_UP','DOWN')),
  unit_price_vnd bigint not null check (unit_price_vnd > 0),
  line_total_vnd bigint not null check (line_total_vnd > 0),
  pricing_rule_id uuid references public.pricing_rules(id) on delete restrict,
  pricing_rule_version integer,
  price_source_type text not null check (price_source_type in ('LIST','CONTRACT','MANUAL_APPROVED')),
  override_by uuid references auth.users(id) on delete restrict,
  override_reason text,
  unique (revision_id, line_number),
  check ((price_source_type = 'MANUAL_APPROVED' and override_by is not null and override_reason is not null) or (price_source_type <> 'MANUAL_APPROVED' and pricing_rule_id is not null and pricing_rule_version is not null))
);

create table public.quotation_acceptances (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null unique references public.quotation_revisions(id) on delete restrict,
  channel text not null check (channel in ('PORTAL','PHONE','ZALO','EMAIL','OTHER')),
  confirmed_by_name text,
  accepted_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  evidence_object_path text,
  accepted_at timestamptz not null default now()
);

create table public.quotation_pdf_artifacts (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.quotation_revisions(id) on delete restrict,
  object_path text not null unique,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (revision_id, checksum_sha256)
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  order_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  quotation_revision_id uuid unique references public.quotation_revisions(id) on delete restrict,
  sales_owner_employee_id uuid references public.employees(id) on delete set null,
  commercial_state text not null default 'DRAFT' check (commercial_state in ('DRAFT','CONFIRMED','CLOSED','CANCELLED')),
  customer_name_snapshot text not null,
  site_name_snapshot text not null,
  delivery_address_snapshot text not null,
  receiver_name_snapshot text,
  receiver_phone_snapshot text,
  requested_delivery_at timestamptz,
  commercial_terms text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  quotation_line_id uuid references public.quotation_lines(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_name_snapshot text not null,
  ordered_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  base_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  quantity numeric(20,6) not null check (quantity > 0),
  conversion_numerator numeric(20,6) not null check (conversion_numerator > 0),
  conversion_denominator numeric(20,6) not null check (conversion_denominator > 0),
  rounding_mode text not null check (rounding_mode in ('HALF_UP','DOWN')),
  unit_price_vnd bigint not null check (unit_price_vnd > 0),
  line_total_vnd bigint not null check (line_total_vnd > 0),
  pricing_rule_id uuid references public.pricing_rules(id) on delete restrict,
  pricing_rule_version integer,
  price_source_type text not null check (price_source_type in ('LIST','CONTRACT','MANUAL_APPROVED')),
  override_by uuid references auth.users(id) on delete restrict,
  override_reason text,
  unique (sales_order_id, line_number),
  check ((price_source_type = 'MANUAL_APPROVED' and override_by is not null and override_reason is not null) or (price_source_type <> 'MANUAL_APPROVED' and pricing_rule_id is not null and pricing_rule_version is not null))
);

alter table public.credit_commitments drop constraint credit_commitments_source_type_check;
alter table public.credit_commitments add column sales_order_id uuid references public.sales_orders(id) on delete restrict;
alter table public.credit_commitments add constraint credit_commitments_source_type_check
  check (source_type in ('LOCAL_FIXTURE','SALES_ORDER'));
alter table public.credit_commitments add constraint credit_commitments_source_shape_check
  check ((source_type = 'LOCAL_FIXTURE' and sales_order_id is null) or (source_type = 'SALES_ORDER' and sales_order_id is not null));
create unique index credit_commitment_sales_order_unique on public.credit_commitments(sales_order_id) where sales_order_id is not null;

create view public.quotation_read with (security_invoker = true) as
select q.id, q.branch_id, q.quotation_number, q.customer_id, q.site_id, q.sales_owner_employee_id,
  r.id as revision_id, r.revision_number, r.state, r.total_vnd::text as total_vnd,
  r.customer_name_snapshot, r.site_name_snapshot, r.expires_at, r.sent_at, r.accepted_at,
  q.created_at
from public.quotations q join public.quotation_revisions r on r.id = q.current_revision_id;

create view public.sales_order_read with (security_invoker = true) as
select o.id, o.branch_id, o.order_number, o.customer_id, o.site_id, o.quotation_revision_id,
  o.sales_owner_employee_id, o.commercial_state,
  'NOT_STARTED'::text as fulfillment_state,
  'NOT_DUE'::text as payment_state,
  o.customer_name_snapshot, o.site_name_snapshot, o.delivery_address_snapshot,
  coalesce(t.total_vnd, 0)::bigint::text as total_vnd,
  o.requested_delivery_at, o.confirmed_at, o.cancelled_at, o.created_at
from public.sales_orders o
left join (select sales_order_id, sum(line_total_vnd) as total_vnd from public.sales_order_lines group by sales_order_id) t on t.sales_order_id = o.id;

create or replace function private.assert_commercial_line(
  target_branch_id uuid,
  target_customer_id uuid,
  line jsonb,
  actor_auth_user_id uuid
)
returns table(
  material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid,
  quantity numeric, conversion_numerator numeric, conversion_denominator numeric,
  rounding_mode text, unit_price_vnd bigint, line_total_vnd bigint,
  pricing_rule_id uuid, pricing_rule_version integer, price_source_type text,
  override_by uuid, override_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_rule public.pricing_rules%rowtype;
  selected_material_group_id uuid;
  selected_customer_tier_code text;
begin
  material_id := (line->>'material_id')::uuid;
  ordered_uom_id := (line->>'ordered_uom_id')::uuid;
  quantity := (line->>'quantity')::numeric;
  conversion_numerator := (line->>'conversion_numerator')::numeric;
  conversion_denominator := (line->>'conversion_denominator')::numeric;
  rounding_mode := line->>'rounding_mode';
  unit_price_vnd := (line->>'unit_price_vnd')::bigint;
  pricing_rule_id := nullif(line->>'pricing_rule_id', '')::uuid;
  pricing_rule_version := nullif(line->>'pricing_rule_version', '')::integer;
  price_source_type := line->>'price_source_type';
  override_reason := nullif(line->>'override_reason', '');
  override_by := case when price_source_type = 'MANUAL_APPROVED' then actor_auth_user_id else null end;

  select m.name, m.base_uom_id, m.group_id into material_name, base_uom_id, selected_material_group_id
  from public.materials m where m.id = material_id and m.active and m.sale_enabled;
  if not found or quantity <= 0 or unit_price_vnd <= 0 or conversion_numerator <= 0 or conversion_denominator <= 0
    or rounding_mode not in ('HALF_UP','DOWN') then
    raise exception 'invalid_commercial_line' using errcode = '22023';
  end if;

  if ordered_uom_id <> base_uom_id and not exists (
    select 1 from public.material_uom_conversions c
    where c.material_id = assert_commercial_line.material_id
      and c.from_uom_id = assert_commercial_line.ordered_uom_id
      and c.to_uom_id = assert_commercial_line.base_uom_id
      and c.active and c.settlement_allowed and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
      and c.numerator = assert_commercial_line.conversion_numerator
      and c.denominator = assert_commercial_line.conversion_denominator
  ) then
    raise exception 'invalid_or_non_settlement_conversion' using errcode = '22023';
  end if;

  if ordered_uom_id = base_uom_id and (conversion_numerator <> 1 or conversion_denominator <> 1) then
    raise exception 'base_uom_conversion_must_be_one' using errcode = '22023';
  end if;

  if price_source_type = 'MANUAL_APPROVED' then
    if override_reason is null or char_length(override_reason) < 3 or not private.has_permission(target_branch_id, 'pricing.manage') then
      raise exception 'manual_price_requires_permission_and_reason' using errcode = '42501';
    end if;
  else
    select * into requested_rule from public.pricing_rules p
    where p.id = assert_commercial_line.pricing_rule_id
      and p.branch_id = target_branch_id
      and p.version = assert_commercial_line.pricing_rule_version
      and p.price_uom_id = assert_commercial_line.ordered_uom_id
      and p.unit_price_vnd = assert_commercial_line.unit_price_vnd
      and p.active
      and p.effective_from <= now() and (p.effective_to is null or p.effective_to > now());
    if not found then raise exception 'pricing_rule_snapshot_mismatch' using errcode = '22023'; end if;
    select c.tier_code into selected_customer_tier_code
    from public.customers c where c.id = target_customer_id and c.branch_id = target_branch_id and c.active;
    if not found then raise exception 'invalid_customer' using errcode = '22023'; end if;
    if requested_rule.scope_type = 'CUSTOMER_MATERIAL' and (requested_rule.customer_id <> target_customer_id or requested_rule.material_id <> material_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'CUSTOMER_GROUP' and (requested_rule.customer_id <> target_customer_id or requested_rule.material_group_id <> selected_material_group_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'CUSTOMER_TIER' and (requested_rule.customer_tier_code is distinct from selected_customer_tier_code or requested_rule.material_id <> material_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'DEFAULT' and requested_rule.material_id <> material_id then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    end if;
  end if;

  line_total_vnd := round(quantity * unit_price_vnd)::bigint;
  return next;
end
$$;

revoke all on function private.assert_commercial_line(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

create or replace function private.command_payload_hash(payload jsonb)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.md5(payload::text) || pg_catalog.md5('hx-v2:' || payload::text)
$$;
revoke all on function private.command_payload_hash(jsonb) from public, anon, authenticated;

create or replace function public.create_sales_order_draft(
  target_branch_id uuid, target_customer_id uuid, target_site_id uuid,
  requested_delivery_at timestamptz, commercial_terms text, order_lines jsonb,
  operation_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  payload jsonb;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  customer public.customers%rowtype;
  site public.customer_sites%rowtype;
  order_id uuid;
  employee_id uuid;
  item jsonb;
  checked record;
  line_no integer := 0;
begin
  if not private.has_permission(target_branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(order_lines) <> 'array' or jsonb_array_length(order_lines) = 0 then raise exception 'order_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'customer_id', target_customer_id, 'site_id', target_site_id, 'delivery_at', requested_delivery_at, 'terms', commercial_terms, 'lines', order_lines);
  payload_hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_sales_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_sales_order_draft' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if customer.id is null or site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  employee_id := private.current_employee_id();
  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, sales_owner_employee_id,
    customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot,
    requested_delivery_at, commercial_terms, created_by)
  values (target_branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, employee_id, customer.display_name, site.name, site.address_text, site.receiver_name, site.receiver_phone,
    requested_delivery_at, commercial_terms, (select auth.uid())) returning id into order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(target_branch_id, target_customer_id, item, (select auth.uid()));
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_sales_order_draft', payload_hash, 'sales_order', order_id, now());
  return order_id;
end
$$;

create or replace function public.create_quote_draft(
  target_branch_id uuid, target_customer_id uuid, target_site_id uuid,
  expires_at timestamptz, commercial_terms text, quote_lines jsonb, operation_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  payload jsonb; payload_hash text; receipt public.command_receipts%rowtype;
  customer public.customers%rowtype; site public.customer_sites%rowtype;
  quote_id uuid; revision_id uuid; employee_id uuid; item jsonb; checked record; line_no integer := 0; total bigint := 0;
begin
  if not private.has_permission(target_branch_id, 'quotation.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(quote_lines) <> 'array' or jsonb_array_length(quote_lines) = 0 then raise exception 'quote_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'customer_id', target_customer_id, 'site_id', target_site_id, 'expires_at', expires_at, 'terms', commercial_terms, 'lines', quote_lines);
  payload_hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_quote_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_quote_draft' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into customer from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  select * into site from public.customer_sites where id = target_site_id and customer_id = target_customer_id and active;
  if customer.id is null or site.id is null then raise exception 'customer_or_site_invalid' using errcode = '23503'; end if;
  employee_id := private.current_employee_id();
  insert into public.quotations(branch_id, quotation_number, customer_id, site_id, sales_owner_employee_id, created_by)
  values (target_branch_id, 'QT-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.quotation_number_seq')::text, 6, '0'), target_customer_id, target_site_id, employee_id, (select auth.uid()))
  returning id into quote_id;
  insert into public.quotation_revisions(quotation_id, revision_number, customer_name_snapshot, site_name_snapshot,
    delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, commercial_terms, expires_at, created_by)
  values (quote_id, 1, customer.display_name, site.name, site.address_text, site.receiver_name, site.receiver_phone,
    commercial_terms, expires_at, (select auth.uid())) returning id into revision_id;
  for item in select value from jsonb_array_elements(quote_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(target_branch_id, target_customer_id, item, (select auth.uid()));
    insert into public.quotation_lines(revision_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (revision_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
    total := total + checked.line_total_vnd;
  end loop;
  update public.quotation_revisions set total_vnd = total where id = revision_id;
  update public.quotations set current_revision_id = revision_id where id = quote_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_quote_draft', payload_hash, 'quotation', quote_id, now());
  return quote_id;
end
$$;

create or replace function public.send_quote_revision(target_revision_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare revision public.quotation_revisions%rowtype; quote public.quotations%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select r.* into revision from public.quotation_revisions r where r.id = target_revision_id for update;
  select q.* into quote from public.quotations q where q.id = revision.quotation_id;
  if not private.has_permission(quote.branch_id, 'quotation.send') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('revision_id', target_revision_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = send_quote_revision.operation_id;
  if found then if receipt.command_name <> 'send_quote_revision' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if revision.state <> 'DRAFT' or revision.total_vnd <= 0 then raise exception 'quote_revision_not_sendable' using errcode = '23514'; end if;
  update public.quotation_revisions set state = 'SENT', sent_at = now() where id = target_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'send_quote_revision', hash, 'quotation_revision', target_revision_id, now());
  return target_revision_id;
end
$$;

create or replace function public.accept_quote_revision(
  target_revision_id uuid, acceptance_channel text, confirmed_by_name text, evidence_object_path text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare revision public.quotation_revisions%rowtype; quote public.quotations%rowtype; hash text; receipt public.command_receipts%rowtype; acceptance_id uuid;
begin
  select r.* into revision from public.quotation_revisions r where r.id = target_revision_id for update;
  select q.* into quote from public.quotations q where q.id = revision.quotation_id;
  if not (private.has_permission(quote.branch_id, 'quotation.accept') or private.has_customer_membership(quote.customer_id, array['OWNER','FINANCE_CONTACT'])) then raise exception 'forbidden' using errcode = '42501'; end if;
  if acceptance_channel not in ('PORTAL','PHONE','ZALO','EMAIL','OTHER') then raise exception 'invalid_acceptance_channel' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('revision_id', target_revision_id, 'channel', acceptance_channel, 'confirmed_by', confirmed_by_name, 'evidence', evidence_object_path));
  select * into receipt from public.command_receipts where command_receipts.operation_id = accept_quote_revision.operation_id;
  if found then if receipt.command_name <> 'accept_quote_revision' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if revision.state <> 'SENT' or (revision.expires_at is not null and revision.expires_at <= now()) then raise exception 'quote_revision_not_acceptable' using errcode = '23514'; end if;
  insert into public.quotation_acceptances(revision_id, channel, confirmed_by_name, accepted_by_auth_user_id, evidence_object_path)
  values (target_revision_id, acceptance_channel, confirmed_by_name, (select auth.uid()), evidence_object_path) returning id into acceptance_id;
  update public.quotation_revisions set state = 'ACCEPTED', accepted_at = now() where id = target_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'accept_quote_revision', hash, 'quotation_acceptance', acceptance_id, now());
  return acceptance_id;
end
$$;

create or replace function private.reserve_sales_order_credit(target_order_id uuid, actor_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; total bigint; limit_value bigint; exposure bigint; existing public.credit_commitments%rowtype; commitment_id uuid;
begin
  select * into order_row from public.sales_orders where id = target_order_id;
  if not found then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  select coalesce(sum(line_total_vnd), 0)::bigint into total from public.sales_order_lines where sales_order_id = target_order_id;
  select * into existing from public.credit_commitments where sales_order_id = target_order_id;
  if found then if existing.amount_vnd <> total then raise exception 'credit_commitment_payload_conflict' using errcode = '23505'; end if; return existing.id; end if;
  select credit_limit_vnd into limit_value from public.customers where id = order_row.customer_id and branch_id = order_row.branch_id and active for update;
  if not found or limit_value is null then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;
  if exists (select 1 from public.receivable_obligations o left join (select obligation_id, sum(amount_delta_vnd) delta from public.receivable_adjustments group by obligation_id) a on a.obligation_id = o.id where o.customer_id = order_row.customer_id and o.due_date < current_date and o.original_amount_vnd + coalesce(a.delta, 0) > 0) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;
  select coalesce(exposure_vnd, 0) into exposure from public.customer_credit_exposure where customer_id = order_row.customer_id;
  if exposure + total > limit_value then raise exception 'credit_limit_exceeded' using errcode = '23514'; end if;
  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, sales_order_id, amount_vnd, created_by)
  values (order_row.branch_id, order_row.customer_id, 'SALES_ORDER', target_order_id::text, target_order_id, total, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;
revoke all on function private.reserve_sales_order_credit(uuid, uuid) from public, anon, authenticated;

create or replace function public.confirm_sales_order(target_order_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; hash text; receipt public.command_receipts%rowtype; commitment_id uuid;
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not private.has_permission(order_row.branch_id, 'orders.confirm') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = confirm_sales_order.operation_id;
  if found then if receipt.command_name <> 'confirm_sales_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.commercial_state <> 'DRAFT' then raise exception 'sales_order_not_confirmable' using errcode = '23514'; end if;
  commitment_id := private.reserve_sales_order_credit(target_order_id, (select auth.uid()));
  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'confirm_sales_order', hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.confirm', 'sales_order', target_order_id, operation_id, array['commercial_state','credit_commitment']);
  return target_order_id;
end
$$;

create or replace function public.cancel_sales_order(target_order_id uuid, cancel_reason text, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not private.has_permission(order_row.branch_id, 'orders.cancel') then raise exception 'forbidden' using errcode = '42501'; end if;
  if cancel_reason is null or char_length(cancel_reason) < 3 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id, 'reason', cancel_reason));
  select * into receipt from public.command_receipts where command_receipts.operation_id = cancel_sales_order.operation_id;
  if found then if receipt.command_name <> 'cancel_sales_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.commercial_state not in ('DRAFT','CONFIRMED') then raise exception 'sales_order_not_cancellable' using errcode = '23514'; end if;
  perform 1 from public.customers where id = order_row.customer_id for update;
  update public.credit_commitments set released_vnd = amount_vnd - consumed_vnd where sales_order_id = target_order_id;
  update public.sales_orders set commercial_state = 'CANCELLED', cancelled_at = now() where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_sales_order', hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.cancel', 'sales_order', target_order_id, operation_id, array['commercial_state','credit_commitment'], cancel_reason);
  return target_order_id;
end
$$;

revoke all on function public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid) from public, anon;
revoke all on function public.create_quote_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid) from public, anon;
revoke all on function public.send_quote_revision(uuid, uuid) from public, anon;
revoke all on function public.accept_quote_revision(uuid, text, text, text, uuid) from public, anon;
revoke all on function public.confirm_sales_order(uuid, uuid) from public, anon;
revoke all on function public.cancel_sales_order(uuid, text, uuid) from public, anon;
grant execute on function public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid) to authenticated;
grant execute on function public.create_quote_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid) to authenticated;
grant execute on function public.send_quote_revision(uuid, uuid) to authenticated;
grant execute on function public.accept_quote_revision(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.confirm_sales_order(uuid, uuid) to authenticated;
grant execute on function public.cancel_sales_order(uuid, text, uuid) to authenticated;

create or replace function private.guard_quote_revision_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'quotation_revision_is_immutable' using errcode = '55000'; end if;
  if old.state <> 'DRAFT' and (to_jsonb(new) - array['state','accepted_at']::text[]) <> (to_jsonb(old) - array['state','accepted_at']::text[]) then
    raise exception 'sent_quotation_revision_is_immutable' using errcode = '55000';
  end if;
  if old.state = 'SENT' and new.state not in ('SENT','ACCEPTED','EXPIRED','SUPERSEDED','CANCELLED') then raise exception 'invalid_quote_transition' using errcode = '23514'; end if;
  if old.state in ('ACCEPTED','EXPIRED','SUPERSEDED','CANCELLED') and new.state not in (old.state, 'SUPERSEDED') then raise exception 'terminal_quote_transition' using errcode = '23514'; end if;
  return new;
end
$$;
create trigger quotation_revision_guard before update or delete on public.quotation_revisions for each row execute function private.guard_quote_revision_mutation();

create or replace function private.guard_quote_line_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare parent_state text;
begin
  select state into parent_state from public.quotation_revisions where id = coalesce(new.revision_id, old.revision_id);
  if parent_state <> 'DRAFT' then raise exception 'sent_quotation_lines_are_immutable' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
create trigger quotation_line_guard before update or delete on public.quotation_lines for each row execute function private.guard_quote_line_mutation();

insert into public.permissions(code, name) values
  ('quotation.read', 'Xem báo giá'), ('quotation.create', 'Tạo báo giá'),
  ('quotation.send', 'Gửi báo giá'), ('quotation.accept', 'Ghi nhận chấp nhận báo giá'),
  ('orders.cancel', 'Hủy phần đơn bán chưa thực hiện')
on conflict (code) do nothing;

alter table public.command_receipts enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_revisions enable row level security;
alter table public.quotation_lines enable row level security;
alter table public.quotation_acceptances enable row level security;
alter table public.quotation_pdf_artifacts enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

revoke all on table public.command_receipts, public.quotations, public.quotation_revisions, public.quotation_lines,
  public.quotation_acceptances, public.quotation_pdf_artifacts, public.sales_orders, public.sales_order_lines,
  public.quotation_read, public.sales_order_read from anon, authenticated;
grant select on table public.command_receipts, public.quotations, public.quotation_revisions, public.quotation_lines,
  public.quotation_acceptances, public.quotation_pdf_artifacts, public.sales_orders, public.sales_order_lines,
  public.quotation_read, public.sales_order_read to authenticated;

create policy command_receipts_select on public.command_receipts for select to authenticated using (actor_auth_user_id = (select auth.uid()));
create policy quotations_select on public.quotations for select to authenticated using ((select private.has_permission(branch_id, 'quotation.read')) or (select private.has_customer_membership(customer_id, null)));
create policy quotation_revisions_select on public.quotation_revisions for select to authenticated using (exists (select 1 from public.quotations q where q.id = quotation_id));
create policy quotation_lines_select on public.quotation_lines for select to authenticated using (exists (select 1 from public.quotation_revisions r join public.quotations q on q.id = r.quotation_id where r.id = revision_id));
create policy quotation_acceptances_select on public.quotation_acceptances for select to authenticated using (exists (select 1 from public.quotation_revisions r join public.quotations q on q.id = r.quotation_id where r.id = revision_id));
create policy quotation_artifacts_select on public.quotation_pdf_artifacts for select to authenticated using (exists (select 1 from public.quotation_revisions r join public.quotations q on q.id = r.quotation_id where r.id = revision_id));
create policy sales_orders_select on public.sales_orders for select to authenticated using ((select private.has_permission(branch_id, 'orders.read')) or (select private.has_customer_membership(customer_id, null)));
create policy sales_order_lines_select on public.sales_order_lines for select to authenticated using (exists (select 1 from public.sales_orders o where o.id = sales_order_id));

create or replace function public.create_quote_revision(source_revision_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source_revision public.quotation_revisions%rowtype; quote public.quotations%rowtype; hash text; receipt public.command_receipts%rowtype; new_revision_id uuid;
begin
  select * into source_revision from public.quotation_revisions where id = source_revision_id for update;
  select * into quote from public.quotations where id = source_revision.quotation_id for update;
  if not private.has_permission(quote.branch_id, 'quotation.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('source_revision_id', source_revision_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_quote_revision.operation_id;
  if found then if receipt.command_name <> 'create_quote_revision' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if quote.current_revision_id <> source_revision_id or source_revision.state not in ('SENT','ACCEPTED','EXPIRED') then raise exception 'revision_not_revisable' using errcode = '23514'; end if;
  update public.quotation_revisions set state = 'SUPERSEDED' where id = source_revision_id;
  insert into public.quotation_revisions(quotation_id, revision_number, customer_name_snapshot, site_name_snapshot,
    delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, commercial_terms, total_vnd,
    expires_at, supersedes_revision_id, created_by)
  values (source_revision.quotation_id, source_revision.revision_number + 1, source_revision.customer_name_snapshot,
    source_revision.site_name_snapshot, source_revision.delivery_address_snapshot, source_revision.receiver_name_snapshot,
    source_revision.receiver_phone_snapshot, source_revision.commercial_terms, source_revision.total_vnd,
    source_revision.expires_at, source_revision_id, (select auth.uid())) returning id into new_revision_id;
  insert into public.quotation_lines(revision_id, line_number, material_id, material_name_snapshot, ordered_uom_id,
    base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd,
    line_total_vnd, pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
  select new_revision_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
    conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
    pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason
  from public.quotation_lines where revision_id = source_revision_id;
  update public.quotations set current_revision_id = new_revision_id where id = source_revision.quotation_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_quote_revision', hash, 'quotation_revision', new_revision_id, now());
  return new_revision_id;
end
$$;

create or replace function public.create_sales_order_from_quote(
  source_revision_id uuid, requested_delivery_at timestamptz, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare revision public.quotation_revisions%rowtype; quote public.quotations%rowtype; hash text; receipt public.command_receipts%rowtype; order_id uuid; existing_id uuid;
begin
  select r.* into revision from public.quotation_revisions r where r.id = source_revision_id for update;
  select q.* into quote from public.quotations q where q.id = revision.quotation_id;
  if not private.has_permission(quote.branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('source_revision_id', source_revision_id, 'delivery_at', requested_delivery_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_sales_order_from_quote.operation_id;
  if found then if receipt.command_name <> 'create_sales_order_from_quote' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  select id into existing_id from public.sales_orders where quotation_revision_id = source_revision_id;
  if existing_id is not null then
    insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_sales_order_from_quote', hash, 'sales_order', existing_id, now());
    return existing_id;
  end if;
  if revision.state <> 'ACCEPTED' then raise exception 'quote_revision_not_accepted' using errcode = '23514'; end if;
  insert into public.sales_orders(branch_id, order_number, customer_id, site_id, quotation_revision_id,
    sales_owner_employee_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot,
    receiver_name_snapshot, receiver_phone_snapshot, requested_delivery_at, commercial_terms, created_by)
  values (quote.branch_id, 'SO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0'),
    quote.customer_id, quote.site_id, source_revision_id, quote.sales_owner_employee_id, revision.customer_name_snapshot,
    revision.site_name_snapshot, revision.delivery_address_snapshot, revision.receiver_name_snapshot,
    revision.receiver_phone_snapshot, requested_delivery_at, revision.commercial_terms, (select auth.uid()))
  returning id into order_id;
  insert into public.sales_order_lines(sales_order_id, quotation_line_id, line_number, material_id, material_name_snapshot,
    ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode,
    unit_price_vnd, line_total_vnd, pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
  select order_id, id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
    conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
    pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason
  from public.quotation_lines where revision_id = source_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_sales_order_from_quote', hash, 'sales_order', order_id, now());
  return order_id;
end
$$;

revoke all on function public.create_quote_revision(uuid, uuid) from public, anon;
revoke all on function public.create_sales_order_from_quote(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.create_quote_revision(uuid, uuid) to authenticated;
grant execute on function public.create_sales_order_from_quote(uuid, timestamptz, uuid) to authenticated;
