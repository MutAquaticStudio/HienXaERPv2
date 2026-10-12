-- Completion is derived from commercial intent, verified execution, debt and unresolved source work.
begin;
create function public.sales_order_operational_snapshot(target_order_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare o public.sales_orders%rowtype;required_qty numeric;accepted_qty numeric;cargo_qty numeric:=0;line record;running bigint;open_physical bigint;pending_return_credit bigint;pending_customer_money bigint;pending_vendor bigint;pending_commission bigint;ar_count bigint;unpaid bigint;negative_debt bigint;delivery_state text;payment_state text;complete boolean;
begin
 select * into o from public.sales_orders where id=target_order_id;
 if o.id is null or not(private.has_permission(o.branch_id,'orders.read') or private.has_permission(o.branch_id,'delivery.read')) then raise exception 'forbidden_or_order_not_found' using errcode='42501';end if;
 select coalesce(sum(l.quantity*l.conversion_numerator/l.conversion_denominator),0) into required_qty from public.sales_order_lines l where l.sales_order_id=o.id;
 select coalesce(sum(v.accepted_base_quantity),0) into accepted_qty from public.delivery_verification_lines v join public.delivery_lines l on l.id=v.delivery_line_id join public.deliveries d on d.id=l.delivery_id where d.sales_order_id=o.id;
 for line in select l.* from public.delivery_lines l join public.deliveries d on d.id=l.delivery_id where d.sales_order_id=o.id loop
  if line.source_mode='SUPPLIER_DIRECT' then
   cargo_qty:=cargo_qty+greatest(0,coalesce(private.delivery_loaded_quantity(line.id),0)-coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v where v.delivery_line_id=line.id),0)-coalesce((select sum(r.base_quantity) from public.return_cases r where r.delivery_line_id=line.id and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state in('RETURNED','LOSS_APPROVED')),0));
  else cargo_qty:=cargo_qty+greatest(0,(select p.base_quantity from private.delivery_line_transit_position(line.id)p));end if;
 end loop;
 select count(*) into running from public.deliveries d where d.sales_order_id=o.id and d.execution_state not in('VERIFIED','CANCELLED');
 select count(*) into open_physical from public.return_cases r join public.delivery_lines l on l.id=r.delivery_line_id join public.deliveries d on d.id=l.delivery_id where d.sales_order_id=o.id and r.state='OPEN';
 select count(*) into pending_return_credit from public.return_cases r join public.delivery_lines l on l.id=r.delivery_line_id join public.deliveries d on d.id=l.delivery_id
 where d.sales_order_id=o.id and r.case_kind='CUSTOMER_RETURN' and r.state='RETURNED' and not exists(select 1 from public.customer_credits c where c.return_case_id=r.id);
 select count(*) into pending_customer_money from public.customer_credits c join public.return_cases r on r.id=c.return_case_id join public.delivery_lines l on l.id=r.delivery_line_id join public.deliveries d on d.id=l.delivery_id
 where d.sales_order_id=o.id and private.customer_credit_remaining(c.id)>0;
 select count(*) into pending_vendor from public.supplier_return_cases c left join public.supplier_fulfillment_lines fl on fl.id=c.source_fulfillment_line_id left join public.purchase_receipt_lines rl on rl.id=c.source_receipt_line_id
 join public.purchase_order_lines pl on pl.id=coalesce(fl.purchase_order_line_id,rl.purchase_order_line_id) join public.sales_order_lines sol on sol.id=coalesce(fl.sales_order_line_id,pl.linked_sales_order_line_id)
 where sol.sales_order_id=o.id and(
  (not c.dispatch_closed and c.requested_base_quantity>coalesce((select sum(e.base_quantity) from public.supplier_return_events e where e.case_id=c.id and e.event_kind='PHYSICAL_RETURN'),0))
  or coalesce((select sum(e.base_quantity)filter(where e.event_kind='PHYSICAL_RETURN')-coalesce(sum(e.base_quantity)filter(where e.event_kind='SUPPLIER_ACCEPTANCE'),0) from public.supplier_return_events e where e.case_id=c.id),0)>0
  or exists(select 1 from public.supplier_return_events e where e.case_id=c.id and e.event_kind='SUPPLIER_ACCEPTANCE' and not exists(select 1 from public.supplier_return_credits credit where credit.acceptance_event_id=e.id))
  or exists(select 1 from public.supplier_return_credits credit where credit.case_id=c.id and private.supplier_credit_remaining(credit.id)>0));
 select count(*) into pending_commission from public.commission_reconciliation_cases c join public.earning_events e on e.id=c.original_earning_event_id where e.sales_order_id=o.id and not exists(select 1 from public.commission_review_resolutions r where r.case_id=c.id);
 select count(*),coalesce(sum(greatest(0,private.current_receivable_outstanding(r.id))),0)::bigint,count(*)filter(where private.current_receivable_outstanding(r.id)<0) into ar_count,unpaid,negative_debt
 from public.receivable_obligations r join public.delivery_verifications v on v.id=r.delivery_verification_id join public.deliveries d on d.id=v.delivery_id where d.sales_order_id=o.id;
 delivery_state:=case when running>0 or cargo_qty>0 then 'IN_PROGRESS' when o.commercial_state='CLOSED' then 'CLOSED_REMAINDER' when accepted_qty>=required_qty and required_qty>0 then 'FULFILLED' when accepted_qty>0 then 'PARTIAL' else 'NOT_STARTED' end;
 payment_state:=case when negative_debt>0 then 'RECONCILIATION_REQUIRED' when ar_count=0 then 'NOT_BILLED' when unpaid=0 then 'PAID' when exists(select 1 from public.payment_allocations a join public.receivable_obligations r on r.id=a.receivable_obligation_id join public.delivery_verifications v on v.id=r.delivery_verification_id join public.deliveries d on d.id=v.delivery_id where d.sales_order_id=o.id and a.amount_delta_vnd>0) then 'PARTIAL' else 'UNPAID' end;
 complete:=o.commercial_state in('CONFIRMED','CLOSED') and delivery_state in('FULFILLED','CLOSED_REMAINDER') and payment_state='PAID' and cargo_qty=0 and open_physical=0 and pending_return_credit=0 and pending_customer_money=0 and pending_vendor=0 and pending_commission=0;
 return jsonb_build_object('commercial_state',o.commercial_state,'delivery_state',delivery_state,'payment_state',payment_state,'operational_complete',complete,
 'exceptions',jsonb_build_object('cargo_remaining',cargo_qty>0,'physical_return_open',open_physical>0,'customer_credit_decision_pending',pending_return_credit>0,'customer_refund_offset_pending',pending_customer_money>0,'supplier_return_or_money_pending',pending_vendor>0,'paid_commission_review_pending',pending_commission>0,'legacy_debt_reconciliation_required',negative_debt>0),
 'delivery_model','ONE_SALES_ORDER_ONE_PICKUP_PER_DELIVERY','trip_grouping_supported',false);
end $fn$;
revoke all on function public.sales_order_operational_snapshot(uuid) from public,anon;
grant execute on function public.sales_order_operational_snapshot(uuid) to authenticated;
create view public.supplier_return_operational_read with(security_barrier=true) as
 select c.id,c.branch_id,
 (c.dispatch_closed or coalesce(q.physical,0)>=c.requested_base_quantity) physical_complete,
 coalesce(q.physical,0)=coalesce(q.accepted,0) supplier_acceptance_complete,
 not exists(select 1 from public.supplier_return_events e where e.case_id=c.id and e.event_kind='SUPPLIER_ACCEPTANCE' and not exists(select 1 from public.supplier_return_credits credit where credit.acceptance_event_id=e.id)) credit_decisions_complete,
 not exists(select 1 from public.supplier_return_credits credit where credit.case_id=c.id and private.supplier_credit_remaining(credit.id)>0) money_settlement_complete
 from public.supplier_return_cases c left join lateral(select sum(e.base_quantity)filter(where e.event_kind='PHYSICAL_RETURN')physical,sum(e.base_quantity)filter(where e.event_kind='SUPPLIER_ACCEPTANCE')accepted from public.supplier_return_events e where e.case_id=c.id)q on true
 where private.has_permission(c.branch_id,'purchasing.read') or private.has_permission(c.branch_id,'inventory.read') or private.has_permission(c.branch_id,'finance.ap.read');
grant select on public.supplier_return_operational_read to authenticated;
notify pgrst,'reload schema';
commit;
