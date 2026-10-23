-- FB10 (4.7): matching a supplier invoice shows, for every source line, what was ordered, what has arrived and where
-- the order price came from (supplier price list, contract or typed in), next to what the invoice says. The comparison
-- itself is unchanged (purchase unit, price per purchase unit); this view only gives the screen names and context instead
-- of raw ids.
begin;

create or replace view public.supplier_document_source_context_read with(security_barrier=true) as
select r.branch_id,'RECEIPT_LINE'::text source_kind,l.id source_id,r.receipt_number source_number,p.purchase_order_number,
  pl.quantity::text ordered_quantity,
  (select coalesce(sum(x.received_quantity),0) from public.purchase_receipt_lines x where x.purchase_order_line_id=pl.id)::text received_quantity,
  pl.unit_cost_vnd::text ordered_unit_cost,pl.price_source_type
from public.purchase_receipt_lines l join public.purchase_receipts r on r.id=l.purchase_receipt_id
join public.purchase_orders p on p.id=r.purchase_order_id join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id
where private.has_permission(r.branch_id,'finance.ap.read')
union all
select f.branch_id,'FULFILLMENT_LINE',l.id,coalesce(f.supplier_reference,p.purchase_order_number),p.purchase_order_number,pl.quantity::text,
  (select coalesce(sum(x.supplier_quantity),0) from public.supplier_fulfillment_lines x where x.purchase_order_line_id=pl.id)::text,
  pl.unit_cost_vnd::text,pl.price_source_type
from public.supplier_fulfillment_lines l join public.supplier_fulfillments f on f.id=l.supplier_fulfillment_id
join public.purchase_orders p on p.id=f.purchase_order_id join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id
where private.has_permission(f.branch_id,'finance.ap.read')
union all
select c.branch_id,'RETURN_CREDIT',c.id,sc.return_number,p.purchase_order_number,null,null,null,pl.price_source_type
from public.supplier_return_credits c join public.supplier_return_cases sc on sc.id=c.case_id
left join public.purchase_receipt_lines rl on rl.id=sc.source_receipt_line_id
left join public.supplier_fulfillment_lines fl on fl.id=sc.source_fulfillment_line_id
join public.purchase_order_lines pl on pl.id=coalesce(rl.purchase_order_line_id,fl.purchase_order_line_id)
join public.purchase_orders p on p.id=pl.purchase_order_id
where private.has_permission(c.branch_id,'finance.ap.read');
revoke all on public.supplier_document_source_context_read from anon,public;
grant select on public.supplier_document_source_context_read to authenticated;
notify pgrst,'reload schema';
commit;
