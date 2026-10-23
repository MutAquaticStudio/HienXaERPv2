-- FB10 (Owner QA 23/10, mục 5.3, 6.5, 6.9, 9).
-- 5.3 "Kiểm kho" could not be opened (Production: open_stock_count → invalid_stock_count_scope): the cut-off comes from the
--     user's device and a clock a few seconds ahead was refused. A cut-off up to 5 minutes ahead is taken as "now".
-- 6.5 A partial delivery verified on the office page ("Làm thay thợ", "Cần xác minh tay") left the undelivered goods on the
--     truck, so the delivery stayed on the dispatch board. It now goes back to its warehouse as from the worker's report;
--     goods carried at zero cost also go back. Deliveries already verified that way are repaired below.
-- 6.9 A planned delivery a worker declined could never be cancelled (any past assignment blocked it).
-- 9   A customer's accountant (FINANCE_CONTACT) only follows orders, debts and payments; only the account owner orders.
begin;

CREATE OR REPLACE FUNCTION public.open_stock_count(target_branch_id uuid, target_warehouse_id uuid, cutoff_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare hash text; receipt public.command_receipts%rowtype; count_id uuid;
begin
  if not private.has_permission(target_branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.warehouses where id = target_warehouse_id and branch_id = target_branch_id and active for update;
  if not found or cutoff_at is null or cutoff_at > now() + interval '5 minutes' then raise exception 'invalid_stock_count_scope' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'warehouse_id', target_warehouse_id, 'cutoff_at', cutoff_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = open_stock_count.operation_id;
  if found then if receipt.command_name <> 'open_stock_count' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.stock_counts(branch_id, warehouse_id, count_number, cutoff_at, created_by)
  values (target_branch_id, target_warehouse_id, 'SC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.stock_count_number_seq')::text, 6, '0'), least(cutoff_at, now()), (select auth.uid())) returning id into count_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),target_branch_id,'stock_count.opened','stock_count',count_id,
    open_stock_count.operation_id,array['warehouse_id','cutoff_at','state','version']);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_stock_count', hash, 'stock_count', count_id, now());
  return count_id;
end
$function$;

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
  if delivery.execution_state <> 'PLANNED' or delivery.version  IS DISTINCT FROM expected_version then
    raise exception 'delivery_cancel_version_conflict' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.delivery_lines where delivery_id = delivery.id)
    -- FB10: an assignment the worker declined (superseded) no longer blocks cancelling the plan.
    or exists (select 1 from public.delivery_assignments where delivery_id = delivery.id and superseded_at is null)
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

create or replace function private.return_delivery_remainder(target_delivery_id uuid, operation_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $function$
declare delivery public.deliveries%rowtype; line public.delivery_lines%rowtype; verified_line public.delivery_verification_lines%rowtype;
  remaining numeric; remaining_value bigint; unit_cost numeric; case_id uuid; returned integer := 0;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or delivery.execution_state <> 'VERIFIED' then return 0; end if;
  for line in select l.* from public.delivery_lines l where l.delivery_id = delivery.id
      and l.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE') order by l.id loop
    select p.base_quantity, p.inventory_value_vnd into remaining, remaining_value from private.delivery_line_transit_position(line.id) p;
    -- FB10: stock carried at zero cost also goes back (it used to stay on the truck and keep the delivery open).
    if coalesce(remaining, 0) <= 0 or coalesce(remaining_value, 0) < 0 then continue; end if;
    if not exists (select 1 from public.warehouses w where w.id = line.warehouse_id and w.branch_id = delivery.branch_id and w.active) then continue; end if;
    perform 1 from public.warehouses where id = line.warehouse_id for update;
    select v.* into verified_line from public.delivery_verification_lines v
      join public.delivery_verifications dv on dv.id = v.delivery_verification_id
      where v.delivery_line_id = line.id and dv.delivery_id = delivery.id order by dv.verified_at desc, v.id limit 1;
    if verified_line.id is null then continue; end if;
    unit_cost := coalesce(remaining_value, 0)::numeric / remaining; remaining_value := coalesce(remaining_value, 0);
    insert into public.return_cases(branch_id, delivery_verification_line_id, delivery_line_id, case_kind, base_quantity, reason, state,
      resolution_warehouse_id, resolution_reason, opened_by, resolved_by, resolved_at)
    values (delivery.branch_id, verified_line.id, line.id, 'TRANSIT_REMAINDER', remaining, 'Hàng chưa giao, xe chở về kho', 'RETURNED',
      line.warehouse_id, 'Tự nhập lại kho xuất khi thợ báo giao', (select auth.uid()), (select auth.uid()), now()) returning id into case_id;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, delivery_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base, source_return_case_id, occurred_at, recorded_by)
    values (delivery.branch_id, line.material_id, line.base_uom_id, 'IN_TRANSIT', delivery.id,
      'RETURN_TRANSFER', -remaining, -remaining_value, unit_cost, case_id, now(), (select auth.uid()));
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base, source_return_case_id, occurred_at, recorded_by)
    values (delivery.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', line.warehouse_id,
      'RETURN_TRANSFER', remaining, remaining_value, unit_cost, case_id, now(), (select auth.uid()));
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values ((select auth.uid()), delivery.branch_id, 'delivery.return_resolved', 'return_case', case_id, operation_id,
      array['state', 'resolution_warehouse_id', 'physical_custody'], 'Hàng chưa giao tự nhập lại kho xuất');
    returned := returned + 1;
  end loop;
  return returned;
end
$function$;
revoke all on function private.return_delivery_remainder(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.verify_delivery(target_delivery_result_id uuid, verification_lines jsonb, expected_delivery_version integer, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare result public.delivery_results%rowtype; delivery public.deliveries%rowtype; hash text; receipt public.command_receipts%rowtype; verification_id uuid;
begin
  select * into result from public.delivery_results where id = target_delivery_result_id;
  select * into delivery from public.deliveries where id = result.delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('result_id', target_delivery_result_id, 'lines', verification_lines, 'version', expected_delivery_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_delivery.operation_id;
  if found then if receipt.command_name <> 'verify_delivery' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  verification_id := private.verify_delivery_core(target_delivery_result_id, verification_lines, expected_delivery_version, verify_delivery.operation_id);
  -- FB10: verified on the office page too, what was not delivered goes back to its warehouse, as from the worker's report.
  perform private.return_delivery_remainder(delivery.id, verify_delivery.operation_id);
  insert into public.command_receipts values (verify_delivery.operation_id, (select auth.uid()), 'verify_delivery', hash, 'delivery_verification', verification_id, now());
  return verification_id;
end
$function$;

create or replace function private.portal_ordering_customer(target_customer_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.customer_id from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id
  where m.auth_user_id = (select auth.uid()) and m.active and c.active and m.membership_role = 'OWNER'
    and (target_customer_id is null or m.customer_id = target_customer_id) and private.auth_actor_active()
  order by m.customer_id limit 1
$$;
revoke all on function private.portal_ordering_customer(uuid) from public, anon, authenticated, service_role;

-- Repair: verified deliveries still holding goods on the truck, returned in the name of whoever verified them.
do $repair$
declare d record;
begin
  for d in select distinct on (dl.id) dl.id, v.verified_by from public.deliveries dl
      join public.delivery_verifications v on v.delivery_id = dl.id
      where dl.execution_state = 'VERIFIED' and exists (select 1 from public.delivery_lines l
        cross join lateral private.delivery_line_transit_position(l.id) p where l.delivery_id = dl.id and p.base_quantity > 0)
      order by dl.id, v.verified_at desc loop
    perform set_config('request.jwt.claim.sub', d.verified_by::text, true);
    perform private.return_delivery_remainder(d.id, gen_random_uuid());
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end
$repair$;

commit;
