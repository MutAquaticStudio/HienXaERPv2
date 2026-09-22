-- Internal override metadata must not be readable through portal Data API rows.
alter policy quotation_lines_select on public.quotation_lines
  using (exists (
    select 1 from public.quotation_revisions r
    join public.quotations q on q.id = r.quotation_id
    where r.id = quotation_lines.revision_id
      and (select private.has_permission(q.branch_id, 'quotation.read'))
  ));

alter policy sales_order_lines_select on public.sales_order_lines
  using (exists (
    select 1 from public.sales_orders o
    where o.id = sales_order_lines.sales_order_id
      and (select private.has_permission(o.branch_id, 'orders.read'))
  ));

-- Both internal PDF and customer portal use this bounded, customer-safe line shape.
create or replace function public.customer_safe_quotation_lines(target_revision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_branch_id uuid;
  target_customer_id uuid;
  safe_lines jsonb;
begin
  select q.branch_id, q.customer_id into target_branch_id, target_customer_id
  from public.quotation_revisions r
  join public.quotations q on q.id = r.quotation_id
  where r.id = target_revision_id;

  if target_branch_id is null or not (
    coalesce(private.has_permission(target_branch_id, 'quotation.read'), false)
    or coalesce(private.has_customer_membership(target_customer_id, null::text[]), false)
  ) then
    raise exception 'quotation_access_denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'material_name_snapshot', l.material_name_snapshot,
    'quantity', l.quantity::text,
    'unit_price_vnd', l.unit_price_vnd::text,
    'line_total_vnd', l.line_total_vnd::text,
    'uom_symbol', u.symbol
  ) order by l.line_number, l.id), '[]'::jsonb)
  into safe_lines
  from public.quotation_lines l
  left join public.units_of_measure u on u.id = l.ordered_uom_id
  where l.revision_id = target_revision_id;

  return safe_lines;
end
$$;

revoke all on function public.customer_safe_quotation_lines(uuid) from public, anon, authenticated;
grant execute on function public.customer_safe_quotation_lines(uuid) to authenticated;
