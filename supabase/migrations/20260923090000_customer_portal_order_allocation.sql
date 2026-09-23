-- Show the signed allocation for this order separately from the full payment voucher.
-- Safe to replay after a manual Production application.
do $patch$
declare
  definition text := pg_get_functiondef('public.customer_portal_order(uuid)'::regprocedure);
  marker text := 'select distinct p.id, p.payment_number, p.amount_vnd, p.allocated_amount_vnd,';
  query_start integer;
  query_end integer;
  new_query text := $new$select p.id, p.payment_number, p.amount_vnd, p.allocated_amount_vnd,
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
      limit 50$new$;
begin
  if position('order_allocated_amount_vnd' in definition) = 0 then
    query_start := position(marker in definition);
    if query_start = 0
      or query_start < position('into payments_json' in definition)
      or query_start > position('into payment_documents' in definition) then
      raise exception 'unexpected customer portal payment function';
    end if;
    query_end := query_start + position('limit 50' in substr(definition, query_start)) - 1;
    if query_end < query_start or query_end > position('into payment_documents' in definition) then
      raise exception 'unexpected customer portal payment query boundary';
    end if;
    definition := substr(definition, 1, query_start - 1) || new_query || substr(definition, query_end + length('limit 50'));
    definition := replace(definition,
      '''allocated_amount_vnd'', payment.allocated_amount_vnd,',
      '''allocated_amount_vnd'', payment.allocated_amount_vnd,' || chr(10) ||
      '      ''order_allocated_amount_vnd'', payment.order_allocated_amount_vnd::text,');
    if position('''order_allocated_amount_vnd'', payment.order_allocated_amount_vnd::text' in definition) = 0 then
      raise exception 'customer portal payment output was not patched';
    end if;
    execute definition;
  end if;
end
$patch$;

revoke all on function public.customer_portal_order(uuid) from public, anon;
grant execute on function public.customer_portal_order(uuid) to authenticated;
select pg_notify('pgrst', 'reload schema');
