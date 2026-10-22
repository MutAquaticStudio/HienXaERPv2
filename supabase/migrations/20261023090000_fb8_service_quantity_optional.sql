-- FB8 (Owner 23/10): a service by trip or hour often has no known quantity until the crew is on site. The planned quantity is
-- optional (null = "Tính theo thực tế"; the worker taps the count when finishing), and so is the description (the service
-- type's name is kept). Everything else in schedule_service_job is as in 20261018090000.
begin;

alter table public.service_jobs alter column planned_quantity drop not null;
alter table public.service_jobs drop constraint service_jobs_planned_quantity_check;
alter table public.service_jobs add constraint service_jobs_planned_quantity_check check (planned_quantity is null or planned_quantity > 0);

create or replace function public.schedule_service_job(target_branch_id uuid, target_customer_id uuid, target_site_id uuid,
  target_service_type_id uuid, description text, scheduled_start timestamptz, scheduled_end timestamptz, planned_quantity numeric,
  target_sales_employee_id uuid, target_vehicle_id uuid, target_machine_id uuid, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  entity_id uuid;
  chosen_type public.service_types%rowtype;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'service.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_service_type_id is null or char_length(trim(coalesce(description, ''))) > 500
    or scheduled_start is null or scheduled_end is null or scheduled_end <= scheduled_start or planned_quantity <= 0
    or num_nonnulls(target_vehicle_id, target_machine_id) > 1 or schedule_service_job.operation_id is null then
    raise exception 'invalid_service_job' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'customer', target_customer_id, 'site', target_site_id,
    'type', target_service_type_id, 'description', trim(description), 'start', scheduled_start, 'end', scheduled_end, 'quantity', planned_quantity,
    'sales', target_sales_employee_id, 'vehicle', target_vehicle_id, 'machine', target_machine_id));
  perform pg_advisory_xact_lock(hashtextextended(schedule_service_job.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = schedule_service_job.operation_id;
  if found then
    if receipt.command_name <> 'schedule_service_job' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if planned_quantity is not null then perform private.require_exact_quantity(planned_quantity, false); end if;

  select * into chosen_type from public.service_types t where t.id = target_service_type_id and t.branch_id = target_branch_id and t.active;
  if chosen_type.id is null then raise exception 'invalid_service_type' using errcode = '23503'; end if;
  if (chosen_type.resource_kind = 'NONE' and num_nonnulls(target_vehicle_id, target_machine_id) > 0)
    or (chosen_type.resource_kind = 'VEHICLE' and target_machine_id is not null)
    or (chosen_type.resource_kind = 'MACHINE' and target_vehicle_id is not null) then
    raise exception 'service_resource_mismatch' using errcode = '22023';
  end if;
  perform 1 from public.customers c join public.customer_sites s on s.customer_id = c.id
  where c.id = target_customer_id and c.branch_id = target_branch_id and c.active and s.id = target_site_id and s.active;
  if not found then raise exception 'invalid_customer_site' using errcode = '23503'; end if;
  if target_sales_employee_id is not null then
    perform 1 from public.employee_branch_access a where a.employee_id = target_sales_employee_id and a.branch_id = target_branch_id and a.active;
    if not found then raise exception 'invalid_sales_employee' using errcode = '23503'; end if;
  end if;
  if target_vehicle_id is not null then
    perform 1 from public.vehicles v where v.id = target_vehicle_id and v.branch_id = target_branch_id and v.active;
    if not found then raise exception 'invalid_vehicle' using errcode = '23503'; end if;
  end if;
  if target_machine_id is not null then
    perform 1 from public.machines m where m.id = target_machine_id and m.branch_id = target_branch_id and m.active;
    if not found then raise exception 'invalid_machine' using errcode = '23503'; end if;
  end if;

  insert into public.service_jobs(branch_id, job_number, customer_id, site_id, sales_employee_id, service_type, service_type_id, description,
    scheduled_start, scheduled_end, planned_quantity, unit_label, unit_price_vnd, vehicle_id, machine_id, created_by)
  values (target_branch_id,
    'SRV-' || to_char((scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.service_job_number_seq')::text, 6, '0'),
    target_customer_id, target_site_id, target_sales_employee_id, trim(chosen_type.name), chosen_type.id,
    case when char_length(trim(coalesce(description, ''))) >= 3 then trim(description) else left('Dịch vụ ' || trim(chosen_type.name), 500) end,
    scheduled_start, scheduled_end, planned_quantity, trim(chosen_type.unit_label), chosen_type.default_price_vnd, target_vehicle_id, target_machine_id,
    (select auth.uid()))
  returning id into entity_id;
  insert into public.command_receipts values (schedule_service_job.operation_id, (select auth.uid()), 'schedule_service_job', payload_hash, 'service_job', entity_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), target_branch_id, 'service_job.created', 'service_job', entity_id, schedule_service_job.operation_id,
    array['schedule', 'planned_quantity', 'resources', 'service_type'], left('Loại dịch vụ: ' || chosen_type.name, 500));
  return entity_id;
end
$function$;
revoke all on function public.schedule_service_job(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, numeric, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.schedule_service_job(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, numeric, uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
