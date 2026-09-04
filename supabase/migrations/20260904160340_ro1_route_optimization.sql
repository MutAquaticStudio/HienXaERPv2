-- HIỀN XA ERP RO1 — route optimization recommendations.
-- Delivery (P7) stays authoritative. A route plan may only recommend a sequence;
-- applying it delegates each assignment to app_private.assign_delivery.

create type public.route_plan_status as enum (
  'DRAFT', 'APPROVED', 'APPLIED', 'SUPERSEDED', 'CANCELLED'
);

create sequence public.route_plan_number_seq;
revoke all on sequence public.route_plan_number_seq from public, anon, authenticated;

create table public.route_plans (
  id uuid primary key default gen_random_uuid(),
  plan_number text not null unique,
  scheduled_date date not null,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  status public.route_plan_status not null default 'DRAFT',
  provider_mode text not null check (provider_mode in ('MAP_PROVIDER', 'MANUAL_FALLBACK')),
  constraint_summary jsonb not null default '[]'::jsonb
    check (jsonb_typeof(constraint_summary) = 'array'),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_by uuid references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz,
  approval_reason text check (approval_reason is null or char_length(trim(approval_reason)) between 10 and 500),
  applied_by uuid references public.user_profiles(user_id) on delete restrict,
  applied_at timestamptz,
  apply_reason text check (apply_reason is null or char_length(trim(apply_reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_plan_approval_shape check (
    (status = 'DRAFT' and approved_by is null and approved_at is null and applied_by is null and applied_at is null)
    or (status = 'APPROVED' and approved_by is not null and approved_at is not null and applied_by is null and applied_at is null)
    or (status = 'APPLIED' and approved_by is not null and approved_at is not null and applied_by is not null and applied_at is not null)
    or status in ('SUPERSEDED', 'CANCELLED')
  )
);

create index route_plans_driver_date_idx
  on public.route_plans(driver_user_id, scheduled_date, status, created_at desc);
create index route_plans_vehicle_date_idx
  on public.route_plans(vehicle_id, scheduled_date, status, created_at desc);

create table public.route_plan_stops (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.route_plans(id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  stop_sequence integer not null check (stop_sequence > 0),
  delivery_number_snapshot text not null,
  customer_name_snapshot text not null,
  pickup_address_snapshot text not null,
  drop_address_snapshot text not null,
  priority_snapshot smallint not null check (priority_snapshot between 1 and 5),
  time_window_start timestamptz,
  time_window_end timestamptz,
  estimated_travel_minutes integer check (estimated_travel_minutes is null or estimated_travel_minutes >= 0),
  constraint_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(constraint_warnings) = 'array'),
  created_at timestamptz not null default now(),
  unique (route_plan_id, delivery_id),
  unique (route_plan_id, stop_sequence),
  check (time_window_end is null or time_window_start is null or time_window_end > time_window_start)
);

create index route_plan_stops_delivery_idx on public.route_plan_stops(delivery_id, created_at desc);

create table public.route_plan_events (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.route_plans(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'APPROVED', 'APPLIED')),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  reason text,
  occurred_at timestamptz not null default now()
);

create index route_plan_events_plan_idx on public.route_plan_events(route_plan_id, occurred_at);

create or replace function app_private.prevent_route_plan_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'ROUTE_PLAN_HISTORY_IMMUTABLE' using errcode = '22000';
end;
$$;

create trigger route_plan_stops_immutable
before update or delete on public.route_plan_stops
for each row execute function app_private.prevent_route_plan_history_mutation();

create trigger route_plan_events_immutable
before update or delete on public.route_plan_events
for each row execute function app_private.prevent_route_plan_history_mutation();

create trigger route_plans_updated_at before update on public.route_plans
for each row execute function app_private.touch_updated_at();

create or replace function app_private.create_route_plan(
  p_scheduled_date date,
  p_vehicle_id uuid,
  p_driver_user_id uuid,
  p_delivery_ids uuid[],
  p_constraint_summary jsonb,
  p_provider_mode text,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  route_plan_id uuid;
  candidate_count integer;
  eligible_count integer;
  duplicate_count integer;
  blocked_pool_count integer;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'route_plan.manage');
  if p_scheduled_date is null then
    raise exception 'ROUTE_PLAN_SCHEDULED_DATE_REQUIRED' using errcode = '22000';
  end if;
  if p_provider_mode not in ('MAP_PROVIDER', 'MANUAL_FALLBACK') then
    raise exception 'ROUTE_PLAN_PROVIDER_MODE_INVALID' using errcode = '22000';
  end if;
  if jsonb_typeof(coalesce(p_constraint_summary, 'null'::jsonb)) <> 'array' then
    raise exception 'ROUTE_PLAN_CONSTRAINT_SUMMARY_INVALID' using errcode = '22000';
  end if;
  candidate_count := coalesce(cardinality(p_delivery_ids), 0);
  if candidate_count < 1 or candidate_count > 50 then
    raise exception 'ROUTE_PLAN_STOP_COUNT_INVALID' using errcode = '22000';
  end if;
  select count(*) into duplicate_count from (
    select delivery_id from unnest(p_delivery_ids) as input(delivery_id)
    group by delivery_id having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'ROUTE_PLAN_DELIVERY_DUPLICATED' using errcode = '23514';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and is_active) then
    raise exception 'ROUTE_PLAN_ACTIVE_VEHICLE_REQUIRED' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.user_profiles profile
    join public.employee_operational_profiles operational on operational.user_id = profile.user_id
    where profile.user_id = p_driver_user_id
      and profile.status = 'ACTIVE'
      and operational.is_active
      and app_private.actor_has_permission(profile.user_id, 'delivery.update_assigned')
  ) then
    raise exception 'ROUTE_PLAN_ACTIVE_DRIVER_REQUIRED' using errcode = 'P0002';
  end if;
  select count(*) into eligible_count
  from public.deliveries delivery
  where delivery.id = any(p_delivery_ids)
    and delivery.status = 'PLANNED'
    and delivery.scheduled_date = p_scheduled_date
    and not exists (
      select 1 from public.delivery_assignments assignment
      where assignment.delivery_id = delivery.id and assignment.status in ('ASSIGNED', 'ACCEPTED')
    );
  if eligible_count <> candidate_count then
    raise exception 'ROUTE_PLAN_DELIVERY_NOT_ELIGIBLE' using errcode = '23514';
  end if;

  -- Pool work is visible in a recommendation but cannot be claimed or converted here.
  select count(*) into blocked_pool_count
  from public.work_items item
  join public.work_requirements requirement on requirement.id = item.requirement_id
  where requirement.source_type = 'DELIVERY'
    and requirement.source_id = any(p_delivery_ids)
    and item.assignment_mode = 'POOL_CLAIM'
    and item.status not in ('DONE', 'VERIFIED', 'CANCELLED');

  insert into public.route_plans (
    plan_number, scheduled_date, vehicle_id, driver_user_id, provider_mode,
    constraint_summary, created_by
  ) values (
    'RTE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.route_plan_number_seq')::text, 6, '0'),
    p_scheduled_date, p_vehicle_id, p_driver_user_id, p_provider_mode,
    p_constraint_summary || case when blocked_pool_count > 0 then jsonb_build_array(jsonb_build_object(
      'code', 'POOL_CLAIM_BLOCKS_APPLY',
      'message', 'Có việc bể công việc; lộ trình chỉ để tham khảo và không thể áp dụng để nhận việc hộ.'
    )) else '[]'::jsonb end,
    p_actor_id
  ) returning id into route_plan_id;

  insert into public.route_plan_stops (
    route_plan_id, delivery_id, stop_sequence, delivery_number_snapshot,
    customer_name_snapshot, pickup_address_snapshot, drop_address_snapshot,
    priority_snapshot, constraint_warnings
  )
  select route_plan_id, delivery.id, input.ordinality::integer,
    delivery.delivery_number, delivery.customer_name_snapshot,
    delivery.pickup_address_snapshot, delivery.drop_address_snapshot,
    coalesce(item.priority, 3),
    case when item.assignment_mode = 'POOL_CLAIM' then jsonb_build_array(jsonb_build_object(
      'code', 'POOL_CLAIM_BLOCKS_APPLY',
      'message', 'Việc đang ở bể nhận việc; điều phối không được nhận hoặc chuyển trực tiếp qua RO1.'
    )) else '[]'::jsonb end
  from unnest(p_delivery_ids) with ordinality as input(delivery_id, ordinality)
  join public.deliveries delivery on delivery.id = input.delivery_id
  left join lateral (
    select work_item.priority, work_item.assignment_mode
    from public.work_items work_item
    join public.work_requirements requirement on requirement.id = work_item.requirement_id
    where requirement.source_type = 'DELIVERY' and requirement.source_id = delivery.id
      and work_item.status not in ('DONE', 'VERIFIED', 'CANCELLED')
    order by work_item.created_at desc limit 1
  ) item on true;

  insert into public.route_plan_events(route_plan_id, event_type, actor_user_id, reason)
  values (route_plan_id, 'CREATED', p_actor_id, 'Đề xuất lộ trình chỉ để điều phối xem xét');
  return route_plan_id;
end;
$$;

create or replace function app_private.approve_route_plan(
  p_route_plan_id uuid,
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  route_plan public.route_plans%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'route_plan.manage');
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'ROUTE_PLAN_APPROVAL_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into route_plan from public.route_plans where id = p_route_plan_id for update;
  if not found then raise exception 'ROUTE_PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  if route_plan.status <> 'DRAFT' then
    raise exception 'ROUTE_PLAN_NOT_DRAFT' using errcode = '23514';
  end if;
  update public.route_plans set status = 'APPROVED', approved_by = p_actor_id,
    approved_at = now(), approval_reason = trim(p_reason)
  where id = route_plan.id;
  insert into public.route_plan_events(route_plan_id, event_type, actor_user_id, reason)
  values (route_plan.id, 'APPROVED', p_actor_id, trim(p_reason));
  return route_plan.id;
end;
$$;

create or replace function app_private.apply_route_plan(
  p_route_plan_id uuid,
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  route_plan public.route_plans%rowtype;
  stop_record public.route_plan_stops%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'route_plan.manage');
  perform app_private.assert_actor_permission(p_actor_id, 'delivery.assign');
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'ROUTE_PLAN_APPLY_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into route_plan from public.route_plans where id = p_route_plan_id for update;
  if not found then raise exception 'ROUTE_PLAN_NOT_FOUND' using errcode = 'P0002'; end if;
  if route_plan.status <> 'APPROVED' then
    raise exception 'ROUTE_PLAN_NOT_APPROVED' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.route_plan_stops stop
    join public.work_requirements requirement on requirement.source_type = 'DELIVERY'
      and requirement.source_id = stop.delivery_id
    join public.work_items item on item.requirement_id = requirement.id
    where stop.route_plan_id = route_plan.id
      and item.assignment_mode = 'POOL_CLAIM'
      and item.status not in ('DONE', 'VERIFIED', 'CANCELLED')
  ) then
    raise exception 'POOL_CLAIM_REQUIRES_EXPLICIT_WORKFLOW' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.route_plan_stops stop
    join public.deliveries delivery on delivery.id = stop.delivery_id
    where stop.route_plan_id = route_plan.id
      and (delivery.status <> 'PLANNED' or delivery.scheduled_date <> route_plan.scheduled_date)
  ) then
    raise exception 'ROUTE_PLAN_DELIVERY_STATE_CHANGED' using errcode = '23514';
  end if;

  -- This is deliberately the existing P7 command. It owns Delivery state,
  -- DeliveryAssignment, readiness events, and the P10 projection trigger.
  for stop_record in
    select * from public.route_plan_stops
    where route_plan_id = route_plan.id
    order by stop_sequence
  loop
    perform app_private.assign_delivery(
      stop_record.delivery_id, route_plan.vehicle_id, route_plan.driver_user_id, p_actor_id
    );
  end loop;
  update public.route_plans set status = 'APPLIED', applied_by = p_actor_id,
    applied_at = now(), apply_reason = trim(p_reason)
  where id = route_plan.id;
  insert into public.route_plan_events(route_plan_id, event_type, actor_user_id, reason)
  values (route_plan.id, 'APPLIED', p_actor_id, trim(p_reason));
  return route_plan.id;
end;
$$;

revoke all on function app_private.prevent_route_plan_history_mutation() from public, anon, authenticated;
revoke all on function app_private.create_route_plan(date, uuid, uuid, uuid[], jsonb, text, uuid) from public, anon, authenticated;
revoke all on function app_private.approve_route_plan(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.apply_route_plan(uuid, text, uuid) from public, anon, authenticated;

alter table public.route_plans enable row level security;
alter table public.route_plan_stops enable row level security;
alter table public.route_plan_events enable row level security;

revoke all on public.route_plans, public.route_plan_stops, public.route_plan_events from anon, authenticated;
grant select on public.route_plans, public.route_plan_stops, public.route_plan_events to authenticated;

create policy route_plans_read_dispatcher_or_own_driver
on public.route_plans for select to authenticated using (
  (select app_private.has_permission('route_plan.read'))
  or (driver_user_id = (select auth.uid()) and status in ('APPROVED', 'APPLIED'))
);
create policy route_plan_stops_read_dispatcher_or_own_driver
on public.route_plan_stops for select to authenticated using (
  exists (
    select 1 from public.route_plans route_plan
    where route_plan.id = route_plan_stops.route_plan_id
  )
);
create policy route_plan_events_read_dispatcher
on public.route_plan_events for select to authenticated using (
  (select app_private.has_permission('route_plan.read'))
);

insert into public.permissions(code, description_vi) values
  ('route_plan.read', 'Xem đề xuất và lộ trình giao đã được duyệt'),
  ('route_plan.manage', 'Tạo, phê duyệt và áp dụng đề xuất lộ trình')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in ('route_plan.read', 'route_plan.manage')
where role.code in ('OWNER_ADMIN', 'SUPERVISOR', 'DISPATCHER')
on conflict do nothing;
