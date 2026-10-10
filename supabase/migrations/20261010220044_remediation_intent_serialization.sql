-- G15: serialize a saved intent and reject another actor taking its identifier.
begin;
create function private.lock_saved_command_intent(op uuid,cmd text) returns void
 language plpgsql security definer set search_path='' as $lock$
declare d private.command_drafts%rowtype;
begin
 -- Lock applies to direct API retries too; no session flags or privileged bypass.
 select * into d from private.command_drafts where operation_id=op for update;
 if d.operation_id is not null and(d.actor_auth_user_id is distinct from(select auth.uid()) or d.command_name is distinct from cmd)
 then raise exception 'forbidden_command_intent' using errcode='42501';end if;
end $lock$;
revoke all on function private.lock_saved_command_intent(uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.post_payment(target_branch_id uuid, direction text, target_customer_id uuid, target_supplier_id uuid, target_account_id uuid, amount_vnd bigint, effective_at timestamp with time zone, method text, external_reference text, allocation_lines jsonb, advance_amount_vnd bigint, operation_id uuid, target_employee_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload_hash text; receipt public.command_receipts%rowtype; payment_id uuid; allocated_total bigint;
begin
  if not private.has_permission(target_branch_id,'finance.payment.post') then raise exception 'forbidden' using errcode='42501'; end if;
  if amount_vnd<=0 or direction not in ('RECEIPT','DISBURSEMENT') or method not in ('CASH','BANK_TRANSFER','CARD','OTHER') or advance_amount_vnd<0 then raise exception 'invalid_payment' using errcode='22023'; end if;
  if (direction='RECEIPT' and (target_customer_id is null or num_nonnulls(target_supplier_id,target_employee_id)>0)) or (direction='DISBURSEMENT' and target_customer_id is not null) or (direction='DISBURSEMENT' and num_nonnulls(target_supplier_id,target_employee_id)<>1) or (target_employee_id is not null and advance_amount_vnd>0) then raise exception 'invalid_payment_party' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('branch_id',target_branch_id,'direction',direction,'customer_id',target_customer_id,'supplier_id',target_supplier_id,'employee_id',target_employee_id,'account_id',target_account_id,'amount',amount_vnd,'effective_at',effective_at,'method',method,'reference',nullif(trim(external_reference),''),'allocations',allocation_lines,'advance',advance_amount_vnd));
  perform private.lock_saved_command_intent(post_payment.operation_id,'post_payment');
  select * into receipt from public.command_receipts where command_receipts.operation_id=post_payment.operation_id;
  if found then if receipt.command_name<>'post_payment' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  perform 1 from public.finance_accounts where id=target_account_id and branch_id=target_branch_id and active for update; if not found then raise exception 'invalid_finance_account' using errcode='23503'; end if;
  if direction='RECEIPT' then perform 1 from public.customers where id=target_customer_id and branch_id=target_branch_id and active;
  elsif target_supplier_id is not null then perform 1 from public.suppliers where id=target_supplier_id and branch_id=target_branch_id and active;
  else perform 1 from public.employee_branch_access a join public.employees e on e.id=a.employee_id where e.id=target_employee_id and e.active and a.branch_id=target_branch_id and a.active; end if;
  if not found then raise exception 'invalid_payment_party' using errcode='23503'; end if;
  insert into public.payments(branch_id,payment_number,direction,customer_id,supplier_id,employee_id,account_id,amount_vnd,method,external_reference,effective_at,posted_by) values(target_branch_id,case when direction='RECEIPT' then 'REC-' else 'PAY-' end||to_char((effective_at at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),direction,target_customer_id,target_supplier_id,target_employee_id,target_account_id,amount_vnd,method,nullif(trim(external_reference),''),effective_at,(select auth.uid())) returning id into payment_id;
  allocated_total:=private.allocate_payment_lines(payment_id,coalesce(allocation_lines,'[]'::jsonb),(select auth.uid()));
  if allocated_total+advance_amount_vnd>amount_vnd then raise exception 'payment_effects_exceed_amount' using errcode='23514'; end if;
  if advance_amount_vnd>0 then insert into public.advances(branch_id,payment_id,advance_side,customer_id,supplier_id,amount_delta_vnd,recorded_by) values(target_branch_id,payment_id,case when direction='RECEIPT' then 'CUSTOMER' else 'SUPPLIER' end,target_customer_id,target_supplier_id,advance_amount_vnd,(select auth.uid())); end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'post_payment',payload_hash,'payment',payment_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'payment.posted','payment',payment_id,operation_id,array['direction','amount_vnd','account_id','effective_at']);
  return payment_id;
end $function$
;

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

notify pgrst,'reload schema';
commit;
