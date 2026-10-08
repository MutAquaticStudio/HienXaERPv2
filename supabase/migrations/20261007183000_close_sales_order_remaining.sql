BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

CREATE FUNCTION public.close_sales_order_remaining(
  target_order_id uuid, close_reason text, operation_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  order_row public.sales_orders%ROWTYPE;
  receipt public.command_receipts%ROWTYPE;
  payload_hash text;
BEGIN
  SELECT * INTO order_row FROM public.sales_orders WHERE id = target_order_id;
  IF NOT FOUND OR NOT private.has_permission(order_row.branch_id, 'orders.cancel') THEN
    RAISE EXCEPTION 'forbidden_or_order_not_found' USING ERRCODE = '42501';
  END IF;
  IF close_reason IS NULL OR char_length(trim(close_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'close_reason_required' USING ERRCODE = '22023';
  END IF;
  -- Same allocation -> sales-line -> sales-order lock order as Delivery creation.
  PERFORM 1 FROM public.supply_allocations a
    JOIN public.sales_order_lines l ON l.id = a.sales_order_line_id
    WHERE l.sales_order_id = target_order_id ORDER BY a.id FOR UPDATE OF a;
  PERFORM 1 FROM public.sales_order_lines WHERE sales_order_id = target_order_id ORDER BY id FOR UPDATE;
  SELECT * INTO order_row FROM public.sales_orders WHERE id = target_order_id FOR UPDATE;
  IF NOT private.has_permission(order_row.branch_id, 'orders.cancel') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  payload_hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id, 'reason', trim(close_reason)));
  SELECT * INTO receipt FROM public.command_receipts r WHERE r.operation_id = close_sales_order_remaining.operation_id;
  IF FOUND THEN
    IF receipt.command_name <> 'close_sales_order_remaining' OR receipt.payload_hash <> payload_hash
      OR receipt.actor_auth_user_id <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'operation_payload_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN receipt.result_entity_id;
  END IF;
  IF order_row.commercial_state <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'sales_order_not_closeable' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deliveries d WHERE d.sales_order_id = target_order_id AND d.execution_state NOT IN ('VERIFIED', 'CANCELLED'))
    OR EXISTS (SELECT 1 FROM public.return_cases r JOIN public.delivery_lines l ON l.id = r.delivery_line_id
      JOIN public.deliveries d ON d.id = l.delivery_id WHERE d.sales_order_id = target_order_id AND r.state = 'OPEN')
    OR EXISTS (SELECT 1 FROM public.work_items w JOIN public.deliveries d ON d.id = w.delivery_id
      WHERE d.sales_order_id = target_order_id AND w.execution_state NOT IN ('VERIFIED', 'CANCELLED'))
    OR EXISTS (SELECT 1 FROM public.inventory_movements m JOIN public.deliveries d ON d.id = m.delivery_id
      WHERE d.sales_order_id = target_order_id AND m.location_kind = 'IN_TRANSIT'
      GROUP BY m.delivery_id, m.material_id, m.base_uom_id
      HAVING sum(m.base_quantity_delta) <> 0 OR sum(m.inventory_value_delta_vnd) <> 0) THEN
    RAISE EXCEPTION 'sales_order_unresolved_execution' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_lines l WHERE l.sales_order_id = target_order_id
    AND l.quantity * l.conversion_numerator / l.conversion_denominator > coalesce((
      SELECT sum(v.accepted_base_quantity) FROM public.delivery_verification_lines v
        JOIN public.delivery_lines dl ON dl.id = v.delivery_line_id
        JOIN public.deliveries d ON d.id = dl.delivery_id
      WHERE dl.sales_order_line_id = l.id AND d.execution_state = 'VERIFIED'), 0)) THEN
    RAISE EXCEPTION 'sales_order_has_no_remaining' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.customers WHERE id = order_row.customer_id FOR UPDATE;
  UPDATE public.inventory_reservations r SET state = 'RELEASED', version = r.version + 1, finalized_at = now()
    WHERE r.state = 'ACTIVE' AND r.sales_order_line_id IN (SELECT id FROM public.sales_order_lines WHERE sales_order_id = target_order_id);
  UPDATE public.credit_commitments SET released_vnd = amount_vnd - consumed_vnd WHERE sales_order_id = target_order_id;
  UPDATE public.sales_orders SET commercial_state = 'CLOSED' WHERE id = target_order_id;
  INSERT INTO public.command_receipts VALUES (operation_id, (SELECT auth.uid()), 'close_sales_order_remaining', payload_hash, 'sales_order', target_order_id, now());
  INSERT INTO public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    VALUES ((SELECT auth.uid()), order_row.branch_id, 'sales_order.remaining.close', 'sales_order', target_order_id, operation_id,
      ARRAY['commercial_state', 'credit_commitment', 'inventory_reservation'], trim(close_reason));
  RETURN target_order_id;
END
$function$;
REVOKE ALL ON FUNCTION public.close_sales_order_remaining(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_sales_order_remaining(uuid, text, uuid) TO authenticated;
COMMIT;
