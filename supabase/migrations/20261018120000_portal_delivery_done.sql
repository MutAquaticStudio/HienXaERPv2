-- FB3 A3 (Owner 17/10/2026): the worker portal reports a delivery with one "Đã giao" and photos taken on the phone.
-- * submit_portal_delivery_done: the assigned worker reports the delivery as delivered (all lines at what the warehouse
--   loaded), or with the quantities they enter (short delivery / not delivered), with 0–5 photos uploaded through the
--   portal. A delivery still "on the way" counts as arrived (no reason to type), an unstarted job counts as started,
--   the work item becomes DONE and the delivery waits for verification, exactly as submit_portal_delivery_result does.
--   Delivered (fully or partly) needs at least one photo; not delivered needs a reason.
-- * The worker sees quantities in the unit the order was sold in (sold unit and ratio added to the job payload), can
--   report as soon as the goods are on the truck, and is told when the warehouse has not handed the goods over yet.
-- * worker_portal_snapshot lists the worker's open jobs by scheduled time (today first) and keeps the claimable pool to
--   50 jobs of the next 14 days.
begin;

-- Same as 20261011203524, plus the sold unit per line, reporting from CLAIMED, and "awaiting_handoff".
create or replace function private.worker_work_item_payload(target_work_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.work_items%rowtype; d public.deliveries%rowtype; s public.service_jobs%rowtype;
  customer jsonb; site jsonb; lines jsonb; proofs jsonb; source_assignment integer;
begin
  select * into w from public.work_items where id=target_work_item_id;
  if w.id is null then return null; end if;
  if w.delivery_id is not null then
    select * into d from public.deliveries where id=w.delivery_id;
    select assignment_version into source_assignment from public.delivery_assignments where delivery_id=d.id and superseded_at is null;
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'material_name',sl.material_name_snapshot,
      'unit',u.symbol,'planned_base_quantity',l.planned_base_quantity::text,
      'sold_unit',su.symbol,'sold_numerator',sl.conversion_numerator::text,'sold_denominator',sl.conversion_denominator::text,
      'loaded_base_quantity',private.delivery_loaded_quantity(l.id)::text,
      'reportable_base_quantity',(case when w.execution_state in('CLAIMED','IN_PROGRESS') and d.execution_state in('DISPATCHED','ARRIVED')
        and private.is_current_work_assignee(w.id) then coalesce(private.delivery_loaded_quantity(l.id),0) else 0 end)::text) order by l.id),'[]'::jsonb) into lines
    from public.delivery_lines l join public.sales_order_lines sl on sl.id=l.sales_order_line_id
      join public.units_of_measure u on u.id=l.base_uom_id left join public.units_of_measure su on su.id=sl.ordered_uom_id where l.delivery_id=d.id;
    select to_jsonb(c) into customer from public.customers c where c.id=d.customer_id;
    select to_jsonb(cs) into site from public.customer_sites cs where cs.id=d.site_id;
  else
    select * into s from public.service_jobs where id=w.service_job_id;
    select to_jsonb(c) into customer from public.customers c where c.id=s.customer_id;
    select to_jsonb(cs) into site from public.customer_sites cs where cs.id=s.site_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'mime_type',e.mime_type,'created_at',e.created_at)
    order by e.created_at desc),'[]'::jsonb) into proofs from public.portal_evidence_objects e
    where e.work_item_id=w.id and e.object_state='READY' and e.uploaded_by=(select auth.uid());
  return jsonb_strip_nulls(jsonb_build_object('id',w.id,'number',w.work_number,
    'kind',case when w.delivery_id is not null then 'DELIVERY' else 'SERVICE_JOB' end,
    'state',w.execution_state,'version',w.version,'title',w.title,'description',s.description,
    'scheduled_start',w.scheduled_start,'scheduled_end',w.scheduled_end,
    'quantity',s.planned_quantity::text,'unit',s.unit_label,
    'customer_name',coalesce(d.customer_name_snapshot,customer->>'display_name'),
    'site_name',coalesce(d.site_name_snapshot,site->>'name'),
    'address',coalesce(d.delivery_address_snapshot,site->>'address_text'),
    'receiver_name',coalesce(d.receiver_name_snapshot,site->>'receiver_name'),
    'receiver_phone',coalesce(d.receiver_phone_snapshot,site->>'receiver_phone'),
    'access_note',site->>'access_note','receiving_window',site->>'receiving_window','proofs',proofs,
    'delivery',case when d.id is not null then jsonb_build_object('id',d.id,'version',d.version,
      'state',d.execution_state,'assignment_version',source_assignment,
      'can_submit_result',w.execution_state in('CLAIMED','IN_PROGRESS') and d.execution_state in('DISPATCHED','ARRIVED')
        and private.is_current_work_assignee(w.id),
      'awaiting_handoff',w.execution_state in('CLAIMED','IN_PROGRESS') and d.execution_state='ASSIGNED','lines',lines) end));
end $$;
revoke all on function private.worker_work_item_payload(uuid) from public,anon,authenticated,service_role;

create or replace function public.submit_portal_delivery_done(target_work_item_id uuid, result_lines jsonb, receiver_name text, note text,
  evidence_ids uuid[], expected_work_version integer, expected_delivery_version integer, expected_assignment_version integer, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  work public.work_items%rowtype; delivery public.deliveries%rowtype;
  assignment public.work_item_assignments%rowtype; source_assignment public.delivery_assignments%rowtype;
  receipt public.command_receipts%rowtype; hash text; item jsonb; line public.delivery_lines%rowtype;
  actual numeric; seen uuid[] := '{}'; positive integer := 0; lower integer := 0;
  kind text; result_id uuid; work_result_id uuid; photos uuid[]; receiver text;
begin
  if not private.is_current_work_assignee(target_work_item_id) then
    raise exception 'work_result_forbidden' using errcode = '42501';
  end if;
  if submit_portal_delivery_done.operation_id is null then raise exception 'operation_id_required' using errcode = '22023'; end if;
  photos := coalesce((select array_agg(distinct p order by p) from unnest(evidence_ids) p where p is not null), '{}');
  if cardinality(photos) <> cardinality(coalesce(evidence_ids, '{}')) or cardinality(photos) > 5 then
    raise exception 'work_result_evidence_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(submit_portal_delivery_done.operation_id::text, 0));
  hash := private.command_payload_hash(jsonb_build_object('work', target_work_item_id, 'lines', result_lines,
    'receiver', nullif(trim(receiver_name), ''), 'note', nullif(trim(note), ''), 'photos', to_jsonb(photos),
    'work_version', expected_work_version, 'delivery_version', expected_delivery_version, 'assignment_version', expected_assignment_version));
  select * into receipt from public.command_receipts r where r.operation_id = submit_portal_delivery_done.operation_id;
  if found then
    if receipt.command_name <> 'submit_portal_delivery_done' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if result_lines is not null then perform private.require_quantity_lines(result_lines, array['actual_base_quantity'], true); end if;

  select * into work from public.work_items w where w.id = target_work_item_id;
  select * into delivery from public.deliveries d where d.id = work.delivery_id for update;
  select * into work from public.work_items w where w.id = target_work_item_id for update;
  select * into assignment from public.work_item_assignments a where a.work_item_id = work.id and a.superseded_at is null;
  select * into source_assignment from public.delivery_assignments a where a.delivery_id = delivery.id and a.superseded_at is null;
  if delivery.id is null or delivery.branch_id <> work.branch_id or not private.is_current_work_assignee(work.id)
    or assignment.id is null or source_assignment.id is null
    or source_assignment.employee_id is distinct from assignment.employee_id
    or source_assignment.vehicle_id is distinct from assignment.vehicle_id then
    raise exception 'delivery_assignee_mismatch' using errcode = '42501';
  end if;
  if work.version is distinct from expected_work_version or delivery.version is distinct from expected_delivery_version
    or source_assignment.assignment_version is distinct from expected_assignment_version then
    raise exception 'stale_work_or_delivery_version' using errcode = '40001';
  end if;
  -- An unstarted job counts as started and goods on the way as arrived: the worker only says what happened.
  if work.execution_state not in ('CLAIMED', 'IN_PROGRESS') or delivery.execution_state not in ('DISPATCHED', 'ARRIVED') then
    raise exception 'delivery_work_not_submittable' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(note), '')) > 1000 or char_length(coalesce(trim(receiver_name), '')) > 120 then
    raise exception 'invalid_delivery_result_text' using errcode = '22023';
  end if;

  if result_lines is null then
    -- "Đã giao": every line as loaded onto the truck.
    select coalesce(jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'actual_base_quantity', coalesce(private.delivery_loaded_quantity(l.id), 0)) order by l.id), '[]')
    into result_lines from public.delivery_lines l where l.delivery_id = delivery.id;
  end if;
  if jsonb_typeof(result_lines) is distinct from 'array' or jsonb_array_length(result_lines) not between 1 and 50 then
    raise exception 'invalid_delivery_lines' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(result_lines) loop
    select * into line from public.delivery_lines l where l.id = (item->>'delivery_line_id')::uuid and l.delivery_id = delivery.id;
    actual := (item->>'actual_base_quantity')::numeric;
    if line.id is null or line.id = any(seen) or actual is null or actual::text in ('NaN', 'Infinity', '-Infinity')
      or actual < 0 or actual > coalesce(private.delivery_loaded_quantity(line.id), 0) or actual <> round(actual, 6) then
      raise exception 'invalid_delivery_result_line' using errcode = '22023';
    end if;
    seen := array_append(seen, line.id);
    if actual > 0 then positive := positive + 1; end if;
    if actual < line.planned_base_quantity then lower := lower + 1; end if;
  end loop;
  if cardinality(seen) <> (select count(*) from public.delivery_lines l where l.delivery_id = delivery.id) then
    raise exception 'delivery_result_line_missing' using errcode = '22023';
  end if;
  kind := case when positive = 0 then 'FAILED' when lower > 0 then 'PARTIAL' else 'FULL' end;
  receiver := coalesce(nullif(trim(receiver_name), ''), nullif(trim(delivery.receiver_name_snapshot), ''));
  if (positive > 0 and receiver is null) or (kind = 'FAILED' and char_length(coalesce(trim(note), '')) < 3) then
    raise exception 'delivery_receiver_or_failure_reason_required' using errcode = '22023';
  end if;
  if kind <> 'FAILED' and cardinality(photos) = 0 then raise exception 'delivery_photo_required' using errcode = '22023'; end if;
  if exists (select 1 from unnest(photos) p where not exists (select 1 from public.portal_evidence_objects e
      where e.id = p and e.context_type = 'WORK_RESULT' and e.work_item_id = work.id and e.object_state = 'READY' and e.uploaded_by = (select auth.uid())))
    or exists (select 1 from public.work_result_portal_evidence x where x.evidence_id = any(photos)) then
    raise exception 'work_result_evidence_invalid' using errcode = '42501';
  end if;

  insert into public.work_item_results(work_item_id, assignment_id, actual_quantity, note, receiver_name, submitted_by)
  values (work.id, assignment.id, null, nullif(trim(note), ''), receiver, (select auth.uid())) returning id into work_result_id;
  insert into public.delivery_results(delivery_id, result_kind, receiver_name, note, missing_arrival_reason, submitted_by, source_work_item_result_id)
  values (delivery.id, kind, receiver, nullif(trim(note), ''), null, (select auth.uid()), work_result_id) returning id into result_id;
  for item in select value from jsonb_array_elements(result_lines) loop
    insert into public.delivery_result_lines(delivery_result_id, delivery_line_id, actual_base_quantity)
    values (result_id, (item->>'delivery_line_id')::uuid, (item->>'actual_base_quantity')::numeric);
  end loop;
  insert into public.work_result_portal_evidence(work_result_id, evidence_id) select work_result_id, p from unnest(photos) p;
  update public.work_items set execution_state = 'DONE', started_at = coalesce(started_at, now()), completed_at = now(), version = version + 1 where id = work.id;
  update public.deliveries set execution_state = 'RESULT_SUBMITTED', result_kind = kind, version = version + 1 where id = delivery.id;
  insert into public.command_receipts values (submit_portal_delivery_done.operation_id, (select auth.uid()), 'submit_portal_delivery_done', hash, 'work_item_result', work_result_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), work.branch_id, 'delivery.result.submitted', 'delivery_result', result_id, submit_portal_delivery_done.operation_id,
    array['source_work_item_result_id', 'actual_base_quantity', 'evidence'],
    case kind when 'FULL' then 'Thợ báo đã giao' when 'PARTIAL' then 'Thợ báo giao thiếu' else 'Thợ báo không giao được' end
      || case when cardinality(photos) > 0 then ' · ' || cardinality(photos) || ' ảnh' else '' end);
  return work_result_id;
end
$function$;
revoke all on function public.submit_portal_delivery_done(uuid, jsonb, text, text, uuid[], integer, integer, integer, uuid) from public, anon;
grant execute on function public.submit_portal_delivery_done(uuid, jsonb, text, text, uuid[], integer, integer, integer, uuid) to authenticated;

-- Same as 20260914095110, plus the open jobs by time and a bounded pool.
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
  open_jobs jsonb;
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
  order by case w.execution_state when 'IN_PROGRESS' then 1 when 'BLOCKED' then 2 else 3 end, w.scheduled_start, w.work_number
  limit 1;

  select private.worker_work_item_payload(w.id)
  into next_job
  from public.work_items w
  join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
  where a.employee_id = current_worker_id
    and private.has_permission(w.branch_id, 'work.claim')
    and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
    and (current_job is null or w.id <> (current_job->>'id')::uuid)
  order by w.scheduled_start, w.work_number
  limit 1;

  -- Every open job of the worker by scheduled time: today's first, then what comes next.
  select coalesce(jsonb_agg(private.worker_work_item_payload(x.id) order by x.scheduled_start, x.work_number), '[]'::jsonb)
  into open_jobs
  from (select w.id, w.scheduled_start, w.work_number from public.work_items w
    join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
    where a.employee_id = current_worker_id and private.has_permission(w.branch_id, 'work.claim')
      and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
    order by w.scheduled_start, w.work_number limit 30) x;

  select coalesce(jsonb_agg(private.worker_work_item_payload(x.id) order by x.scheduled_start, x.work_number), '[]'::jsonb)
  into pool_jobs
  from (select w.id, w.scheduled_start, w.work_number from public.work_items w
    where w.execution_state = 'AVAILABLE' and private.has_permission(w.branch_id, 'work.claim')
      and w.scheduled_start < now() + interval '14 days'
    order by w.scheduled_start, w.work_number limit 50) x;

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
    'jobs', open_jobs,
    'pool', pool_jobs,
    'earnings', earnings
  );
end $$;

notify pgrst, 'reload schema';
commit;
