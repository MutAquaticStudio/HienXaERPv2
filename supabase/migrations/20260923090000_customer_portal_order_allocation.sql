-- Report the portion of each payment allocated to this sales order.

create or replace function public.customer_portal_order(target_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      'original_amount_vnd', coalesce(sum(r.original_amount_vnd), 0),
      'outstanding_amount_vnd', coalesce(sum(r.outstanding_amount_vnd), 0),
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'source_type', r.source_type,
        'source_number', r.source_label,
        'original_amount_vnd', r.original_amount_vnd,
        'outstanding_amount_vnd', r.outstanding_amount_vnd,
        'due_date', r.due_date
      ) order by r.due_date, r.id) filter (where r.id is not null), '[]'::jsonb)
    )
    into debt_json
    from public.receivable_read r
    where r.sales_order_id = target_order_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', payment.id,
      'number', payment.payment_number,
      'amount_vnd', payment.amount_vnd,
      'allocated_amount_vnd', payment.allocated_amount_vnd,
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
$$;

revoke all on function public.customer_portal_order(uuid) from public, anon;

grant execute on function public.customer_portal_order(uuid) to authenticated;

