-- Fix of the D79 change (Owner 16/11/2026: "Phần D79 sửa lại tý cho phần nhận việc hiện dù không đủ thông tin nhé").
-- 20261116140000 let a delivery without address / receiver / phone show in "Nhận việc" and "Điều phối", but the job that
-- assigning a driver creates (private.sync_delivery_work_item) still required those three, so claiming it, the lead's
-- "Giao cho bạn" and the office's assignment made no job: "Người hoặc xe này không nhận được việc này nữa" (Owner, DL-2026-000442
-- without a receiver phone). The job is now created without them; it still needs a line with a quantity. Body otherwise as
-- the latest definition, 20261102140000_d46_split_numbering.sql (split trial run skipped).
begin;

create or replace function private.sync_delivery_work_item(target_delivery_id uuid, trace uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  d public.deliveries%rowtype;
  current_assignment public.delivery_assignments%rowtype;
  entity_id uuid;
  end_at timestamptz;
begin
  -- D46: a split's trial run assigns drivers only to check them; it must not use up a WRK number.
  if coalesce(current_setting('hx.split_trial', true), '') = 'on' then return null; end if;
  select * into d from public.deliveries x where x.id = target_delivery_id;
  select * into current_assignment from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null;
  if d.id is null or d.execution_state <> 'ASSIGNED' or d.scheduled_at is null or current_assignment.employee_id is null then return null; end if;
  select w.id into entity_id from public.work_items w where w.delivery_id = d.id;
  if entity_id is not null then return entity_id; end if;
  if not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.planned_base_quantity > 0) then
    return null;
  end if;
  end_at := coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id));
  insert into public.work_items(branch_id, work_number, delivery_id, service_job_id, title, assignment_mode, execution_state, scheduled_start, scheduled_end,
    planned_vehicle_id, planned_machine_id, created_by)
  values (d.branch_id, 'WRK-' || to_char((d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.work_item_number_seq')::text, 6, '0'),
    d.id, null, 'Giao hàng - ' || d.delivery_number, 'DIRECT', 'CLAIMED', d.scheduled_at, end_at, current_assignment.vehicle_id, null, (select auth.uid()))
  returning id into entity_id;
  perform private.assert_work_resources_available(entity_id, d.branch_id, current_assignment.employee_id, current_assignment.vehicle_id, null, d.scheduled_at, end_at);
  insert into public.work_item_assignments(work_item_id, assignment_version, employee_id, vehicle_id, machine_id, assignment_kind, assigned_by)
  values (entity_id, 1, current_assignment.employee_id, current_assignment.vehicle_id, null, 'DIRECT', (select auth.uid()));
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), d.branch_id, 'work_item.published', 'work_item', entity_id, trace, array['source', 'assignment_mode', 'schedule'],
    'Tự giao việc cho người giao khi phân xe');
  return entity_id;
end
$function$;
revoke all on function private.sync_delivery_work_item(uuid, uuid) from public, anon, authenticated, service_role;

-- The office can still add or fix the receiver after a driver has the job, as long as the job has not started (before, any
-- job locked the contact, which was fine only while a job needed the phone first). Body otherwise as
-- 20261018110000_delivery_work_sync.sql.
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
    or exists(select 1 from public.work_items w where w.delivery_id=delivery.id
      and (w.started_at is not null or w.execution_state not in ('AVAILABLE','CLAIMED'))) then
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
  -- A2: an assigned delivery that was waiting only for its receiver goes to the driver's worker portal now.
  if delivery.execution_state='ASSIGNED' then perform private.sync_delivery_work_item(delivery.id,update_delivery_receiver.operation_id); end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'update_delivery_receiver',hash,'delivery',delivery.id,now());
  return delivery.id;
end $$;
revoke all on function public.update_delivery_receiver(uuid,text,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.update_delivery_receiver(uuid,text,text,text,integer,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
