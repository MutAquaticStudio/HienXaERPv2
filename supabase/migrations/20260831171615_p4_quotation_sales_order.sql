-- HIỀN XA ERP P4 — Quotation and Sales Order.
-- Sent/accepted quote revisions and order snapshots are immutable.
-- Confirming a Sales Order creates fulfillment requirements and credit exposure,
-- never a receivable or AR ledger entry.

create type public.quotation_status as enum (
  'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'
);

create type public.quotation_revision_status as enum (
  'DRAFT', 'SENT', 'ACCEPTED', 'SUPERSEDED'
);

create type public.price_safety_status as enum (
  'RULE_MATCH', 'ABOVE_RULE', 'APPROVED_OVERRIDE'
);

create type public.sales_order_status as enum (
  'DRAFT', 'CREDIT_BLOCKED', 'CONFIRMED', 'FULFILLING', 'COMPLETED', 'CANCELLED'
);

create type public.sales_order_credit_status as enum (
  'PENDING', 'CLEAR', 'OVERRIDDEN', 'BLOCKED'
);

create type public.fulfillment_requirement_status as enum (
  'PENDING_READINESS', 'READY', 'ALLOCATED', 'CANCELLED'
);

create sequence public.quotation_number_seq start 1;
create sequence public.sales_order_number_seq start 1;
revoke all on sequence public.quotation_number_seq from anon, authenticated;
revoke all on sequence public.sales_order_number_seq from anon, authenticated;

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique
    check (quotation_number = upper(trim(quotation_number))
      and char_length(quotation_number) between 4 and 40),
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_site_id uuid references public.customer_sites(id) on delete restrict,
  status public.quotation_status not null default 'DRAFT',
  active_revision_id uuid,
  owner_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotations_customer_idx on public.quotations(customer_id, created_at desc);
create index quotations_site_idx on public.quotations(customer_site_id)
  where customer_site_id is not null;
create index quotations_owner_idx on public.quotations(owner_user_id, status);
create index quotations_created_by_idx on public.quotations(created_by);

create table public.quotation_revisions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  status public.quotation_revision_status not null default 'DRAFT',
  valid_until date not null,
  currency text not null default 'VND'
    check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  subtotal_amount numeric(20, 2) not null default 0 check (subtotal_amount >= 0),
  total_amount numeric(20, 2) not null default 0 check (total_amount >= 0),
  notes text check (notes is null or char_length(trim(notes)) between 3 and 500),
  sent_at timestamptz,
  accepted_at timestamptz,
  locked_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quotation_id, revision_number),
  constraint quotation_revision_lock_state check (
    (status = 'DRAFT' and locked_at is null and sent_at is null and accepted_at is null)
    or (status = 'SENT' and locked_at is not null and sent_at is not null and accepted_at is null)
    or (status = 'ACCEPTED' and locked_at is not null and sent_at is not null and accepted_at is not null)
    or (status = 'SUPERSEDED' and locked_at is not null and sent_at is not null)
  )
);

alter table public.quotations
  add constraint quotations_active_revision_fk
  foreign key (active_revision_id) references public.quotation_revisions(id) on delete restrict;

create index quotation_revisions_quote_idx
  on public.quotation_revisions(quotation_id, revision_number desc);
create index quotation_revisions_status_idx
  on public.quotation_revisions(status, valid_until);
create index quotation_revisions_created_by_idx
  on public.quotation_revisions(created_by);
create index quotations_active_revision_idx
  on public.quotations(active_revision_id) where active_revision_id is not null;

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.quotation_revisions(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  quantity numeric(20, 6) not null check (quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  uom_snapshot jsonb not null,
  price_rule_id uuid not null references public.customer_price_rules(id) on delete restrict,
  price_snapshot_id uuid not null references public.selling_price_snapshots(id) on delete restrict,
  reference_unit_price numeric(20, 2) not null check (reference_unit_price > 0),
  unit_price numeric(20, 2) not null check (unit_price > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  line_amount numeric(20, 2) generated always as (round(quantity * unit_price, 2)) stored,
  price_safety_status public.price_safety_status not null,
  price_override_reason text,
  price_approved_by uuid references public.user_profiles(user_id) on delete restrict,
  price_approved_at timestamptz,
  price_refreshed_at timestamptz not null default now(),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (revision_id, line_number),
  constraint quotation_line_price_approval check (
    (
      price_safety_status in ('RULE_MATCH', 'ABOVE_RULE')
      and price_override_reason is null
      and price_approved_by is null
      and price_approved_at is null
    )
    or (
      price_safety_status = 'APPROVED_OVERRIDE'
      and unit_price < reference_unit_price
      and char_length(trim(price_override_reason)) between 10 and 500
      and price_approved_by is not null
      and price_approved_at is not null
    )
  )
);

create index quotation_lines_revision_idx on public.quotation_lines(revision_id, line_number);
create index quotation_lines_material_idx on public.quotation_lines(material_id);
create index quotation_lines_uom_idx on public.quotation_lines(uom_id);
create index quotation_lines_price_rule_idx on public.quotation_lines(price_rule_id);
create index quotation_lines_price_snapshot_idx on public.quotation_lines(price_snapshot_id);
create index quotation_lines_price_approved_by_idx on public.quotation_lines(price_approved_by)
  where price_approved_by is not null;
create index quotation_lines_created_by_idx on public.quotation_lines(created_by);

create table public.price_approval_events (
  id uuid primary key default gen_random_uuid(),
  quotation_line_id uuid not null references public.quotation_lines(id) on delete restrict,
  reference_unit_price numeric(20, 2) not null check (reference_unit_price > 0),
  approved_unit_price numeric(20, 2) not null check (approved_unit_price > 0),
  discount_percent numeric(7, 4) not null check (discount_percent >= 0),
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  approved_by uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz not null default now()
);

create index price_approval_events_line_idx
  on public.price_approval_events(quotation_line_id, approved_at desc);
create index price_approval_events_actor_idx
  on public.price_approval_events(approved_by, approved_at desc);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  sales_order_number text not null unique
    check (sales_order_number = upper(trim(sales_order_number))
      and char_length(sales_order_number) between 4 and 40),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  quotation_revision_id uuid not null unique
    references public.quotation_revisions(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_code_snapshot text not null,
  customer_name_snapshot text not null,
  customer_site_id uuid references public.customer_sites(id) on delete restrict,
  customer_site_name_snapshot text,
  status public.sales_order_status not null default 'DRAFT',
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  total_amount numeric(20, 2) not null check (total_amount > 0),
  credit_status public.sales_order_credit_status not null default 'PENDING',
  credit_decision_snapshot jsonb,
  confirmed_by uuid references public.user_profiles(user_id) on delete restrict,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_order_confirmation_state check (
    (status in ('DRAFT', 'CREDIT_BLOCKED') and confirmed_by is null and confirmed_at is null)
    or (status in ('CONFIRMED', 'FULFILLING', 'COMPLETED')
      and confirmed_by is not null and confirmed_at is not null)
    or (status = 'CANCELLED')
  )
);

create index sales_orders_customer_idx on public.sales_orders(customer_id, created_at desc);
create index sales_orders_site_idx on public.sales_orders(customer_site_id)
  where customer_site_id is not null;
create index sales_orders_status_idx on public.sales_orders(status, created_at desc);
create index sales_orders_quotation_idx on public.sales_orders(quotation_id);
create index sales_orders_confirmed_by_idx on public.sales_orders(confirmed_by)
  where confirmed_by is not null;
create index sales_orders_created_by_idx on public.sales_orders(created_by);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  source_quotation_line_id uuid not null unique
    references public.quotation_lines(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  ordered_quantity numeric(20, 6) not null check (ordered_quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  uom_snapshot jsonb not null,
  price_rule_id uuid not null references public.customer_price_rules(id) on delete restrict,
  price_snapshot_id uuid not null references public.selling_price_snapshots(id) on delete restrict,
  reference_unit_price numeric(20, 2) not null check (reference_unit_price > 0),
  unit_price numeric(20, 2) not null check (unit_price > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  line_amount numeric(20, 2) not null check (line_amount > 0),
  price_safety_status public.price_safety_status not null,
  created_at timestamptz not null default now(),
  unique (sales_order_id, line_number)
);

create index sales_order_lines_order_idx on public.sales_order_lines(sales_order_id, line_number);
create index sales_order_lines_material_idx on public.sales_order_lines(material_id);
create index sales_order_lines_uom_idx on public.sales_order_lines(uom_id);
create index sales_order_lines_price_rule_idx on public.sales_order_lines(price_rule_id);
create index sales_order_lines_price_snapshot_idx on public.sales_order_lines(price_snapshot_id);

create table public.sales_order_state_transitions (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  from_status public.sales_order_status not null,
  to_status public.sales_order_status not null,
  reason text check (reason is null or char_length(trim(reason)) between 5 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now(),
  check (from_status <> to_status)
);

create index sales_order_state_transitions_order_idx
  on public.sales_order_state_transitions(sales_order_id, occurred_at desc);
create index sales_order_state_transitions_actor_idx
  on public.sales_order_state_transitions(actor_user_id, occurred_at desc);

create table public.fulfillment_requirements (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  sales_order_line_id uuid not null unique
    references public.sales_order_lines(id) on delete restrict,
  requirement_type text not null default 'MATERIAL_DELIVERY'
    check (requirement_type = 'MATERIAL_DELIVERY'),
  status public.fulfillment_requirement_status not null default 'PENDING_READINESS',
  required_quantity numeric(20, 6) not null check (required_quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  customer_site_id uuid references public.customer_sites(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fulfillment_requirements_order_idx
  on public.fulfillment_requirements(sales_order_id, status);
create index fulfillment_requirements_uom_idx on public.fulfillment_requirements(uom_id);
create index fulfillment_requirements_site_idx on public.fulfillment_requirements(customer_site_id)
  where customer_site_id is not null;

create trigger quotations_updated_at
before update on public.quotations
for each row execute function app_private.set_master_updated_at();
create trigger sales_orders_updated_at
before update on public.sales_orders
for each row execute function app_private.set_master_updated_at();
create trigger fulfillment_requirements_updated_at
before update on public.fulfillment_requirements
for each row execute function app_private.set_master_updated_at();

create or replace function app_private.guard_quotation_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'DRAFT' then
    if new.status not in ('DRAFT', 'SENT') then
      raise exception 'INVALID_QUOTATION_REVISION_TRANSITION' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'SENT'
    and new.status in ('ACCEPTED', 'SUPERSEDED')
    and new.quotation_id = old.quotation_id
    and new.revision_number = old.revision_number
    and new.valid_until = old.valid_until
    and new.currency = old.currency
    and new.subtotal_amount = old.subtotal_amount
    and new.total_amount = old.total_amount
    and new.notes is not distinct from old.notes
    and new.sent_at = old.sent_at
    and new.locked_at = old.locked_at
    and new.created_by = old.created_by
    and new.created_at = old.created_at
  then
    return new;
  end if;

  raise exception 'QUOTATION_REVISION_LOCKED' using errcode = '22000';
end;
$$;

create trigger quotation_revisions_guard
before update on public.quotation_revisions
for each row execute function app_private.guard_quotation_revision();
create trigger quotation_revisions_no_delete
before delete on public.quotation_revisions
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_quotation_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_revision_id uuid;
  target_status public.quotation_revision_status;
begin
  target_revision_id := case when tg_op = 'DELETE' then old.revision_id else new.revision_id end;
  select status into target_status
  from public.quotation_revisions
  where id = target_revision_id
  for update;
  if target_status is distinct from 'DRAFT' then
    raise exception 'QUOTATION_REVISION_LOCKED' using errcode = '22000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger quotation_lines_guard_locked_revision
before insert or update or delete on public.quotation_lines
for each row execute function app_private.guard_quotation_line();

create or replace function app_private.recalculate_quotation_totals()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_revision_id uuid;
begin
  if tg_op = 'DELETE' then
    target_revision_id := old.revision_id;
  else
    target_revision_id := new.revision_id;
  end if;
  update public.quotation_revisions
  set subtotal_amount = coalesce((
        select sum(line_amount) from public.quotation_lines where revision_id = target_revision_id
      ), 0),
      total_amount = coalesce((
        select sum(line_amount) from public.quotation_lines where revision_id = target_revision_id
      ), 0)
  where id = target_revision_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger quotation_lines_recalculate_totals
after insert or update or delete on public.quotation_lines
for each row execute function app_private.recalculate_quotation_totals();

create trigger price_approval_events_no_update_or_delete
before update or delete on public.price_approval_events
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_sales_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if new.sales_order_number <> old.sales_order_number
    or new.quotation_id <> old.quotation_id
    or new.quotation_revision_id <> old.quotation_revision_id
    or new.customer_id <> old.customer_id
    or new.customer_code_snapshot <> old.customer_code_snapshot
    or new.customer_name_snapshot <> old.customer_name_snapshot
    or new.customer_site_id is distinct from old.customer_site_id
    or new.customer_site_name_snapshot is distinct from old.customer_site_name_snapshot
    or new.currency <> old.currency
    or new.total_amount <> old.total_amount
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  then
    raise exception 'SALES_ORDER_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;

  allowed :=
    (old.status = 'DRAFT' and new.status in ('CREDIT_BLOCKED', 'CONFIRMED', 'CANCELLED'))
    or (old.status = 'CREDIT_BLOCKED' and new.status in ('CONFIRMED', 'CANCELLED'))
    or (old.status = 'CONFIRMED' and new.status in ('FULFILLING', 'CANCELLED'))
    or (old.status = 'FULFILLING' and new.status in ('COMPLETED', 'CANCELLED'));
  if old.status <> new.status and not allowed then
    raise exception 'INVALID_SALES_ORDER_TRANSITION' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger sales_orders_guard_update
before update on public.sales_orders
for each row execute function app_private.guard_sales_order_update();
create trigger sales_orders_no_delete
before delete on public.sales_orders
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.reject_sales_order_line_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SALES_ORDER_LINE_IMMUTABLE' using errcode = '22000';
end;
$$;

create trigger sales_order_lines_no_update_or_delete
before update or delete on public.sales_order_lines
for each row execute function app_private.reject_sales_order_line_change();
create trigger sales_order_state_transitions_no_update_or_delete
before update or delete on public.sales_order_state_transitions
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.confirm_sales_order(
  p_sales_order_id uuid,
  p_actor_id uuid,
  p_credit_override_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order public.sales_orders%rowtype;
  exposure public.customer_credit_exposures%rowtype;
  policy public.customer_credit_policies%rowtype;
  projected numeric(20, 2);
  blocked boolean := false;
  reasons jsonb := '[]'::jsonb;
  credit_result public.sales_order_credit_status;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'sales_order.confirm');

  select * into target_order
  from public.sales_orders
  where id = p_sales_order_id
  for update;
  if target_order.id is null then
    raise exception 'SALES_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_order.status not in ('DRAFT', 'CREDIT_BLOCKED') then
    raise exception 'SALES_ORDER_NOT_CONFIRMABLE' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.sales_order_lines where sales_order_id = target_order.id
  ) then
    raise exception 'SALES_ORDER_HAS_NO_LINES' using errcode = '23514';
  end if;

  select * into exposure
  from public.customer_credit_exposures
  where customer_id = target_order.customer_id
  for update;
  if exposure.customer_id is null then
    exposure.customer_id := target_order.customer_id;
    exposure.receivable_amount := 0;
    exposure.uninvoiced_order_amount := 0;
    exposure.overdue_amount := 0;
    exposure.oldest_overdue_days := 0;
    exposure.customer_advance_amount := 0;
  end if;

  select * into policy
  from public.customer_credit_policies
  where customer_id = target_order.customer_id
    and current_date between valid_from and coalesce(valid_to, 'infinity'::date)
  order by version desc
  limit 1;

  projected := greatest(
    exposure.receivable_amount
      + exposure.uninvoiced_order_amount
      + target_order.total_amount
      - exposure.customer_advance_amount,
    0
  );

  if policy.id is null then
    blocked := true;
    reasons := reasons || jsonb_build_array('Khách hàng chưa có chính sách tín dụng hiệu lực.');
  else
    if projected > policy.credit_limit then
      blocked := true;
      reasons := reasons || jsonb_build_array('Dư nợ dự kiến vượt hạn mức tín dụng.');
    end if;
    if exposure.overdue_amount > 0
      and exposure.oldest_overdue_days > policy.allowed_overdue_days
    then
      blocked := true;
      reasons := reasons || jsonb_build_array('Khách hàng có khoản quá hạn vượt số ngày cho phép.');
    end if;
  end if;

  if blocked then
    perform app_private.assert_actor_permission(p_actor_id, 'customer_credit.override');
    if p_credit_override_reason is null
      or char_length(trim(p_credit_override_reason)) not between 10 and 500
    then
      raise exception 'CREDIT_OVERRIDE_REASON_REQUIRED' using errcode = '23514';
    end if;
    insert into public.customer_credit_override_events (
      customer_id, policy_id, order_amount, reason, exposure_snapshot, approved_by
    ) values (
      target_order.customer_id,
      policy.id,
      target_order.total_amount,
      trim(p_credit_override_reason),
      jsonb_build_object(
        'sales_order_id', target_order.id,
        'receivable_amount', exposure.receivable_amount,
        'uninvoiced_order_amount', exposure.uninvoiced_order_amount,
        'customer_advance_amount', exposure.customer_advance_amount,
        'projected_exposure', projected,
        'reasons', reasons
      ),
      p_actor_id
    );
    credit_result := 'OVERRIDDEN';
  else
    credit_result := 'CLEAR';
  end if;

  update public.sales_orders
  set status = 'CONFIRMED',
      credit_status = credit_result,
      credit_decision_snapshot = jsonb_build_object(
        'status', case when blocked then 'BLOCKED' else 'CLEAR' end,
        'policy_id', policy.id,
        'projected_exposure', projected,
        'available_credit', greatest(coalesce(policy.credit_limit, 0) - projected, 0),
        'reasons', reasons,
        'override_reason', case when blocked then trim(p_credit_override_reason) else null end
      ),
      confirmed_by = p_actor_id,
      confirmed_at = now()
  where id = target_order.id;

  insert into public.sales_order_state_transitions (
    sales_order_id, from_status, to_status, reason, actor_user_id
  ) values (
    target_order.id,
    target_order.status,
    'CONFIRMED',
    case when blocked then 'Xác nhận với phê duyệt vượt chặn tín dụng.' else 'Đạt kiểm tra tín dụng.' end,
    p_actor_id
  );

  insert into public.customer_credit_exposures (
    customer_id, receivable_amount, uninvoiced_order_amount, overdue_amount,
    oldest_overdue_days, customer_advance_amount, calculated_at
  ) values (
    target_order.customer_id,
    exposure.receivable_amount,
    exposure.uninvoiced_order_amount + target_order.total_amount,
    exposure.overdue_amount,
    exposure.oldest_overdue_days,
    exposure.customer_advance_amount,
    now()
  )
  on conflict (customer_id) do update
  set uninvoiced_order_amount = public.customer_credit_exposures.uninvoiced_order_amount
        + target_order.total_amount,
      calculated_at = now();

  insert into public.fulfillment_requirements (
    sales_order_id, sales_order_line_id, required_quantity, uom_id,
    uom_symbol_snapshot, customer_site_id
  )
  select line.sales_order_id, line.id, line.ordered_quantity, line.uom_id,
    line.uom_symbol_snapshot, target_order.customer_site_id
  from public.sales_order_lines as line
  where line.sales_order_id = target_order.id
  on conflict (sales_order_line_id) do nothing;

  insert into public.customer_timeline_events (
    customer_id, event_type, title, detail, source_entity_type,
    source_entity_id, actor_user_id
  ) values (
    target_order.customer_id,
    'SALES_ORDER_CONFIRMED',
    'Đã xác nhận đơn bán ' || target_order.sales_order_number,
    'Đã tạo yêu cầu thực hiện; chưa phát sinh công nợ khách hàng.',
    'sales_order',
    target_order.id,
    p_actor_id
  );

  return jsonb_build_object(
    'sales_order_id', target_order.id,
    'status', 'CONFIRMED',
    'credit_status', credit_result,
    'projected_exposure', projected
  );
end;
$$;

revoke all on function app_private.guard_quotation_revision() from public;
revoke all on function app_private.guard_quotation_line() from public;
revoke all on function app_private.recalculate_quotation_totals() from public;
revoke all on function app_private.guard_sales_order_update() from public;
revoke all on function app_private.reject_sales_order_line_change() from public;
revoke all on function app_private.confirm_sales_order(uuid, uuid, text)
  from public, anon, authenticated;

alter table public.quotations enable row level security;
alter table public.quotation_revisions enable row level security;
alter table public.quotation_lines enable row level security;
alter table public.price_approval_events enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.sales_order_state_transitions enable row level security;
alter table public.fulfillment_requirements enable row level security;

revoke all on public.quotations from anon, authenticated;
revoke all on public.quotation_revisions from anon, authenticated;
revoke all on public.quotation_lines from anon, authenticated;
revoke all on public.price_approval_events from anon, authenticated;
revoke all on public.sales_orders from anon, authenticated;
revoke all on public.sales_order_lines from anon, authenticated;
revoke all on public.sales_order_state_transitions from anon, authenticated;
revoke all on public.fulfillment_requirements from anon, authenticated;

grant select on public.quotations to authenticated;
grant select on public.quotation_revisions to authenticated;
grant select on public.quotation_lines to authenticated;
grant select on public.price_approval_events to authenticated;
grant select on public.sales_orders to authenticated;
grant select on public.sales_order_lines to authenticated;
grant select on public.sales_order_state_transitions to authenticated;
grant select on public.fulfillment_requirements to authenticated;

create policy quotations_read_authorized
on public.quotations for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('quotation.read'))
    or (select app_private.has_permission('quotation.create'))
    or (select app_private.has_permission('quotation.send'))
  )
);
create policy quotation_revisions_read_authorized
on public.quotation_revisions for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('quotation.read'))
    or (select app_private.has_permission('quotation.create'))
    or (select app_private.has_permission('quotation.send'))
  )
);
create policy quotation_lines_read_authorized
on public.quotation_lines for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('quotation.read'))
    or (select app_private.has_permission('quotation.create'))
    or (select app_private.has_permission('quotation.send'))
  )
);
create policy price_approval_events_read_authorized
on public.price_approval_events for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('quotation.read'))
    or (select app_private.has_permission('price.override'))
    or (select app_private.has_permission('audit.view'))
  )
);
create policy sales_orders_read_authorized
on public.sales_orders for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('sales_order.read'))
    or (select app_private.has_permission('sales_order.create'))
    or (select app_private.has_permission('sales_order.confirm'))
  )
);
create policy sales_order_lines_read_authorized
on public.sales_order_lines for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('sales_order.read'))
    or (select app_private.has_permission('sales_order.create'))
    or (select app_private.has_permission('sales_order.confirm'))
  )
);
create policy sales_order_state_transitions_read_authorized
on public.sales_order_state_transitions for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('sales_order.read'))
    or (select app_private.has_permission('audit.view'))
  )
);
create policy fulfillment_requirements_read_authorized
on public.fulfillment_requirements for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (select app_private.has_permission('sales_order.read'))
    or (select app_private.has_permission('sales_order.confirm'))
  )
);

insert into public.permissions (code, description_vi) values
  ('quotation.read', 'Xem báo giá và lịch sử phiên bản'),
  ('quotation.create', 'Tạo báo giá, revision và dòng vật liệu'),
  ('quotation.send', 'Gửi và khóa phiên bản báo giá'),
  ('quotation.accept', 'Ghi nhận khách chấp nhận báo giá'),
  ('sales_order.read', 'Xem đơn bán và yêu cầu thực hiện'),
  ('sales_order.create', 'Chuyển báo giá đã chấp nhận thành đơn bán'),
  ('sales_order.confirm', 'Xác nhận đơn bán sau kiểm tra giá và tín dụng'),
  ('price.override', 'Phê duyệt giá bán thấp hơn quy tắc có lý do')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'quotation.read', 'quotation.create', 'quotation.send', 'quotation.accept',
  'sales_order.read', 'sales_order.create', 'sales_order.confirm', 'price.override'
)
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'quotation.read', 'quotation.create', 'quotation.send', 'quotation.accept',
  'sales_order.read', 'sales_order.create', 'sales_order.confirm'
)
where role.code = 'SALES'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'quotation.read', 'quotation.create', 'quotation.send', 'quotation.accept',
  'sales_order.read', 'sales_order.create', 'sales_order.confirm', 'price.override'
)
where role.code = 'SUPERVISOR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'quotation.read', 'sales_order.read', 'sales_order.confirm'
)
where role.code = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'quotation.read', 'sales_order.read'
)
where role.code = 'AUDITOR_VIEWER'
on conflict do nothing;
