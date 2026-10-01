-- Cancel only an unstarted delivery. Keep its history, release its stock holds,
-- and make its allocation available to a replacement delivery atomically.
create or replace function public.cancel_planned_delivery(
  target_delivery_id uuid,
  expected_version integer,
  cancellation_reason text,
  operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  delivery public.deliveries%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
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
  if delivery.execution_state <> 'PLANNED' or delivery.version <> expected_version then
    raise exception 'delivery_cancel_version_conflict' using errcode = '40001';
  end if;
  if not exists (select 1 from public.delivery_lines where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_assignments where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_handoffs where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_results where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_verifications where delivery_id = delivery.id) then
    raise exception 'delivery_cancel_not_safe' using errcode = '23514';
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
  update public.inventory_reservations reservation
    set state = 'RELEASED', version = version + 1, finalized_at = now()
    from public.delivery_lines line
    where line.id = reservation.delivery_line_id and line.delivery_id = delivery.id
      and reservation.state = 'ACTIVE';
  update public.deliveries set execution_state = 'CANCELLED', version = version + 1
    where id = delivery.id;
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_planned_delivery', hash,
    'delivery', delivery.id, now());
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason)
  values (
    (select auth.uid()), delivery.branch_id, 'delivery.cancel', 'delivery', delivery.id,
    operation_id, array['execution_state', 'inventory_reservations'], trim(cancellation_reason));
  return delivery.id;
end
$function$;

revoke all on function public.cancel_planned_delivery(uuid, integer, text, uuid) from public, anon;
grant execute on function public.cancel_planned_delivery(uuid, integer, text, uuid) to authenticated;
