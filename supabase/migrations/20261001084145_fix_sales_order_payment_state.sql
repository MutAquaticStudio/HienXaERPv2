-- SPEC-SO-001: payment state follows canonical AR and signed allocations.
-- Preserve the existing view columns, fulfillment semantics, ACL and RLS.
create or replace view public.sales_order_read with (security_invoker = true) as
select o.id, o.branch_id, o.order_number, o.customer_id, o.site_id, o.quotation_revision_id,
  o.sales_owner_employee_id, o.commercial_state,
  case
    when not exists (select 1 from public.deliveries d where d.sales_order_id = o.id and d.execution_state <> 'CANCELLED') then 'NOT_STARTED'
    when coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v join public.delivery_lines dl on dl.id = v.delivery_line_id where dl.sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = o.id)), 0)
      >= coalesce((select sum(quantity * conversion_numerator / conversion_denominator) from public.sales_order_lines where sales_order_id = o.id), 0) then 'COMPLETED'
    else 'IN_PROGRESS'
  end::text as fulfillment_state,
  case
    when ar.obligation_count = 0 then 'NOT_DUE'
    when ar.outstanding_vnd <= 0 then 'PAID'
    when ar.allocated_vnd > 0 then 'PARTIAL'
    else 'UNPAID'
  end::text as payment_state,
  o.customer_name_snapshot, o.site_name_snapshot, o.delivery_address_snapshot,
  coalesce((select sum(l.line_total_vnd) from public.sales_order_lines l where l.sales_order_id = o.id), 0)::bigint::text as total_vnd,
  o.requested_delivery_at, o.confirmed_at, o.cancelled_at, o.created_at
from public.sales_orders o
left join lateral (
  select count(*) as obligation_count,
    coalesce(sum(r.outstanding_amount_vnd), 0) as outstanding_vnd,
    coalesce(sum(r.allocated_amount_vnd), 0) as allocated_vnd
  from public.receivable_read r
  where r.sales_order_id = o.id
) ar on true;
