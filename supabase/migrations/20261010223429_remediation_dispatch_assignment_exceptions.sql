-- G06/G10/G21: coherent pre-start assignment and unresolved custody board.
begin;
create function private.delivery_has_unresolved_exception(did uuid) returns boolean
 language sql stable security definer set search_path='' as $exception$
 select exists(select 1 from public.return_cases r where r.state='OPEN' and r.delivery_line_id in(select id from public.delivery_lines where delivery_id=did))
 or exists(select 1 from public.deliveries d where d.id=did and d.execution_state='VERIFIED' and(
  exists(select 1 from public.inventory_movements m where m.delivery_id=d.id and m.location_kind='IN_TRANSIT'
   group by m.material_id,m.base_uom_id having sum(m.base_quantity_delta)<>0 or sum(m.inventory_value_delta_vnd)<>0)
  or exists(select 1 from public.delivery_verification_lines v join public.delivery_lines l on l.id=v.delivery_line_id where l.delivery_id=d.id
   and v.actual_base_quantity-v.accepted_base_quantity>coalesce((select sum(r.base_quantity) from public.return_cases r
    where r.delivery_line_id=l.id and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state<>'OPEN'),0))
 ))
 or exists(select 1 from public.deliveries d where d.id=did and d.execution_state='RESULT_SUBMITTED' and d.result_kind in('PARTIAL','FAILED'))
$exception$;
revoke all on function private.delivery_has_unresolved_exception(uuid) from public,anon,authenticated,service_role;
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
  if work.id is not null and target_employee_id is not null then
   perform private.assert_work_resources_available(work.id,delivery.branch_id,target_employee_id,target_vehicle_id,null,
     work.scheduled_start,work.scheduled_end);
  end if;
  update public.gps_tracking_sessions set status='REVOKED',stopped_at=now(),stop_reason='assignment_superseded'
   where delivery_id=delivery.id and status='ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', version = version + 1 where id = target_delivery_id;
  if work.id is not null then
   update public.work_item_assignments set superseded_at=now() where work_item_id=work.id and superseded_at is null;
   if target_employee_id is null then
    update public.work_items set execution_state='CANCELLED',version=version+1 where id=work.id;
   else
    select coalesce(max(assignment_version),0)+1 into work_assignment_version from public.work_item_assignments where work_item_id=work.id;
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by)
     values(work.id,work_assignment_version,target_employee_id,target_vehicle_id,null,'DIRECT',(select auth.uid()));
    update public.work_items set planned_vehicle_id=target_vehicle_id,execution_state='CLAIMED',version=version+1 where id=work.id;
   end if;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.assigned','delivery',delivery.id,assign_delivery.operation_id,
   array['delivery_assignment','work_assignment','assignment_version','gps_session'],
   case when work.id is not null then 'Đồng bộ phân giao trước khi bắt đầu việc' else 'Phân giao theo kế hoạch' end);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.dispatch_board_page(target_branch_id uuid, target_bucket text, target_q text, target_offset integer, target_limit integer)
 RETURNS TABLE(id uuid, delivery_number text, customer_name_snapshot text, site_name_snapshot text, execution_state text, result_kind text, scheduled_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  safe_offset integer := greatest(0, least(coalesce(target_offset, 0), 250000));
  safe_limit integer := greatest(1, least(coalesce(target_limit, 26), 26));
  q text := coalesce(target_q, '');
begin
  if not private.has_permission(target_branch_id, 'delivery.read')
     or target_bucket not in ('planned', 'assigned', 'active', 'exception')
     or length(q) > 80 then
    raise exception 'dispatch_forbidden' using errcode = '42501';
  end if;

  if target_bucket = 'planned' and q = '' then
    return query
      select d.id, d.delivery_number, d.customer_name_snapshot, d.site_name_snapshot,
        d.execution_state, d.result_kind, d.scheduled_at
      from public.deliveries d
      where d.branch_id = target_branch_id and d.execution_state = 'PLANNED'
      order by d.scheduled_at asc nulls last, d.id asc
      offset safe_offset limit safe_limit;
  else
    return query
      select d.id, d.delivery_number, d.customer_name_snapshot, d.site_name_snapshot,
        d.execution_state, d.result_kind, d.scheduled_at
      from public.deliveries d
      where d.branch_id = target_branch_id and d.execution_state <> 'CANCELLED'
        and (
          (target_bucket = 'planned' and d.execution_state = 'PLANNED')
          or (target_bucket = 'assigned' and d.execution_state = 'ASSIGNED')
          or (target_bucket = 'active' and d.execution_state in ('DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED'))
          or (target_bucket = 'exception' and private.delivery_has_unresolved_exception(d.id))
        )
        and (q = '' or d.delivery_number ilike '%' || q || '%'
          or d.customer_name_snapshot ilike '%' || q || '%'
          or d.site_name_snapshot ilike '%' || q || '%')
      order by d.scheduled_at asc nulls last, d.id asc
      offset safe_offset limit safe_limit;
  end if;
end;
$function$
;
notify pgrst,'reload schema';
commit;
