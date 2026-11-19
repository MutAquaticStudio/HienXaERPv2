-- D95 (Owner 16/11/2026: "Ok giờ hãy fix các điểm chú ý"), part 2 — cancelling one delivery.
-- (D2) "Hủy kế hoạch giao" (cancel_planned_delivery, same signature, permission delivery.exception) also cancels an ASSIGNED
--     delivery that has not run (SPEC-DEL-002: CANCELLED only before the handoff): nothing loaded, on the road, delivered,
--     verified, stock moved, money, track or return (the D90 definition, for one delivery) and its job not started
--     (`delivery_cancel_work_started` otherwise). Like D94 for an order: the current delivery assignment (truck / person, or an
--     external vehicle) and the job assignment are closed (kept as history), the job CANCELLED (leaves "Nhận việc" and Điều phối),
--     the stock reservations RELEASED, the delivery CANCELLED (version + 1). As in D94 the worker gets no separate notice; his
--     unsent pushes about it are stopped. A PLANNED delivery is cancelled as before (an assignment the worker declined no
--     longer matters).
-- (D1, D3) cancel_planned_delivery and split_delivery (the original note) stop the unsent pushes about the cancelled delivery /
--     job, held ones included, drop its dispatch proposals and its stops in draft route plans
--     (private.stop_cancelled_delivery_followups, 20261117100000). split_delivery still tells the former worker the note was split.
begin;

-- ===== 1. Has one delivery run? (the D90 definition of private.sales_order_started_delivery_number, for one delivery) =====
create or replace function private.delivery_has_run(target_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deliveries d
    where d.id = target_delivery_id and (
      d.execution_state not in ('PLANNED', 'ASSIGNED', 'CANCELLED')
      or d.result_kind is not null or d.verified_at is not null
      or exists (select 1 from public.delivery_handoffs x where x.delivery_id = d.id)
      or exists (select 1 from public.delivery_results x where x.delivery_id = d.id)
      or exists (select 1 from public.delivery_verifications x where x.delivery_id = d.id)
      or exists (select 1 from public.inventory_movements x where x.delivery_id = d.id)
      or exists (select 1 from public.delivery_expense_sources x where x.delivery_id = d.id)
      or exists (select 1 from public.gps_tracking_sessions x where x.delivery_id = d.id)
      or exists (select 1 from public.gps_positions x where x.delivery_id = d.id)
      or exists (
        select 1 from public.delivery_lines l
        where l.delivery_id = d.id and (
          exists (select 1 from public.delivery_handoff_lines x where x.delivery_line_id = l.id)
          or exists (select 1 from public.delivery_result_lines x where x.delivery_line_id = l.id)
          or exists (select 1 from public.delivery_verification_lines x where x.delivery_line_id = l.id)
          or exists (select 1 from public.return_cases x where x.delivery_line_id = l.id)
          or exists (select 1 from public.inventory_reservations x where x.delivery_line_id = l.id and x.state = 'CONSUMED')))))
$$;
revoke all on function private.delivery_has_run(uuid) from public, anon, authenticated, service_role;

-- A job of the delivery that the worker started (or reported on).
create or replace function private.delivery_work_started(target_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_items w
    where w.delivery_id = target_delivery_id and (
      w.started_at is not null or w.completed_at is not null
      or w.execution_state not in ('AVAILABLE', 'CLAIMED', 'CANCELLED')
      or exists (select 1 from public.work_item_results x where x.work_item_id = w.id)
      or exists (select 1 from public.work_item_heartbeats x where x.work_item_id = w.id)
      or exists (select 1 from public.work_item_verifications x where x.work_item_id = w.id)
      or exists (select 1 from public.service_work_logs x where x.work_item_id = w.id)
      or exists (select 1 from public.service_verifications x where x.work_item_id = w.id)
      or exists (select 1 from public.portal_evidence_objects x where x.work_item_id = w.id)))
$$;
revoke all on function private.delivery_work_started(uuid) from public, anon, authenticated, service_role;

-- ===== 2. Job assignment history (D94 body; plus closing the not-started job of the delivery cancel_planned_delivery cancels) =====
CREATE OR REPLACE FUNCTION private.guard_work_assignment_supersession()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype;
begin
 if tg_op='DELETE' then
  select * into work from public.work_items where id=old.work_item_id;
  -- D90: only inside delete_sales_order, for an unstarted job of a delivery of the order being deleted.
  if coalesce(current_setting('hx.delete_sales_order', true), '') <> ''
   and work.delivery_id is not null and work.started_at is null and work.completed_at is null
   and work.execution_state in('AVAILABLE','CLAIMED','CANCELLED')
   and exists (select 1 from public.deliveries d where d.id=work.delivery_id
     and d.sales_order_id::text=current_setting('hx.delete_sales_order', true)) then
   return old;
  end if;
  raise exception 'work_assignment_history_immutable' using errcode='55000';
 end if;
 if tg_op='UPDATE' and old.superseded_at is null and new.superseded_at is not null
  and (to_jsonb(old)-'superseded_at')=(to_jsonb(new)-'superseded_at') then
  select * into work from public.work_items where id=old.work_item_id for update;
  if work.started_at is null and work.execution_state in('AVAILABLE','CLAIMED')
   and (private.has_permission(work.branch_id,'work.manage')
     or (work.delivery_id is not null and private.has_permission(work.branch_id,'delivery.assign'))
     -- C2: the worker declining their own unstarted job (set only inside decline_portal_work_item).
     or coalesce(current_setting('hx.decline_work_item', true), '') = old.work_item_id::text
     -- D85: the lead worker changing the person (set only inside private.field_dispatch_delivery / field_dispatch_work).
     or coalesce(current_setting('hx.field_dispatch_work_item', true), '') = old.work_item_id::text
     -- D94: cancelling the order of this delivery job (set only inside cancel_sales_order).
     or (coalesce(current_setting('hx.cancel_sales_order', true), '') <> '' and work.delivery_id is not null
       and exists (select 1 from public.deliveries d where d.id=work.delivery_id
         and d.sales_order_id::text=current_setting('hx.cancel_sales_order', true)))
     -- D95: cancelling this delivery (set only inside cancel_planned_delivery).
     or (work.delivery_id is not null and coalesce(current_setting('hx.cancel_delivery', true), '') = work.delivery_id::text)) then
   return new;
  end if;
 end if;
 raise exception 'work_assignment_history_immutable' using errcode='55000';
end $function$;

-- ===== 3. "Hủy kế hoạch giao": a planned or assigned delivery that has not run =====
CREATE OR REPLACE FUNCTION public.cancel_planned_delivery(target_delivery_id uuid, expected_version integer, cancellation_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delivery public.deliveries%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  had_assignment boolean;
  had_work boolean;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.exception') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(cancellation_reason)), 0) < 3
    or char_length(trim(cancellation_reason)) > 500 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object(
    'delivery_id', target_delivery_id, 'version', expected_version,
    'reason', trim(cancellation_reason)));
  select * into receipt from public.command_receipts
    where command_receipts.operation_id = cancel_planned_delivery.operation_id;
  if found then
    if receipt.command_name <> 'cancel_planned_delivery' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  -- D95: an assigned delivery too, before anything is loaded.
  if delivery.execution_state not in ('PLANNED', 'ASSIGNED') or delivery.version IS DISTINCT FROM expected_version then
    raise exception 'delivery_cancel_version_conflict' using errcode = 'PT409';
  end if;
  -- Its jobs are locked so the worker cannot start one meanwhile.
  perform 1 from public.work_items where delivery_id = delivery.id order by id for update;
  if not exists (select 1 from public.delivery_lines where delivery_id = delivery.id)
    or private.delivery_has_run(delivery.id) then
    raise exception 'delivery_cancel_not_safe' using errcode = '23514';
  end if;
  if private.delivery_work_started(delivery.id) then
    raise exception 'delivery_cancel_work_started' using errcode = '23514';
  end if;
  perform 1 from public.inventory_reservations reservation
    join public.delivery_lines line on line.id = reservation.delivery_line_id
    where line.delivery_id = delivery.id order by reservation.id for update of reservation;
  if exists (
    select 1 from public.delivery_lines line
    left join public.inventory_reservations reservation on reservation.delivery_line_id = line.id
    where line.delivery_id = delivery.id and (
      (line.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE')
        and (reservation.id is null or reservation.state <> 'ACTIVE'))
      or (line.source_mode = 'SUPPLIER_DIRECT' and reservation.id is not null)
    )
  ) then
    raise exception 'delivery_reservation_state_conflict' using errcode = '23514';
  end if;
  -- D95: the job leaves the worker and the truck / person (or external vehicle) is freed; both kept as history.
  had_work := exists (select 1 from public.work_items where delivery_id = delivery.id and execution_state in ('AVAILABLE', 'CLAIMED'));
  perform set_config('hx.cancel_delivery', delivery.id::text, true);
  update public.work_item_assignments set superseded_at = now()
    where work_item_id in (select id from public.work_items where delivery_id = delivery.id and execution_state in ('AVAILABLE', 'CLAIMED'))
      and superseded_at is null;
  perform set_config('hx.cancel_delivery', '', true);
  update public.delivery_assignments set superseded_at = now() where delivery_id = delivery.id and superseded_at is null;
  had_assignment := found;
  update public.inventory_reservations reservation
    set state = 'RELEASED', version = version + 1, finalized_at = now()
    from public.delivery_lines line
    where line.id = reservation.delivery_line_id and line.delivery_id = delivery.id
      and reservation.state = 'ACTIVE';
  -- deliveries_sync_work_item cancels the unstarted job with it.
  update public.deliveries set execution_state = 'CANCELLED', version = version + 1
    where id = delivery.id;
  update public.work_items set execution_state = 'CANCELLED', version = version + 1
    where delivery_id = delivery.id and execution_state in ('AVAILABLE', 'CLAIMED');
  perform private.stop_cancelled_delivery_followups(array[delivery.id], 'Không gửi: phiếu giao đã hủy');
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_planned_delivery', hash,
    'delivery', delivery.id, now());
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason)
  values (
    (select auth.uid()), delivery.branch_id, 'delivery.cancel', 'delivery', delivery.id,
    operation_id, array['execution_state', 'inventory_reservations']
      || case when had_assignment then array['delivery_assignment'] else '{}'::text[] end
      || case when had_work then array['work_items'] else '{}'::text[] end,
    trim(cancellation_reason));
  return delivery.id;
end
$function$;

revoke all on function public.cancel_planned_delivery(uuid, integer, text, uuid) from public, anon;
grant execute on function public.cancel_planned_delivery(uuid, integer, text, uuid) to authenticated;

comment on function public.cancel_planned_delivery(uuid, integer, text, uuid)
  is 'Cancels a planned or (D95) assigned delivery that has not run and whose job has not started: assignments closed, job cancelled, reservations released, unsent pushes stopped, draft route stops dropped. Audited, idempotent, permission delivery.exception.';

-- ===== 4. "Tách phiếu" (D46 body; change: the original note's unsent pushes / proposals / draft route stops follow it) =====
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
  -- D95: its unsent pushes (held ones too), dispatch proposals and draft route stops go with it.
  perform private.stop_cancelled_delivery_followups(array[source.id], 'Không gửi: phiếu giao đã tách');

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

notify pgrst, 'reload schema';
commit;
