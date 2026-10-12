begin;
create function private.employee_can_report_work(target_employee_id uuid,target_branch_id uuid) returns boolean
language sql stable security definer set search_path='' as $body$
 select exists(select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.roles r on r.id=a.role_id and r.active join public.role_permissions rp on rp.role_id=r.id
  join public.branches b on b.id=a.branch_id and b.active
  where e.id=target_employee_id and e.active and e.auth_user_id is not null and a.branch_id=target_branch_id and rp.permission_code='work.claim')
$body$;
revoke all on function private.employee_can_report_work(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.assert_delivery_resources(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, target_start timestamp with time zone, target_end timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.deliveries%rowtype; vehicle public.vehicles%rowtype; l public.delivery_lines%rowtype;
 load numeric:=0; factor numeric; conversion_count integer; work_id uuid;
begin
 select * into d from public.deliveries where id=target_delivery_id;
 if target_start is null or target_end is null or target_end<=target_start
 then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
 if not private.employee_can_report_work(target_employee_id,d.branch_id) then raise exception 'delivery_employee_cannot_report_work' using errcode='23503';end if;
 select id into work_id from public.work_items where delivery_id=d.id;
 perform private.assert_work_resources_available(coalesce(work_id,d.id),d.branch_id,target_employee_id,target_vehicle_id,null,target_start,target_end);
 -- The same employee/vehicle locks protect unpublished assignments and work assignments.
 if exists(select 1 from public.delivery_assignments a join public.deliveries other on other.id=a.delivery_id
  where a.superseded_at is null and other.id<>d.id and other.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
  and (a.employee_id=target_employee_id or a.vehicle_id=target_vehicle_id)
  and tstzrange(other.scheduled_at,coalesce(other.scheduled_end_at,other.scheduled_at+interval '4 hours'),'[)')
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
notify pgrst,'reload schema';
commit;
