-- HIỀN XA ERP GPS1 — foreground active-delivery telemetry.
-- Telemetry is operational context only. It never transitions a Delivery,
-- changes a P10 work assignment, or changes an RO1 route recommendation.

create table public.current_vehicle_locations (
  vehicle_id uuid primary key references public.vehicles(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  latitude numeric(10, 7) not null check (latitude between -90 and 90),
  longitude numeric(10, 7) not null check (longitude between -180 and 180),
  accuracy_m numeric(10, 2) not null check (accuracy_m > 0 and accuracy_m <= 5000),
  speed_mps numeric(10, 3) check (speed_mps is null or speed_mps between 0 and 100),
  heading_deg numeric(7, 3) check (heading_deg is null or heading_deg >= 0 and heading_deg < 360),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index current_vehicle_locations_worker_idx
  on public.current_vehicle_locations(worker_user_id, recorded_at desc);
create index current_vehicle_locations_delivery_idx
  on public.current_vehicle_locations(delivery_id, recorded_at desc);

create table public.vehicle_location_pings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  latitude numeric(10, 7) not null check (latitude between -90 and 90),
  longitude numeric(10, 7) not null check (longitude between -180 and 180),
  accuracy_m numeric(10, 2) not null check (accuracy_m > 0 and accuracy_m <= 5000),
  speed_mps numeric(10, 3) check (speed_mps is null or speed_mps between 0 and 100),
  heading_deg numeric(7, 3) check (heading_deg is null or heading_deg >= 0 and heading_deg < 360),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index vehicle_location_pings_delivery_idx
  on public.vehicle_location_pings(delivery_id, recorded_at desc);
create index vehicle_location_pings_vehicle_idx
  on public.vehicle_location_pings(vehicle_id, recorded_at desc);
create index vehicle_location_pings_retention_idx
  on public.vehicle_location_pings(received_at);

-- A hold is intentionally minimal: a scheduled retention job must not purge
-- telemetry connected to an unresolved dispute or operational audit.
create table public.vehicle_location_retention_holds (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  delivery_id uuid references public.deliveries(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  check (vehicle_id is not null or delivery_id is not null)
);

create index vehicle_location_retention_holds_active_idx
  on public.vehicle_location_retention_holds(vehicle_id, delivery_id)
  where released_at is null;

create trigger current_vehicle_locations_updated_at before update
on public.current_vehicle_locations for each row execute function app_private.touch_updated_at();

create or replace function app_private.record_active_delivery_location(
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric,
  p_speed_mps numeric,
  p_heading_deg numeric,
  p_recorded_at timestamptz,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_count integer;
  active_delivery_id uuid;
  active_vehicle_id uuid;
  previous_ping_at timestamptz;
  ping_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'gps.location.submit');
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'GPS_COORDINATES_INVALID' using errcode = '22000';
  end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > 5000 then
    raise exception 'GPS_ACCURACY_INVALID' using errcode = '22000';
  end if;
  if p_speed_mps is not null and p_speed_mps not between 0 and 100 then
    raise exception 'GPS_SPEED_INVALID' using errcode = '22000';
  end if;
  if p_heading_deg is not null and (p_heading_deg < 0 or p_heading_deg >= 360) then
    raise exception 'GPS_HEADING_INVALID' using errcode = '22000';
  end if;
  if p_recorded_at is null or p_recorded_at < now() - interval '10 minutes'
    or p_recorded_at > now() + interval '2 minutes' then
    raise exception 'GPS_TIMESTAMP_INVALID' using errcode = '22000';
  end if;

  select count(*) into active_count
  from public.deliveries delivery
  join public.delivery_assignments assignment on assignment.delivery_id = delivery.id
  where assignment.driver_user_id = p_actor_id
    and assignment.status in ('ASSIGNED', 'ACCEPTED')
    and delivery.status in ('DISPATCHED', 'ARRIVED');
  if active_count = 0 then
    raise exception 'GPS_ACTIVE_DELIVERY_REQUIRED' using errcode = '23514';
  end if;
  if active_count > 1 then
    raise exception 'GPS_ACTIVE_DELIVERY_AMBIGUOUS' using errcode = '23514';
  end if;

  select delivery.id, assignment.vehicle_id
    into active_delivery_id, active_vehicle_id
  from public.deliveries delivery
  join public.delivery_assignments assignment on assignment.delivery_id = delivery.id
  where assignment.driver_user_id = p_actor_id
    and assignment.status in ('ASSIGNED', 'ACCEPTED')
    and delivery.status in ('DISPATCHED', 'ARRIVED')
  for update of delivery, assignment;

  select ping.recorded_at into previous_ping_at
  from public.vehicle_location_pings ping
  where ping.vehicle_id = active_vehicle_id and ping.delivery_id = active_delivery_id
  order by ping.recorded_at desc limit 1 for update;
  if previous_ping_at is not null and p_recorded_at < previous_ping_at + interval '15 seconds' then
    raise exception 'GPS_PING_THROTTLED' using errcode = '23514';
  end if;

  insert into public.vehicle_location_pings (
    vehicle_id, worker_user_id, delivery_id, latitude, longitude, accuracy_m,
    speed_mps, heading_deg, recorded_at
  ) values (
    active_vehicle_id, p_actor_id, active_delivery_id, p_latitude, p_longitude,
    p_accuracy_m, p_speed_mps, p_heading_deg, p_recorded_at
  ) returning id into ping_id;

  insert into public.current_vehicle_locations (
    vehicle_id, worker_user_id, delivery_id, latitude, longitude, accuracy_m,
    speed_mps, heading_deg, recorded_at, received_at
  ) values (
    active_vehicle_id, p_actor_id, active_delivery_id, p_latitude, p_longitude,
    p_accuracy_m, p_speed_mps, p_heading_deg, p_recorded_at, now()
  ) on conflict (vehicle_id) do update set
    worker_user_id = excluded.worker_user_id,
    delivery_id = excluded.delivery_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    speed_mps = excluded.speed_mps,
    heading_deg = excluded.heading_deg,
    recorded_at = excluded.recorded_at,
    received_at = excluded.received_at;
  return ping_id;
end;
$$;

-- This function is for a scheduled, audited retention job. It is deliberately
-- not exposed to browser roles and keeps active holds intact.
create or replace function app_private.purge_vehicle_location_pings(
  p_before timestamptz,
  p_actor_id uuid
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare removed_count integer;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'audit.view');
  if p_before is null or p_before > now() - interval '30 days' then
    raise exception 'GPS_RETENTION_CUTOFF_INVALID' using errcode = '22000';
  end if;
  delete from public.vehicle_location_pings ping
  where ping.received_at < p_before
    and not exists (
      select 1 from public.vehicle_location_retention_holds hold
      where hold.released_at is null
        and (hold.vehicle_id = ping.vehicle_id or hold.delivery_id = ping.delivery_id)
    );
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

create view public.active_vehicle_location_view with (security_invoker = true) as
select location.vehicle_id, vehicle.code as vehicle_code, vehicle.plate_number,
  location.worker_user_id, profile.display_name as worker_name,
  location.delivery_id, delivery.delivery_number,
  delivery.drop_address_snapshot as next_destination,
  location.latitude, location.longitude, location.accuracy_m,
  location.speed_mps, location.heading_deg, location.recorded_at, location.received_at,
  case when location.recorded_at >= now() - interval '90 seconds' then 'LIVE'
       when location.recorded_at >= now() - interval '15 minutes' then 'STALE'
       else 'OFFLINE' end as freshness_status
from public.current_vehicle_locations location
join public.vehicles vehicle on vehicle.id = location.vehicle_id
join public.user_profiles profile on profile.user_id = location.worker_user_id
join public.deliveries delivery on delivery.id = location.delivery_id
where delivery.status in ('DISPATCHED', 'ARRIVED');

revoke all on function app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function app_private.purge_vehicle_location_pings(timestamptz, uuid)
  from public, anon, authenticated;

alter table public.current_vehicle_locations enable row level security;
alter table public.vehicle_location_pings enable row level security;
alter table public.vehicle_location_retention_holds enable row level security;

revoke all on public.current_vehicle_locations, public.vehicle_location_pings,
  public.vehicle_location_retention_holds from anon, authenticated;
grant select on public.current_vehicle_locations, public.vehicle_location_pings to authenticated;
grant select on public.active_vehicle_location_view to authenticated;

create policy current_vehicle_locations_read_authorized
on public.current_vehicle_locations for select to authenticated using (
  (select app_private.has_permission('gps.location.read_fleet'))
  or worker_user_id = (select auth.uid())
);
create policy vehicle_location_pings_read_authorized
on public.vehicle_location_pings for select to authenticated using (
  (select app_private.has_permission('gps.location.read_fleet'))
  or worker_user_id = (select auth.uid())
);

insert into public.permissions(code, description_vi) values
  ('gps.location.submit', 'Gửi vị trí của chính tài xế trong chuyến giao đang hoạt động'),
  ('gps.location.read_fleet', 'Xem vị trí vận hành của đội xe được điều phối')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'gps.location.submit'
where role.code = 'DRIVER'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'gps.location.read_fleet'
where role.code in ('OWNER_ADMIN', 'SUPERVISOR', 'DISPATCHER')
on conflict do nothing;
