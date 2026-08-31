-- HIỀN XA ERP P7 — dispatch, delivery and proof of delivery.
-- Delivery is a server-controlled workflow. Browser clients receive read-only
-- projections; every state mutation is serialized in app_private functions.

create type public.delivery_status as enum (
  'PLANNED', 'ASSIGNED', 'DISPATCHED', 'ARRIVED', 'DELIVERED',
  'CONFIRMED', 'PARTIAL', 'FAILED', 'CANCELLED'
);

create type public.delivery_assignment_status as enum (
  'ASSIGNED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'
);

create type public.delivery_proof_type as enum (
  'PHOTO', 'DOCUMENT', 'LOCATION', 'SIGNATURE'
);

create sequence public.delivery_number_seq;
create sequence public.delivery_assignment_number_seq;
create sequence public.delivery_readiness_event_seq;
revoke all on sequence public.delivery_number_seq from anon, authenticated;
revoke all on sequence public.delivery_assignment_number_seq from anon, authenticated;
revoke all on sequence public.delivery_readiness_event_seq from anon, authenticated;

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_number text not null unique,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_code_snapshot text not null,
  customer_name_snapshot text not null,
  customer_site_id uuid references public.customer_sites(id) on delete restrict,
  customer_site_name_snapshot text,
  sourcing_mode public.sourcing_mode not null,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  pickup_address_snapshot text not null check (char_length(trim(pickup_address_snapshot)) between 5 and 500),
  drop_address_snapshot text not null check (char_length(trim(drop_address_snapshot)) between 5 and 500),
  scheduled_date date not null,
  status public.delivery_status not null default 'PLANNED',
  failure_reason text check (failure_reason is null or char_length(trim(failure_reason)) between 10 and 500),
  cancellation_reason text check (cancellation_reason is null or char_length(trim(cancellation_reason)) between 10 and 500),
  dispatched_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.user_profiles(user_id) on delete restrict,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_route_shape check (
    (sourcing_mode = 'WAREHOUSE' and warehouse_id is not null and supplier_id is null)
    or (sourcing_mode = 'SUPPLIER_DIRECT' and warehouse_id is null and supplier_id is not null)
    or (sourcing_mode = 'SUPPLIER_TO_WAREHOUSE' and warehouse_id is not null and supplier_id is not null)
  ),
  constraint delivery_terminal_shape check (
    (status = 'FAILED' and failure_reason is not null)
    or (status = 'CANCELLED' and cancellation_reason is not null)
    or (status in ('CONFIRMED', 'PARTIAL') and confirmed_at is not null and confirmed_by is not null)
    or status in ('PLANNED', 'ASSIGNED', 'DISPATCHED', 'ARRIVED', 'DELIVERED')
  )
);

create index deliveries_board_idx on public.deliveries(status, scheduled_date, created_at);
create index deliveries_order_idx on public.deliveries(sales_order_id, created_at desc);
create index deliveries_route_idx on public.deliveries(warehouse_id, supplier_id);

create table public.delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  supply_allocation_id uuid not null unique references public.supply_allocations(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  stock_reservation_id uuid references public.stock_reservations(id) on delete restrict,
  warehouse_issue_id uuid references public.warehouse_issues(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code_snapshot text not null,
  material_name_snapshot text not null,
  planned_quantity numeric(20, 6) not null check (planned_quantity > 0),
  uom_id uuid not null references public.uom_catalog(id) on delete restrict,
  uom_symbol_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (delivery_id, line_number)
);

create index delivery_lines_delivery_idx on public.delivery_lines(delivery_id, line_number);
create index delivery_lines_sales_line_idx on public.delivery_lines(sales_order_line_id);

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_number text not null unique,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  status public.delivery_assignment_status not null default 'ASSIGNED',
  assigned_by uuid not null references public.user_profiles(user_id) on delete restrict,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

create unique index delivery_assignments_active_delivery_idx
  on public.delivery_assignments(delivery_id)
  where status in ('ASSIGNED', 'ACCEPTED');
create index delivery_assignments_driver_idx
  on public.delivery_assignments(driver_user_id, status, assigned_at desc);

create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  proof_type public.delivery_proof_type not null,
  evidence_id uuid references public.evidence(id) on delete restrict,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  receiver_name text check (receiver_name is null or char_length(trim(receiver_name)) between 2 and 120),
  captured_by uuid not null references public.user_profiles(user_id) on delete restrict,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint delivery_proof_shape check (
    (proof_type in ('PHOTO', 'DOCUMENT', 'SIGNATURE') and evidence_id is not null)
    or (proof_type = 'LOCATION' and latitude between -90 and 90 and longitude between -180 and 180)
  )
);

create index delivery_proofs_delivery_idx on public.delivery_proofs(delivery_id, captured_at desc);

create table public.delivery_actuals (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  delivery_line_id uuid not null unique references public.delivery_lines(id) on delete restrict,
  actual_quantity numeric(20, 6) not null check (actual_quantity >= 0),
  accepted_quantity numeric(20, 6) not null check (accepted_quantity >= 0),
  receiver_name text not null check (char_length(trim(receiver_name)) between 2 and 120),
  received_at timestamptz not null,
  recorded_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint delivery_actual_quantity_chain check (accepted_quantity <= actual_quantity)
);

create index delivery_actuals_delivery_idx on public.delivery_actuals(delivery_id);

create table public.delivery_variances (
  id uuid primary key default gen_random_uuid(),
  delivery_actual_id uuid not null unique references public.delivery_actuals(id) on delete restrict,
  delivery_line_id uuid not null references public.delivery_lines(id) on delete restrict,
  planned_actual_variance numeric(20, 6) not null,
  actual_accepted_variance numeric(20, 6) not null,
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  created_at timestamptz not null default now()
);

create table public.delivery_state_transitions (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  from_status public.delivery_status not null,
  to_status public.delivery_status not null,
  reason text check (reason is null or char_length(trim(reason)) between 10 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now(),
  check (from_status <> to_status)
);

create index delivery_transitions_delivery_idx
  on public.delivery_state_transitions(delivery_id, occurred_at desc);

-- P10 consumes this immutable outbox seam. P7 does not create claimable work.
create table public.delivery_readiness_events (
  id uuid primary key default gen_random_uuid(),
  event_number text not null unique,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  event_type text not null check (event_type in ('DELIVERY_READY', 'DELIVERY_NOT_READY', 'DELIVERY_COMPLETED')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (delivery_id, event_type)
);

create index delivery_readiness_events_created_idx on public.delivery_readiness_events(created_at);

create trigger deliveries_updated_at before update on public.deliveries
for each row execute function app_private.touch_updated_at();

create or replace function app_private.guard_delivery_line_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.delivery_id is distinct from old.delivery_id
    or new.line_number is distinct from old.line_number
    or new.supply_allocation_id is distinct from old.supply_allocation_id
    or new.sales_order_line_id is distinct from old.sales_order_line_id
    or new.stock_reservation_id is distinct from old.stock_reservation_id
    or new.material_id is distinct from old.material_id
    or new.material_code_snapshot is distinct from old.material_code_snapshot
    or new.material_name_snapshot is distinct from old.material_name_snapshot
    or new.planned_quantity is distinct from old.planned_quantity
    or new.uom_id is distinct from old.uom_id
    or new.uom_symbol_snapshot is distinct from old.uom_symbol_snapshot
    or new.created_at is distinct from old.created_at
    or old.warehouse_issue_id is not null
    or new.warehouse_issue_id is null
  then raise exception 'DELIVERY_LINE_SNAPSHOT_IMMUTABLE' using errcode = '22000'; end if;
  return new;
end;
$$;
create trigger delivery_lines_guard_update before update on public.delivery_lines
for each row execute function app_private.guard_delivery_line_update();
create trigger delivery_lines_no_delete before delete on public.delivery_lines
for each row execute function app_private.prevent_immutable_delete();
create trigger delivery_proofs_no_update_or_delete before update or delete on public.delivery_proofs
for each row execute function app_private.prevent_immutable_delete();
create trigger delivery_actuals_no_update_or_delete before update or delete on public.delivery_actuals
for each row execute function app_private.prevent_immutable_delete();
create trigger delivery_variances_no_update_or_delete before update or delete on public.delivery_variances
for each row execute function app_private.prevent_immutable_delete();
create trigger delivery_transitions_no_update_or_delete before update or delete on public.delivery_state_transitions
for each row execute function app_private.prevent_immutable_delete();
create trigger delivery_readiness_no_update_or_delete before update or delete on public.delivery_readiness_events
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.guard_delivery_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.delivery_number is distinct from old.delivery_number
    or new.sales_order_id is distinct from old.sales_order_id
    or new.customer_id is distinct from old.customer_id
    or new.customer_code_snapshot is distinct from old.customer_code_snapshot
    or new.customer_name_snapshot is distinct from old.customer_name_snapshot
    or new.customer_site_id is distinct from old.customer_site_id
    or new.customer_site_name_snapshot is distinct from old.customer_site_name_snapshot
    or new.sourcing_mode is distinct from old.sourcing_mode
    or new.warehouse_id is distinct from old.warehouse_id
    or new.supplier_id is distinct from old.supplier_id
    or new.pickup_address_snapshot is distinct from old.pickup_address_snapshot
    or new.drop_address_snapshot is distinct from old.drop_address_snapshot
    or new.scheduled_date is distinct from old.scheduled_date
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'DELIVERY_SNAPSHOT_IMMUTABLE' using errcode = '22000';
  end if;
  if old.status in ('CONFIRMED', 'PARTIAL', 'FAILED', 'CANCELLED')
    and new.status is distinct from old.status
  then
    raise exception 'DELIVERY_TERMINAL' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger deliveries_guard_update before update on public.deliveries
for each row execute function app_private.guard_delivery_update();
create trigger deliveries_no_delete before delete on public.deliveries
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.actor_has_permission(
  p_actor_id uuid, p_permission text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_profiles profile
    join public.user_roles user_role on user_role.user_id = profile.user_id
    join public.role_permissions role_permission on role_permission.role_id = user_role.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where profile.user_id = p_actor_id and profile.status = 'ACTIVE'
      and permission.code = p_permission
  );
$$;

create or replace function app_private.assign_delivery(
  p_delivery_id uuid, p_vehicle_id uuid, p_driver_user_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.deliveries%rowtype;
  assignment_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'delivery.assign');
  select * into delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND' using errcode = 'P0002'; end if;
  if delivery.status <> 'PLANNED' then raise exception 'DELIVERY_NOT_PLANNED' using errcode = '23514'; end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and is_active)
    then raise exception 'ACTIVE_VEHICLE_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.user_profiles profile
    join public.employee_operational_profiles operational on operational.user_id = profile.user_id
    where profile.user_id = p_driver_user_id and profile.status = 'ACTIVE' and operational.is_active
      and app_private.actor_has_permission(profile.user_id, 'delivery.update_assigned')
  ) then raise exception 'ACTIVE_DRIVER_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.delivery_assignments (
    assignment_number, delivery_id, vehicle_id, driver_user_id, assigned_by
  ) values (
    'ASN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_assignment_number_seq')::text, 6, '0'),
    p_delivery_id, p_vehicle_id, p_driver_user_id, p_actor_id
  ) returning id into assignment_id;

  update public.deliveries set status = 'ASSIGNED' where id = p_delivery_id;
  insert into public.delivery_state_transitions (
    delivery_id, from_status, to_status, reason, actor_user_id
  ) values (p_delivery_id, 'PLANNED', 'ASSIGNED', 'Đã phân công xe và tài xế hợp lệ', p_actor_id);
  insert into public.delivery_readiness_events (
    event_number, delivery_id, event_type, payload, created_by
  ) values (
    'DRE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_readiness_event_seq')::text, 6, '0'),
    p_delivery_id, 'DELIVERY_READY', jsonb_build_object('assignment_id', assignment_id), p_actor_id
  );
  return assignment_id;
end;
$$;

create or replace function app_private.transition_delivery(
  p_delivery_id uuid, p_to_status public.delivery_status, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.deliveries%rowtype;
  issue_id uuid;
  delivery_line record;
  reservation public.stock_reservations%rowtype;
  required_permission text;
begin
  required_permission := case when p_to_status = 'DISPATCHED' then 'delivery.dispatch' else 'delivery.update_assigned' end;
  perform app_private.assert_actor_permission(p_actor_id, required_permission);
  select * into delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (
    (delivery.status = 'ASSIGNED' and p_to_status in ('DISPATCHED', 'CANCELLED'))
    or (delivery.status = 'DISPATCHED' and p_to_status in ('ARRIVED', 'FAILED'))
    or (delivery.status = 'ARRIVED' and p_to_status in ('DELIVERED', 'FAILED'))
    or (delivery.status = 'PLANNED' and p_to_status = 'CANCELLED')
  ) then raise exception 'INVALID_DELIVERY_TRANSITION' using errcode = '23514'; end if;
  if not app_private.actor_has_permission(p_actor_id, 'delivery.confirm')
    and not app_private.actor_has_permission(p_actor_id, 'delivery.assign')
    and not app_private.actor_has_permission(p_actor_id, 'inventory.issue')
    and not exists (
      select 1 from public.delivery_assignments assignment
      where assignment.delivery_id = p_delivery_id
        and assignment.driver_user_id = p_actor_id
        and assignment.status in ('ASSIGNED', 'ACCEPTED')
    )
  then raise exception 'DELIVERY_ASSIGNED_DRIVER_REQUIRED' using errcode = '42501'; end if;
  if p_to_status in ('FAILED', 'CANCELLED') and char_length(trim(coalesce(p_reason, ''))) < 10
    then raise exception 'DELIVERY_TERMINAL_REASON_REQUIRED' using errcode = '22000'; end if;
  if p_to_status = 'DISPATCHED' and delivery.sourcing_mode = 'WAREHOUSE'
    and not app_private.actor_has_permission(p_actor_id, 'inventory.issue')
    then raise exception 'WAREHOUSE_HANDOFF_PERMISSION_REQUIRED' using errcode = '42501'; end if;

  if p_to_status = 'DISPATCHED' and delivery.sourcing_mode = 'WAREHOUSE' then
    insert into public.warehouse_issues (
      issue_number, warehouse_id, sales_order_id, status, issued_at, reason, created_by
    ) values (
      'ISS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.warehouse_issue_number_seq')::text, 6, '0'),
      delivery.warehouse_id, delivery.sales_order_id, 'DRAFT', now(),
      'Bàn giao kho cho chuyến ' || delivery.delivery_number, p_actor_id
    ) returning id into issue_id;
    for delivery_line in
      select line.* from public.delivery_lines line where line.delivery_id = p_delivery_id order by line.line_number
    loop
      select * into reservation from public.stock_reservations
      where id = delivery_line.stock_reservation_id for update;
      if not found or reservation.status <> 'ACTIVE'
        then raise exception 'ACTIVE_RESERVATION_REQUIRED_FOR_DISPATCH' using errcode = '23514'; end if;
      insert into public.warehouse_issue_lines (
        warehouse_issue_id, line_number, reservation_id, sales_order_line_id,
        material_id, material_code_snapshot, material_name_snapshot,
        base_quantity, base_uom_id, base_uom_symbol_snapshot
      ) values (
        issue_id, delivery_line.line_number, reservation.id, delivery_line.sales_order_line_id,
        delivery_line.material_id, delivery_line.material_code_snapshot, delivery_line.material_name_snapshot,
        reservation.reserved_quantity, reservation.base_uom_id, reservation.base_uom_symbol_snapshot
      );
      update public.delivery_lines set warehouse_issue_id = issue_id
      where id = delivery_line.id;
    end loop;
    perform app_private.confirm_warehouse_issue(issue_id, p_actor_id);
  end if;

  update public.deliveries set
    status = p_to_status,
    dispatched_at = case when p_to_status = 'DISPATCHED' then now() else dispatched_at end,
    arrived_at = case when p_to_status = 'ARRIVED' then now() else arrived_at end,
    delivered_at = case when p_to_status = 'DELIVERED' then now() else delivered_at end,
    failure_reason = case when p_to_status = 'FAILED' then trim(p_reason) else failure_reason end,
    cancellation_reason = case when p_to_status = 'CANCELLED' then trim(p_reason) else cancellation_reason end
  where id = p_delivery_id;
  insert into public.delivery_state_transitions (
    delivery_id, from_status, to_status, reason, actor_user_id
  ) values (p_delivery_id, delivery.status, p_to_status, nullif(trim(p_reason), ''), p_actor_id);
  if p_to_status in ('FAILED', 'CANCELLED') then
    update public.delivery_assignments set status = 'CANCELLED', cancelled_at = now()
    where delivery_id = p_delivery_id and status in ('ASSIGNED', 'ACCEPTED');
    insert into public.delivery_readiness_events (
      event_number, delivery_id, event_type, payload, created_by
    ) values (
      'DRE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_readiness_event_seq')::text, 6, '0'),
      p_delivery_id, 'DELIVERY_NOT_READY', jsonb_build_object('status', p_to_status), p_actor_id
    ) on conflict (delivery_id, event_type) do nothing;
  end if;
  return p_delivery_id;
end;
$$;

create or replace function app_private.record_delivery_proof(
  p_delivery_id uuid, p_proof_type public.delivery_proof_type,
  p_evidence_id uuid, p_latitude numeric, p_longitude numeric,
  p_receiver_name text, p_metadata jsonb, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare proof_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'delivery.proof.create');
  if not exists (
    select 1 from public.deliveries delivery
    where delivery.id = p_delivery_id and delivery.status in ('DISPATCHED', 'ARRIVED', 'DELIVERED')
      and (
        app_private.actor_has_permission(p_actor_id, 'delivery.confirm')
        or exists (select 1 from public.delivery_assignments assignment
          where assignment.delivery_id = delivery.id and assignment.driver_user_id = p_actor_id
            and assignment.status in ('ASSIGNED', 'ACCEPTED'))
      )
  ) then raise exception 'DELIVERY_PROOF_ACCESS_DENIED' using errcode = '42501'; end if;
  if p_proof_type in ('PHOTO', 'DOCUMENT', 'SIGNATURE') and not exists (
    select 1 from public.evidence evidence
    where evidence.id = p_evidence_id
      and (evidence.owner_user_id = p_actor_id
        or app_private.actor_has_permission(p_actor_id, 'delivery.confirm'))
  ) then raise exception 'DELIVERY_EVIDENCE_ACCESS_DENIED' using errcode = '42501'; end if;
  insert into public.delivery_proofs (
    delivery_id, proof_type, evidence_id, latitude, longitude,
    receiver_name, captured_by, metadata
  ) values (
    p_delivery_id, p_proof_type, p_evidence_id, p_latitude, p_longitude,
    nullif(trim(p_receiver_name), ''), p_actor_id, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into proof_id;
  return proof_id;
end;
$$;

create or replace function app_private.confirm_delivery(
  p_delivery_id uuid, p_actuals jsonb, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.deliveries%rowtype;
  line public.delivery_lines%rowtype;
  item jsonb;
  actual numeric;
  accepted numeric;
  actual_id uuid;
  final_status public.delivery_status := 'CONFIRMED';
begin
  perform app_private.assert_actor_permission(p_actor_id, 'delivery.confirm');
  select * into delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND' using errcode = 'P0002'; end if;
  if delivery.status in ('CONFIRMED', 'PARTIAL') then return delivery.id; end if;
  if delivery.status <> 'DELIVERED' then raise exception 'DELIVERY_NOT_DELIVERED' using errcode = '23514'; end if;
  if jsonb_typeof(p_actuals) <> 'array' or jsonb_array_length(p_actuals) = 0
    then raise exception 'DELIVERY_ACTUALS_REQUIRED' using errcode = '22000'; end if;
  if not exists (select 1 from public.delivery_proofs where delivery_id = p_delivery_id)
    then raise exception 'DELIVERY_PROOF_REQUIRED' using errcode = '23514'; end if;

  for line in select * from public.delivery_lines where delivery_id = p_delivery_id order by line_number
  loop
    select value into item from jsonb_array_elements(p_actuals)
    where value->>'deliveryLineId' = line.id::text limit 1;
    if item is null then raise exception 'DELIVERY_LINE_ACTUAL_REQUIRED' using errcode = '22000'; end if;
    actual := (item->>'actualQuantity')::numeric;
    accepted := (item->>'acceptedQuantity')::numeric;
    if actual < 0 or actual > line.planned_quantity or accepted < 0 or accepted > actual
      then raise exception 'INVALID_DELIVERY_ACTUAL_QUANTITY' using errcode = '22000'; end if;
    if accepted < line.planned_quantity then final_status := 'PARTIAL'; end if;
    insert into public.delivery_actuals (
      delivery_id, delivery_line_id, actual_quantity, accepted_quantity,
      receiver_name, received_at, recorded_by
    ) values (
      p_delivery_id, line.id, actual, accepted,
      trim(item->>'receiverName'), coalesce((item->>'receivedAt')::timestamptz, now()), p_actor_id
    ) returning id into actual_id;
    if actual <> line.planned_quantity or accepted <> actual then
      insert into public.delivery_variances (
        delivery_actual_id, delivery_line_id, planned_actual_variance,
        actual_accepted_variance, reason
      ) values (
        actual_id, line.id, actual - line.planned_quantity,
        accepted - actual, trim(p_reason)
      );
    end if;
    update public.supply_allocations set
      supplier_delivered_qty = actual,
      customer_accepted_qty = accepted,
      customer_billable_qty = accepted,
      status = case when accepted < line.planned_quantity then 'IN_PROGRESS' else 'COMPLETED' end
    where id = line.supply_allocation_id;
  end loop;

  update public.deliveries set status = final_status, confirmed_at = now(), confirmed_by = p_actor_id
  where id = p_delivery_id;
  update public.delivery_assignments set status = 'COMPLETED', completed_at = now()
  where delivery_id = p_delivery_id and status in ('ASSIGNED', 'ACCEPTED');
  insert into public.delivery_state_transitions (
    delivery_id, from_status, to_status, reason, actor_user_id
  ) values (p_delivery_id, 'DELIVERED', final_status, nullif(trim(p_reason), ''), p_actor_id);
  insert into public.delivery_readiness_events (
    event_number, delivery_id, event_type, payload, created_by
  ) values (
    'DRE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_readiness_event_seq')::text, 6, '0'),
    p_delivery_id, 'DELIVERY_COMPLETED', jsonb_build_object('status', final_status), p_actor_id
  );
  return p_delivery_id;
exception when unique_violation then
  if exists (select 1 from public.deliveries where id = p_delivery_id and status in ('CONFIRMED', 'PARTIAL'))
    then return p_delivery_id; end if;
  raise;
end;
$$;

revoke all on function app_private.guard_delivery_update() from public;
revoke all on function app_private.guard_delivery_line_update() from public;
revoke all on function app_private.actor_has_permission(uuid, text) from public, anon, authenticated;
revoke all on function app_private.assign_delivery(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.transition_delivery(uuid, public.delivery_status, text, uuid) from public, anon, authenticated;
revoke all on function app_private.record_delivery_proof(uuid, public.delivery_proof_type, uuid, numeric, numeric, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function app_private.confirm_delivery(uuid, jsonb, text, uuid) from public, anon, authenticated;

alter table public.deliveries enable row level security;
alter table public.delivery_lines enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.delivery_actuals enable row level security;
alter table public.delivery_variances enable row level security;
alter table public.delivery_state_transitions enable row level security;
alter table public.delivery_readiness_events enable row level security;

revoke all on public.deliveries, public.delivery_lines, public.delivery_assignments,
  public.delivery_proofs, public.delivery_actuals, public.delivery_variances,
  public.delivery_state_transitions, public.delivery_readiness_events from anon, authenticated;
grant select on public.deliveries, public.delivery_lines, public.delivery_assignments,
  public.delivery_proofs, public.delivery_actuals, public.delivery_variances,
  public.delivery_state_transitions, public.delivery_readiness_events to authenticated;

create policy deliveries_read_authorized on public.deliveries for select to authenticated using (
  (select app_private.is_active_user((select auth.uid()))) and (
    (select app_private.has_permission('delivery.read'))
    or exists (select 1 from public.delivery_assignments assignment
      where assignment.delivery_id = deliveries.id and assignment.driver_user_id = (select auth.uid()))
  )
);
create policy delivery_lines_read_authorized on public.delivery_lines for select to authenticated using (
  exists (select 1 from public.deliveries delivery where delivery.id = delivery_lines.delivery_id)
);
create policy delivery_assignments_read_authorized on public.delivery_assignments for select to authenticated using (
  (select app_private.has_permission('delivery.read')) or driver_user_id = (select auth.uid())
);
create policy delivery_proofs_read_authorized on public.delivery_proofs for select to authenticated using (
  exists (select 1 from public.deliveries delivery where delivery.id = delivery_proofs.delivery_id)
);
create policy delivery_actuals_read_authorized on public.delivery_actuals for select to authenticated using (
  exists (select 1 from public.deliveries delivery where delivery.id = delivery_actuals.delivery_id)
);
create policy delivery_variances_read_authorized on public.delivery_variances for select to authenticated using (
  exists (select 1 from public.delivery_lines line
    join public.deliveries delivery on delivery.id = line.delivery_id
    where line.id = delivery_variances.delivery_line_id)
);
create policy delivery_transitions_read_authorized on public.delivery_state_transitions for select to authenticated using (
  exists (select 1 from public.deliveries delivery where delivery.id = delivery_state_transitions.delivery_id)
);
create policy delivery_readiness_read_authorized on public.delivery_readiness_events for select to authenticated using (
  (select app_private.has_permission('delivery.read')) or (select app_private.has_permission('audit.view'))
);

insert into public.permissions (code, description_vi) values
  ('delivery.read', 'Xem điều phối, chuyến giao và bằng chứng giao hàng'),
  ('delivery.plan', 'Lập chuyến giao từ phần chia nguồn'),
  ('delivery.assign', 'Phân công xe và tài xế'),
  ('delivery.dispatch', 'Bàn giao kho và xuất phát chuyến giao'),
  ('delivery.update_assigned', 'Cập nhật tiến độ chuyến được giao'),
  ('delivery.proof.create', 'Ghi bằng chứng giao hàng'),
  ('delivery.confirm', 'Xác nhận số thực giao và thực nhận')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code like 'delivery.%'
where role.code in ('OWNER_ADMIN', 'SUPERVISOR') on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'delivery.read', 'delivery.plan', 'delivery.assign', 'delivery.dispatch',
  'delivery.update_assigned', 'delivery.proof.create', 'delivery.confirm'
) where role.code = 'DISPATCHER' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'delivery.read', 'delivery.dispatch', 'delivery.proof.create'
) where role.code = 'WAREHOUSE' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'delivery.dispatch', 'delivery.update_assigned', 'delivery.proof.create'
) where role.code = 'DRIVER' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'delivery.read'
where role.code in ('SALES', 'FINANCE', 'AUDITOR_VIEWER') on conflict do nothing;
