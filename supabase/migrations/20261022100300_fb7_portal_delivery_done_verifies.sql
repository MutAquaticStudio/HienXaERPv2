-- FB7 4/5: "Đã giao" is the verification — receivable, revenue and cost as reported, the remainder back to the warehouse,
-- the job verified. No arrival step, and no note required when nothing was delivered.
begin;

-- "Không giao được" no longer needs a note, photos of the loaded truck stay with the loading, and the report verifies the delivery.
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
  kind text; result_id uuid; work_result_id uuid; photos uuid[]; receiver text; verify_lines jsonb; verified boolean := false;
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
  -- FB7: a note is welcome but never required, also when nothing was delivered.
  if positive > 0 and receiver is null then
    raise exception 'delivery_receiver_or_failure_reason_required' using errcode = '22023';
  end if;
  if kind <> 'FAILED' and cardinality(photos) = 0 then raise exception 'delivery_photo_required' using errcode = '22023'; end if;
  if exists (select 1 from unnest(photos) p where not exists (select 1 from public.portal_evidence_objects e
      where e.id = p and e.context_type = 'WORK_RESULT' and e.work_item_id = work.id and e.object_state = 'READY' and e.uploaded_by = (select auth.uid())))
    or exists (select 1 from public.work_result_portal_evidence x where x.evidence_id = any(photos))
    or exists (select 1 from public.delivery_handoff_portal_evidence x where x.evidence_id = any(photos)) then
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
  -- The office is told once, below, with the outcome of the automatic verification.
  perform set_config('hx.delivery_auto_verify', 'on', true);
  update public.deliveries set execution_state = 'RESULT_SUBMITTED', result_kind = kind, version = version + 1 where id = delivery.id;
  insert into public.command_receipts values (submit_portal_delivery_done.operation_id, (select auth.uid()), 'submit_portal_delivery_done', hash, 'work_item_result', work_result_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), work.branch_id, 'delivery.result.submitted', 'delivery_result', result_id, submit_portal_delivery_done.operation_id,
    array['source_work_item_result_id', 'actual_base_quantity', 'evidence'],
    case kind when 'FULL' then 'Thợ báo đã giao' when 'PARTIAL' then 'Thợ báo giao thiếu' else 'Thợ báo không giao được' end
      || case when cardinality(photos) > 0 then ' · ' || cardinality(photos) || ' ảnh' else '' end);
  -- FB7 (Owner 22/10): the worker's report is the verification, also for short or failed deliveries: receivable, revenue and cost
  -- as reported, goods not delivered back to the warehouse they left, the job verified. An accounting problem (e.g. credit) leaves
  -- the delivery waiting for the office and never refuses the worker's report.
  begin
    select jsonb_agg(jsonb_build_object('delivery_line_id', rl.delivery_line_id,
        'accepted_base_quantity', trim_scale(rl.actual_base_quantity)::text,
        'billable_base_quantity', trim_scale(rl.actual_base_quantity)::text) order by rl.delivery_line_id)
      into verify_lines from public.delivery_result_lines rl where rl.delivery_result_id = result_id;
    perform private.verify_delivery_core(result_id, verify_lines, delivery.version + 1, submit_portal_delivery_done.operation_id);
    perform private.return_delivery_remainder(delivery.id, submit_portal_delivery_done.operation_id);
    verified := true;
  exception when others then
    verified := false;
  end;
  perform set_config('hx.delivery_auto_verify', '', true);
  perform private.notify(work.branch_id, 'delivery.result_submitted', 'delivery', delivery.id,
    case when not verified then 'Cần xác minh tay ' || delivery.delivery_number
      when kind = 'FAILED' then 'Không giao được ' || delivery.delivery_number || ' — hàng đã về kho'
      when kind = 'PARTIAL' then 'Giao thiếu ' || delivery.delivery_number || ' — phần còn lại đã về kho'
      else delivery.delivery_number || ' đã giao xong' end,
    delivery.customer_name_snapshot || ' · ' || coalesce(delivery.site_name_snapshot, ''), '/admin/deliveries/' || delivery.id,
    case when verified then 'delivery.read' else 'delivery.verify' end, null, 'delivery.result:' || delivery.id || ':' || (delivery.version + 1));
  return work_result_id;
end
$function$;

notify pgrst, 'reload schema';
commit;
