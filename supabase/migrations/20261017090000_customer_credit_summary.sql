-- Customer 360 (FB2 Đợt 4, 2026-10-17): the header shows current debt, overdue debt and the credit still available.
-- customer_credit_exposure is the same view the order confirmation uses, but it reads the private credit limit column,
-- which API roles cannot select. This read-only function returns the summary to actors who may already see receivables
-- and credit limits of the customer's branch (finance.ar.read). No rule or number is computed differently.
begin;

create or replace function public.customer_credit_summary(target_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  customer public.customers%rowtype;
  exposure public.customer_credit_exposure%rowtype;
  overdue bigint;
begin
  select * into customer from public.customers c where c.id = target_customer_id;
  if customer.id is null or auth.uid() is null or not private.has_permission(customer.branch_id, 'finance.ar.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into exposure from public.customer_credit_exposure x where x.customer_id = customer.id;
  select coalesce(sum(r.outstanding_amount_vnd), 0)::bigint into overdue from public.receivable_read r
    where r.customer_id = customer.id and r.state = 'OVERDUE';
  return jsonb_build_object(
    'credit_limit_vnd', exposure.credit_limit_vnd,
    'receivable_vnd', coalesce(exposure.receivable_vnd, 0),
    'overdue_vnd', overdue,
    'committed_vnd', coalesce(exposure.committed_vnd, 0),
    'available_vnd', exposure.available_vnd);
end
$function$;

revoke all on function public.customer_credit_summary(uuid) from public, anon;
grant execute on function public.customer_credit_summary(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
