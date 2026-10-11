begin;
create function public.payment_allocation_balances(target_payment_id uuid)
 returns table(available_amount_vnd bigint,advance_remaining_vnd bigint)
language plpgsql stable security definer set search_path='' as $body$
declare p public.payments%rowtype;
begin
 select * into p from public.payments where id=target_payment_id;
 if p.id is null or not ((p.customer_id is not null and private.has_permission(p.branch_id,'finance.ar.read'))
  or(p.customer_id is null and private.has_permission(p.branch_id,'finance.ap.read'))) then return;end if;
 return query select private.payment_available(p.id),
  coalesce((select sum(private.advance_remaining(a.id)) from public.advances a
   where a.payment_id=p.id and a.reversal_of_advance_id is null),0)::bigint;
end $body$;
revoke all on function public.payment_allocation_balances(uuid) from public,anon,authenticated,service_role;
grant execute on function public.payment_allocation_balances(uuid) to authenticated;
create or replace view public.payment_allocation_source_read with(security_barrier=true) as
 select p.id,p.branch_id,p.payment_number,p.direction,p.customer_id,p.supplier_id,p.employee_id,p.posted_at,
  p.amount_vnd::text amount_vnd,b.available_amount_vnd::text available_amount_vnd,b.advance_remaining_vnd::text advance_remaining_vnd
 from public.payments p cross join lateral public.payment_allocation_balances(p.id) b
 where p.reversal_of_payment_id is null and not exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
  and ((p.customer_id is not null and private.has_permission(p.branch_id,'finance.ar.read'))
   or(p.customer_id is null and private.has_permission(p.branch_id,'finance.ap.read')));
notify pgrst,'reload schema';
commit;
