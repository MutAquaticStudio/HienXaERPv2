create table public.routing_settings (
  branch_id uuid primary key references public.branches(id) on delete restrict,
  gps_stale_after_seconds integer not null default 300 check (gps_stale_after_seconds between 60 and 86400),
  gps_retention_days integer not null default 30 check (gps_retention_days between 1 and 365),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.gps_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  assignment_id uuid not null references public.delivery_assignments(id) on delete restrict,
  assignment_version integer not null check (assignment_version > 0),
  employee_id uuid not null references public.employees(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','STOPPED','REVOKED')),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  last_captured_at timestamptz,
  last_position_received_at timestamptz,
  started_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  stop_reason text,
  start_operation_id uuid not null unique,
  stop_operation_id uuid unique
);

create unique index gps_tracking_one_active_assignment on public.gps_tracking_sessions(assignment_id) where status = 'ACTIVE';
create index gps_tracking_branch_active_idx on public.gps_tracking_sessions(branch_id, status, last_position_received_at desc);

create table public.gps_positions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.gps_tracking_sessions(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  assignment_version integer not null check (assignment_version > 0),
  sequence bigint not null check (sequence > 0),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  accuracy_meters numeric(10,2) check (accuracy_meters is null or accuracy_meters between 0 and 10000),
  speed_mps numeric(10,3) check (speed_mps is null or speed_mps between 0 and 200),
  heading_degrees numeric(7,3) check (heading_degrees is null or heading_degrees between 0 and 360),
  operation_id uuid not null unique,
  unique (session_id, sequence)
);

create index gps_positions_session_sequence_idx on public.gps_positions(session_id, sequence desc);
create index gps_positions_branch_received_idx on public.gps_positions(branch_id, received_at);

alter table public.routing_settings enable row level security;
alter table public.gps_tracking_sessions enable row level security;
alter table public.gps_positions enable row level security;

revoke all on public.routing_settings, public.gps_tracking_sessions, public.gps_positions from anon, authenticated;
grant select on public.routing_settings, public.gps_tracking_sessions, public.gps_positions to authenticated;

create policy routing_settings_select on public.routing_settings for select to authenticated
  using ((select private.has_permission(branch_id, 'delivery.read')));

create policy gps_tracking_sessions_select on public.gps_tracking_sessions for select to authenticated
  using (
    employee_id = (select private.current_employee_id())
    or (select private.has_permission(branch_id, 'delivery.read'))
  );

create policy gps_positions_select on public.gps_positions for select to authenticated
  using (
    (select private.has_permission(branch_id, 'delivery.read'))
    or exists (
      select 1 from public.gps_tracking_sessions s
      where s.id = session_id and s.employee_id = (select private.current_employee_id())
    )
  );

create or replace function public.update_routing_settings(
  target_branch_id uuid,
  target_stale_after_seconds integer,
  target_retention_days integer,
  change_reason text,
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
begin
  if (select auth.uid()) is null or not private.has_permission(target_branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_stale_after_seconds not between 60 and 86400 or target_retention_days not between 1 and 365
    or char_length(trim(change_reason)) < 3 then
    raise exception 'invalid_routing_settings' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'branch_id', target_branch_id,
    'stale_after_seconds', target_stale_after_seconds,
    'retention_days', target_retention_days,
    'reason', trim(change_reason)
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_routing_settings.operation_id;
  if found then
    if receipt.command_name <> 'update_routing_settings' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  insert into public.routing_settings(branch_id, gps_stale_after_seconds, gps_retention_days, updated_by)
  values (target_branch_id, target_stale_after_seconds, target_retention_days, (select auth.uid()))
  on conflict (branch_id) do update
    set gps_stale_after_seconds = excluded.gps_stale_after_seconds,
        gps_retention_days = excluded.gps_retention_days,
        updated_by = excluded.updated_by,
        updated_at = now();
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_routing_settings', payload_hash, 'branch', target_branch_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), target_branch_id, 'routing_settings.updated', 'branch', target_branch_id, operation_id,
    array['gps_stale_after_seconds','gps_retention_days'], trim(change_reason));
  return target_branch_id;
end
$$;

create or replace function public.start_gps_tracking(
  target_delivery_id uuid,
  target_assignment_version integer,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.deliveries%rowtype;
  assignment public.delivery_assignments%rowtype;
  employee_id uuid;
  session_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  employee_id := private.current_employee_id();
  if employee_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into delivery from public.deliveries d where d.id = target_delivery_id for update;
  select * into assignment from public.delivery_assignments a
    where a.delivery_id = target_delivery_id and a.superseded_at is null for update;
  if delivery.id is null or assignment.id is null or assignment.employee_id <> employee_id
    or assignment.assignment_version <> target_assignment_version
    or delivery.execution_state not in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED') then
    raise exception 'gps_assignment_not_active' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'delivery_id', target_delivery_id,
    'assignment_version', target_assignment_version
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = start_gps_tracking.operation_id;
  if found then
    if receipt.command_name <> 'start_gps_tracking' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select s.id into session_id from public.gps_tracking_sessions s
    where s.assignment_id = assignment.id and s.status = 'ACTIVE' for update;
  if session_id is null then
    update public.gps_tracking_sessions
      set status = 'REVOKED', stopped_at = now(), stop_reason = 'assignment_superseded'
      where delivery_id = delivery.id and status = 'ACTIVE';
    insert into public.gps_tracking_sessions(
      branch_id, delivery_id, assignment_id, assignment_version, employee_id, vehicle_id, started_by, start_operation_id
    ) values (
      delivery.branch_id, delivery.id, assignment.id, assignment.assignment_version, assignment.employee_id,
      assignment.vehicle_id, (select auth.uid()), operation_id
    ) returning id into session_id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values ((select auth.uid()), delivery.branch_id, 'gps_tracking.started', 'gps_tracking_session', session_id, operation_id,
      array['delivery','assignment_version','foreground']);
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'start_gps_tracking', payload_hash, 'gps_tracking_session', session_id, now());
  return session_id;
end
$$;

create or replace function public.record_gps_ping(
  target_session_id uuid,
  target_sequence bigint,
  target_captured_at timestamptz,
  target_latitude numeric,
  target_longitude numeric,
  target_accuracy_meters numeric,
  target_speed_mps numeric,
  target_heading_degrees numeric,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.gps_tracking_sessions%rowtype;
  delivery public.deliveries%rowtype;
  assignment public.delivery_assignments%rowtype;
  position_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  retention_days integer;
begin
  select * into session from public.gps_tracking_sessions s where s.id = target_session_id for update;
  if session.id is null or session.status <> 'ACTIVE' or session.employee_id <> private.current_employee_id() then
    raise exception 'gps_session_not_active' using errcode = '42501';
  end if;
  select * into assignment from public.delivery_assignments a where a.id = session.assignment_id and a.superseded_at is null;
  select * into delivery from public.deliveries d where d.id = session.delivery_id;
  if assignment.id is null or assignment.assignment_version <> session.assignment_version
    or delivery.execution_state not in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED') then
    raise exception 'gps_assignment_revoked' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'session_id', target_session_id,
    'sequence', target_sequence,
    'captured_at', target_captured_at,
    'latitude', target_latitude,
    'longitude', target_longitude,
    'accuracy_meters', target_accuracy_meters,
    'speed_mps', target_speed_mps,
    'heading_degrees', target_heading_degrees
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_gps_ping.operation_id;
  if found then
    if receipt.command_name <> 'record_gps_ping' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if target_sequence <= session.last_sequence
    or (session.last_captured_at is not null and target_captured_at < session.last_captured_at)
    or target_captured_at < session.started_at - interval '5 minutes'
    or target_captured_at > now() + interval '5 minutes' then
    raise exception 'gps_ping_out_of_order' using errcode = '40001';
  end if;
  if target_latitude not between -90 and 90 or target_longitude not between -180 and 180 then
    raise exception 'gps_coordinate_invalid' using errcode = '22023';
  end if;
  insert into public.gps_positions(
    session_id, branch_id, delivery_id, assignment_version, sequence, captured_at,
    latitude, longitude, accuracy_meters, speed_mps, heading_degrees, operation_id
  ) values (
    session.id, session.branch_id, session.delivery_id, session.assignment_version, target_sequence, target_captured_at,
    target_latitude, target_longitude, target_accuracy_meters, target_speed_mps, target_heading_degrees, operation_id
  ) returning id into position_id;
  update public.gps_tracking_sessions
    set last_sequence = target_sequence, last_captured_at = target_captured_at, last_position_received_at = now()
    where id = session.id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_gps_ping', payload_hash, 'gps_position', position_id, now());
  select coalesce(s.gps_retention_days, 30) into retention_days from public.routing_settings s where s.branch_id = session.branch_id;
  retention_days := coalesce(retention_days, 30);
  delete from public.gps_positions p where p.id in (
    select old.id from public.gps_positions old
    where old.branch_id = session.branch_id and old.received_at < now() - make_interval(days => retention_days)
    order by old.received_at asc limit 500
  );
  return position_id;
end
$$;

create or replace function public.stop_gps_tracking(
  target_session_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.gps_tracking_sessions%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  next_status text;
begin
  select * into session from public.gps_tracking_sessions s where s.id = target_session_id for update;
  if session.id is null or not (
    session.employee_id = private.current_employee_id()
    or private.has_permission(session.branch_id, 'delivery.assign')
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('session_id', target_session_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = stop_gps_tracking.operation_id;
  if found then
    if receipt.command_name <> 'stop_gps_tracking' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  next_status := case when session.employee_id = private.current_employee_id() then 'STOPPED' else 'REVOKED' end;
  if session.status = 'ACTIVE' then
    update public.gps_tracking_sessions
      set status = next_status, stopped_at = now(), stop_reason = case when next_status = 'STOPPED' then 'user_stopped' else 'dispatcher_revoked' end,
          stop_operation_id = operation_id
      where id = session.id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values ((select auth.uid()), session.branch_id, 'gps_tracking.stopped', 'gps_tracking_session', session.id, operation_id,
      array['status']);
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'stop_gps_tracking', payload_hash, 'gps_tracking_session', session.id, now());
  return session.id;
end
$$;

create or replace function public.gps_fleet_snapshot(target_branch_id uuid)
returns table(
  session_id uuid,
  delivery_id uuid,
  delivery_number text,
  vehicle_id uuid,
  plate_number text,
  employee_id uuid,
  employee_name text,
  latitude numeric,
  longitude numeric,
  accuracy_meters numeric,
  captured_at timestamptz,
  received_at timestamptz,
  is_stale boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare stale_seconds integer;
begin
  if not private.has_permission(target_branch_id, 'delivery.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(s.gps_stale_after_seconds, 300) into stale_seconds from public.routing_settings s where s.branch_id = target_branch_id;
  stale_seconds := coalesce(stale_seconds, 300);
  return query
  select s.id, d.id, d.delivery_number, s.vehicle_id, v.plate_number, s.employee_id, e.display_name,
    p.latitude, p.longitude, p.accuracy_meters, p.captured_at, p.received_at,
    p.received_at < now() - make_interval(secs => stale_seconds)
  from public.gps_tracking_sessions s
  join public.deliveries d on d.id = s.delivery_id and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
  join public.delivery_assignments a on a.id = s.assignment_id and a.superseded_at is null and a.assignment_version = s.assignment_version
  join public.vehicles v on v.id = s.vehicle_id
  join public.employees e on e.id = s.employee_id
  join lateral (
    select gp.latitude, gp.longitude, gp.accuracy_meters, gp.captured_at, gp.received_at
    from public.gps_positions gp where gp.session_id = s.id order by gp.sequence desc limit 1
  ) p on true
  where s.branch_id = target_branch_id and s.status = 'ACTIVE'
  order by p.received_at desc, s.id;
end
$$;

create or replace function public.gps_position_history(
  target_session_id uuid,
  before_sequence bigint,
  page_size integer
)
returns setof public.gps_positions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare session public.gps_tracking_sessions%rowtype; bounded_size integer;
begin
  select * into session from public.gps_tracking_sessions s where s.id = target_session_id;
  if session.id is null or not (
    session.employee_id = private.current_employee_id()
    or private.has_permission(session.branch_id, 'delivery.read')
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  bounded_size := least(100, greatest(1, coalesce(page_size, 50)));
  return query
    select p.* from public.gps_positions p
    where p.session_id = target_session_id and (before_sequence is null or p.sequence < before_sequence)
    order by p.sequence desc limit bounded_size;
end
$$;

revoke all on function public.update_routing_settings(uuid,integer,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.start_gps_tracking(uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.record_gps_ping(uuid,bigint,timestamptz,numeric,numeric,numeric,numeric,numeric,uuid) from public, anon, authenticated;
revoke all on function public.stop_gps_tracking(uuid,uuid) from public, anon, authenticated;
revoke all on function public.gps_fleet_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.gps_position_history(uuid,bigint,integer) from public, anon, authenticated;
grant execute on function public.update_routing_settings(uuid,integer,integer,text,uuid) to authenticated;
grant execute on function public.start_gps_tracking(uuid,integer,uuid) to authenticated;
grant execute on function public.record_gps_ping(uuid,bigint,timestamptz,numeric,numeric,numeric,numeric,numeric,uuid) to authenticated;
grant execute on function public.stop_gps_tracking(uuid,uuid) to authenticated;
grant execute on function public.gps_fleet_snapshot(uuid) to authenticated;
grant execute on function public.gps_position_history(uuid,bigint,integer) to authenticated;

comment on table public.gps_positions is 'Foreground-only delivery telemetry; never authoritative delivery state.';
