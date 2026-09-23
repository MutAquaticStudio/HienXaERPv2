create table public.route_plans (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  departure_at timestamptz not null,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_employee_id uuid not null references public.employees(id) on delete restrict,
  provider_name text not null default 'OSRM' check (provider_name = 'OSRM'),
  provider_state text not null check (provider_state in ('RECOMMENDED','MANUAL_FALLBACK')),
  provider_distance_meters integer check (provider_distance_meters is null or provider_distance_meters >= 0),
  provider_duration_seconds integer check (provider_duration_seconds is null or provider_duration_seconds >= 0),
  provider_error_safe text check (provider_error_safe is null or char_length(provider_error_safe) <= 300),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPLIED','CANCELLED')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_by uuid references auth.users(id) on delete restrict,
  applied_at timestamptz,
  operation_id uuid not null unique,
  apply_operation_id uuid unique
);

create index route_plans_branch_created_idx on public.route_plans(branch_id, created_at desc, id desc);

create table public.route_plan_stops (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.route_plans(id) on delete cascade,
  stop_order integer not null check (stop_order > 0),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  expected_delivery_version integer not null check (expected_delivery_version > 0),
  expected_assignment_version integer not null check (expected_assignment_version >= 0),
  latitude numeric(10,7),
  longitude numeric(10,7),
  address_snapshot text not null,
  time_window_snapshot text,
  capacity_warning text,
  time_window_warning text,
  unique (route_plan_id, stop_order),
  unique (route_plan_id, delivery_id),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create index route_plan_stops_delivery_idx on public.route_plan_stops(delivery_id, route_plan_id);

alter table public.route_plans enable row level security;
alter table public.route_plan_stops enable row level security;

revoke all on public.route_plans, public.route_plan_stops from anon, authenticated;
grant select on public.route_plans, public.route_plan_stops to authenticated;

create policy route_plans_select on public.route_plans for select to authenticated
  using ((select private.has_permission(branch_id, 'delivery.read')));

create policy route_plan_stops_select on public.route_plan_stops for select to authenticated
  using (exists (
    select 1 from public.route_plans p
    where p.id = route_plan_id
      and (select private.has_permission(p.branch_id, 'delivery.read'))
  ));

create or replace function public.create_route_plan(
  target_branch_id uuid,
  target_departure_at timestamptz,
  target_vehicle_id uuid,
  target_driver_employee_id uuid,
  target_provider_state text,
  target_provider_distance_meters integer,
  target_provider_duration_seconds integer,
  target_provider_error_safe text,
  target_stops jsonb,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  stop record;
  delivery public.deliveries%rowtype;
  current_assignment_version integer;
  stop_count integer;
begin
  if (select auth.uid()) is null or not private.has_permission(target_branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_departure_at is null or target_vehicle_id is null or target_driver_employee_id is null then
    raise exception 'route_resources_required' using errcode = '22023';
  end if;
  if target_provider_state not in ('RECOMMENDED','MANUAL_FALLBACK') then
    raise exception 'invalid_route_provider_state' using errcode = '22023';
  end if;
  if jsonb_typeof(target_stops) <> 'array' or jsonb_array_length(target_stops) not between 1 and 50 then
    raise exception 'invalid_route_stops' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = target_vehicle_id and v.branch_id = target_branch_id and v.active) then
    raise exception 'route_vehicle_invalid' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    where e.id = target_driver_employee_id and e.active and a.branch_id = target_branch_id
  ) then
    raise exception 'route_driver_invalid' using errcode = '23503';
  end if;

  payload_hash := private.command_payload_hash(jsonb_build_object(
    'branch_id', target_branch_id,
    'departure_at', target_departure_at,
    'vehicle_id', target_vehicle_id,
    'driver_employee_id', target_driver_employee_id,
    'provider_state', target_provider_state,
    'provider_distance_meters', target_provider_distance_meters,
    'provider_duration_seconds', target_provider_duration_seconds,
    'stops', target_stops
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_route_plan.operation_id;
  if found then
    if receipt.command_name <> 'create_route_plan' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;

  select count(*), count(distinct (item->>'stop_order')::integer)
    into stop_count, current_assignment_version
  from jsonb_array_elements(target_stops) item;
  if stop_count <> current_assignment_version
    or (select min((item->>'stop_order')::integer) from jsonb_array_elements(target_stops) item) <> 1
    or (select max((item->>'stop_order')::integer) from jsonb_array_elements(target_stops) item) <> stop_count then
    raise exception 'route_stop_order_invalid' using errcode = '22023';
  end if;

  insert into public.route_plans(
    branch_id, departure_at, vehicle_id, driver_employee_id, provider_state,
    provider_distance_meters, provider_duration_seconds, provider_error_safe,
    created_by, operation_id
  ) values (
    target_branch_id, target_departure_at, target_vehicle_id, target_driver_employee_id, target_provider_state,
    target_provider_distance_meters, target_provider_duration_seconds, nullif(left(trim(target_provider_error_safe), 300), ''),
    (select auth.uid()), operation_id
  ) returning id into plan_id;

  for stop in
    select * from jsonb_to_recordset(target_stops) as x(
      delivery_id uuid,
      stop_order integer,
      expected_delivery_version integer,
      expected_assignment_version integer,
      latitude numeric,
      longitude numeric,
      address_snapshot text,
      time_window_snapshot text,
      capacity_warning text,
      time_window_warning text
    ) order by stop_order
  loop
    select * into delivery from public.deliveries d where d.id = stop.delivery_id for update;
    if delivery.id is null or delivery.branch_id <> target_branch_id or delivery.execution_state not in ('PLANNED','ASSIGNED')
      or delivery.version <> stop.expected_delivery_version then
      raise exception 'route_delivery_stale' using errcode = '40001';
    end if;
    select coalesce(max(a.assignment_version), 0) into current_assignment_version
      from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
    if current_assignment_version <> stop.expected_assignment_version then
      raise exception 'route_assignment_stale' using errcode = '40001';
    end if;
    if nullif(trim(stop.address_snapshot), '') is null then
      raise exception 'route_address_required' using errcode = '22023';
    end if;
    insert into public.route_plan_stops(
      route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version,
      latitude, longitude, address_snapshot, time_window_snapshot, capacity_warning, time_window_warning
    ) values (
      plan_id, stop.stop_order, stop.delivery_id, stop.expected_delivery_version, stop.expected_assignment_version,
      stop.latitude, stop.longitude, trim(stop.address_snapshot), nullif(trim(stop.time_window_snapshot), ''),
      nullif(trim(stop.capacity_warning), ''), nullif(trim(stop.time_window_warning), '')
    );
  end loop;

  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_route_plan', payload_hash, 'route_plan', plan_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'route_plan.created', 'route_plan', plan_id, operation_id,
    array['stops','vehicle','driver','departure','provider_state']);
  return plan_id;
end
$$;

create or replace function public.apply_route_plan(
  target_route_plan_id uuid,
  expected_version integer,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.route_plans%rowtype;
  stop record;
  delivery public.deliveries%rowtype;
  current_assignment_version integer;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into plan from public.route_plans p where p.id = target_route_plan_id for update;
  if plan.id is null or not private.has_permission(plan.branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('route_plan_id', target_route_plan_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = apply_route_plan.operation_id;
  if found then
    if receipt.command_name <> 'apply_route_plan' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if plan.status <> 'DRAFT' or plan.version <> expected_version then
    raise exception 'route_plan_version_conflict' using errcode = '40001';
  end if;

  for stop in
    select s.* from public.route_plan_stops s where s.route_plan_id = plan.id order by s.stop_order for update
  loop
    select * into delivery from public.deliveries d where d.id = stop.delivery_id for update;
    if delivery.id is null or delivery.branch_id <> plan.branch_id or delivery.execution_state not in ('PLANNED','ASSIGNED')
      or delivery.version <> stop.expected_delivery_version then
      raise exception 'route_delivery_stale' using errcode = '40001';
    end if;
    select coalesce(max(a.assignment_version), 0) into current_assignment_version
      from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
    if current_assignment_version <> stop.expected_assignment_version then
      raise exception 'route_assignment_stale' using errcode = '40001';
    end if;
    perform public.assign_delivery(
      delivery.id,
      plan.driver_employee_id,
      plan.vehicle_id,
      null::text,
      null::text,
      delivery.version,
      gen_random_uuid()
    );
  end loop;

  update public.route_plans
    set status = 'APPLIED', version = version + 1, applied_by = (select auth.uid()), applied_at = now(), apply_operation_id = apply_route_plan.operation_id
    where id = plan.id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'apply_route_plan', payload_hash, 'route_plan', plan.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), plan.branch_id, 'route_plan.applied', 'route_plan', plan.id, operation_id,
    array['delivery_assignments','vehicle','driver']);
  return plan.id;
end
$$;

revoke all on function public.create_route_plan(uuid,timestamptz,uuid,uuid,text,integer,integer,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.apply_route_plan(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.create_route_plan(uuid,timestamptz,uuid,uuid,text,integer,integer,text,jsonb,uuid) to authenticated;
grant execute on function public.apply_route_plan(uuid,integer,uuid) to authenticated;

comment on table public.route_plans is 'R10 route recommendation snapshot; delivery assignments change only through explicit apply_route_plan.';
