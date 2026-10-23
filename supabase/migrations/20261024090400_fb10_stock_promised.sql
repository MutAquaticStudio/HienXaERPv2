-- FB10 (5.1): "Đang giữ" on the stock page was the goods already put on a delivery and not yet loaded on the truck, while
-- "Có thể bán" ignored stock promised to confirmed orders that have no delivery yet — automatic sourcing already holds
-- that back (private.free_warehouse_stock), so the page showed more for sale than the system would hand out.
-- This read gives the promised part per warehouse and material so the page shows: Tồn kho − Chờ xuất giao − Đã hứa cho
-- đơn = Có thể bán, the same figure sourcing uses.
begin;

create or replace function public.warehouse_stock_promised(target_branch_id uuid)
returns table(warehouse_id uuid,material_id uuid,promised_base_quantity text)
language sql stable security definer set search_path='' as $function$
  select a.warehouse_id,l.material_id,sum(greatest(a.allocated_base_quantity-private.delivery_allocation_consumed(a.id),0))::text
  from public.supply_allocations a
  join public.sales_order_lines l on l.id=a.sales_order_line_id
  join public.sales_orders o on o.id=l.sales_order_id
  where o.branch_id=target_branch_id and private.has_permission(target_branch_id,'inventory.read')
    and a.supply_mode='WAREHOUSE' and a.warehouse_id is not null and o.commercial_state in ('DRAFT','CONFIRMED')
  group by a.warehouse_id,l.material_id
  having sum(greatest(a.allocated_base_quantity-private.delivery_allocation_consumed(a.id),0))>0
$function$;
revoke all on function public.warehouse_stock_promised(uuid) from public,anon;
grant execute on function public.warehouse_stock_promised(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
