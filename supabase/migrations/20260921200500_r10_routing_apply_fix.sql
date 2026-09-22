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
  insert into public.command_receipts values (apply_route_plan.operation_id, (select auth.uid()), 'apply_route_plan', payload_hash, 'route_plan', plan.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), plan.branch_id, 'route_plan.applied', 'route_plan', plan.id, apply_route_plan.operation_id,
    array['delivery_assignments','vehicle','driver']);
  return plan.id;
end
$$;

revoke all on function public.apply_route_plan(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.apply_route_plan(uuid,integer,uuid) to authenticated;
