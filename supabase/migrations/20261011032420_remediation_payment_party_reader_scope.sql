begin;
-- A customer-debt reader must not infer purchase cost through supplier payments.
drop policy payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated using(
 (customer_id is not null and private.has_permission(branch_id,'finance.ar.read'))
 or(customer_id is null and private.has_permission(branch_id,'finance.ap.read')));
drop policy advance_allocations_read on public.advance_allocations;
create policy advance_allocations_read on public.advance_allocations for select to authenticated using(exists(
 select 1 from public.advances a where a.id=advance_id
  and ((a.advance_side='CUSTOMER' and private.has_permission(advance_allocations.branch_id,'finance.ar.read'))
    or(a.advance_side='SUPPLIER' and private.has_permission(advance_allocations.branch_id,'finance.ap.read')))));
notify pgrst,'reload schema';
commit;
