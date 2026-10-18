-- FB3 A2 + FB4 F2/D21 (Owner 17/10/2026): one driver takes several deliveries, and assigning a driver puts the job on the
-- worker portal by itself.
-- * A delivery without an end time used to block its driver and vehicle for 4 hours, so a second "Giao ngay" for the same
--   person within 4 hours was refused. Each stop now takes the branch's "thời gian mỗi điểm giao" (branch setting, default
--   60 minutes). Saved end times are kept as they are.
-- * "Giao ngay" (create_delivery_for_order with assignment.schedule_mode = 'NOW') puts the stop at the first time the driver
--   and vehicle are both free, right after what they already have, instead of refusing it.
-- * A clash at a chosen time still refuses, and the error hint carries the nearest free start (next_free_at=...).
-- * A2: assign_delivery / assign_delivery_scheduled create the driver's work item (DIRECT, CLAIMED) when the delivery has
--   none yet, like "Giao việc qua cổng thợ", provided the delivery has receiver name, phone and address; otherwise the
--   delivery page still shows what is missing. Re-assigning moves an unstarted work item, as before.
begin;

create table public.branch_operation_settings (
  branch_id uuid primary key references public.branches(id) on delete restrict,
  stop_minutes integer not null default 60 check (stop_minutes between 5 and 720),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
alter table public.branch_operation_settings enable row level security;
revoke all on public.branch_operation_settings from anon, authenticated;
grant select on public.branch_operation_settings to authenticated;
create policy branch_operation_settings_select on public.branch_operation_settings for select to authenticated
  using ((select private.has_branch_access(branch_id)));

-- Owner sets the branch's delivery settings (roles.manage, like the other branch settings).
create or replace function public.save_branch_operation_settings(target_branch_id uuid, settings jsonb, expected_version integer, operation_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  current_row public.branch_operation_settings%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  minutes integer;
  result_version integer;
begin
  if auth.uid() is null or target_branch_id is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(settings) is distinct from 'object' or exists (select 1 from jsonb_object_keys(settings) key where key <> 'stop_minutes')
    or coalesce(settings->>'stop_minutes', '') !~ '^[0-9]{1,3}$' or save_branch_operation_settings.operation_id is null then
    raise exception 'operation_settings_invalid' using errcode = '22023';
  end if;
  minutes := (settings->>'stop_minutes')::integer;
  if minutes not between 5 and 720 then raise exception 'operation_settings_invalid' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'settings', settings, 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(save_branch_operation_settings.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_branch_operation_settings.operation_id;
  if found then
    if receipt.command_name <> 'save_branch_operation_settings' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return (select s.version from public.branch_operation_settings s where s.branch_id = target_branch_id);
  end if;
  select * into current_row from public.branch_operation_settings s where s.branch_id = target_branch_id for update;
  if current_row.branch_id is null then
    if expected_version is not null then raise exception 'operation_settings_changed' using errcode = 'PT409'; end if;
    insert into public.branch_operation_settings(branch_id, stop_minutes, updated_by) values (target_branch_id, minutes, (select auth.uid()))
    returning version into result_version;
  else
    if current_row.version is distinct from expected_version then raise exception 'operation_settings_changed' using errcode = 'PT409'; end if;
    update public.branch_operation_settings set stop_minutes = minutes, version = version + 1, updated_by = (select auth.uid()), updated_at = now()
    where branch_id = target_branch_id returning version into result_version;
  end if;
  insert into public.command_receipts values (save_branch_operation_settings.operation_id, auth.uid(), 'save_branch_operation_settings', hash, 'branch', target_branch_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, 'branch_operation_settings.saved', 'branches', target_branch_id, save_branch_operation_settings.operation_id,
    array['stop_minutes'], 'Thời gian mỗi điểm giao: ' || minutes || ' phút');
  return result_version;
end
$function$;
revoke all on function public.save_branch_operation_settings(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_branch_operation_settings(uuid, jsonb, integer, uuid) to authenticated;

-- How long one delivery stop takes in a branch when no end time was saved.
create or replace function private.delivery_stop_interval(target_branch_id uuid) returns interval
language sql stable security definer set search_path = '' as $$
  select make_interval(mins => coalesce((select s.stop_minutes from public.branch_operation_settings s where s.branch_id = target_branch_id), 60))
$$;
revoke all on function private.delivery_stop_interval(uuid) from public, anon, authenticated, service_role;

-- First start >= desired_start at which the employee and the vehicle are both free for `length`: the same busy windows the
-- assignment checks use (open delivery assignments, and claimed or running work items), skipping the delivery being placed.
create or replace function private.next_free_start(target_branch_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  desired_start timestamptz, length interval, skip_delivery_id uuid) returns timestamptz
language plpgsql stable security definer set search_path = '' as $function$
declare
  candidate timestamptz := desired_start;
  blocking_end timestamptz;
  rounds integer := 0;
begin
  if desired_start is null or length is null or length <= interval '0' then return desired_start; end if;
  loop
    select max(busy_end) into blocking_end from (
      select coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)) as busy_end
      from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
      where a.superseded_at is null and d.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED')
        and d.id is distinct from skip_delivery_id and d.scheduled_at is not null
        and (a.employee_id = target_employee_id or (target_vehicle_id is not null and a.vehicle_id = target_vehicle_id))
        and tstzrange(d.scheduled_at, coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)), '[)')
          && tstzrange(candidate, candidate + length, '[)')
      union all
      select w.scheduled_end
      from public.work_item_assignments a join public.work_items w on w.id = a.work_item_id
      where a.superseded_at is null and w.execution_state in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED')
        and w.delivery_id is distinct from skip_delivery_id
        and (a.employee_id = target_employee_id or (target_vehicle_id is not null and a.vehicle_id = target_vehicle_id))
        and tstzrange(w.scheduled_start, w.scheduled_end, '[)') && tstzrange(candidate, candidate + length, '[)')
    ) busy;
    exit when blocking_end is null or blocking_end <= candidate;
    candidate := blocking_end;
    rounds := rounds + 1;
    if rounds > 200 then raise exception 'work_resource_schedule_collision' using errcode = '23P01'; end if;
  end loop;
  return candidate;
end
$function$;
revoke all on function private.next_free_start(uuid, uuid, uuid, timestamptz, interval, uuid) from public, anon, authenticated, service_role;

-- A2: the driver's work item for an assigned delivery, as publish_work_item DIRECT makes it. Called by the assignment
-- commands (delivery.assign); returns null and changes nothing while receiver name, phone or address is missing.
create or replace function private.sync_delivery_work_item(target_delivery_id uuid, trace uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  d public.deliveries%rowtype;
  current_assignment public.delivery_assignments%rowtype;
  entity_id uuid;
  end_at timestamptz;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id;
  select * into current_assignment from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null;
  if d.id is null or d.execution_state <> 'ASSIGNED' or d.scheduled_at is null or current_assignment.employee_id is null then return null; end if;
  select w.id into entity_id from public.work_items w where w.delivery_id = d.id;
  if entity_id is not null then return entity_id; end if;
  if nullif(trim(d.delivery_address_snapshot), '') is null or nullif(trim(d.receiver_name_snapshot), '') is null
    or nullif(trim(d.receiver_phone_snapshot), '') is null
    or not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.planned_base_quantity > 0) then
    return null;
  end if;
  end_at := coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id));
  insert into public.work_items(branch_id, work_number, delivery_id, service_job_id, title, assignment_mode, execution_state, scheduled_start, scheduled_end,
    planned_vehicle_id, planned_machine_id, created_by)
  values (d.branch_id, 'WRK-' || to_char((d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.work_item_number_seq')::text, 6, '0'),
    d.id, null, 'Giao hàng - ' || d.delivery_number, 'DIRECT', 'CLAIMED', d.scheduled_at, end_at, current_assignment.vehicle_id, null, (select auth.uid()))
  returning id into entity_id;
  perform private.assert_work_resources_available(entity_id, d.branch_id, current_assignment.employee_id, current_assignment.vehicle_id, null, d.scheduled_at, end_at);
  insert into public.work_item_assignments(work_item_id, assignment_version, employee_id, vehicle_id, machine_id, assignment_kind, assigned_by)
  values (entity_id, 1, current_assignment.employee_id, current_assignment.vehicle_id, null, 'DIRECT', (select auth.uid()));
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), d.branch_id, 'work_item.published', 'work_item', entity_id, trace, array['source', 'assignment_mode', 'schedule'],
    'Tự giao việc cho người giao khi phân xe');
  return entity_id;
end
$function$;
revoke all on function private.sync_delivery_work_item(uuid, uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_delivery_resources(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, target_start timestamp with time zone, target_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deliveries%rowtype; vehicle public.vehicles%rowtype; l public.delivery_lines%rowtype;
 load numeric:=0; factor numeric; conversion_count integer; work_id uuid; free_at timestamptz;
begin
 select * into d from public.deliveries where id=target_delivery_id;
 if target_start is null or target_end is null or target_end<=target_start
 then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
 if not private.employee_can_report_work(target_employee_id,d.branch_id) then raise exception 'delivery_employee_cannot_report_work' using errcode='23503';end if;
 select id into work_id from public.work_items where delivery_id=d.id;
 -- F2: a clash says when the person and vehicle are free next, so the caller can offer that time.
 free_at:=private.next_free_start(d.branch_id,target_employee_id,target_vehicle_id,target_start,target_end-target_start,d.id);
 if free_at>target_start then
  raise exception 'work_resource_schedule_collision' using errcode='23P01',
   hint='next_free_at='||to_char(free_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 end if;
 perform private.assert_work_resources_available(coalesce(work_id,d.id),d.branch_id,target_employee_id,target_vehicle_id,null,target_start,target_end);
 -- The same employee/vehicle locks protect unpublished assignments and work assignments.
 if exists(select 1 from public.delivery_assignments a join public.deliveries other on other.id=a.delivery_id
  where a.superseded_at is null and other.id<>d.id and other.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
  and (a.employee_id=target_employee_id or a.vehicle_id=target_vehicle_id)
  and tstzrange(other.scheduled_at,coalesce(other.scheduled_end_at,other.scheduled_at+private.delivery_stop_interval(other.branch_id)),'[)')
    &&tstzrange(target_start,target_end,'[)'))
 then raise exception 'work_resource_schedule_collision' using errcode='23P01';end if;
 select * into vehicle from public.vehicles where id=target_vehicle_id;
 if vehicle.capacity_quantity is null or vehicle.capacity_uom_id is null or vehicle.capacity_verified_at is null or vehicle.capacity_verified_by is null or nullif(trim(vehicle.capacity_source_note),'') is null
 then raise exception 'vehicle_capacity_basis_missing' using errcode='23514';end if;
 perform private.require_exact_quantity(vehicle.capacity_quantity,false);
 for l in select * from public.delivery_lines where delivery_id=d.id loop
  if l.base_uom_id=vehicle.capacity_uom_id then factor:=1;
  else
   select count(*)::integer,min(c.numerator/c.denominator) into conversion_count,factor
   from public.material_uom_conversions c where c.active and c.from_uom_id=l.base_uom_id
    and c.to_uom_id=vehicle.capacity_uom_id and (c.material_id=l.material_id or c.material_id is null)
    and c.conversion_type in('EXACT','PACKAGING','MEASURED')
    and (c.conversion_type<>'MEASURED' or nullif(trim(c.source_note),'') is not null)
    and c.effective_from<=target_start and (c.effective_to is null or c.effective_to>target_start);
   if conversion_count<>1 or factor is null
   then raise exception 'vehicle_capacity_conversion_missing' using errcode='23514';end if;
  end if;
  load:=load+l.planned_base_quantity*factor;
 end loop;
 if load>vehicle.capacity_quantity then raise exception 'vehicle_capacity_exceeded' using errcode='23514';end if;
end $function$
;

CREATE OR REPLACE FUNCTION private.assert_work_resources_available(target_work_item_id uuid, target_branch_id uuid, target_employee_id uuid, target_vehicle_id uuid, target_machine_id uuid, target_start timestamp with time zone, target_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.employees e
  where e.id = target_employee_id and e.active
    and exists (select 1 from public.employee_branch_access a where a.employee_id = e.id and a.branch_id = target_branch_id and a.active)
  for update;
  if not found then raise exception 'employee_not_eligible' using errcode = '23503'; end if;
  if target_vehicle_id is not null then
    perform 1 from public.vehicles where id = target_vehicle_id and branch_id = target_branch_id and active for update;
    if not found then raise exception 'vehicle_not_available' using errcode = '23503'; end if;
  end if;
  if target_machine_id is not null then
    perform 1 from public.machines where id = target_machine_id and branch_id = target_branch_id and active for update;
    if not found then raise exception 'machine_not_available' using errcode = '23503'; end if;
  end if;
  if target_start is null or target_end is null or target_end<=target_start then raise exception 'work_schedule_window_required' using errcode='22023';end if;
  if exists(select 1 from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id
    where a.superseded_at is null and d.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
    and d.id is distinct from (select delivery_id from public.work_items where id=target_work_item_id)
    and d.id<>target_work_item_id and (a.employee_id=target_employee_id or a.vehicle_id=target_vehicle_id)
    and tstzrange(d.scheduled_at,coalesce(d.scheduled_end_at,d.scheduled_at+private.delivery_stop_interval(d.branch_id)),'[)')&&tstzrange(target_start,target_end,'[)'))
  then raise exception 'work_resource_schedule_collision' using errcode='23P01';end if;
  if exists (
    select 1 from public.work_item_assignments a
    join public.work_items w on w.id = a.work_item_id
    where a.superseded_at is null and w.id <> target_work_item_id
      and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
      and tstzrange(w.scheduled_start, w.scheduled_end, '[)') && tstzrange(target_start, target_end, '[)')
      and (a.employee_id = target_employee_id
        or (target_vehicle_id is not null and a.vehicle_id = target_vehicle_id)
        or (target_machine_id is not null and a.machine_id = target_machine_id))
  ) then raise exception 'work_resource_schedule_collision' using errcode = '23P01'; end if;
end
$function$
;

CREATE OR REPLACE FUNCTION public.assign_delivery(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; work public.work_items%rowtype; work_assignment_version integer; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery.operation_id;
  if found then if receipt.command_name <> 'assign_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version is distinct from expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = 'PT409'; end if;
  if not ((target_employee_id is not null and target_vehicle_id is not null and nullif(trim(external_carrier_name), '') is null)
    or (target_employee_id is null and target_vehicle_id is null and nullif(trim(external_carrier_name), '') is not null)) then raise exception 'invalid_assignment_shape' using errcode = '22023'; end if;
  if target_employee_id is not null and (not exists (select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id where e.id = target_employee_id and e.active and a.branch_id = delivery.branch_id and a.active)
    or not exists (select 1 from public.vehicles where id = target_vehicle_id and branch_id = delivery.branch_id and active)) then raise exception 'assignment_resource_invalid' using errcode = '23503'; end if;
  select * into work from public.work_items where delivery_id=delivery.id for update;
  if work.id is not null and(work.execution_state not in('AVAILABLE','CLAIMED') or work.started_at is not null)
  then raise exception 'delivery_reassignment_after_work_started_forbidden' using errcode='PT409';end if;
  if work.id is not null and target_employee_id is null then
   raise exception 'delivery_external_assignment_with_work_forbidden' using errcode='PT409';
  end if;
  if target_employee_id is not null then
   perform private.assert_delivery_resources(delivery.id,target_employee_id,target_vehicle_id,delivery.scheduled_at,
     coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+private.delivery_stop_interval(delivery.branch_id)));
  end if;
  update public.gps_tracking_sessions set status='REVOKED',stopped_at=now(),stop_reason='assignment_superseded'
   where delivery_id=delivery.id and status='ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', scheduled_end_at=coalesce(scheduled_end_at,work.scheduled_end,scheduled_at+private.delivery_stop_interval(branch_id)), version = version + 1 where id = target_delivery_id;
  if work.id is not null then
   update public.work_item_assignments set superseded_at=now() where work_item_id=work.id and superseded_at is null;
   if target_employee_id is null then
    update public.work_items set execution_state='CANCELLED',version=version+1 where id=work.id;
   else
    select coalesce(max(assignment_version),0)+1 into work_assignment_version from public.work_item_assignments where work_item_id=work.id;
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by)
     values(work.id,work_assignment_version,target_employee_id,target_vehicle_id,null,'DIRECT',(select auth.uid()));
    update public.work_items set planned_vehicle_id=target_vehicle_id,scheduled_start=delivery.scheduled_at,scheduled_end=coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+private.delivery_stop_interval(delivery.branch_id)),execution_state='CLAIMED',version=version+1 where id=work.id;
   end if;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.assigned','delivery',delivery.id,assign_delivery.operation_id,
   array['delivery_assignment','work_assignment','assignment_version','gps_session'],
   case when work.id is not null then 'Đồng bộ phân giao trước khi bắt đầu việc' else 'Phân giao theo kế hoạch' end);
  -- A2: assigning a driver puts the job on the worker portal.
  if target_employee_id is not null and work.id is null then perform private.sync_delivery_work_item(delivery.id, assign_delivery.operation_id); end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$

;

CREATE OR REPLACE FUNCTION public.assign_delivery_scheduled(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid, scheduled_start timestamptz, scheduled_end timestamptz)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; work public.work_items%rowtype; work_assignment_version integer; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version,'scheduled_start',scheduled_start,'scheduled_end',scheduled_end));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery_scheduled.operation_id;
  if found then if receipt.command_name <> 'assign_delivery_scheduled' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version is distinct from expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = 'PT409'; end if;
  if not ((target_employee_id is not null and target_vehicle_id is not null and nullif(trim(external_carrier_name), '') is null)
    or (target_employee_id is null and target_vehicle_id is null and nullif(trim(external_carrier_name), '') is not null)) then raise exception 'invalid_assignment_shape' using errcode = '22023'; end if;
  if target_employee_id is not null and (not exists (select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id where e.id = target_employee_id and e.active and a.branch_id = delivery.branch_id and a.active)
    or not exists (select 1 from public.vehicles where id = target_vehicle_id and branch_id = delivery.branch_id and active)) then raise exception 'assignment_resource_invalid' using errcode = '23503'; end if;
  if scheduled_start is null or scheduled_end is null or scheduled_end<=scheduled_start
  then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
  delivery.scheduled_at:=scheduled_start;delivery.scheduled_end_at:=scheduled_end;
  select * into work from public.work_items where delivery_id=delivery.id for update;
  if work.id is not null and(work.execution_state not in('AVAILABLE','CLAIMED') or work.started_at is not null)
  then raise exception 'delivery_reassignment_after_work_started_forbidden' using errcode='PT409';end if;
  if work.id is not null and target_employee_id is null then
   raise exception 'delivery_external_assignment_with_work_forbidden' using errcode='PT409';
  end if;
  if target_employee_id is not null then
   perform private.assert_delivery_resources(delivery.id,target_employee_id,target_vehicle_id,delivery.scheduled_at,
     coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+private.delivery_stop_interval(delivery.branch_id)));
  end if;
  update public.gps_tracking_sessions set status='REVOKED',stopped_at=now(),stop_reason='assignment_superseded'
   where delivery_id=delivery.id and status='ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', scheduled_at=scheduled_start,scheduled_end_at=scheduled_end, version = version + 1 where id = target_delivery_id;
  if work.id is not null then
   update public.work_item_assignments set superseded_at=now() where work_item_id=work.id and superseded_at is null;
   if target_employee_id is null then
    update public.work_items set execution_state='CANCELLED',version=version+1 where id=work.id;
   else
    select coalesce(max(assignment_version),0)+1 into work_assignment_version from public.work_item_assignments where work_item_id=work.id;
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by)
     values(work.id,work_assignment_version,target_employee_id,target_vehicle_id,null,'DIRECT',(select auth.uid()));
    update public.work_items set planned_vehicle_id=target_vehicle_id,scheduled_start=delivery.scheduled_at,scheduled_end=coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+private.delivery_stop_interval(delivery.branch_id)),execution_state='CLAIMED',version=version+1 where id=work.id;
   end if;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.assigned','delivery',delivery.id,assign_delivery_scheduled.operation_id,
   array['delivery_assignment','work_assignment','assignment_version','gps_session'],
   case when work.id is not null then 'Đồng bộ phân giao trước khi bắt đầu việc' else 'Phân giao theo kế hoạch' end);
  -- A2: assigning a driver puts the job on the worker portal.
  if target_employee_id is not null and work.id is null then perform private.sync_delivery_work_item(delivery.id, assign_delivery_scheduled.operation_id); end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery_scheduled', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$

;

CREATE OR REPLACE FUNCTION public.publish_work_item(target_branch_id uuid, source_kind text, source_id uuid, requested_assignment_mode text, target_employee_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; title text; start_at timestamptz; end_at timestamptz; vehicle uuid; machine uuid; employee uuid := target_employee_id; source_delivery uuid; source_service uuid;
begin
  if not private.has_permission(target_branch_id, 'work.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if source_kind not in ('DELIVERY','SERVICE_JOB') or requested_assignment_mode not in ('DIRECT','POOL_CLAIM') then raise exception 'invalid_work_source' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'kind',source_kind,'source',source_id,'mode',requested_assignment_mode,'employee',target_employee_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = publish_work_item.operation_id;
  if found then
    if receipt.command_name <> 'publish_work_item' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if source_kind = 'SERVICE_JOB' then
    select j.id,j.service_type||' - '||j.job_number,j.scheduled_start,j.scheduled_end,j.vehicle_id,j.machine_id into source_service,title,start_at,end_at,vehicle,machine
    from public.service_jobs j where j.id=source_id and j.branch_id=target_branch_id and j.execution_state='SCHEDULED' for update;
    if source_service is null then raise exception 'service_not_ready' using errcode = '55000'; end if;
  else
    if requested_assignment_mode <> 'DIRECT' then raise exception 'delivery_requires_direct_assignment' using errcode = '22023'; end if;
    select d.id,'Giao hàng - '||d.delivery_number,d.scheduled_at,coalesce(d.scheduled_end_at,d.scheduled_at+private.delivery_stop_interval(d.branch_id)),a.vehicle_id,a.employee_id into source_delivery,title,start_at,end_at,vehicle,employee
    from public.deliveries d join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null
    where d.id=source_id and d.branch_id=target_branch_id and d.execution_state='ASSIGNED' and d.scheduled_at is not null for update of d;
    if source_delivery is null or employee is null then raise exception 'delivery_not_ready_for_work' using errcode = '55000'; end if;
    if exists (select 1 from public.deliveries d where d.id = source_delivery
        and (nullif(trim(d.delivery_address_snapshot),'') is null
          or nullif(trim(d.receiver_name_snapshot),'') is null
          or nullif(trim(d.receiver_phone_snapshot),'') is null))
      or not exists (select 1 from public.delivery_lines l where l.delivery_id = source_delivery and l.planned_base_quantity > 0) then
      raise exception 'delivery_contact_or_lines_missing' using errcode = '55000';
    end if;
  end if;
  if requested_assignment_mode='DIRECT' and employee is null then raise exception 'direct_employee_required' using errcode = '22023'; end if;
  if requested_assignment_mode='POOL_CLAIM' and employee is not null then raise exception 'pool_cannot_preassign_employee' using errcode = '22023'; end if;
  insert into public.work_items(branch_id,work_number,delivery_id,service_job_id,title,assignment_mode,execution_state,scheduled_start,scheduled_end,planned_vehicle_id,planned_machine_id,created_by)
  values(target_branch_id,'WRK-'||to_char((start_at at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.work_item_number_seq')::text,6,'0'),source_delivery,source_service,title,requested_assignment_mode,case when employee is null then 'AVAILABLE' else 'CLAIMED' end,start_at,end_at,vehicle,machine,(select auth.uid())) returning id into entity_id;
  if employee is not null then
    perform private.assert_work_resources_available(entity_id,target_branch_id,employee,vehicle,machine,start_at,end_at);
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(entity_id,1,employee,vehicle,machine,'DIRECT',(select auth.uid()));
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'publish_work_item',payload_hash,'work_item',entity_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'work_item.published','work_item',entity_id,operation_id,array['source','assignment_mode','schedule']);
  return entity_id;
end
$function$

;

create or replace function public.create_delivery_for_order(
  target_sales_order_id uuid,
  target_warehouse_id uuid,
  delivery_lines jsonb,
  scheduled_at timestamptz,
  assignment jsonb,
  operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  sale_order public.sales_orders%rowtype;
  sale_line public.sales_order_lines%rowtype;
  allocation public.supply_allocations%rowtype;
  item jsonb;
  item_no integer;
  line_ids uuid[] := '{}';
  base_quantity numeric;
  covered numeric;
  allocation_id uuid;
  planned jsonb := '[]';
  delivery_id uuid;
  assignment_id uuid;
  assign_start timestamptz;
  stop_length interval;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null or auth.uid() is null or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if operation_id is null or target_warehouse_id is null or scheduled_at is null or jsonb_typeof(delivery_lines) is distinct from 'array'
    or jsonb_array_length(delivery_lines) not between 1 and 50 or (assignment is not null and jsonb_typeof(assignment) <> 'object') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('order', target_sales_order_id, 'warehouse', target_warehouse_id,
    'lines', delivery_lines, 'scheduled_at', scheduled_at, 'assignment', assignment));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = create_delivery_for_order.operation_id;
  if found then
    if receipt.command_name <> 'create_delivery_for_order' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('delivery_id', receipt.result_entity_id, 'replayed', true,
      'scheduled_at', (select d.scheduled_at from public.deliveries d where d.id = receipt.result_entity_id),
      'scheduled_end_at', (select d.scheduled_end_at from public.deliveries d where d.id = receipt.result_entity_id));
  end if;

  for item in select value from jsonb_array_elements(delivery_lines) loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['sales_order_line_id', 'quantity']))
      or (item->>'sales_order_line_id') is null or (item->>'sales_order_line_id')::uuid = any(line_ids)
      or coalesce(item->>'quantity', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'invalid_delivery_line' using errcode = '22023';
    end if;
    line_ids := line_ids || (item->>'sales_order_line_id')::uuid;
  end loop;
  -- Same lock order as create_delivery_from_allocations: allocations, sales lines, then the order.
  perform 1 from public.supply_allocations a where a.sales_order_line_id = any(line_ids) order by a.id for update;
  perform 1 from public.sales_order_lines l where l.id = any(line_ids) order by l.id for update;
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id for update;
  if sale_order.commercial_state <> 'CONFIRMED' then raise exception 'order_not_ready_for_delivery' using errcode = '42501'; end if;

  for item, item_no in select value, ordinality from jsonb_array_elements(delivery_lines) with ordinality loop
    select * into sale_line from public.sales_order_lines l where l.id = (item->>'sales_order_line_id')::uuid;
    if sale_line.id is null or sale_line.sales_order_id <> sale_order.id then raise exception 'delivery_line_source_invalid_or_duplicate' using errcode = '23514'; end if;
    -- The quantity is typed in the unit the order was sold in; the delivery keeps base units, which must stay exact.
    perform private.require_exact_quantity((item->>'quantity')::numeric, false);
    base_quantity := trim_scale((item->>'quantity')::numeric * sale_line.conversion_numerator / sale_line.conversion_denominator);
    perform private.require_exact_quantity(base_quantity, false);

    select * into allocation from public.supply_allocations a
      where a.sales_order_line_id = sale_line.id and a.supply_mode = 'WAREHOUSE' and a.warehouse_id = target_warehouse_id
      order by a.id limit 1;
    if allocation.id is null then
      allocation_id := private.allocate_warehouse_source(sale_line.id, target_warehouse_id, base_quantity, null, null);
    else
      covered := allocation.allocated_base_quantity - private.delivery_allocation_consumed(allocation.id);
      allocation_id := allocation.id;
      if covered < base_quantity then
        perform private.allocate_warehouse_source(sale_line.id, target_warehouse_id,
          allocation.allocated_base_quantity + (base_quantity - covered), allocation.id, allocation.version);
      end if;
    end if;
    planned := planned || jsonb_build_array(jsonb_build_object('supply_allocation_id', allocation_id, 'planned_base_quantity', base_quantity));
  end loop;

  delivery_id := public.create_delivery_from_allocations(sale_order.id, planned, scheduled_at, md5(operation_id::text || ':delivery')::uuid);
  if assignment is not null then
    if exists (select 1 from jsonb_object_keys(assignment) key where key <> all(array['employee_id', 'vehicle_id', 'scheduled_start', 'scheduled_end', 'schedule_mode']))
      or coalesce(assignment->>'schedule_mode', 'AT') not in ('AT', 'NOW') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    assign_start := coalesce((assignment->>'scheduled_start')::timestamptz, scheduled_at);
    stop_length := coalesce((assignment->>'scheduled_end')::timestamptz - assign_start, private.delivery_stop_interval(sale_order.branch_id));
    if stop_length <= interval '0' then raise exception 'delivery_schedule_window_required' using errcode = '22023'; end if;
    -- F2 "Giao ngay": a busy driver or vehicle gets this stop right after what they already have, instead of a clash.
    if assignment->>'schedule_mode' = 'NOW' then
      assign_start := private.next_free_start(sale_order.branch_id, (assignment->>'employee_id')::uuid, (assignment->>'vehicle_id')::uuid,
        greatest(assign_start, now()), stop_length, delivery_id);
    end if;
    assignment_id := public.assign_delivery_scheduled(delivery_id, (assignment->>'employee_id')::uuid, (assignment->>'vehicle_id')::uuid, null, null,
      (select d.version from public.deliveries d where d.id = delivery_id), md5(operation_id::text || ':assign')::uuid,
      assign_start, assign_start + stop_length);
  end if;

  insert into public.command_receipts values (operation_id, auth.uid(), 'create_delivery_for_order', payload_hash, 'delivery', delivery_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), sale_order.branch_id, 'delivery.create_for_order', 'deliveries', delivery_id, operation_id,
    array_remove(array['supply_allocations', 'delivery_lines', case when assignment is not null then 'assignment' end], null), null);
  return jsonb_build_object('delivery_id', delivery_id, 'assignment_id', assignment_id, 'replayed', false,
    'scheduled_at', (select d.scheduled_at from public.deliveries d where d.id = delivery_id),
    'scheduled_end_at', (select d.scheduled_end_at from public.deliveries d where d.id = delivery_id));
end
$function$;

revoke all on function public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid) from public, anon;
grant execute on function public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid) to authenticated;

-- Same as 20261003063723, plus the work item once the receiver is known (A2).
create or replace function public.update_delivery_receiver(
  target_delivery_id uuid, receiver_name text, receiver_phone text, reason text,
  expected_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare delivery public.deliveries%rowtype; receipt public.command_receipts%rowtype; hash text;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id,'delivery.assign') then
    raise exception 'forbidden_or_delivery_not_found' using errcode='42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery',target_delivery_id,
    'receiver',trim(receiver_name),'phone',trim(receiver_phone),'reason',trim(reason),'version',expected_version));
  select * into receipt from public.command_receipts r where r.operation_id=update_delivery_receiver.operation_id;
  if found then
    if receipt.command_name<>'update_delivery_receiver' or receipt.payload_hash<>hash then
      raise exception 'operation_payload_conflict' using errcode='23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if delivery.version is distinct from expected_version then raise exception 'stale_delivery_version' using errcode='40001'; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED')
    or exists(select 1 from public.work_items w where w.delivery_id=delivery.id) then
    raise exception 'delivery_contact_locked' using errcode='55000';
  end if;
  if receiver_name is null or char_length(trim(receiver_name)) not between 1 and 120
    or receiver_phone is null or char_length(trim(receiver_phone)) not between 1 and 40
    or reason is null or char_length(trim(reason)) not between 3 and 500 then
    raise exception 'invalid_delivery_contact' using errcode='22023';
  end if;
  update public.deliveries set receiver_name_snapshot=trim(receiver_name),
    receiver_phone_snapshot=trim(receiver_phone),version=version+1 where id=delivery.id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.receiver.updated','delivery',delivery.id,operation_id,
    array['receiver_name_snapshot','receiver_phone_snapshot'],trim(reason));
  -- A2: an assigned delivery that was waiting only for its receiver goes to the driver's worker portal now.
  if delivery.execution_state='ASSIGNED' then perform private.sync_delivery_work_item(delivery.id,update_delivery_receiver.operation_id); end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'update_delivery_receiver',hash,'delivery',delivery.id,now());
  return delivery.id;
end $$;
revoke all on function public.update_delivery_receiver(uuid,text,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.update_delivery_receiver(uuid,text,text,text,integer,uuid) to authenticated;

revoke all on function public.assign_delivery_scheduled(uuid,uuid,uuid,text,text,integer,uuid,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.assign_delivery_scheduled(uuid,uuid,uuid,text,text,integer,uuid,timestamptz,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
