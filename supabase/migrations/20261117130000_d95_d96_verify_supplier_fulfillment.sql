-- D95 + D96 together: 20261117110000 (D96, business dates) redefined public.verify_supplier_fulfillment from the FB10 body and so
-- dropped the D95 guard added in 20261117100000 (no supplier delivery for a cancelled sales order). Body = the D96 definition plus
-- that guard; grants unchanged.
begin;

CREATE OR REPLACE FUNCTION public.verify_supplier_fulfillment(target_purchase_order_id uuid, fulfillment_lines jsonb, target_evidence_id uuid, supplier_reference text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare order_row public.purchase_orders%rowtype; line public.purchase_order_lines%rowtype; item jsonb;
  quantity numeric; prior_quantity numeric; base_quantity numeric; amount bigint; total_amount bigint := 0;
  sales_order_id uuid; fulfillment_id uuid; hash text; receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'inventory.receive') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'lines', fulfillment_lines, 'evidence_id', target_evidence_id, 'supplier_reference', nullif(trim(supplier_reference), '')));
  perform private.lock_saved_command_intent(verify_supplier_fulfillment.operation_id,'verify_supplier_fulfillment');
  select * into receipt from public.command_receipts where command_receipts.operation_id = verify_supplier_fulfillment.operation_id;
  if found then if receipt.command_name <> 'verify_supplier_fulfillment' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_quantity_lines(fulfillment_lines,array['supplier_quantity'],false);
  -- D95: no supplier delivery (payable, direct cost) is recorded for a cancelled sales order.
  if private.purchase_linked_sales_order_cancelled(order_row.id) then
    raise exception 'purchase_linked_sales_order_cancelled' using errcode = '23514';
  end if;
  -- FB10: the supplier's delivery is the confirmation of a draft order.
  perform private.confirm_purchase_on_receipt(order_row.id); select * into order_row from public.purchase_orders where id = target_purchase_order_id;

  if order_row.state <> 'CONFIRMED' or order_row.destination_type <> 'CUSTOMER_SITE' or jsonb_array_length(fulfillment_lines) = 0 then raise exception 'direct_purchase_not_verifiable' using errcode = '23514'; end if;
  perform private.assert_verified_evidence(target_evidence_id, order_row.branch_id);
  insert into public.supplier_fulfillments(branch_id, purchase_order_id, evidence_object_id, supplier_reference, verified_by)
  values (order_row.branch_id, target_purchase_order_id, target_evidence_id, nullif(trim(supplier_reference), ''), (select auth.uid())) returning id into fulfillment_id;
  for item in select value from jsonb_array_elements(fulfillment_lines) loop
    quantity := (item->>'supplier_quantity')::numeric;
    select * into line from public.purchase_order_lines where id = (item->>'purchase_order_line_id')::uuid and purchase_order_id = target_purchase_order_id for update;
    if line.id is null or line.linked_sales_order_line_id is null or quantity <= 0 then raise exception 'invalid_supplier_fulfillment_line' using errcode = '22023'; end if;
    select coalesce(sum(fl.supplier_quantity), 0) into prior_quantity from public.supplier_fulfillment_lines fl where fl.purchase_order_line_id = line.id;
    if prior_quantity + quantity > line.quantity then raise exception 'supplier_fulfillment_exceeds_purchase_line' using errcode = '23514'; end if;
    base_quantity := quantity * line.conversion_numerator / line.conversion_denominator;
    perform private.require_exact_quantity(base_quantity,false);
    amount := round(quantity * line.unit_cost_vnd)::bigint;
    insert into public.supplier_fulfillment_lines(supplier_fulfillment_id, purchase_order_line_id,
      sales_order_line_id, supplier_quantity, supplier_base_quantity, payable_amount_vnd)
    values (fulfillment_id, line.id, line.linked_sales_order_line_id, quantity, base_quantity, amount);
    total_amount := total_amount + amount;
    select sl.sales_order_id into sales_order_id from public.sales_order_lines sl where sl.id = line.linked_sales_order_line_id;
  end loop;
  insert into public.payable_obligations(branch_id, supplier_id, opening_source_id, supplier_fulfillment_id,
    original_amount_vnd, due_date, recorded_by)
  values (order_row.branch_id, order_row.supplier_id, null, fulfillment_id, total_amount, private.business_today(), (select auth.uid()));
  insert into public.direct_cost_entries(branch_id, sales_order_id, supplier_fulfillment_id,
    amount_delta_vnd, cost_kind, recorded_by)
  values (order_row.branch_id, sales_order_id, fulfillment_id, total_amount, 'SUPPLIER_DIRECT', (select auth.uid()));
  if not exists (
    select 1 from public.purchase_order_lines l where l.purchase_order_id = target_purchase_order_id
      and coalesce((select sum(fl.supplier_quantity) from public.supplier_fulfillment_lines fl where fl.purchase_order_line_id = l.id), 0) < l.quantity
  ) then update public.purchase_orders set state = 'CLOSED' where id = target_purchase_order_id; end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'verify_supplier_fulfillment', hash, 'supplier_fulfillment', fulfillment_id, now());
  return fulfillment_id;
end
$function$;

notify pgrst, 'reload schema';
commit;
