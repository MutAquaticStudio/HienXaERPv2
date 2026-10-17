-- FB2 Đợt 7: a route plan gives every stop its expected window (departure time + the minutes per stop the dispatcher
-- entered, in stop order), shown before applying. Applying then assigns a delivery that has no schedule yet with the
-- window of its stop (assign_delivery_scheduled) instead of failing on delivery_schedule_window_required; a delivery
-- that already has a schedule keeps it (assign_delivery, unchanged), so nothing agreed with the customer is moved.
-- Stop windows of one plan follow the stop order and never overlap, since the same vehicle and driver serve them all.
begin;

alter table public.route_plan_stops add column planned_start_at timestamptz;
alter table public.route_plan_stops add column planned_end_at timestamptz;
alter table public.route_plan_stops add constraint route_plan_stop_window_valid
  check ((planned_start_at is null and planned_end_at is null) or (planned_start_at is not null and planned_end_at > planned_start_at));

CREATE OR REPLACE FUNCTION public.create_route_plan(target_branch_id uuid, target_departure_at timestamp with time zone, target_vehicle_id uuid, target_driver_employee_id uuid, target_provider_state text, target_provider_distance_meters integer, target_provider_duration_seconds integer, target_provider_error_safe text, target_stops jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  plan_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  stop record;
  delivery public.deliveries%rowtype;
  current_assignment_version integer;
  stop_count integer;
  previous_end timestamptz;
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

  previous_end := target_departure_at;
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
      time_window_warning text,
      planned_start_at timestamptz,
      planned_end_at timestamptz
    ) order by stop_order
  loop
    select * into delivery from public.deliveries d where d.id = stop.delivery_id for update;
    if delivery.id is null or delivery.branch_id <> target_branch_id or delivery.execution_state not in ('PLANNED','ASSIGNED')
      or delivery.version  IS DISTINCT FROM stop.expected_delivery_version then
      raise exception 'route_delivery_stale' using errcode = 'PT409';
    end if;
    select coalesce(max(a.assignment_version), 0) into current_assignment_version
      from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
    if current_assignment_version  IS DISTINCT FROM stop.expected_assignment_version then
      raise exception 'route_assignment_stale' using errcode = 'PT409';
    end if;
    if nullif(trim(stop.address_snapshot), '') is null then
      raise exception 'route_address_required' using errcode = '22023';
    end if;
    -- Expected windows start at departure, follow the stop order without overlapping and stay within one day each.
    if (stop.planned_start_at is null) <> (stop.planned_end_at is null)
      or (stop.planned_start_at is not null and (stop.planned_end_at <= stop.planned_start_at
        or stop.planned_start_at < previous_end or stop.planned_end_at - stop.planned_start_at > interval '24 hours')) then
      raise exception 'route_stop_window_invalid' using errcode = '22023';
    end if;
    previous_end := coalesce(stop.planned_end_at, previous_end);
    insert into public.route_plan_stops(
      route_plan_id, stop_order, delivery_id, expected_delivery_version, expected_assignment_version,
      latitude, longitude, address_snapshot, time_window_snapshot, capacity_warning, time_window_warning,
      planned_start_at, planned_end_at
    ) values (
      plan_id, stop.stop_order, stop.delivery_id, stop.expected_delivery_version, stop.expected_assignment_version,
      stop.latitude, stop.longitude, trim(stop.address_snapshot), nullif(trim(stop.time_window_snapshot), ''),
      nullif(trim(stop.capacity_warning), ''), nullif(trim(stop.time_window_warning), ''),
      stop.planned_start_at, stop.planned_end_at
    );
  end loop;

  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_route_plan', payload_hash, 'route_plan', plan_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'route_plan.created', 'route_plan', plan_id, operation_id,
    array['stops','vehicle','driver','departure','provider_state','stop_windows']);
  return plan_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.apply_route_plan(target_route_plan_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if plan.status <> 'DRAFT' or plan.version  IS DISTINCT FROM expected_version then
    raise exception 'route_plan_version_conflict' using errcode = 'PT409';
  end if;

  for stop in
    select s.* from public.route_plan_stops s where s.route_plan_id = plan.id order by s.stop_order for update
  loop
    select * into delivery from public.deliveries d where d.id = stop.delivery_id for update;
    if delivery.id is null or delivery.branch_id <> plan.branch_id or delivery.execution_state not in ('PLANNED','ASSIGNED')
      or delivery.version  IS DISTINCT FROM stop.expected_delivery_version then
      raise exception 'route_delivery_stale' using errcode = 'PT409';
    end if;
    select coalesce(max(a.assignment_version), 0) into current_assignment_version
      from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
    if current_assignment_version  IS DISTINCT FROM stop.expected_assignment_version then
      raise exception 'route_assignment_stale' using errcode = 'PT409';
    end if;
    if delivery.scheduled_at is null then
      -- No schedule yet: the stop's expected window becomes the delivery schedule.
      if stop.planned_start_at is null then raise exception 'route_stop_schedule_required' using errcode = '22023'; end if;
      perform public.assign_delivery_scheduled(delivery.id, plan.driver_employee_id, plan.vehicle_id, null::text, null::text,
        delivery.version, md5(apply_route_plan.operation_id::text || ':stop:' || stop.stop_order)::uuid,
        stop.planned_start_at, stop.planned_end_at);
    else
      perform public.assign_delivery(delivery.id, plan.driver_employee_id, plan.vehicle_id, null::text, null::text,
        delivery.version, md5(apply_route_plan.operation_id::text || ':stop:' || stop.stop_order)::uuid);
    end if;
  end loop;

  update public.route_plans
    set status = 'APPLIED', version = version + 1, applied_by = (select auth.uid()), applied_at = now(), apply_operation_id = apply_route_plan.operation_id
    where id = plan.id;
  insert into public.command_receipts values (apply_route_plan.operation_id, (select auth.uid()), 'apply_route_plan', payload_hash, 'route_plan', plan.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), plan.branch_id, 'route_plan.applied', 'route_plan', plan.id, apply_route_plan.operation_id,
    array['delivery_assignments','vehicle','driver','schedule']);
  return plan.id;
end
$function$
;

notify pgrst, 'reload schema';
commit;
