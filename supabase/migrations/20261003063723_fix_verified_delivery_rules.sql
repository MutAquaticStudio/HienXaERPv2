-- SPEC-DEL-002/005, SPEC-OPS-004, SPEC-INVTRY-006, SPEC-SO-001.
-- No historical result, inventory movement, obligation or payment is rewritten.
begin;

create or replace function private.delivery_line_transit_position(target_line_id uuid)
returns table(base_quantity numeric, inventory_value_vnd bigint)
language sql stable set search_path = '' as $$
  select coalesce(sum(m.base_quantity_delta), 0),
    coalesce(sum(m.inventory_value_delta_vnd), 0)::bigint
  from public.inventory_movements m
  left join public.delivery_handoff_lines h on h.id = m.source_delivery_handoff_line_id
  left join public.delivery_verification_lines v on v.id = m.source_delivery_verification_line_id
  left join public.return_cases r on r.id = m.source_return_case_id
  where m.location_kind = 'IN_TRANSIT'
    and m.delivery_id = (select delivery_id from public.delivery_lines where id = target_line_id)
    and coalesce(h.delivery_line_id, v.delivery_line_id, r.delivery_line_id) = target_line_id
$$;
revoke all on function private.delivery_line_transit_position(uuid) from public, anon, authenticated;

create or replace function private.delivery_allocation_consumed(target_allocation_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(case
    when d.execution_state = 'VERIFIED' then coalesce(v.accepted_base_quantity, 0)
      + case when l.source_mode = 'SUPPLIER_DIRECT' then 0 else greatest(p.base_quantity, 0) end
    else l.planned_base_quantity end), 0)
  from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
  left join public.delivery_verification_lines v on v.delivery_line_id = l.id
  left join lateral private.delivery_line_transit_position(l.id) p on true
  where l.supply_allocation_id = target_allocation_id and d.execution_state <> 'CANCELLED'
$$;
revoke all on function private.delivery_allocation_consumed(uuid) from public, anon, authenticated;

-- Replace only the demonstrated mechanisms; retain the existing permission,
-- row-lock, idempotency and source-effect code. Unexpected bases fail closed.
do $migration$
declare definition text; before_text text; after_text text; signature text;
begin
  for signature, before_text, after_text in select * from (values
    ('public.create_delivery_from_allocation(uuid,numeric,timestamptz,uuid)',
     $old$select coalesce(sum(l.planned_base_quantity), 0) into already_planned
  from public.delivery_lines l join public.deliveries d on d.id = l.delivery_id
  where l.supply_allocation_id = target_supply_allocation_id and d.execution_state <> 'CANCELLED';$old$,
     'already_planned := private.delivery_allocation_consumed(target_supply_allocation_id);'),
    ('public.create_delivery_from_allocations(uuid,jsonb,timestamptz,uuid)',
     $old$select coalesce(sum(line.planned_base_quantity), 0) into already_planned
      from public.delivery_lines line join public.deliveries delivery on delivery.id = line.delivery_id
      where line.supply_allocation_id = allocation.id and delivery.execution_state <> 'CANCELLED';$old$,
     'already_planned := private.delivery_allocation_consumed(allocation.id);'),
    ('public.verify_delivery(uuid,jsonb,integer,uuid)',
     'cost_value := round(accepted * handoff_line.unit_cost_vnd_per_base)::bigint;',
     $new$select case when accepted = p.base_quantity then p.inventory_value_vnd
        else round(accepted * handoff_line.unit_cost_vnd_per_base)::bigint end into cost_value
        from private.delivery_line_transit_position(line.id) p;
      if accepted > (select p.base_quantity from private.delivery_line_transit_position(line.id) p)
        or (accepted > 0 and cost_value <= 0) then
        raise exception 'delivery_cost_quantity_invalid' using errcode = '23514';
      end if;$new$),
    ('public.resolve_return_case(uuid,text,uuid,text,uuid,integer,uuid)',
     'value_amount := round(case_row.base_quantity * unit_cost)::bigint;',
     $new$value_amount := round(case_row.base_quantity * unit_cost)::bigint;
  if case_row.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') then
    if case_row.base_quantity > (select p.base_quantity from private.delivery_line_transit_position(line.id) p) then
      raise exception 'return_exceeds_transit_position' using errcode = '23514';
    end if;
    select case when case_row.base_quantity = p.base_quantity then p.inventory_value_vnd
      else value_amount end into value_amount from private.delivery_line_transit_position(line.id) p;
    if value_amount <= 0 then raise exception 'return_cost_below_currency_precision' using errcode = '23514'; end if;
  end if;$new$),
    ('public.publish_work_item(uuid,text,uuid,text,uuid,uuid)',
     $old$if source_delivery is null or employee is null then raise exception 'delivery_not_ready_for_work' using errcode = '55000'; end if;$old$,
     $new$if source_delivery is null or employee is null then raise exception 'delivery_not_ready_for_work' using errcode = '55000'; end if;
    if exists (select 1 from public.deliveries d where d.id = source_delivery
        and (nullif(trim(d.delivery_address_snapshot),'') is null
          or nullif(trim(d.receiver_name_snapshot),'') is null
          or nullif(trim(d.receiver_phone_snapshot),'') is null))
      or not exists (select 1 from public.delivery_lines l where l.delivery_id = source_delivery and l.planned_base_quantity > 0) then
      raise exception 'delivery_contact_or_lines_missing' using errcode = '55000';
    end if;$new$),
    ('public.submit_work_result(uuid,numeric,text,text,uuid,integer,uuid)',
     'if actual_quantity<0 or',
     $new$if actual_quantity is null or actual_quantity::text in ('NaN','Infinity','-Infinity') or actual_quantity<0 or$new$),
    ('public.submit_work_result(uuid,numeric,text,text,uuid,integer,uuid)',
     'insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,evidence_object_id,submitted_by)',
     $new$if work.delivery_id is not null then raise exception 'delivery_line_result_required' using errcode='22023'; end if;
  insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,evidence_object_id,submitted_by)$new$)
  ) replacements(signature, before_text, after_text) loop
    definition := pg_get_functiondef(signature::regprocedure);
    if strpos(definition, before_text) = 0 then
      raise exception 'delivery_rules_migration_precondition: %', signature;
    end if;
    execute replace(definition, before_text, after_text);
  end loop;
end $migration$;

-- Delivery quantities are authoritative per line, not a sum of unlike UOMs.
-- The service command above continues to require a finite scalar quantity.
alter table public.work_item_results alter column actual_quantity drop not null;
alter table public.delivery_results add column source_work_item_result_id uuid unique
  references public.work_item_results(id) on delete restrict;

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
  insert into public.command_receipts values(operation_id,(select auth.uid()),'update_delivery_receiver',hash,'delivery',delivery.id,now());
  return delivery.id;
end $$;
revoke all on function public.update_delivery_receiver(uuid,text,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.update_delivery_receiver(uuid,text,text,text,integer,uuid) to authenticated;

create or replace function public.submit_portal_delivery_result(
  target_work_item_id uuid, result_lines jsonb, receiver_name text, note text,
  target_evidence_id uuid, missing_arrival_reason text, expected_work_version integer,
  expected_delivery_version integer, expected_assignment_version integer, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  work public.work_items%rowtype; delivery public.deliveries%rowtype;
  assignment public.work_item_assignments%rowtype; source_assignment public.delivery_assignments%rowtype;
  receipt public.command_receipts%rowtype; hash text; item jsonb; line public.delivery_lines%rowtype;
  actual numeric; seen uuid[] := '{}'; positive integer := 0; lower integer := 0;
  kind text; result_id uuid; work_result_id uuid;
begin
  if not private.is_current_work_assignee(target_work_item_id) then
    raise exception 'work_result_forbidden' using errcode='42501';
  end if;
  if operation_id is null then raise exception 'operation_id_required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  hash := private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'lines',result_lines,
    'receiver',nullif(trim(receiver_name),''),'note',nullif(trim(note),''),'evidence',target_evidence_id,
    'arrival_reason',nullif(trim(missing_arrival_reason),''),'work_version',expected_work_version,
    'delivery_version',expected_delivery_version,'assignment_version',expected_assignment_version));
  select * into receipt from public.command_receipts r where r.operation_id=submit_portal_delivery_result.operation_id;
  if found then
    if receipt.command_name<>'submit_portal_delivery_result' or receipt.payload_hash<>hash then
      raise exception 'operation_payload_conflict' using errcode='23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into work from public.work_items where id=target_work_item_id;
  select * into delivery from public.deliveries where id=work.delivery_id for update;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  select * into source_assignment from public.delivery_assignments where delivery_id=delivery.id and superseded_at is null;
  if delivery.id is null or delivery.branch_id<>work.branch_id or not private.is_current_work_assignee(work.id)
    or assignment.id is null or source_assignment.id is null
    or source_assignment.employee_id is distinct from assignment.employee_id
    or source_assignment.vehicle_id is distinct from assignment.vehicle_id then
    raise exception 'delivery_assignee_mismatch' using errcode='42501';
  end if;
  if work.version is distinct from expected_work_version or delivery.version is distinct from expected_delivery_version
    or source_assignment.assignment_version is distinct from expected_assignment_version then
    raise exception 'stale_work_or_delivery_version' using errcode='40001';
  end if;
  if work.execution_state<>'IN_PROGRESS' or delivery.execution_state not in ('DISPATCHED','ARRIVED') then
    raise exception 'delivery_work_not_submittable' using errcode='55000';
  end if;
  if delivery.execution_state='DISPATCHED' and (missing_arrival_reason is null or char_length(trim(missing_arrival_reason))<3) then
    raise exception 'missing_arrival_reason_required' using errcode='22023';
  end if;
  if char_length(coalesce(trim(note),''))>1000 or char_length(coalesce(trim(receiver_name),''))>120
    or char_length(coalesce(trim(missing_arrival_reason),''))>1000 then
    raise exception 'invalid_delivery_result_text' using errcode='22023';
  end if;
  if jsonb_typeof(result_lines) is distinct from 'array' then raise exception 'invalid_delivery_lines' using errcode='22023'; end if;
  if jsonb_array_length(result_lines) not between 1 and 50 then raise exception 'invalid_delivery_lines' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(result_lines) loop
    select * into line from public.delivery_lines where id=(item->>'delivery_line_id')::uuid and delivery_id=delivery.id;
    actual := (item->>'actual_base_quantity')::numeric;
    if line.id is null or line.id=any(seen) or actual is null or actual::text in ('NaN','Infinity','-Infinity')
      or actual<0 or actual>line.planned_base_quantity or actual<>round(actual,6) then
      raise exception 'invalid_delivery_result_line' using errcode='22023';
    end if;
    seen:=array_append(seen,line.id);
    if actual>0 then positive:=positive+1; end if;
    if actual<line.planned_base_quantity then lower:=lower+1; end if;
  end loop;
  if cardinality(seen)<>(select count(*) from public.delivery_lines where delivery_id=delivery.id) then
    raise exception 'delivery_result_line_missing' using errcode='22023';
  end if;
  kind:=case when positive=0 then 'FAILED' when lower>0 then 'PARTIAL' else 'FULL' end;
  if (positive>0 and nullif(trim(receiver_name),'') is null)
    or (kind='FAILED' and char_length(coalesce(trim(note),''))<3) then
    raise exception 'delivery_receiver_or_failure_reason_required' using errcode='22023';
  end if;
  if target_evidence_id is not null and not exists(select 1 from public.portal_evidence_objects e
    where e.id=target_evidence_id and e.context_type='WORK_RESULT' and e.work_item_id=work.id
      and e.object_state='READY' and e.uploaded_by=(select auth.uid())) then
    raise exception 'work_result_evidence_invalid' using errcode='42501';
  end if;
  insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,submitted_by)
  values(work.id,assignment.id,null,nullif(trim(note),''),nullif(trim(receiver_name),''),(select auth.uid())) returning id into work_result_id;
  insert into public.delivery_results(delivery_id,result_kind,receiver_name,note,missing_arrival_reason,submitted_by,source_work_item_result_id)
  values(delivery.id,kind,nullif(trim(receiver_name),''),nullif(trim(note),''),nullif(trim(missing_arrival_reason),''),
    (select auth.uid()),work_result_id) returning id into result_id;
  for item in select value from jsonb_array_elements(result_lines) loop
    insert into public.delivery_result_lines(delivery_result_id,delivery_line_id,actual_base_quantity)
    values(result_id,(item->>'delivery_line_id')::uuid,(item->>'actual_base_quantity')::numeric);
  end loop;
  if target_evidence_id is not null then
    insert into public.work_result_portal_evidence(work_result_id,evidence_id) values(work_result_id,target_evidence_id);
  end if;
  update public.work_items set execution_state='DONE',completed_at=now(),version=version+1 where id=work.id;
  update public.deliveries set execution_state='RESULT_SUBMITTED',result_kind=kind,version=version+1 where id=delivery.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'submit_portal_delivery_result',hash,'work_item_result',work_result_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),work.branch_id,'delivery.result.submitted','delivery_result',result_id,operation_id,array['source_work_item_result_id','actual_base_quantity']);
  return work_result_id;
end $$;
revoke all on function public.submit_portal_delivery_result(uuid,jsonb,text,text,uuid,text,integer,integer,integer,uuid) from public, anon, authenticated;
grant execute on function public.submit_portal_delivery_result(uuid,jsonb,text,text,uuid,text,integer,integer,integer,uuid) to authenticated;

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
      'unit',u.symbol,'planned_base_quantity',l.planned_base_quantity::text) order by l.id),'[]'::jsonb) into lines
    from public.delivery_lines l join public.sales_order_lines sl on sl.id=l.sales_order_line_id
      join public.units_of_measure u on u.id=l.base_uom_id where l.delivery_id=d.id;
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
      'state',d.execution_state,'assignment_version',source_assignment,'lines',lines) end));
end $$;
revoke all on function private.worker_work_item_payload(uuid) from public, anon, authenticated;

create or replace view public.sales_order_read with (security_invoker = true) as
select o.id,o.branch_id,o.order_number,o.customer_id,o.site_id,o.quotation_revision_id,
  o.sales_owner_employee_id,o.commercial_state,
  case
    when exists(select 1 from public.sales_order_lines l where l.sales_order_id=o.id)
      and not exists(select 1 from public.sales_order_lines l where l.sales_order_id=o.id
        and coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v
          join public.delivery_lines dl on dl.id=v.delivery_line_id where dl.sales_order_line_id=l.id),0)
          < l.quantity*l.conversion_numerator/l.conversion_denominator) then 'FULFILLED'
    when o.commercial_state='CLOSED' or (o.commercial_state='CANCELLED' and exists(
      select 1 from public.delivery_verification_lines v join public.delivery_lines dl on dl.id=v.delivery_line_id
      where dl.delivery_id in (select id from public.deliveries where sales_order_id=o.id) and v.accepted_base_quantity>0)) then 'CLOSED_REMAINDER'
    when exists(select 1 from public.delivery_verification_lines v join public.delivery_lines dl on dl.id=v.delivery_line_id
      where dl.delivery_id in(select id from public.deliveries where sales_order_id=o.id) and v.accepted_base_quantity>0) then 'PARTIAL'
    else 'NOT_STARTED' end::text as fulfillment_state,
  case when ar.obligation_count=0 then 'NOT_DUE' when ar.outstanding_vnd<=0 then 'PAID'
    when ar.allocated_vnd>0 then 'PARTIAL' else 'UNPAID' end::text as payment_state,
  o.customer_name_snapshot,o.site_name_snapshot,o.delivery_address_snapshot,
  coalesce((select sum(l.line_total_vnd) from public.sales_order_lines l where l.sales_order_id=o.id),0)::bigint::text as total_vnd,
  o.requested_delivery_at,o.confirmed_at,o.cancelled_at,o.created_at
from public.sales_orders o left join lateral (
  select count(*) as obligation_count,coalesce(sum(r.outstanding_amount_vnd),0) as outstanding_vnd,
    coalesce(sum(r.allocated_amount_vnd),0) as allocated_vnd from public.receivable_read r where r.sales_order_id=o.id
) ar on true;
commit;
