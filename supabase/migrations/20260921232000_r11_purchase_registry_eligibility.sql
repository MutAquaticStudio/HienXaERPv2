create or replace function public.purchase_invoice_eligible_sources(target_branch_id uuid, page_size integer)
returns table(
  obligation_id uuid,
  supplier_name text,
  source_type text,
  source_id uuid,
  source_amount_vnd bigint,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare bounded_size integer;
begin
  if not private.has_permission(target_branch_id, 'finance.ap.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  bounded_size := least(100, greatest(1, coalesce(page_size, 50)));
  return query
    select o.id, s.name,
      case when o.purchase_receipt_id is not null then 'PURCHASE_RECEIPT' else 'SUPPLIER_FULFILLMENT' end,
      coalesce(o.purchase_receipt_id, o.supplier_fulfillment_id), o.original_amount_vnd, o.recorded_at
    from public.payable_obligations o
    join public.suppliers s on s.id = o.supplier_id and s.branch_id = o.branch_id
    where o.branch_id = target_branch_id
      and (o.purchase_receipt_id is not null or o.supplier_fulfillment_id is not null)
      and not exists (select 1 from public.purchase_invoice_registry r where r.payable_obligation_id = o.id)
    order by o.recorded_at asc, o.id
    limit bounded_size;
end
$$;

revoke all on function public.purchase_invoice_eligible_sources(uuid,integer) from public, anon, authenticated;
grant execute on function public.purchase_invoice_eligible_sources(uuid,integer) to authenticated;
