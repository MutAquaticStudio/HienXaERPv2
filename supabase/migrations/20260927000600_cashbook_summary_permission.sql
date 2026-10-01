create or replace function public.cashbook_summary(target_branch_id uuid)
returns table(net_cash_vnd numeric, unmatched_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(target_branch_id, 'finance.ar.read') then
    raise exception 'cashbook_forbidden' using errcode = '42501';
  end if;
  return query
    select
      coalesce(sum(case when p.direction = 'RECEIPT' then p.amount_vnd else -p.amount_vnd end), 0)::numeric,
      count(*) filter (where p.reconciliation_state <> 'MATCHED')::bigint
    from public.payment_read p
    where p.branch_id = target_branch_id;
end;
$$;
