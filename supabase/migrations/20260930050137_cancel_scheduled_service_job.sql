create or replace function public.cancel_scheduled_service_job(
  target_service_job_id uuid,
  expected_version integer,
  cancellation_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  job public.service_jobs%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into job from public.service_jobs
    where id = target_service_job_id for update;
  if job.id is null or not private.has_permission(job.branch_id, 'service.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(cancellation_reason)), 0) < 3
    or char_length(trim(cancellation_reason)) > 500 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object(
    'service_job_id', target_service_job_id,
    'version', expected_version,
    'reason', trim(cancellation_reason)
  ));
  select * into receipt from public.command_receipts
    where command_receipts.operation_id = cancel_scheduled_service_job.operation_id;
  if found then
    if receipt.command_name <> 'cancel_scheduled_service_job' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if job.execution_state <> 'SCHEDULED' or job.version <> expected_version then
    raise exception 'service_cancel_version_conflict' using errcode = '40001';
  end if;
  if exists (select 1 from public.work_items where service_job_id = job.id)
    or exists (select 1 from public.service_verifications where service_job_id = job.id) then
    raise exception 'service_cancel_has_execution' using errcode = '23514';
  end if;
  update public.service_jobs set execution_state = 'CANCELLED', version = version + 1
    where id = job.id;
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_scheduled_service_job', hash,
    'service_job', job.id, now()
  );
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason
  ) values (
    (select auth.uid()), job.branch_id, 'service_job.cancel', 'service_job', job.id,
    operation_id, array['execution_state'], trim(cancellation_reason)
  );
  return job.id;
end
$function$;

revoke all on function public.cancel_scheduled_service_job(uuid, integer, text, uuid) from public, anon;
grant execute on function public.cancel_scheduled_service_job(uuid, integer, text, uuid) to authenticated;
