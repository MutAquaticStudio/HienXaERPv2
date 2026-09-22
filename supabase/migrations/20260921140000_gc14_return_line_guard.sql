create or replace function public.open_return_case(
  target_delivery_verification_line_id uuid, case_kind text, requested_base_quantity numeric,
  reason text, target_evidence_id uuid, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  verified_line public.delivery_verification_lines%rowtype;
  line public.delivery_lines%rowtype;
  delivery public.deliveries%rowtype;
  handoff_line public.delivery_handoff_lines%rowtype;
  available numeric;
  pending numeric;
  resolved numeric;
  case_id uuid;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into verified_line from public.delivery_verification_lines where id = target_delivery_verification_line_id;
  select * into line from public.delivery_lines where id = verified_line.delivery_line_id;
  select * into delivery from public.deliveries where id = line.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.exception') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if case_kind not in ('CUSTOMER_RETURN','TRANSIT_REMAINDER','TRANSIT_LOSS')
    or requested_base_quantity <= 0 or char_length(trim(reason)) < 3 then
    raise exception 'invalid_return_case' using errcode = '22023';
  end if;
  perform private.assert_verified_evidence(target_evidence_id, delivery.branch_id);
  hash := private.command_payload_hash(jsonb_build_object(
    'verification_line_id', target_delivery_verification_line_id, 'kind', case_kind,
    'quantity', requested_base_quantity, 'reason', trim(reason), 'evidence_id', target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = open_return_case.operation_id;
  if found then
    if receipt.command_name <> 'open_return_case' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if case_kind = 'CUSTOMER_RETURN' then
    available := verified_line.accepted_base_quantity;
    select coalesce(sum(rc.base_quantity), 0) into pending from public.return_cases rc
      where rc.delivery_verification_line_id = verified_line.id
        and rc.case_kind = 'CUSTOMER_RETURN' and rc.state <> 'CANCELLED';
  else
    if line.source_mode = 'SUPPLIER_DIRECT' then
      raise exception 'transit_return_requires_stock_source' using errcode = '23514';
    end if;
    select hl.* into handoff_line from public.delivery_handoff_lines hl
      join public.delivery_handoffs h on h.id = hl.delivery_handoff_id
      where h.delivery_id = delivery.id and hl.delivery_line_id = line.id;
    if handoff_line.id is null then
      raise exception 'delivery_handoff_line_missing' using errcode = '23514';
    end if;
    select coalesce(sum(rc.base_quantity), 0) into resolved from public.return_cases rc
      where rc.delivery_line_id = line.id
        and rc.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS')
        and rc.state in ('RETURNED','LOSS_APPROVED');
    available := greatest(handoff_line.moved_base_quantity - verified_line.accepted_base_quantity - resolved, 0);
    select coalesce(sum(rc.base_quantity), 0) into pending from public.return_cases rc
      where rc.delivery_line_id = line.id
        and rc.case_kind in ('TRANSIT_REMAINDER','TRANSIT_LOSS') and rc.state = 'OPEN';
  end if;
  if requested_base_quantity + pending > available then
    raise exception 'return_quantity_exceeds_source' using errcode = '23514';
  end if;
  insert into public.return_cases(branch_id, delivery_verification_line_id, delivery_line_id, case_kind,
    base_quantity, reason, evidence_object_id, opened_by)
  values (delivery.branch_id, verified_line.id, line.id, case_kind, requested_base_quantity,
    trim(reason), target_evidence_id, (select auth.uid())) returning id into case_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_return_case', hash, 'return_case', case_id, now());
  return case_id;
end
$$;

revoke all on function public.open_return_case(uuid, text, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.open_return_case(uuid, text, numeric, text, uuid, uuid) to authenticated;
