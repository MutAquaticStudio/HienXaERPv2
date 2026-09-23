-- Deny GPS access when the caller has no employee identity.
-- PL/pgSQL IF skips NULL conditions, so every authorization guard must be two-valued.

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
  if session.id is null or session.status <> 'ACTIVE'
    or session.employee_id is distinct from private.current_employee_id() then
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
  if session.id is null or (
    session.employee_id = private.current_employee_id()
    or private.has_permission(session.branch_id, 'delivery.assign')
  ) is not true then raise exception 'forbidden' using errcode = '42501'; end if;
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
  if session.id is null or (
    session.employee_id = private.current_employee_id()
    or private.has_permission(session.branch_id, 'delivery.read')
  ) is not true then raise exception 'forbidden' using errcode = '42501'; end if;
  bounded_size := least(100, greatest(1, coalesce(page_size, 50)));
  return query
    select p.* from public.gps_positions p
    where p.session_id = target_session_id and (before_sequence is null or p.sequence < before_sequence)
    order by p.sequence desc limit bounded_size;
end
$$;
