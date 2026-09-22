-- Keep the order list bounded by its branch/sort keys before deriving row values.
create index if not exists sales_orders_branch_created_id_idx
  on public.sales_orders (branch_id, created_at desc, id desc);
create index if not exists deliveries_sales_order_id_idx
  on public.deliveries (sales_order_id);
create index if not exists delivery_lines_sales_order_line_id_idx
  on public.delivery_lines (sales_order_line_id);
create index if not exists delivery_verification_lines_delivery_line_id_idx
  on public.delivery_verification_lines (delivery_line_id);

create or replace view public.sales_order_read with (security_invoker = true) as
select o.id, o.branch_id, o.order_number, o.customer_id, o.site_id, o.quotation_revision_id,
  o.sales_owner_employee_id, o.commercial_state,
  case
    when not exists (select 1 from public.deliveries d where d.sales_order_id = o.id and d.execution_state <> 'CANCELLED') then 'NOT_STARTED'
    when coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v join public.delivery_lines dl on dl.id = v.delivery_line_id where dl.sales_order_line_id in (select id from public.sales_order_lines where sales_order_id = o.id)), 0)
      >= coalesce((select sum(quantity * conversion_numerator / conversion_denominator) from public.sales_order_lines where sales_order_id = o.id), 0) then 'COMPLETED'
    else 'IN_PROGRESS'
  end::text as fulfillment_state,
  case when exists (select 1 from public.receivable_obligations r join public.delivery_verifications v on v.id = r.delivery_verification_id join public.deliveries d on d.id = v.delivery_id where d.sales_order_id = o.id) then 'DUE' else 'NOT_DUE' end::text as payment_state,
  o.customer_name_snapshot, o.site_name_snapshot, o.delivery_address_snapshot,
  coalesce((select sum(l.line_total_vnd) from public.sales_order_lines l where l.sales_order_id = o.id), 0)::bigint::text as total_vnd,
  o.requested_delivery_at, o.confirmed_at, o.cancelled_at, o.created_at
from public.sales_orders o;
