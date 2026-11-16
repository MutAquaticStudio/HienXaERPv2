-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý", audit S4): business dates are days in Asia/Ho_Chi_Minh, never
-- the database's UTC day. Before, a delivery verified at 06:40 on 17/11 (23:40 UTC on 16/11) got a due date one day early,
-- and overdue checks blocked credit from 07:00 instead of midnight Vietnam time. The database time zone is NOT changed.
-- private.business_today(ts) is the one helper: the Vietnam calendar day of an instant (default now()).
-- Redefined from their latest bodies, only the date expression changed:
--   private.reserve_fixture_credit, private.reserve_sales_order_credit (overdue check)   20260930000100
--   private.sales_order_credit_snapshot (overdue amount of the credit override)          20261001182059
--   public.receive_purchase_order (receipt number year, supplier payable due date)       20261024090100
--   public.verify_supplier_fulfillment (direct-delivery supplier payable due date)       20261024090100
--   public.customer_portal_snapshot (customer's overdue amount)                          20261011211846
-- The customer receivable due date at delivery verification is fixed in 20261117110100 (verify_delivery_core).
begin;

create or replace function private.business_today(at_instant timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (at_instant at time zone 'Asia/Ho_Chi_Minh')::date
$$;
revoke all on function private.business_today(timestamptz) from public, anon, authenticated, service_role;

create or replace function private.reserve_fixture_credit(
  target_customer_id uuid,
  target_branch_id uuid,
  requested_amount_vnd bigint,
  fixture_source_key text,
  actor_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_limit bigint;
  current_exposure bigint;
  existing public.credit_commitments%rowtype;
  commitment_id uuid;
begin
  if requested_amount_vnd <= 0 then
    raise exception 'credit_amount_must_be_positive' using errcode = '22023';
  end if;

  select * into existing from public.credit_commitments
  where source_type = 'LOCAL_FIXTURE' and source_key = fixture_source_key;
  if found then
    if existing.customer_id <> target_customer_id or existing.branch_id <> target_branch_id or existing.amount_vnd <> requested_amount_vnd then
      raise exception 'credit_source_payload_conflict' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select credit_limit_vnd into customer_limit
  from public.customers
  where id = target_customer_id and branch_id = target_branch_id and active
  for update;

  if not found then raise exception 'customer_not_found_in_branch' using errcode = '23503'; end if;
  if customer_limit is null then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;

  if exists (
    select 1 from public.receivable_obligations o
    where o.customer_id = target_customer_id and o.due_date < private.business_today()
      and private.current_receivable_outstanding(o.id) > 0
  ) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;

  select coalesce(exposure_vnd, 0) into current_exposure
  from public.customer_credit_exposure where customer_id = target_customer_id;
  if current_exposure + requested_amount_vnd > customer_limit then
    raise exception 'credit_limit_exceeded' using errcode = '23514';
  end if;

  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by)
  values (target_branch_id, target_customer_id, 'LOCAL_FIXTURE', fixture_source_key, requested_amount_vnd, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;
revoke all on function private.reserve_fixture_credit(uuid, uuid, bigint, text, uuid) from public, anon, authenticated;

create or replace function private.reserve_sales_order_credit(target_order_id uuid, actor_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; total bigint; limit_value bigint; exposure bigint; existing public.credit_commitments%rowtype; commitment_id uuid;
begin
  select * into order_row from public.sales_orders where id = target_order_id;
  if not found then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  select coalesce(sum(line_total_vnd), 0)::bigint into total from public.sales_order_lines where sales_order_id = target_order_id;
  select * into existing from public.credit_commitments where sales_order_id = target_order_id;
  if found then if existing.amount_vnd <> total then raise exception 'credit_commitment_payload_conflict' using errcode = '23505'; end if; return existing.id; end if;
  select credit_limit_vnd into limit_value from public.customers where id = order_row.customer_id and branch_id = order_row.branch_id and active for update;
  if not found or limit_value is null then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;
  if exists (
    select 1 from public.receivable_obligations o
    where o.customer_id = order_row.customer_id and o.due_date < private.business_today()
      and private.current_receivable_outstanding(o.id) > 0
  ) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;
  select coalesce(exposure_vnd, 0) into exposure from public.customer_credit_exposure where customer_id = order_row.customer_id;
  if exposure + total > limit_value then raise exception 'credit_limit_exceeded' using errcode = '23514'; end if;
  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, sales_order_id, amount_vnd, created_by)
  values (order_row.branch_id, order_row.customer_id, 'SALES_ORDER', target_order_id::text, target_order_id, total, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;
revoke all on function private.reserve_sales_order_credit(uuid, uuid) from public, anon, authenticated;

create or replace function private.sales_order_credit_snapshot(target_order_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.sales_orders%rowtype; amount bigint; exposure public.customer_credit_exposure%rowtype;
  overdue bigint; customer_active boolean;
begin
  select * into o from public.sales_orders where id = target_order_id;
  if not found then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  select coalesce(sum(line_total_vnd), 0)::bigint into amount
    from public.sales_order_lines where sales_order_id = o.id;
  select * into exposure from public.customer_credit_exposure where customer_id = o.customer_id;
  select active into customer_active from public.customers
    where id = o.customer_id and branch_id = o.branch_id;
  select coalesce(sum(greatest(private.current_receivable_outstanding(r.id), 0)), 0)::bigint
    into overdue from public.receivable_obligations r
    where r.customer_id = o.customer_id and r.due_date < private.business_today();
  return jsonb_build_object('order_id', o.id, 'branch_id', o.branch_id, 'customer_id', o.customer_id,
    'state', o.commercial_state, 'draft_version', o.draft_version,
    'customer_active', coalesce(customer_active, false), 'order_amount_vnd', amount::text,
    'approved_limit_vnd', exposure.credit_limit_vnd::text,
    'exposure_vnd', coalesce(exposure.exposure_vnd, 0)::text, 'overdue_vnd', overdue::text);
end
$$;
revoke all on function private.sales_order_credit_snapshot(uuid) from public, anon, authenticated;

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
  values (order_row.branch_id, target_purchase_order_id, 'PR-' || to_char(private.business_today(), 'YYYY') || '-' || lpad(nextval('public.purchase_receipt_number_seq')::text, 6, '0'), received_at, target_evidence_id, (select auth.uid())) returning id into receipt_id;
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
  values (order_row.branch_id, order_row.supplier_id, null, receipt_id, total_value, private.business_today(received_at), (select auth.uid()));
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
$function$
;

CREATE OR REPLACE FUNCTION public.customer_portal_snapshot(target_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_customer_id uuid;
  member_role text;
  customer_json jsonb;
  quote_json jsonb;
  orders_json jsonb;
  debt_json jsonb;
  notices_json jsonb;
begin
  select m.customer_id, m.membership_role::text
  into selected_customer_id, member_role
  from public.customer_portal_memberships m
  where m.auth_user_id = (select auth.uid())
    and m.active
    and (target_customer_id is null or m.customer_id = target_customer_id)
  order by m.customer_id
  limit 1;
  if selected_customer_id is null then raise exception 'active_customer_membership_required' using errcode = '42501'; end if;

  select jsonb_build_object('id', c.id, 'code', c.code, 'display_name', c.display_name)
  into customer_json from public.customers c where c.id = selected_customer_id;

  if member_role in ('OWNER','FINANCE_CONTACT') then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', item->>'id',
      'number', coalesce(item->>'quotation_number', item->>'number'),
      'state', coalesce(item->>'quotation_state', item->>'status'),
      'current_revision_id', item->>'current_revision_id',
      'valid_until', item->>'valid_until'
    )) into quote_json
    from (
      select to_jsonb(q) item
      from public.quotations q
      where to_jsonb(q)->>'customer_id' = selected_customer_id::text
      order by to_jsonb(q)->>'created_at' desc nulls last, q.id desc
      limit 1
    ) quote_row;
  end if;

  select coalesce(jsonb_agg(private.customer_order_payload(o.id) order by o.id desc), '[]'::jsonb)
  into orders_json
  from public.sales_orders o
  where to_jsonb(o)->>'customer_id' = selected_customer_id::text;

  if member_role in ('OWNER','FINANCE_CONTACT') then
    select jsonb_build_object(
      'outstanding_amount_vnd', coalesce(sum((item->>'outstanding_amount_vnd')::bigint), 0)::text,
      'overdue_amount_vnd', coalesce(sum((item->>'outstanding_amount_vnd')::bigint) filter (
        where nullif(item->>'due_date', '') is not null and (item->>'due_date')::date < private.business_today()
      ), 0)::text,
      'items', coalesce(
        jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'id', item->>'id',
            'source_type', item->>'source_type',
            'source_number', coalesce(item->>'source_number', item->>'reference_number'),
            'original_amount_vnd', item->>'original_amount_vnd',
            'outstanding_amount_vnd', item->>'outstanding_amount_vnd',
            'due_date', item->>'due_date'
          ))
          order by item->>'due_date' nulls first
        ),
        '[]'::jsonb
      )
    ) into debt_json
    from (
      select to_jsonb(r) item
      from public.receivable_read r
      where to_jsonb(r)->>'customer_id' = selected_customer_id::text
        and coalesce((to_jsonb(r)->>'outstanding_amount_vnd')::bigint, 0) > 0
    ) debt_rows;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'amount_vnd', n.declared_amount_vnd::text,
      'paid_on', n.paid_on,
      'reference', n.payment_reference,
      'state', n.review_state,
      'version', n.version,
      'submitted_at', n.submitted_at,
      'evidence_id', n.evidence_id,
      'review_note', n.review_note
    ) order by n.submitted_at desc), '[]'::jsonb)
    into notices_json
    from public.payment_notices n
    where n.customer_id = selected_customer_id;
  else
    debt_json := null;
    notices_json := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'customer', customer_json,
    'membership_role', member_role,
    'can_view_debt', member_role in ('OWNER','FINANCE_CONTACT'),
    'quotation', quote_json,
    'orders', orders_json,
    'debt', debt_json,
    'payment_notices', notices_json
  );
end $function$
;

notify pgrst, 'reload schema';
commit;
