create or replace view public.purchase_order_line_progress_read
with (security_barrier = true) as
select
  line.id as purchase_order_line_id,
  line.purchase_order_id,
  coalesce((
    select sum(receipt_line.received_quantity)
    from public.purchase_receipt_lines receipt_line
    where receipt_line.purchase_order_line_id = line.id
  ), 0)::text as received_quantity,
  coalesce((
    select sum(fulfillment_line.supplier_quantity)
    from public.supplier_fulfillment_lines fulfillment_line
    where fulfillment_line.purchase_order_line_id = line.id
  ), 0)::text as supplier_quantity
from public.purchase_order_lines line
join public.purchase_orders purchase_order on purchase_order.id = line.purchase_order_id
where private.has_permission(purchase_order.branch_id, 'purchasing.read');

revoke all on public.purchase_order_line_progress_read from public, anon, authenticated;
grant select on public.purchase_order_line_progress_read to authenticated;

select pg_notify('pgrst', 'reload schema');
