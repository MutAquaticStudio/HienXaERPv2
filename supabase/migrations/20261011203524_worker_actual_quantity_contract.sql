-- Add actual pickup and report limits to the existing permission-scoped worker read contract.
-- No inventory, money, assignment, cost fields or posted facts are changed.
begin;
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
      'loaded_base_quantity',private.delivery_loaded_quantity(l.id)::text,
      'reportable_base_quantity',(case when w.execution_state='IN_PROGRESS' and d.execution_state in('DISPATCHED','ARRIVED')
        and private.is_current_work_assignee(w.id) then coalesce(private.delivery_loaded_quantity(l.id),0) else 0 end)::text) order by l.id),'[]'::jsonb) into lines
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
      'state',d.execution_state,'assignment_version',source_assignment,
      'can_submit_result',w.execution_state='IN_PROGRESS' and d.execution_state in('DISPATCHED','ARRIVED')
        and private.is_current_work_assignee(w.id),'lines',lines) end));
end $$;
revoke all on function private.worker_work_item_payload(uuid) from public,anon,authenticated,service_role;
commit;
