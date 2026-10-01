create or replace function public.cashbook_summary(target_branch_id uuid)
returns table(net_cash_vnd numeric, unmatched_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(case when p.direction = 'RECEIPT' then p.amount_vnd else -p.amount_vnd end), 0)::numeric,
    count(*) filter (where p.reconciliation_state <> 'MATCHED')::bigint
  from public.payment_read p
  where p.branch_id = target_branch_id
$$;

revoke all on function public.cashbook_summary(uuid) from public, anon, authenticated;
grant execute on function public.cashbook_summary(uuid) to authenticated;
