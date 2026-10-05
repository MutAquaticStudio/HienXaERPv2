begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- MB-COST-01: RLS limits rows, not the price columns exposed by table SELECT.
-- Existing barrier views retain their field-specific permission checks.
revoke select on public.purchase_order_lines from public, anon, authenticated;
revoke select (
  unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id,
  purchase_price_rule_version, price_source_type, override_by, override_reason
) on public.purchase_order_lines from public, anon, authenticated;
grant select (
  id, purchase_order_id, linked_sales_order_line_id, line_number,
  material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
  quantity, conversion_numerator, conversion_denominator, rounding_mode
) on public.purchase_order_lines to authenticated;

-- The security-invoker order view cannot aggregate a revoked raw cost column.
-- This narrow accessor returns only a permitted order total, never raw lines.
create function private.purchase_order_visible_total_cost(target_purchase_order_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce((select sum(l.line_total_cost_vnd)::bigint
    from public.purchase_order_lines l
    where l.purchase_order_id = p.id), 0::bigint)
  from public.purchase_orders p
  where p.id = target_purchase_order_id
    and private.has_permission(p.branch_id, 'purchasing.read')
    and private.has_permission(p.branch_id, 'purchasing.price.read');
$$;
revoke all on function private.purchase_order_visible_total_cost(uuid)
  from public, anon, service_role;
grant execute on function private.purchase_order_visible_total_cost(uuid)
  to authenticated;

create or replace view public.purchase_order_read with (security_invoker = true) as
select p.id, p.branch_id, p.purchase_order_number, p.supplier_id,
  p.destination_type, p.warehouse_id, p.customer_id, p.site_id,
  p.source_sales_order_id, p.state, p.supplier_name_snapshot,
  p.destination_name_snapshot, p.destination_address_snapshot, p.expected_at,
  private.purchase_order_visible_total_cost(p.id)::text as total_cost_vnd,
  p.confirmed_at, p.cancelled_at, p.created_at
from public.purchase_orders p;

notify pgrst, 'reload schema';
commit;
