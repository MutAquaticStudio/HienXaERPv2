-- FB7 3/5: the worker confirms "Đã lấy hàng lên xe" with photos; the job page tells who may act and how the delivery ended.
begin;

-- "Đã lấy hàng lên xe": only the assigned worker, with 1–5 photos; without quantities, everything planned is loaded.
create or replace function public.portal_delivery_loaded(target_work_item_id uuid, loaded_lines jsonb, evidence_ids uuid[],
  expected_work_version integer, expected_delivery_version integer, expected_assignment_version integer, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  work public.work_items%rowtype; delivery public.deliveries%rowtype;
  assignment public.work_item_assignments%rowtype; source_assignment public.delivery_assignments%rowtype;
  receipt public.command_receipts%rowtype; hash text; photos uuid[]; handoff_id uuid; lines jsonb;
begin
  if not private.is_current_work_assignee(target_work_item_id) then
    raise exception 'work_result_forbidden' using errcode = '42501';
  end if;
  if portal_delivery_loaded.operation_id is null then raise exception 'operation_id_required' using errcode = '22023'; end if;
  photos := coalesce((select array_agg(distinct p order by p) from unnest(evidence_ids) p where p is not null), '{}');
  if cardinality(photos) <> cardinality(coalesce(evidence_ids, '{}')) or cardinality(photos) > 5 then
    raise exception 'work_result_evidence_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(portal_delivery_loaded.operation_id::text, 0));
  hash := private.command_payload_hash(jsonb_build_object('work', target_work_item_id, 'lines', loaded_lines, 'photos', to_jsonb(photos),
    'work_version', expected_work_version, 'delivery_version', expected_delivery_version, 'assignment_version', expected_assignment_version));
  select * into receipt from public.command_receipts r where r.operation_id = portal_delivery_loaded.operation_id;
  if found then
    if receipt.command_name <> 'portal_delivery_loaded' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if cardinality(photos) = 0 then raise exception 'handoff_photo_required' using errcode = '22023'; end if;

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
  if work.execution_state not in ('CLAIMED', 'IN_PROGRESS') or delivery.execution_state <> 'ASSIGNED' then
    raise exception 'delivery_work_not_loadable' using errcode = '55000';
  end if;
  if exists (select 1 from unnest(photos) p where not exists (select 1 from public.portal_evidence_objects e
      where e.id = p and e.context_type = 'WORK_RESULT' and e.work_item_id = work.id and e.object_state = 'READY' and e.uploaded_by = (select auth.uid())))
    or exists (select 1 from public.work_result_portal_evidence x where x.evidence_id = any(photos))
    or exists (select 1 from public.delivery_handoff_portal_evidence x where x.evidence_id = any(photos)) then
    raise exception 'work_result_evidence_invalid' using errcode = '42501';
  end if;
  lines := loaded_lines;
  if lines is null then
    select coalesce(jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'loaded_base_quantity', trim_scale(l.planned_base_quantity)::text) order by l.id), '[]')
      into lines from public.delivery_lines l where l.delivery_id = delivery.id;
  end if;
  handoff_id := private.handoff_delivery_core(delivery.id, delivery.version, now(), portal_delivery_loaded.operation_id, lines);
  insert into public.delivery_handoff_portal_evidence(delivery_handoff_id, evidence_id) select handoff_id, p from unnest(photos) p;
  update public.work_items set execution_state = 'IN_PROGRESS', started_at = coalesce(started_at, now()), last_heartbeat_at = now(),
    lease_expires_at = now() + interval '8 hours', version = version + 1 where id = work.id;
  insert into public.command_receipts values (portal_delivery_loaded.operation_id, (select auth.uid()), 'portal_delivery_loaded', hash, 'delivery_handoff', handoff_id, now());
  return handoff_id;
end
$function$;
revoke all on function public.portal_delivery_loaded(uuid, jsonb, uuid[], integer, integer, integer, uuid) from public, anon;
grant execute on function public.portal_delivery_loaded(uuid, jsonb, uuid[], integer, integer, integer, uuid) to authenticated;

-- The job page: whether the worker can load the truck now, who the job belongs to, and how the delivery ended.
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
    where e.work_item_id=w.id and e.object_state='READY' and e.uploaded_by=(select auth.uid())
      and not exists (select 1 from public.delivery_handoff_portal_evidence x where x.evidence_id=e.id);
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
      'awaiting_handoff',w.execution_state in('CLAIMED','IN_PROGRESS') and d.execution_state='ASSIGNED',
      'can_load',w.execution_state in('CLAIMED','IN_PROGRESS') and d.execution_state='ASSIGNED' and private.is_current_work_assignee(w.id),
      'result_kind',d.result_kind,'delivered_at',d.verified_at,'lines',lines) end,
    'is_assignee',private.is_current_work_assignee(w.id),
    'assignee_name',(select e.display_name from public.work_item_assignments a join public.employees e on e.id=a.employee_id
      where a.work_item_id=w.id and a.superseded_at is null)));
end $$;
revoke all on function private.worker_work_item_payload(uuid) from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
commit;
