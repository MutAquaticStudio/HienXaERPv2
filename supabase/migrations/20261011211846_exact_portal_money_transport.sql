-- Preserve integer VND as JSON strings at worker/customer display boundaries.
-- Reader-only change: no posted money/quantities, ownership, membership or price snapshot changes.
begin;
CREATE OR REPLACE FUNCTION private.customer_order_payload(target_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row record;
  member_role text;
  deliveries_json jsonb;
begin
  select * into order_row from public.sales_order_read o where o.id = target_order_id;
  if order_row.id is null then return null; end if;
  member_role := private.portal_customer_role(order_row.customer_id);

  select coalesce(jsonb_agg(
    private.customer_delivery_payload(d.id)
    order by d.created_at, d.id
  ), '[]'::jsonb)
  into deliveries_json
  from public.delivery_read d
  where d.sales_order_id = target_order_id;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', order_row.id,
    'number', order_row.order_number,
    'state', order_row.commercial_state,
    'fulfillment_state', order_row.fulfillment_state,
    'payment_state', case when member_role in ('OWNER', 'FINANCE_CONTACT') then order_row.payment_state else null end,
    'ordered_at', coalesce(order_row.confirmed_at, order_row.created_at),
    'requested_delivery_date', order_row.requested_delivery_at,
    'total_amount_vnd', case when member_role in ('OWNER', 'FINANCE_CONTACT') then order_row.total_vnd::text else null end,
    'deliveries', deliveries_json
  ));
end
$function$
;

CREATE OR REPLACE FUNCTION public.customer_portal_order(target_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row record;
  member_role text;
  result_json jsonb;
  debt_json jsonb := null;
  payments_json jsonb := '[]'::jsonb;
  quotation_documents jsonb := '[]'::jsonb;
  delivery_documents jsonb := '[]'::jsonb;
  payment_documents jsonb := '[]'::jsonb;
begin
  select * into order_row from public.sales_order_read o where o.id = target_order_id;
  if order_row.id is null then raise exception 'order_not_found' using errcode = '23503'; end if;

  member_role := private.portal_customer_role(order_row.customer_id);
  if member_role is null then
    raise exception 'forbidden_or_order_not_found' using errcode = '42501';
  end if;

  result_json := private.customer_order_payload(target_order_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'delivery-' || d.id::text,
    'kind', 'DELIVERY',
    'title', 'Phiếu giao ' || d.delivery_number,
    'state', d.execution_state,
    'issued_at', coalesce(d.verified_at, d.created_at)
  ) order by d.created_at, d.id), '[]'::jsonb)
  into delivery_documents
  from public.delivery_read d
  where d.sales_order_id = target_order_id;

  if order_row.quotation_revision_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'quotation-' || qr.id::text,
      'kind', 'QUOTATION',
      'title', 'Báo giá ' || q.quotation_number || ' · R' || qr.revision_number::text,
      'state', qr.state,
      'issued_at', coalesce(qr.sent_at, qr.created_at),
      'href', '/api/quotation-revisions/' || qr.id::text || '/pdf'
    )), '[]'::jsonb)
    into quotation_documents
    from public.quotation_revisions qr
    join public.quotations q on q.id = qr.quotation_id
    where qr.id = order_row.quotation_revision_id
      and q.customer_id = order_row.customer_id;
  end if;

  if member_role in ('OWNER', 'FINANCE_CONTACT') then
    select jsonb_build_object(
      'original_amount_vnd', coalesce(sum(r.original_amount_vnd), 0)::text,
      'outstanding_amount_vnd', coalesce(sum(r.outstanding_amount_vnd), 0)::text,
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'source_type', r.source_type,
        'source_number', r.source_label,
        'original_amount_vnd', r.original_amount_vnd::text,
        'outstanding_amount_vnd', r.outstanding_amount_vnd::text,
        'due_date', r.due_date
      ) order by r.due_date, r.id) filter (where r.id is not null), '[]'::jsonb)
    )
    into debt_json
    from public.receivable_read r
    where r.sales_order_id = target_order_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', payment.id,
      'number', payment.payment_number,
      'amount_vnd', payment.amount_vnd::text,
      'allocated_amount_vnd', payment.allocated_amount_vnd::text,
      'order_allocated_amount_vnd', payment.order_allocated_amount_vnd::text,
      'effective_at', payment.effective_at,
      'state', payment.posting_state,
      'reconciliation_state', payment.reconciliation_state
    ) order by payment.effective_at desc, payment.id), '[]'::jsonb)
    into payments_json
    from (
      select p.id, p.payment_number, p.amount_vnd, p.allocated_amount_vnd,
        p.effective_at, p.posting_state, p.reconciliation_state,
        sum(a.amount_delta_vnd)::bigint as order_allocated_amount_vnd
      from public.payment_read p
      join public.payment_allocations a on a.payment_id = p.id
      join public.receivable_read r on r.id = a.receivable_obligation_id
      where r.sales_order_id = target_order_id
        and p.customer_id = order_row.customer_id
      group by p.id, p.payment_number, p.amount_vnd, p.allocated_amount_vnd,
        p.effective_at, p.posting_state, p.reconciliation_state
      order by p.effective_at desc, p.id
      limit 50
    ) payment;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'payment-' || payment.id::text,
      'kind', 'PAYMENT',
      'title', 'Phiếu thu ' || payment.payment_number,
      'state', payment.posting_state,
      'issued_at', payment.effective_at
    ) order by payment.effective_at desc, payment.id), '[]'::jsonb)
    into payment_documents
    from (
      select distinct p.id, p.payment_number, p.effective_at, p.posting_state
      from public.payment_read p
      join public.payment_allocations a on a.payment_id = p.id
      join public.receivable_read r on r.id = a.receivable_obligation_id
      where r.sales_order_id = target_order_id
        and p.customer_id = order_row.customer_id
      order by p.effective_at desc, p.id
      limit 50
    ) payment;
  end if;

  return result_json || jsonb_build_object(
    'can_view_finance', member_role in ('OWNER', 'FINANCE_CONTACT'),
    'debt', debt_json,
    'payments', payments_json,
    'documents', quotation_documents || delivery_documents || payment_documents
  );
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
        where nullif(item->>'due_date', '') is not null and (item->>'due_date')::date < current_date
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

commit;
