-- D46 follow-up (Owner 02/11: "sửa cho số phiếu liền mạch"): a refused split no longer uses up delivery numbers.
-- split_delivery first builds and assigns the parts in a trial run (temporary numbers, no work item, rolled back); only
-- when every part is accepted are the real notes created with consecutive DL numbers. The worker job sync skips the
-- trial run so WRK numbers are not used up either.

CREATE OR REPLACE FUNCTION private.sync_delivery_work_item(target_delivery_id uuid, trace uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if nullif(trim(d.delivery_address_snapshot), '') is null or nullif(trim(d.receiver_name_snapshot), '') is null
    or nullif(trim(d.receiver_phone_snapshot), '') is null
    or not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.planned_base_quantity > 0) then
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

-- Creates the parts of a split (lines, reservations, exclusions) and assigns each one. With final = false it is a trial
-- run: temporary numbers, no work item; the caller rolls it back.
create or replace function private.split_delivery_create_parts(source public.deliveries, parts jsonb, target_operation_id uuid, final boolean)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  part jsonb;
  item jsonb;
  part_index integer := 0;
  line public.delivery_lines%rowtype;
  quantity numeric;
  new_delivery uuid;
  new_line uuid;
  new_ids uuid[] := '{}';
  employee uuid;
  vehicle uuid;
  start_at timestamptz;
  end_at timestamptz;
  refusal text;
  part_trace uuid;
begin
  -- The parts: new notes with the same customer, address and receiver as the original.
  for part in select value from jsonb_array_elements(parts) loop
    part_index := part_index + 1;
    start_at := nullif(part->>'scheduled_start', '')::timestamptz;
    end_at := nullif(part->>'scheduled_end', '')::timestamptz;
    if end_at is not null and (start_at is null or end_at <= start_at) then
      raise exception 'delivery_split_schedule_window' using errcode = '22023';
    end if;
    insert into public.deliveries(branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot,
      delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, scheduled_at, scheduled_end_at, created_by, split_from_delivery_id)
    values (source.branch_id, source.sales_order_id, case when final then 'DL-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.delivery_number_seq')::text, 6, '0')
        else 'TAM-' || left(md5(target_operation_id::text || ':' || part_index), 16) end,
      source.customer_id, source.site_id, source.customer_name_snapshot, source.site_name_snapshot, source.delivery_address_snapshot,
      source.receiver_name_snapshot, source.receiver_phone_snapshot, coalesce(start_at, source.scheduled_at),
      case when start_at is null then source.scheduled_end_at else end_at end, auth.uid(), source.id)
    returning id into new_delivery;
    new_ids := new_ids || new_delivery;
    for item in select value from jsonb_array_elements(part->'lines') loop
      select * into line from public.delivery_lines l where l.id = (item->>'delivery_line_id')::uuid;
      quantity := (item->>'base_quantity')::numeric;
      insert into public.delivery_lines(delivery_id, sales_order_line_id, supply_allocation_id, material_id, base_uom_id, source_mode, warehouse_id,
        planned_base_quantity, conversion_numerator, conversion_denominator, unit_price_vnd)
      values (new_delivery, line.sales_order_line_id, line.supply_allocation_id, line.material_id, line.base_uom_id, line.source_mode, line.warehouse_id,
        quantity, line.conversion_numerator, line.conversion_denominator, line.unit_price_vnd)
      returning id into new_line;
      if line.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE') then
        perform private.reserve_inventory_for_line(line.sales_order_line_id, new_line, line.warehouse_id, quantity, auth.uid());
      end if;
    end loop;
    -- A driver who declined the original is not proposed again for its parts.
    insert into public.delivery_dispatch_exclusions(delivery_id, employee_id, reason, created_by)
    select new_delivery, x.employee_id, x.reason, x.created_by from public.delivery_dispatch_exclusions x where x.delivery_id = source.id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), source.branch_id, 'delivery.created_from_split', 'delivery', new_delivery, target_operation_id,
      array['delivery_lines', 'inventory_reservations'], 'Tách từ ' || source.delivery_number);
  end loop;

  -- Who drives each part: the one chosen (checked like a manual assignment), or the branch's dispatch mode.
  part_index := 0;
  for part in select value from jsonb_array_elements(parts) loop
    part_index := part_index + 1;
    new_delivery := new_ids[part_index];
    part_trace := md5(target_operation_id::text || ':split:' || part_index)::uuid;
    employee := nullif(part->>'employee_id', '')::uuid;
    vehicle := nullif(part->>'vehicle_id', '')::uuid;
    if employee is not null then
      if exists (select 1 from public.delivery_lines l where l.delivery_id = new_delivery and l.source_mode = 'SUPPLIER_DIRECT') then
        raise exception 'delivery_split_direct_assignment' using errcode = '23514';
      end if;
      start_at := (part->>'scheduled_start')::timestamptz;
      end_at := coalesce(nullif(part->>'scheduled_end', '')::timestamptz, start_at + private.delivery_stop_interval(source.branch_id));
      refusal := private.try_dispatch_assignment(new_delivery, employee, vehicle, start_at, end_at, part_trace, false);
      if refusal is not null then
        raise exception 'delivery_split_assignment_refused' using errcode = '23514', detail = part_index::text, hint = refusal;
      end if;
    else
      perform private.auto_dispatch_delivery(new_delivery, part_trace);
    end if;
  end loop;

  return new_ids;
end $$;

create or replace function public.split_delivery(target_delivery_id uuid, expected_version integer, parts jsonb, operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source public.deliveries%rowtype;
  receipt public.command_receipts%rowtype;
  hash text;
  part jsonb;
  item jsonb;
  part_count integer;
  new_ids uuid[] := '{}';
  former_employee uuid;
  numbers text;
  trial_state text;
  trial_detail text;
  trial_hint text;
begin
  if auth.uid() is null or split_delivery.operation_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into source from public.deliveries d where d.id = target_delivery_id;
  if source.id is null or not private.has_permission(source.branch_id, 'delivery.assign')
    or not private.has_permission(source.branch_id, 'delivery.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'version', expected_version, 'parts', parts));
  select * into receipt from public.command_receipts r where r.operation_id = split_delivery.operation_id;
  if found then
    if receipt.command_name <> 'split_delivery' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return private.delivery_split_view(receipt.result_entity_id);
  end if;

  -- The shape of the request.
  if jsonb_typeof(parts) is distinct from 'array' or jsonb_array_length(parts) not between 2 and 5 then
    raise exception 'delivery_split_parts_invalid' using errcode = '22023';
  end if;
  part_count := jsonb_array_length(parts);
  for part in select value from jsonb_array_elements(parts) loop
    if jsonb_typeof(part->'lines') is distinct from 'array' or jsonb_array_length(part->'lines') < 1 then
      raise exception 'delivery_split_part_empty' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_array_elements(part->'lines') x) <> (select count(distinct x->>'delivery_line_id') from jsonb_array_elements(part->'lines') x) then
      raise exception 'delivery_split_line_duplicate' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(part->'lines') loop
      if coalesce(item->>'base_quantity', '') !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' or (item->>'base_quantity')::numeric <= 0 then
        raise exception 'delivery_split_quantity_invalid' using errcode = '22023';
      end if;
    end loop;
    if (nullif(part->>'employee_id', '') is null) <> (nullif(part->>'vehicle_id', '') is null)
      or (nullif(part->>'employee_id', '') is not null and nullif(part->>'scheduled_start', '') is null) then
      raise exception 'delivery_split_assignment_incomplete' using errcode = '22023';
    end if;
  end loop;

  -- The note itself: nothing has left the warehouse yet.
  select * into source from public.deliveries d where d.id = target_delivery_id for update;
  if source.execution_state not in ('PLANNED', 'ASSIGNED') or source.version is distinct from expected_version then
    raise exception 'delivery_split_version_conflict' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.delivery_handoffs h where h.delivery_id = source.id)
    or exists (select 1 from public.delivery_results r where r.delivery_id = source.id)
    or exists (select 1 from public.delivery_verifications v where v.delivery_id = source.id) then
    raise exception 'delivery_split_already_loaded' using errcode = '23514';
  end if;
  perform 1 from public.work_items w where w.delivery_id = source.id for update;
  if exists (select 1 from public.work_items w where w.delivery_id = source.id
      and (w.started_at is not null or w.execution_state not in ('AVAILABLE', 'CLAIMED', 'CANCELLED'))) then
    raise exception 'delivery_split_after_work_started' using errcode = '23514';
  end if;

  -- Every line shared out exactly, only lines of this note.
  if exists (
    select 1 from jsonb_array_elements(parts) p cross join jsonb_array_elements(p->'lines') x
    where not exists (select 1 from public.delivery_lines l where l.delivery_id = source.id and l.id::text = x->>'delivery_line_id')
  ) then
    raise exception 'delivery_split_line_not_on_delivery' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.delivery_lines l
    where l.delivery_id = source.id and l.planned_base_quantity is distinct from (
      select coalesce(sum((x->>'base_quantity')::numeric), 0)
      from jsonb_array_elements(parts) p cross join jsonb_array_elements(p->'lines') x where x->>'delivery_line_id' = l.id::text)
  ) then
    raise exception 'delivery_split_quantity_mismatch' using errcode = '23514';
  end if;

  -- Withdraw the original: assignment, job, GPS and reservations; the note is kept as history.
  perform 1 from public.inventory_reservations r join public.delivery_lines l on l.id = r.delivery_line_id
    where l.delivery_id = source.id order by r.id for update of r;
  if exists (
    select 1 from public.delivery_lines l left join public.inventory_reservations r on r.delivery_line_id = l.id
    where l.delivery_id = source.id and (
      (l.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE') and (r.id is null or r.state <> 'ACTIVE'))
      or (l.source_mode = 'SUPPLIER_DIRECT' and r.id is not null))
  ) then
    raise exception 'delivery_reservation_state_conflict' using errcode = '23514';
  end if;
  select a.employee_id into former_employee from public.delivery_assignments a where a.delivery_id = source.id and a.superseded_at is null;
  update public.gps_tracking_sessions set status = 'REVOKED', stopped_at = now(), stop_reason = 'assignment_superseded'
    where delivery_id = source.id and status = 'ACTIVE';
  update public.work_item_assignments wa set superseded_at = now()
    from public.work_items w where w.id = wa.work_item_id and w.delivery_id = source.id and wa.superseded_at is null
      and w.execution_state in ('AVAILABLE', 'CLAIMED');
  update public.delivery_assignments set superseded_at = now() where delivery_id = source.id and superseded_at is null;
  update public.inventory_reservations r set state = 'RELEASED', version = r.version + 1, finalized_at = now()
    from public.delivery_lines l where l.id = r.delivery_line_id and l.delivery_id = source.id and r.state = 'ACTIVE';
  update public.deliveries set execution_state = 'CANCELLED', version = version + 1 where id = source.id;

  -- D46 numbering: a trial run with temporary numbers first, so a refused part (truck too small, clash…) never uses up a
  -- DL number; then the real notes, numbered one after another.
  begin
    perform set_config('hx.split_trial', 'on', true);
    perform private.split_delivery_create_parts(source, parts, split_delivery.operation_id, false);
    raise exception 'hx_split_trial_ok';
  exception when others then
    perform set_config('hx.split_trial', '', true);
    if sqlerrm <> 'hx_split_trial_ok' then
      get stacked diagnostics trial_state = returned_sqlstate, trial_detail = pg_exception_detail, trial_hint = pg_exception_hint;
      raise exception '%', sqlerrm using errcode = trial_state, detail = coalesce(trial_detail, ''), hint = coalesce(trial_hint, '');
    end if;
  end;
  new_ids := private.split_delivery_create_parts(source, parts, split_delivery.operation_id, true);

  select string_agg(d.delivery_number, ', ' order by d.delivery_number) into numbers from public.deliveries d where d.id = any (new_ids);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), source.branch_id, 'delivery.split', 'delivery', source.id, split_delivery.operation_id,
    array['execution_state', 'delivery_assignment', 'inventory_reservations'], left('Tách thành ' || numbers, 500));
  if former_employee is not null then
    perform private.notify(source.branch_id, 'work.delivery_split', 'delivery', source.id, 'Phiếu ' || source.delivery_number || ' đã được tách',
      'Việc cũ đã hủy. Phiếu mới: ' || numbers || '. Xem lại việc được giao.', '/work', 'work.claim', former_employee,
      'work.delivery_split:' || split_delivery.operation_id);
  end if;
  insert into public.command_receipts values (split_delivery.operation_id, auth.uid(), 'split_delivery', hash, 'delivery', source.id, now());
  return private.delivery_split_view(source.id);
end $$;

revoke all on function private.split_delivery_create_parts(public.deliveries, jsonb, uuid, boolean) from public, anon, authenticated;
