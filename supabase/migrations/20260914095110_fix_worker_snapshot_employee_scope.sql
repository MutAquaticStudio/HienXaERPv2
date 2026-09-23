create or replace function public.worker_portal_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_worker_id uuid := private.current_employee_id();
  employee_json jsonb;
  current_job jsonb;
  next_job jsonb;
  pool_jobs jsonb;
  earnings jsonb;
begin
  if current_worker_id is null or not exists (
    select 1 from public.employee_branch_access a
    where a.employee_id = current_worker_id and a.active and private.has_permission(a.branch_id, 'work.claim')
  ) then
    raise exception 'active_worker_access_required' using errcode = '42501';
  end if;

  select jsonb_build_object('id', e.id, 'code', e.code, 'display_name', e.display_name)
  into employee_json from public.employees e where e.id = current_worker_id;
  if employee_json is null then raise exception 'active_worker_required' using errcode = '42501'; end if;

  select private.worker_work_item_payload(w.id)
  into current_job
  from public.work_items w
  join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
  where a.employee_id = current_worker_id
    and private.has_permission(w.branch_id, 'work.claim')
    and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
  order by case w.execution_state when 'IN_PROGRESS' then 1 when 'BLOCKED' then 2 else 3 end, w.work_number
  limit 1;

  select private.worker_work_item_payload(w.id)
  into next_job
  from public.work_items w
  join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
  where a.employee_id = current_worker_id
    and private.has_permission(w.branch_id, 'work.claim')
    and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
    and (current_job is null or w.id <> (current_job->>'id')::uuid)
  order by w.work_number
  limit 1;

  select coalesce(jsonb_agg(private.worker_work_item_payload(w.id) order by w.work_number), '[]'::jsonb)
  into pool_jobs
  from public.work_items w
  where w.execution_state = 'AVAILABLE' and private.has_permission(w.branch_id, 'work.claim');

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', item->>'id',
        'type', item->>'earning_type',
        'state', coalesce(item->>'approval_state', item->>'event_state'),
        'amount_vnd', coalesce(item->>'approved_amount_vnd', item->>'calculated_amount_vnd'),
        'occurred_at', coalesce(item->>'approved_at', item->>'created_at')
      ))
      order by item->>'id'
    ),
    '[]'::jsonb
  )
  into earnings
  from (
    select to_jsonb(e) item
    from public.earning_events e
    where e.employee_id = current_worker_id and private.has_permission(e.branch_id, 'work.claim')
  ) rows;

  return jsonb_build_object(
    'employee', employee_json,
    'current', current_job,
    'next', next_job,
    'pool', pool_jobs,
    'earnings', earnings
  );
end $$;
