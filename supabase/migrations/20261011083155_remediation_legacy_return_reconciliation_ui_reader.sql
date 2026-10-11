begin;
create or replace view public.customer_return_finance_read with(security_barrier=true) as
 select r.id,r.branch_id,o.customer_id,d.id delivery_id,d.delivery_number,o.order_number,
  r.base_quantity::text base_quantity,sl.material_name_snapshot,r.reason,
  least(v.receivable_amount_vnd,round(r.base_quantity*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint)::text maximum_credit_vnd,
  exists(select 1 from public.receivable_adjustments a where a.return_case_id=r.id) legacy_adjustment_exists,
  (select (-sum(a.amount_delta_vnd))::text from public.receivable_adjustments a where a.return_case_id=r.id) legacy_credit_amount_vnd
 from public.return_cases r join public.delivery_verification_lines v on v.id=r.delivery_verification_line_id
 join public.delivery_lines l on l.id=r.delivery_line_id join public.deliveries d on d.id=l.delivery_id
 join public.sales_order_lines sl on sl.id=l.sales_order_line_id
 join public.sales_orders o on o.id=d.sales_order_id
 where r.case_kind='CUSTOMER_RETURN' and r.state='RETURNED' and private.has_permission(r.branch_id,'finance.ar.read')
  and not exists(select 1 from public.customer_credits c where c.return_case_id=r.id);
notify pgrst,'reload schema';
commit;
