-- FB10 (12): reports like KiotViet for a building-materials shop. One read, report_center, answers each report of the new
-- /admin/reports hub for a date range (Vietnam days, both ends included) and returns rows, a chart series and headline
-- figures. Each report checks the right of its own area; money stays whole đồng as text, quantities as text.
--   END_OF_DAY        money in / out, revenue, deliveries and receipts of the period (usually one day)
--   SALES_BY_DAY      revenue by day (deliveries verified + services verified)
--   SALES_BY_CUSTOMER revenue by customer        SALES_BY_STAFF  revenue by sales owner
--   GOODS_SALES       quantity (in the unit sold and in base unit) and amount by material, from verified deliveries
--   STOCK_IO          opening / in / out / closing stock by material (one warehouse or all)
--   CUSTOMER_DEBT     receivables by customer with ageing (not due, 1–30, 31–60, over 60 days past due)
--   SUPPLIER          goods received and still owed by supplier
--   DELIVERY          verified trips by worker and truck: full / partial / failed, trip pay
-- Profit and loss uses the existing finance_dashboard_snapshot.
begin;

create or replace function public.report_center(target_branch_id uuid, report_key text, from_date date, to_date date, target_warehouse_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare from_ts timestamptz; to_ts timestamptz; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; result jsonb; permission text;
begin
  if from_date is null or to_date is null or to_date<from_date or to_date-from_date>400 then raise exception 'invalid_report_range' using errcode='22023'; end if;
  permission:=case report_key when 'END_OF_DAY' then 'finance.ar.read' when 'SALES_BY_DAY' then 'orders.read' when 'SALES_BY_CUSTOMER' then 'orders.read'
    when 'SALES_BY_STAFF' then 'orders.read' when 'GOODS_SALES' then 'orders.read' when 'STOCK_IO' then 'inventory.read' when 'CUSTOMER_DEBT' then 'finance.ar.read'
    when 'SUPPLIER' then 'finance.ap.read' when 'DELIVERY' then 'delivery.read' end;
  if permission is null then raise exception 'invalid_report' using errcode='22023'; end if;
  if auth.uid() is null or not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501'; end if;
  from_ts:=from_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
  to_ts:=(to_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  if report_key in ('SALES_BY_DAY','SALES_BY_CUSTOMER','SALES_BY_STAFF') then
    with sales as (
      select r.recorded_at at_time,o.customer_id,o.sales_owner_employee_id staff,o.id doc,r.amount_vnd amount
        from public.revenue_entries r join public.sales_orders o on o.id=r.sales_order_id
        where r.branch_id=target_branch_id and r.recorded_at>=from_ts and r.recorded_at<to_ts
      union all
      select v.verified_at,j.customer_id,j.sales_employee_id,j.id,v.billable_amount_vnd
        from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id
        where j.branch_id=target_branch_id and v.verified_at>=from_ts and v.verified_at<to_ts and v.billable_amount_vnd>0
    ), grouped as (
      select case report_key when 'SALES_BY_DAY' then to_char(s.at_time at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
          when 'SALES_BY_CUSTOMER' then coalesce(c.display_name,'Khách lẻ') else coalesce(e.display_name,'Chưa gán nhân viên') end label,
        count(distinct s.doc) docs,sum(s.amount)::bigint amount
      from sales s left join public.customers c on c.id=s.customer_id left join public.employees e on e.id=s.staff
      group by 1
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'documents',g.docs,'amount_vnd',g.amount::text)
        order by case when report_key='SALES_BY_DAY' then g.label end, g.amount desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Doanh thu','value',coalesce(sum(g.amount),0)::text,'kind','money'),
        jsonb_build_object('label','Số chứng từ','value',coalesce(sum(g.docs),0)::text,'kind','number')))
      into result from grouped g;

  elsif report_key='GOODS_SALES' then
    with lines as (
      select m.id material_id,m.code,m.name,coalesce(u.symbol,'') sold_unit,bu.symbol base_unit,
        sum(vl.accepted_base_quantity) base_qty,
        sum(vl.accepted_base_quantity*sol.conversion_denominator/sol.conversion_numerator) sold_qty,
        sum(vl.receivable_amount_vnd)::bigint amount
      from public.delivery_verification_lines vl
      join public.delivery_verifications dv on dv.id=vl.delivery_verification_id
      join public.delivery_lines dl on dl.id=vl.delivery_line_id
      join public.deliveries d on d.id=dl.delivery_id
      join public.sales_order_lines sol on sol.id=dl.sales_order_line_id
      join public.materials m on m.id=sol.material_id
      left join public.units_of_measure u on u.id=sol.ordered_uom_id
      left join public.units_of_measure bu on bu.id=sol.base_uom_id
      where d.branch_id=target_branch_id and dv.verified_at>=from_ts and dv.verified_at<to_ts and vl.accepted_base_quantity>0
      group by m.id,m.code,m.name,u.symbol,bu.symbol
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',l.name,'code',l.code,'quantity',round(l.sold_qty,3)::text,'unit',l.sold_unit,
        'base_quantity',round(l.base_qty,3)::text,'base_unit',l.base_unit,'amount_vnd',l.amount::text) order by l.amount desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Tiền hàng đã giao','value',coalesce(sum(l.amount),0)::text,'kind','money'),
        jsonb_build_object('label','Số mặt hàng','value',count(*)::text,'kind','number')))
      into result from lines l;

  elsif report_key='STOCK_IO' then
    with moves as (
      select m.material_id,
        sum(m.base_quantity_delta) filter (where m.occurred_at<from_ts) opening,
        sum(m.base_quantity_delta) filter (where m.occurred_at>=from_ts and m.occurred_at<to_ts and m.base_quantity_delta>0) qty_in,
        -sum(m.base_quantity_delta) filter (where m.occurred_at>=from_ts and m.occurred_at<to_ts and m.base_quantity_delta<0) qty_out,
        sum(m.base_quantity_delta) filter (where m.occurred_at<to_ts) closing,
        sum(m.inventory_value_delta_vnd) filter (where m.occurred_at<to_ts) closing_value
      from public.inventory_movements m
      where m.branch_id=target_branch_id and m.location_kind='WAREHOUSE' and (target_warehouse_id is null or m.warehouse_id=target_warehouse_id)
      group by m.material_id
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',mt.name,'code',mt.code,'unit',u.symbol,
        'opening',coalesce(mv.opening,0)::text,'in',coalesce(mv.qty_in,0)::text,'out',coalesce(mv.qty_out,0)::text,'closing',coalesce(mv.closing,0)::text,
        'closing_value_vnd',case when private.has_permission(target_branch_id,'inventory.cost.read') then coalesce(mv.closing_value,0)::bigint::text end)
        order by mt.name),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Mặt hàng có phát sinh','value',count(*) filter (where coalesce(mv.qty_in,0)<>0 or coalesce(mv.qty_out,0)<>0)::text,'kind','number'),
        jsonb_build_object('label','Giá trị tồn cuối kỳ','value',case when private.has_permission(target_branch_id,'inventory.cost.read') then coalesce(sum(mv.closing_value),0)::bigint::text end,'kind','money')))
      into result from moves mv join public.materials mt on mt.id=mv.material_id left join public.units_of_measure u on u.id=mt.base_uom_id
      where coalesce(mv.opening,0)<>0 or coalesce(mv.qty_in,0)<>0 or coalesce(mv.qty_out,0)<>0 or coalesce(mv.closing,0)<>0;

  elsif report_key='CUSTOMER_DEBT' then
    with debts as (
      select r.customer_id,private.current_receivable_outstanding(r.id) outstanding,greatest(today-r.due_date,0) late
      from public.receivable_obligations r where r.branch_id=target_branch_id
    ), grouped as (
      select c.display_name label,c.code,sum(d.outstanding)::bigint total,
        sum(d.outstanding) filter (where d.late=0)::bigint not_due,
        sum(d.outstanding) filter (where d.late between 1 and 30)::bigint d30,
        sum(d.outstanding) filter (where d.late between 31 and 60)::bigint d60,
        sum(d.outstanding) filter (where d.late>60)::bigint d90
      from debts d join public.customers c on c.id=d.customer_id where d.outstanding>0 group by c.id,c.display_name,c.code
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'code',g.code,'total_vnd',g.total::text,'not_due_vnd',coalesce(g.not_due,0)::text,
        'd30_vnd',coalesce(g.d30,0)::text,'d60_vnd',coalesce(g.d60,0)::text,'d90_vnd',coalesce(g.d90,0)::text) order by g.total desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Tổng phải thu','value',coalesce(sum(g.total),0)::text,'kind','money'),
        jsonb_build_object('label','Quá hạn trên 60 ngày','value',coalesce(sum(g.d90),0)::text,'kind','money'),
        jsonb_build_object('label','Khách còn nợ','value',count(*)::text,'kind','number')))
      into result from grouped g;

  elsif report_key='SUPPLIER' then
    with received as (
      select p.supplier_id,sum(l.inventory_value_vnd)::bigint value,count(distinct pr.id) receipts
      from public.purchase_receipts pr join public.purchase_receipt_lines l on l.purchase_receipt_id=pr.id join public.purchase_orders p on p.id=pr.purchase_order_id
      where pr.branch_id=target_branch_id and pr.received_at>=from_ts and pr.received_at<to_ts group by p.supplier_id
    ), owed as (
      select o.supplier_id,sum(private.current_payable_outstanding(o.id))::bigint value
      from public.payable_obligations o where o.branch_id=target_branch_id and o.supplier_id is not null group by o.supplier_id
    ), grouped as (
      select s.name label,s.code,coalesce(r.value,0) received,coalesce(r.receipts,0) receipts,coalesce(w.value,0) owed
      from public.suppliers s left join received r on r.supplier_id=s.id left join owed w on w.supplier_id=s.id
      where s.branch_id=target_branch_id and (coalesce(r.value,0)<>0 or coalesce(w.value,0)<>0)
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'code',g.code,'documents',g.receipts,'received_vnd',g.received::text,'owed_vnd',g.owed::text)
        order by g.received desc,g.owed desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Tiền hàng nhập','value',coalesce(sum(g.received),0)::text,'kind','money'),
        jsonb_build_object('label','Còn phải trả NCC','value',coalesce(sum(g.owed),0)::text,'kind','money')))
      into result from grouped g;

  elsif report_key='DELIVERY' then
    with trips as (
      select d.id,d.result_kind,a.employee_id,a.vehicle_id
      from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
      left join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null
      where d.branch_id=target_branch_id and dv.verified_at>=from_ts and dv.verified_at<to_ts
    ), grouped as (
      select coalesce(e.display_name,'Chưa gán thợ') label,coalesce(v.plate_number,'—') vehicle,count(*) trips,
        count(*) filter (where t.result_kind='PARTIAL') partial,count(*) filter (where t.result_kind='FAILED') failed,
        coalesce((select sum(ee.approved_amount_vnd) from public.earning_events ee join public.work_item_verifications wv on wv.id=ee.work_item_verification_id
          join public.work_items wi on wi.id=wv.work_item_id where wi.delivery_id=any(array_agg(t.id)) and ee.approval_state='APPROVED'),0)::bigint pay
      from trips t left join public.employees e on e.id=t.employee_id left join public.vehicles v on v.id=t.vehicle_id
      group by e.display_name,v.plate_number
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'vehicle',g.vehicle,'documents',g.trips,'partial',g.partial,'failed',g.failed,'pay_vnd',g.pay::text)
        order by g.trips desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Chuyến đã xong','value',coalesce(sum(g.trips),0)::text,'kind','number'),
        jsonb_build_object('label','Giao thiếu','value',coalesce(sum(g.partial),0)::text,'kind','number'),
        jsonb_build_object('label','Không giao được','value',coalesce(sum(g.failed),0)::text,'kind','number'),
        jsonb_build_object('label','Tiền chuyến','value',coalesce(sum(g.pay),0)::text,'kind','money')))
      into result from grouped g;

  else -- END_OF_DAY
    select jsonb_build_object(
      'rows',coalesce((select jsonb_agg(jsonb_build_object('label',p.payment_number,'time',p.effective_at,'direction',p.direction,
          'party',coalesce(c.display_name,s.name,e.display_name,'—'),'amount_vnd',p.amount_vnd::text) order by p.effective_at)
        from public.payments p left join public.customers c on c.id=p.customer_id left join public.suppliers s on s.id=p.supplier_id
        left join public.employees e on e.id=p.employee_id
        where p.branch_id=target_branch_id and p.effective_at>=from_ts and p.effective_at<to_ts and p.reversal_of_payment_id is null
          and not exists (select 1 from public.payments x where x.reversal_of_payment_id=p.id)),'[]'::jsonb),
      'kpis',jsonb_build_array(
        jsonb_build_object('label','Tiền thu','value',(select coalesce(sum(p.amount_vnd),0) from public.payments p where p.branch_id=target_branch_id and p.direction='RECEIPT'
          and p.effective_at>=from_ts and p.effective_at<to_ts and p.reversal_of_payment_id is null and not exists (select 1 from public.payments x where x.reversal_of_payment_id=p.id))::text,'kind','money'),
        jsonb_build_object('label','Tiền chi','value',(select coalesce(sum(p.amount_vnd),0) from public.payments p where p.branch_id=target_branch_id and p.direction='DISBURSEMENT'
          and p.effective_at>=from_ts and p.effective_at<to_ts and p.reversal_of_payment_id is null and not exists (select 1 from public.payments x where x.reversal_of_payment_id=p.id))::text,'kind','money'),
        jsonb_build_object('label','Doanh thu giao hàng','value',(select coalesce(sum(r.amount_vnd),0) from public.revenue_entries r where r.branch_id=target_branch_id
          and r.recorded_at>=from_ts and r.recorded_at<to_ts)::text,'kind','money'),
        jsonb_build_object('label','Phiếu giao xong','value',(select count(*) from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
          where d.branch_id=target_branch_id and dv.verified_at>=from_ts and dv.verified_at<to_ts)::text,'kind','number'),
        jsonb_build_object('label','Phiếu nhập hàng','value',(select count(*) from public.purchase_receipts pr where pr.branch_id=target_branch_id
          and pr.received_at>=from_ts and pr.received_at<to_ts)::text,'kind','number')))
      into result;
  end if;
  return result||jsonb_build_object('report',report_key,'from',from_date,'to',to_date);
end $function$;
revoke all on function public.report_center(uuid,text,date,date,uuid) from public,anon;
grant execute on function public.report_center(uuid,text,date,date,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
