-- FB10 (Owner QA 23/10, mục 4): a purchase order needs no separate "Xác nhận đơn mua". Receiving the goods (or the
-- supplier's delivery to site) is the confirmation: a draft order with lines is confirmed in the same transaction, with the
-- same checks as confirm_purchase_order, then received as before.
begin;

create or replace function private.confirm_purchase_on_receipt(target_purchase_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare order_row public.purchase_orders%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.state <> 'DRAFT' then return; end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = order_row.id) then
    raise exception 'purchase_order_not_confirmable' using errcode = '23514';
  end if;
  update public.purchase_orders set state = 'CONFIRMED', confirmed_at = now() where id = order_row.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.confirm', 'purchase_order', order_row.id, gen_random_uuid(), array['state'],
    'Xác nhận khi nhận hàng');
end
$function$;
revoke all on function private.confirm_purchase_on_receipt(uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(target_purchase_order_id uuid, receipt_lines jsonb, target_evidence_id uuid, received_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare order_row public.purchase_orders%rowtype; line public.purchase_order_lines%rowtype;
  item jsonb; prior_quantity numeric; received_quantity numeric; base_quantity numeric;
  inventory_value bigint; unit_cost_base numeric; total_value bigint := 0; receipt_id uuid; receipt_line_id uuid;
  hash text; command_receipt public.command_receipts%rowtype;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'inventory.receive') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'lines', receipt_lines, 'evidence_id', target_evidence_id, 'received_at', received_at));
  perform private.lock_saved_command_intent(receive_purchase_order.operation_id,'receive_purchase_order');
  select * into command_receipt from public.command_receipts where command_receipts.operation_id = receive_purchase_order.operation_id;
  if found then if command_receipt.command_name <> 'receive_purchase_order' or command_receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return command_receipt.result_entity_id; end if;
  perform private.require_quantity_lines(receipt_lines,array['received_quantity'],false);
  -- FB10: receiving is the confirmation; a draft order is confirmed here, in the same transaction.
  perform private.confirm_purchase_on_receipt(order_row.id); select * into order_row from public.purchase_orders where id = target_purchase_order_id;

  if order_row.state <> 'CONFIRMED' or order_row.destination_type <> 'WAREHOUSE' or jsonb_array_length(receipt_lines) = 0 or received_at > now() + interval '5 minutes' then raise exception 'purchase_order_not_receivable' using errcode = '23514'; end if;
  perform private.assert_verified_evidence(target_evidence_id, order_row.branch_id);
  perform 1 from public.warehouses where id = order_row.warehouse_id for update;
  insert into public.purchase_receipts(branch_id, purchase_order_id, receipt_number, received_at, evidence_object_id, recorded_by)
  values (order_row.branch_id, target_purchase_order_id, 'PR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_receipt_number_seq')::text, 6, '0'), received_at, target_evidence_id, (select auth.uid())) returning id into receipt_id;
  for item in select value from jsonb_array_elements(receipt_lines) loop
    received_quantity := (item->>'received_quantity')::numeric;
    select * into line from public.purchase_order_lines where id = (item->>'purchase_order_line_id')::uuid and purchase_order_id = target_purchase_order_id for update;
    if line.id is null or received_quantity <= 0 then raise exception 'invalid_receipt_line' using errcode = '22023'; end if;
    select coalesce(sum(l.received_quantity), 0) into prior_quantity from public.purchase_receipt_lines l where l.purchase_order_line_id = line.id;
    if prior_quantity + received_quantity > line.quantity then raise exception 'receipt_exceeds_purchase_line' using errcode = '23514'; end if;
    base_quantity := received_quantity * line.conversion_numerator / line.conversion_denominator;
    perform private.require_exact_quantity(base_quantity,false);
    inventory_value := round(received_quantity * line.unit_cost_vnd)::bigint;
    unit_cost_base := inventory_value::numeric / base_quantity;
    insert into public.purchase_receipt_lines(purchase_receipt_id, purchase_order_line_id, material_id, warehouse_id,
      received_quantity, received_base_quantity, unit_cost_vnd, inventory_value_vnd, unit_cost_vnd_per_base)
    values (receipt_id, line.id, line.material_id, order_row.warehouse_id, received_quantity, base_quantity,
      line.unit_cost_vnd, inventory_value, unit_cost_base) returning id into receipt_line_id;
    insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id,
      movement_type, base_quantity_delta, inventory_value_delta_vnd, unit_cost_vnd_per_base,
      source_purchase_receipt_line_id, occurred_at, recorded_by)
    values (order_row.branch_id, line.material_id, line.base_uom_id, 'WAREHOUSE', order_row.warehouse_id,
      'PURCHASE_RECEIPT', base_quantity, inventory_value, unit_cost_base, receipt_line_id, received_at, (select auth.uid()));
    total_value := total_value + inventory_value;
  end loop;
  insert into public.payable_obligations(branch_id, supplier_id, opening_source_id, purchase_receipt_id,
    original_amount_vnd, due_date, recorded_by)
  values (order_row.branch_id, order_row.supplier_id, null, receipt_id, total_value, received_at::date, (select auth.uid()));
  if not exists (
    select 1 from public.purchase_order_lines l
    where l.purchase_order_id = target_purchase_order_id
      and coalesce((select sum(rl.received_quantity) from public.purchase_receipt_lines rl where rl.purchase_order_line_id = l.id), 0) < l.quantity
  ) then update public.purchase_orders set state = 'CLOSED' where id = target_purchase_order_id; end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'receive_purchase_order', hash, 'purchase_receipt', receipt_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.receive', 'purchase_receipt', receipt_id, operation_id, array['inventory','payable']);
  return receipt_id;
end
$function$
;

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
  values (order_row.branch_id, order_row.supplier_id, null, fulfillment_id, total_amount, current_date, (select auth.uid()));
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
$function$
;

create or replace function public.create_supplier_direct_delivery(target_purchase_order_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  purchase public.purchase_orders%rowtype;
  supplier public.suppliers%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  lines jsonb;
  delivery uuid;
  at_time timestamptz;
begin
  select * into purchase from public.purchase_orders p where p.id = target_purchase_order_id;
  if purchase.id is null or auth.uid() is null or not private.has_permission(purchase.branch_id, 'delivery.create')
    or not private.has_permission(purchase.branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if create_supplier_direct_delivery.operation_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order', target_purchase_order_id));
  perform pg_advisory_xact_lock(hashtextextended('supplier_delivery:' || target_purchase_order_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = create_supplier_direct_delivery.operation_id;
  if found then
    if receipt.command_name <> 'create_supplier_direct_delivery' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  -- FB10: planning the supplier's delivery confirms a draft order.
  if purchase.state = 'DRAFT' and purchase.destination_type = 'CUSTOMER_SITE' then
    perform private.confirm_purchase_on_receipt(purchase.id); select * into purchase from public.purchase_orders p where p.id = target_purchase_order_id;
  end if;
  if purchase.state <> 'CONFIRMED' or purchase.destination_type <> 'CUSTOMER_SITE' or purchase.source_sales_order_id is null then
    raise exception 'purchase_order_not_direct' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('supply_allocation_id', a.id,
      'planned_base_quantity', a.allocated_base_quantity - private.delivery_allocation_consumed(a.id)) order by pl.line_number), '[]'::jsonb)
  into lines
  from public.supply_allocations a join public.purchase_order_lines pl on pl.id = a.purchase_order_line_id
  where pl.purchase_order_id = purchase.id and a.supply_mode = 'SUPPLIER_DIRECT'
    and a.allocated_base_quantity - private.delivery_allocation_consumed(a.id) > 0;
  if jsonb_array_length(lines) = 0 then raise exception 'nothing_to_deliver' using errcode = '23514'; end if;
  select * into supplier from public.suppliers s where s.id = purchase.supplier_id;
  at_time := greatest(coalesce(purchase.expected_at, now()), now());
  delivery := public.create_delivery_from_allocations(purchase.source_sales_order_id, lines, at_time,
    md5(create_supplier_direct_delivery.operation_id::text || ':delivery')::uuid);
  perform public.assign_delivery(delivery, null, null, left(coalesce(purchase.supplier_name_snapshot, supplier.name), 120), supplier.phone,
    (select d.version from public.deliveries d where d.id = delivery), md5(create_supplier_direct_delivery.operation_id::text || ':assign')::uuid);
  insert into public.command_receipts values (create_supplier_direct_delivery.operation_id, auth.uid(), 'create_supplier_direct_delivery', hash, 'delivery', delivery, now());
  return delivery;
end
$function$;

notify pgrst, 'reload schema';
commit;
