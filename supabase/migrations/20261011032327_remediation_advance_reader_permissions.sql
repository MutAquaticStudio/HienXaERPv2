begin;
drop policy advance_allocations_read on public.advance_allocations;
create policy advance_allocations_read on public.advance_allocations for select to authenticated using(private.has_permission(branch_id,'finance.ar.read') or private.has_permission(branch_id,'finance.ap.read'));
create or replace view public.payment_allocation_source_read with(security_barrier=true) as  SELECT id,
    branch_id,
    payment_number,
    direction,
    customer_id,
    supplier_id,
    employee_id,
    posted_at,
    amount_vnd::text AS amount_vnd,
    private.payment_available(id)::text AS available_amount_vnd,
    COALESCE(( SELECT sum(private.advance_remaining(a.id)) AS sum
           FROM advances a
          WHERE a.payment_id = p.id AND a.reversal_of_advance_id IS NULL), 0::numeric)::text AS advance_remaining_vnd
   FROM payments p
  WHERE reversal_of_payment_id IS NULL AND NOT (EXISTS ( SELECT 1
           FROM payments r
          WHERE r.reversal_of_payment_id = p.id)) AND ((p.customer_id is not null and private.has_permission(p.branch_id,'finance.ar.read')) or (p.customer_id is null and private.has_permission(p.branch_id,'finance.ap.read')));
notify pgrst,'reload schema';
commit;
