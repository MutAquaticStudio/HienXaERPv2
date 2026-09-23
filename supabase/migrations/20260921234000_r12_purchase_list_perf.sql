-- Compute a PO total only for rows selected by a bounded list query.
create or replace view public.purchase_order_read with (security_invoker = true) as
select p.id, p.branch_id, p.purchase_order_number, p.supplier_id,
  p.destination_type, p.warehouse_id, p.customer_id, p.site_id,
  p.source_sales_order_id, p.state, p.supplier_name_snapshot,
  p.destination_name_snapshot, p.destination_address_snapshot, p.expected_at,
  case
    when private.has_permission(p.branch_id, 'purchasing.price.read')
      then coalesce((select sum(l.line_total_cost_vnd)
                     from public.purchase_order_lines l
                     where l.purchase_order_id = p.id), 0)::bigint::text
    else null::text
  end as total_cost_vnd,
  p.confirmed_at, p.cancelled_at, p.created_at
from public.purchase_orders p;
