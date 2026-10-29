-- FB11 (Owner QA 29/10): an order the warehouse could not cover was sourced "NCC giao thẳng"; after "NCC đã giao" the purchase
-- order and the sales order still showed "chưa giao". The report only submitted the delivery result: the delivery waited for
-- the office to verify it, and even the office verification never recorded the supplier's delivery on the purchase order
-- (no supplier payable, the purchase order never closed).
-- Now, as for a worker's "Đã giao" (FB7), the supplier report is the verification: receivable and revenue as reported, and
-- the delivered quantity is recorded on the purchase order (supplier payable, direct cost of the order, the purchase order
-- closes once everything was delivered). An accounting problem (e.g. credit) leaves the delivery for the office, whose
-- verification now records the supplier's delivery as well. Deliveries already verified that way are repaired below.
begin;

-- Records, once per delivery, what the supplier delivered on the purchase order lines behind its supplier-direct lines.
create or replace function private.record_supplier_delivery_fulfillment(target_delivery_id uuid, target_evidence_id uuid)
returns integer language plpgsql security definer set search_path='' as $function$
declare d public.deliveries%rowtype; po record; item record; po_branch uuid; po_supplier uuid; fulfillment_id uuid; qty numeric; prior numeric; amount bigint;
  total bigint; reference text; made integer:=0;
begin
  select * into d from public.deliveries x where x.id=target_delivery_id;
  if d.id is null or d.execution_state<>'VERIFIED' then return 0; end if;
  reference:='Phiếu giao '||d.delivery_number;
  for po in select distinct pl.purchase_order_id from public.delivery_lines l
      join public.supply_allocations a on a.id=l.supply_allocation_id join public.purchase_order_lines pl on pl.id=a.purchase_order_line_id
      where l.delivery_id=d.id and l.source_mode='SUPPLIER_DIRECT' order by pl.purchase_order_id loop
    perform 1 from public.purchase_orders p where p.id=po.purchase_order_id for update;
    continue when exists (select 1 from public.supplier_fulfillments f where f.purchase_order_id=po.purchase_order_id and f.supplier_reference=reference);
    -- A purchase order whose supplier delivery was recorded by hand ("NCC đã giao" on the purchase order) is left to that entry.
    continue when exists (select 1 from public.supplier_fulfillments f where f.purchase_order_id=po.purchase_order_id
      and coalesce(f.supplier_reference,'') not like 'Phiếu giao %');
    fulfillment_id:=null; total:=0;
    for item in select pl.id po_line_id,pl.quantity po_quantity,pl.conversion_numerator,pl.conversion_denominator,pl.unit_cost_vnd,
        l.sales_order_line_id,sum(v.accepted_base_quantity) accepted
      from public.delivery_verification_lines v join public.delivery_verifications dv on dv.id=v.delivery_verification_id
      join public.delivery_lines l on l.id=v.delivery_line_id join public.supply_allocations a on a.id=l.supply_allocation_id
      join public.purchase_order_lines pl on pl.id=a.purchase_order_line_id
      where dv.delivery_id=d.id and l.source_mode='SUPPLIER_DIRECT' and pl.purchase_order_id=po.purchase_order_id and v.accepted_base_quantity>0
      group by pl.id,pl.quantity,pl.conversion_numerator,pl.conversion_denominator,pl.unit_cost_vnd,l.sales_order_line_id order by pl.id loop
      select coalesce(sum(fl.supplier_quantity),0) into prior from public.supplier_fulfillment_lines fl where fl.purchase_order_line_id=item.po_line_id;
      -- In the purchase unit, never more than is still open on the line (a manual "NCC đã giao" on the purchase order counts).
      qty:=least(round(item.accepted*item.conversion_denominator/item.conversion_numerator,6),item.po_quantity-prior);
      continue when qty<=0;
      amount:=round(qty*item.unit_cost_vnd)::bigint;
      continue when amount<=0;
      if fulfillment_id is null then
        select p.branch_id,p.supplier_id into po_branch,po_supplier from public.purchase_orders p where p.id=po.purchase_order_id;
        insert into public.supplier_fulfillments(branch_id,purchase_order_id,evidence_object_id,supplier_reference,verified_by)
          values(po_branch,po.purchase_order_id,target_evidence_id,reference,coalesce(auth.uid(),(select dv.verified_by from public.delivery_verifications dv
            where dv.delivery_id=d.id order by dv.verified_at desc limit 1))) returning id into fulfillment_id;
      end if;
      insert into public.supplier_fulfillment_lines(supplier_fulfillment_id,purchase_order_line_id,sales_order_line_id,supplier_quantity,supplier_base_quantity,payable_amount_vnd)
        values(fulfillment_id,item.po_line_id,item.sales_order_line_id,qty,round(qty*item.conversion_numerator/item.conversion_denominator,6),amount);
      total:=total+amount;
    end loop;
    continue when fulfillment_id is null;
    insert into public.payable_obligations(branch_id,supplier_id,opening_source_id,supplier_fulfillment_id,original_amount_vnd,due_date,recorded_by)
      select po_branch,po_supplier,null,fulfillment_id,total,(now() at time zone 'Asia/Ho_Chi_Minh')::date,f.verified_by
      from public.supplier_fulfillments f where f.id=fulfillment_id;
    insert into public.direct_cost_entries(branch_id,sales_order_id,supplier_fulfillment_id,amount_delta_vnd,cost_kind,recorded_by)
      select po_branch,d.sales_order_id,fulfillment_id,total,'SUPPLIER_DIRECT',f.verified_by from public.supplier_fulfillments f where f.id=fulfillment_id;
    if not exists (select 1 from public.purchase_order_lines l where l.purchase_order_id=po.purchase_order_id
        and coalesce((select sum(fl.supplier_quantity) from public.supplier_fulfillment_lines fl where fl.purchase_order_line_id=l.id),0)<l.quantity) then
      update public.purchase_orders set state='CLOSED' where id=po.purchase_order_id and state='CONFIRMED';
    end if;
    insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
      select f.verified_by,po_branch,'purchase_order.supplier_delivered','supplier_fulfillment',fulfillment_id,d.id,array['payable','direct_cost'],reference
      from public.supplier_fulfillments f where f.id=fulfillment_id;
    made:=made+1;
  end loop;
  return made;
end $function$;
revoke all on function private.record_supplier_delivery_fulfillment(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.submit_supplier_delivery_done(target_delivery_id uuid, result_lines jsonb, receiver_name text, note text,
  target_evidence_id uuid, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  delivery public.deliveries%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  lines jsonb;
  kind text;
  result_id uuid;
  version_now integer;
  verify_lines jsonb;
  verified boolean := false;
begin
  select * into delivery from public.deliveries d where d.id = target_delivery_id;
  if delivery.id is null or auth.uid() is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if submit_supplier_delivery_done.operation_id is null or (result_lines is not null and jsonb_typeof(result_lines) <> 'array') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery', target_delivery_id, 'lines', result_lines, 'receiver', nullif(trim(receiver_name), ''),
    'note', nullif(trim(note), ''), 'evidence', target_evidence_id, 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(submit_supplier_delivery_done.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = submit_supplier_delivery_done.operation_id;
  if found then
    if receipt.command_name <> 'submit_supplier_delivery_done' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into delivery from public.deliveries d where d.id = target_delivery_id for update;
  if delivery.version is distinct from expected_version or delivery.execution_state not in ('ASSIGNED', 'DISPATCHED', 'ARRIVED') then
    raise exception 'delivery_result_version_conflict' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.delivery_lines l where l.delivery_id = delivery.id and l.source_mode <> 'SUPPLIER_DIRECT')
    or not exists (select 1 from public.delivery_lines l where l.delivery_id = delivery.id) then
    raise exception 'delivery_not_supplier_direct' using errcode = '23514';
  end if;
  version_now := delivery.version;
  if delivery.execution_state = 'ASSIGNED' then
    perform public.handoff_delivery_actual(delivery.id, version_now, now(), md5(submit_supplier_delivery_done.operation_id::text || ':handoff')::uuid,
      (select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'loaded_base_quantity', l.planned_base_quantity)) from public.delivery_lines l where l.delivery_id = delivery.id));
    select d.version into version_now from public.deliveries d where d.id = delivery.id;
  end if;
  if (select d.execution_state from public.deliveries d where d.id = delivery.id) = 'DISPATCHED' then
    perform public.mark_delivery_arrived(delivery.id, version_now, md5(submit_supplier_delivery_done.operation_id::text || ':arrived')::uuid);
    select d.version into version_now from public.deliveries d where d.id = delivery.id;
  end if;
  if result_lines is null then
    select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'actual_base_quantity', coalesce(private.delivery_loaded_quantity(l.id), l.planned_base_quantity)))
    into lines from public.delivery_lines l where l.delivery_id = delivery.id;
  else
    lines := result_lines;
  end if;
  select case when bool_and((i->>'actual_base_quantity')::numeric = 0) then 'FAILED'
    when bool_and((i->>'actual_base_quantity')::numeric >= l.planned_base_quantity) then 'FULL' else 'PARTIAL' end
  into kind from jsonb_array_elements(lines) i join public.delivery_lines l on l.id = (i->>'delivery_line_id')::uuid and l.delivery_id = delivery.id;
  if kind is null then raise exception 'invalid_delivery_result' using errcode = '22023'; end if;
  if kind <> 'FAILED' and target_evidence_id is null then raise exception 'delivery_photo_required' using errcode = '22023'; end if;
  if kind = 'FAILED' and char_length(trim(coalesce(note, ''))) < 3 then raise exception 'delivery_failure_reason_required' using errcode = '22023'; end if;
  -- The office is told once, below, with the outcome of the automatic verification.
  perform set_config('hx.delivery_auto_verify', 'on', true);
  result_id := public.submit_delivery_result(delivery.id, kind, lines, coalesce(nullif(trim(receiver_name), ''), delivery.receiver_name_snapshot), note, null,
    target_evidence_id, version_now, md5(submit_supplier_delivery_done.operation_id::text || ':result')::uuid);
  -- FB11: the supplier's report is the verification, as a worker's "Đã giao": receivable and revenue as reported, and what the
  -- supplier delivered recorded on the purchase order. An accounting problem leaves the delivery for the office.
  begin
    select jsonb_agg(jsonb_build_object('delivery_line_id', rl.delivery_line_id,
        'accepted_base_quantity', trim_scale(rl.actual_base_quantity)::text,
        'billable_base_quantity', trim_scale(rl.actual_base_quantity)::text) order by rl.delivery_line_id)
      into verify_lines from public.delivery_result_lines rl where rl.delivery_result_id = result_id;
    perform private.verify_delivery_core(result_id, verify_lines, (select d.version from public.deliveries d where d.id = delivery.id),
      md5(submit_supplier_delivery_done.operation_id::text || ':verify')::uuid);
    perform private.record_supplier_delivery_fulfillment(delivery.id, target_evidence_id);
    verified := true;
  exception when others then
    verified := false;
  end;
  perform set_config('hx.delivery_auto_verify', '', true);
  perform private.notify(delivery.branch_id, 'delivery.result_submitted', 'delivery', delivery.id,
    case when not verified then 'Cần xác minh tay ' || delivery.delivery_number
      when kind = 'FAILED' then 'Không giao được ' || delivery.delivery_number
      when kind = 'PARTIAL' then 'NCC giao thiếu ' || delivery.delivery_number
      else delivery.delivery_number || ' NCC đã giao xong' end,
    delivery.customer_name_snapshot || ' · ' || coalesce(delivery.site_name_snapshot, ''), '/admin/deliveries/' || delivery.id,
    case when verified then 'delivery.read' else 'delivery.verify' end, null, 'delivery.result:' || delivery.id || ':supplier');
  insert into public.command_receipts values (submit_supplier_delivery_done.operation_id, auth.uid(), 'submit_supplier_delivery_done', hash, 'delivery_result', result_id, now());
  return result_id;
end
$function$;
revoke all on function public.submit_supplier_delivery_done(uuid, jsonb, text, text, uuid, integer, uuid) from public, anon;
grant execute on function public.submit_supplier_delivery_done(uuid, jsonb, text, text, uuid, integer, uuid) to authenticated;

-- The office verification also records what the supplier delivered.
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
  -- FB11: and what a supplier delivered straight to the site is recorded on its purchase order.
  perform private.record_supplier_delivery_fulfillment(delivery.id, result.evidence_object_id);
  insert into public.command_receipts values (verify_delivery.operation_id, (select auth.uid()), 'verify_delivery', hash, 'delivery_verification', verification_id, now());
  return verification_id;
end
$function$;

-- Repair: supplier-direct deliveries already verified whose purchase order has no supplier delivery recorded at all. A purchase
-- order with any "NCC đã giao" recorded by hand is left as it is (the hand entry may already cover these goods).
do $repair$
declare d record;
begin
  for d in select distinct on (dl.id) dl.id, v.verified_by, r.evidence_object_id from public.deliveries dl
      join public.delivery_verifications v on v.delivery_id = dl.id join public.delivery_results r on r.id = v.delivery_result_id
      where dl.execution_state = 'VERIFIED' and exists (select 1 from public.delivery_lines l where l.delivery_id = dl.id and l.source_mode = 'SUPPLIER_DIRECT')
        and not exists (select 1 from public.delivery_lines l join public.supply_allocations a on a.id = l.supply_allocation_id
          join public.purchase_order_lines pl on pl.id = a.purchase_order_line_id join public.supplier_fulfillments f on f.purchase_order_id = pl.purchase_order_id
          where l.delivery_id = dl.id and l.source_mode = 'SUPPLIER_DIRECT')
      order by dl.id, v.verified_at desc loop
    perform set_config('request.jwt.claim.sub', d.verified_by::text, true);
    perform private.record_supplier_delivery_fulfillment(d.id, d.evidence_object_id);
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end
$repair$;

notify pgrst, 'reload schema';
commit;
