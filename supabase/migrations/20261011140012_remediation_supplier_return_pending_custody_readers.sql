begin;
create or replace view public.supplier_return_read with(security_barrier=true) as
 SELECT c.id,
    c.branch_id,
    c.supplier_id,
    c.return_number,
    s.name AS supplier_name,
    c.source_receipt_line_id,
    c.source_fulfillment_line_id,
    c.source_return_case_id,
    c.source_payable_id,
    c.material_id,
    m.name AS material_name,
    c.warehouse_id,
    c.requested_base_quantity::text AS requested_base_quantity,
    c.source_base_quantity::text AS source_base_quantity,
    c.dispatch_closed,
    c.version,
    c.reason,
    c.created_at,
    c.created_by,
    COALESCE(x.returned, 0::numeric)::text AS physically_returned_base_quantity,
    COALESCE(x.accepted, 0::numeric)::text AS supplier_accepted_base_quantity,
        CASE
            WHEN private.has_permission(c.branch_id, 'purchasing.price.read'::text) OR private.has_permission(c.branch_id, 'finance.ap.read'::text) THEN c.source_value_vnd::text
            ELSE NULL::text
        END AS source_value_vnd,
    (coalesce(x.returned,0)-coalesce(x.accepted,0))::text vendor_pending_base_quantity,
    case when private.has_permission(c.branch_id,'inventory.cost.read') then (select (coalesce(sum(coalesce(e.inventory_value_vnd,e.source_value_vnd))filter(where e.event_kind='PHYSICAL_RETURN'),0)-coalesce(sum(coalesce(e.inventory_value_vnd,e.source_value_vnd))filter(where e.event_kind='SUPPLIER_ACCEPTANCE'),0))::text from public.supplier_return_events e where e.case_id=c.id) else null end vendor_pending_value_vnd

   FROM supplier_return_cases c
     JOIN suppliers s ON s.id = c.supplier_id
     JOIN materials m ON m.id = c.material_id
     LEFT JOIN LATERAL ( SELECT sum(e.base_quantity) FILTER (WHERE e.event_kind = 'PHYSICAL_RETURN'::text) AS returned,
            sum(e.base_quantity) FILTER (WHERE e.event_kind = 'SUPPLIER_ACCEPTANCE'::text) AS accepted
           FROM supplier_return_events e
          WHERE e.case_id = c.id) x ON true
  WHERE private.has_permission(c.branch_id, 'purchasing.read'::text) OR private.has_permission(c.branch_id, 'inventory.read'::text) OR private.has_permission(c.branch_id, 'finance.ap.read'::text);;
create or replace view public.supplier_return_eligible_source_read with(security_barrier=true) as
 select pr.branch_id,p.supplier_id,l.id source_receipt_line_id,null::uuid source_fulfillment_line_id,null::uuid source_return_case_id,pr.receipt_number source_number,
 l.material_id,m.name material_name,l.warehouse_id,l.received_base_quantity::text source_base_quantity,null::text custody_base_quantity
 from public.purchase_receipt_lines l join public.purchase_receipts pr on pr.id=l.purchase_receipt_id join public.purchase_orders p on p.id=pr.purchase_order_id join public.materials m on m.id=l.material_id
 where private.has_permission(pr.branch_id,'purchasing.create')
 union all
 select sf.branch_id,p.supplier_id,null::uuid,fl.id,rc.id,p.purchase_order_number,m.id,m.name,rc.resolution_warehouse_id,fl.supplier_base_quantity::text,
 (rc.base_quantity-coalesce(used.qty,0))::text
 from public.supplier_fulfillment_lines fl join public.supplier_fulfillments sf on sf.id=fl.supplier_fulfillment_id join public.purchase_orders p on p.id=sf.purchase_order_id
 join public.purchase_order_lines pl on pl.id=fl.purchase_order_line_id join public.materials m on m.id=pl.material_id
 join public.supply_allocations sa on sa.purchase_order_line_id=fl.purchase_order_line_id and sa.sales_order_line_id=fl.sales_order_line_id
 join public.delivery_lines dl on dl.supply_allocation_id=sa.id join public.return_cases rc on rc.delivery_line_id=dl.id
 left join lateral(select sum(case when c.dispatch_closed then coalesce((select sum(e.base_quantity) from public.supplier_return_events e where e.case_id=c.id and e.event_kind='PHYSICAL_RETURN'),0) else c.requested_base_quantity end) qty from public.supplier_return_cases c where c.source_return_case_id=rc.id) used on true
 where(rc.state='OPEN' or(rc.state='RETURNED' and rc.resolution_warehouse_id is not null)) and rc.case_kind in('CUSTOMER_RETURN','TRANSIT_REMAINDER') and dl.source_mode='SUPPLIER_DIRECT' and private.has_permission(sf.branch_id,'purchasing.create')
 and rc.base_quantity>coalesce(used.qty,0);
notify pgrst,'reload schema';
commit;
