-- FB2 Đợt 6 (17/10/2026): "Sổ quỹ" totals for a period — opening balance, receipts, disbursements and closing balance —
-- optionally for one money account. Read only; same rows and sign rule as cashbook_summary (every posted payment and
-- reversal in payment_read, receipts in, disbursements out). Amounts are returned as text so no client rounds them.
begin;

create or replace function public.cashbook_period_summary(target_branch_id uuid, from_at timestamptz, to_at timestamptz, target_account_id uuid default null)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare result jsonb;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'finance.ar.read') then raise exception 'cashbook_forbidden' using errcode = '42501'; end if;
  if from_at is null or to_at is null or to_at <= from_at then raise exception 'invalid_cashbook_period' using errcode = '22023'; end if;
  select jsonb_build_object(
    'opening_vnd', coalesce(sum(p.cash_delta_vnd) filter (where p.effective_at < from_at), 0)::text,
    'receipts_vnd', coalesce(sum(p.amount_vnd) filter (where p.direction = 'RECEIPT' and p.effective_at >= from_at and p.effective_at < to_at), 0)::text,
    'disbursements_vnd', coalesce(sum(p.amount_vnd) filter (where p.direction = 'DISBURSEMENT' and p.effective_at >= from_at and p.effective_at < to_at), 0)::text,
    'closing_vnd', coalesce(sum(p.cash_delta_vnd) filter (where p.effective_at < to_at), 0)::text,
    'payment_count', count(*) filter (where p.effective_at >= from_at and p.effective_at < to_at))
  into result
  from public.payment_read p
  where p.branch_id = target_branch_id and (target_account_id is null or p.account_id = target_account_id);
  return result;
end
$function$;

revoke all on function public.cashbook_period_summary(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.cashbook_period_summary(uuid, timestamptz, timestamptz, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
