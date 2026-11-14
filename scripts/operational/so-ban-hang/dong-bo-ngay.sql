-- Đồng bộ ngày chứng từ nhập từ sổ bán hàng với ngày ghi trong sổ (Owner 14/11/2026), chạy SAU nhap-so-hang-ngay.sql.
-- Các lệnh nghiệp vụ ghi giờ lúc chạy; khối này đặt lại các mốc giờ theo ngày sổ, đúng như lần đồng bộ tay 14/11:
--   đơn hàng: tạo 07:30, xác nhận 07:31, giao 08:10, nộp kết quả 09:00, xác nhận giao + doanh thu + công nợ 09:05, hạn nợ = ngày sổ + 14;
--   nhà cung cấp giao thẳng: thêm đơn mua, phiếu NCC giao, công nợ phải trả (hạn = ngày sổ);
--   dịch vụ: 08:40 → 10:05, hạn nợ = ngày sổ + 14; phiếu bù tồn: 07:00 ngày sổ đầu tiên của đợt.
-- Chỉ chạm chứng từ có dấu "Sổ <tab> dòng" còn lệch ngày, nên chạy lại bao nhiêu lần cũng được. Không đổi số lượng, tiền hay trạng thái.
-- Một giao dịch: lỗi ở đâu thì hủy cả khối. Gửi nguyên file (tạo hàm tạm, gọi hàm, rồi câu kiểm tra) trong một lần chạy SQL.
create or replace function pg_temp.hx_dong_bo_ngay(branch_code text default 'HX', actor uuid default '1a5a03c5-df68-4c95-af31-4f254c87216a')
returns jsonb language plpgsql as $dongbo$
declare branch uuid; n_orders bigint; n_jobs bigint; n_counts bigint;
begin
  set local session_replication_role = replica;
  select id into branch from public.branches where code = branch_code;
  if branch is null then raise exception 'không có chi nhánh %', branch_code; end if;

  create temp table hx_od on commit drop as
    select o.id as order_id, (((o.requested_delivery_at at time zone 'Asia/Ho_Chi_Minh')::date)::text || ' 08:00:00+07')::timestamptz as t0
    from public.sales_orders o where o.branch_id = branch and o.commercial_terms like 'Sổ %dòng %' and o.requested_delivery_at is not null
      and o.created_at is distinct from (((o.requested_delivery_at at time zone 'Asia/Ho_Chi_Minh')::date)::text || ' 08:00:00+07')::timestamptz - interval '30 minutes';
  select count(*) into n_orders from hx_od;
  if n_orders > 0 then
    update public.sales_orders o set created_at = od.t0 - interval '30 minutes', confirmed_at = od.t0 - interval '29 minutes' from hx_od od where o.id = od.order_id;
    update public.credit_commitments c set created_at = od.t0 - interval '29 minutes' from hx_od od where c.sales_order_id = od.order_id;
    update public.supply_allocations a set created_at = od.t0 - interval '25 minutes', updated_at = od.t0 - interval '25 minutes'
      from public.sales_order_lines l join hx_od od on od.order_id = l.sales_order_id where a.sales_order_line_id = l.id;
    update public.inventory_reservations r set created_at = od.t0 - interval '25 minutes', finalized_at = case when r.finalized_at is not null then od.t0 + interval '65 minutes' end
      from public.sales_order_lines l join hx_od od on od.order_id = l.sales_order_id where r.sales_order_line_id = l.id;
    update public.deliveries d set created_at = od.t0 - interval '20 minutes', scheduled_at = od.t0, scheduled_end_at = od.t0 + interval '1 hour', verified_at = od.t0 + interval '65 minutes'
      from hx_od od where d.sales_order_id = od.order_id;
    update public.delivery_assignments a set assigned_at = od.t0 - interval '20 minutes' from public.deliveries d join hx_od od on od.order_id = d.sales_order_id where a.delivery_id = d.id;
    update public.delivery_handoffs h set handed_off_at = od.t0 + interval '10 minutes', created_at = od.t0 + interval '10 minutes'
      from public.deliveries d join hx_od od on od.order_id = d.sales_order_id where h.delivery_id = d.id;
    update public.delivery_results r set submitted_at = od.t0 + interval '60 minutes' from public.deliveries d join hx_od od on od.order_id = d.sales_order_id where r.delivery_id = d.id;
    update public.delivery_verifications v set verified_at = od.t0 + interval '65 minutes' from public.deliveries d join hx_od od on od.order_id = d.sales_order_id where v.delivery_id = d.id;
    update public.work_items w set created_at = od.t0 - interval '20 minutes', scheduled_start = od.t0, scheduled_end = od.t0 + interval '1 hour',
        started_at = od.t0 + interval '10 minutes', completed_at = od.t0 + interval '60 minutes'
      from public.deliveries d join hx_od od on od.order_id = d.sales_order_id where w.delivery_id = d.id;
    update public.work_item_assignments wa set assigned_at = od.t0 - interval '20 minutes'
      from public.work_items w join public.deliveries d on d.id = w.delivery_id join hx_od od on od.order_id = d.sales_order_id where wa.work_item_id = w.id;
    update public.work_item_results wr set submitted_at = od.t0 + interval '60 minutes'
      from public.work_items w join public.deliveries d on d.id = w.delivery_id join hx_od od on od.order_id = d.sales_order_id where wr.work_item_id = w.id;
    update public.work_item_verifications wv set verified_at = od.t0 + interval '65 minutes'
      from public.work_items w join public.deliveries d on d.id = w.delivery_id join hx_od od on od.order_id = d.sales_order_id where wv.work_item_id = w.id;
    update public.revenue_entries re set recorded_at = od.t0 + interval '65 minutes' from hx_od od where re.sales_order_id = od.order_id;
    update public.receivable_obligations ro set recorded_at = od.t0 + interval '65 minutes', due_date = ((od.t0 at time zone 'Asia/Ho_Chi_Minh')::date) + 14
      from public.delivery_verifications v join public.deliveries d on d.id = v.delivery_id join hx_od od on od.order_id = d.sales_order_id where ro.delivery_verification_id = v.id;
    update public.direct_cost_entries dc set recorded_at = od.t0 + interval '65 minutes' from hx_od od where dc.sales_order_id = od.order_id;
    update public.inventory_movements m set occurred_at = case m.movement_type when 'DELIVERY_HANDOFF' then od.t0 + interval '10 minutes' else od.t0 + interval '65 minutes' end,
        created_at = case m.movement_type when 'DELIVERY_HANDOFF' then od.t0 + interval '10 minutes' else od.t0 + interval '65 minutes' end
      from public.deliveries d join hx_od od on od.order_id = d.sales_order_id where m.delivery_id = d.id and m.movement_type in ('DELIVERY_HANDOFF', 'DELIVERY_VERIFIED');
    -- Nhà cung cấp giao thẳng
    update public.purchase_orders po set created_at = od.t0 - interval '30 minutes', confirmed_at = od.t0 - interval '29 minutes' from hx_od od where po.source_sales_order_id = od.order_id;
    update public.supplier_fulfillments f set verified_at = od.t0 + interval '65 minutes'
      from public.purchase_orders po join hx_od od on od.order_id = po.source_sales_order_id where f.purchase_order_id = po.id;
    update public.payable_obligations pa set recorded_at = od.t0 + interval '65 minutes', due_date = (od.t0 at time zone 'Asia/Ho_Chi_Minh')::date
      from public.supplier_fulfillments f join public.purchase_orders po on po.id = f.purchase_order_id join hx_od od on od.order_id = po.source_sales_order_id
      where pa.supplier_fulfillment_id = f.id;
  end if;

  create temp table hx_sj on commit drop as
    select j.id as job_id, (((j.scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date)::text || ' 09:00:00+07')::timestamptz as t0
    from public.service_jobs j where j.branch_id = branch and j.description like 'Sổ %dòng %'
      and j.created_at is distinct from (((j.scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date)::text || ' 09:00:00+07')::timestamptz - interval '20 minutes';
  select count(*) into n_jobs from hx_sj;
  if n_jobs > 0 then
    update public.service_jobs j set created_at = sj.t0 - interval '20 minutes', scheduled_end = sj.t0 + interval '1 hour', verified_at = sj.t0 + interval '65 minutes'
      from hx_sj sj where j.id = sj.job_id;
    update public.work_items w set created_at = sj.t0 - interval '20 minutes', started_at = sj.t0 + interval '10 minutes', completed_at = sj.t0 + interval '60 minutes'
      from hx_sj sj where w.service_job_id = sj.job_id;
    update public.work_item_assignments a set assigned_at = sj.t0 - interval '20 minutes' from public.work_items w join hx_sj sj on sj.job_id = w.service_job_id where a.work_item_id = w.id;
    update public.work_item_results r set submitted_at = sj.t0 + interval '60 minutes' from public.work_items w join hx_sj sj on sj.job_id = w.service_job_id where r.work_item_id = w.id;
    update public.service_work_logs l set started_at = sj.t0 + interval '10 minutes', ended_at = sj.t0 + interval '60 minutes', recorded_at = sj.t0 + interval '60 minutes'
      from hx_sj sj where l.service_job_id = sj.job_id;
    update public.service_verifications v set verified_at = sj.t0 + interval '65 minutes' from hx_sj sj where v.service_job_id = sj.job_id;
    update public.work_item_verifications wv set verified_at = sj.t0 + interval '65 minutes' from public.work_items w join hx_sj sj on sj.job_id = w.service_job_id where wv.work_item_id = w.id;
    update public.receivable_obligations ro set recorded_at = sj.t0 + interval '65 minutes', due_date = ((sj.t0 at time zone 'Asia/Ho_Chi_Minh')::date) + 14
      from public.service_verifications v join hx_sj sj on sj.job_id = v.service_job_id where ro.service_verification_id = v.id;
  end if;

  -- Phiếu bù tồn của đợt nhập tự động: về 07:00 ngày sổ ghi trong lý do của dòng phiếu.
  create temp table hx_sc on commit drop as
    select x.count_id, x.t0 from (
      select l.stock_count_id as count_id, (min(substring(l.reason from 'ngày ([0-9]{4}-[0-9]{2}-[0-9]{2})')) || ' 07:00:00+07')::timestamptz as t0
      from public.stock_count_lines l where l.reason like 'Bù tồn trước khi giao theo sổ bán hàng % ngày ____-__-__%' group by 1) x
    join public.stock_counts c on c.id = x.count_id where c.branch_id = branch and c.cutoff_at is distinct from x.t0;
  select count(*) into n_counts from hx_sc;
  if n_counts > 0 then
    update public.stock_counts c set created_at = sc.t0, cutoff_at = sc.t0, approved_at = sc.t0 + interval '5 minutes' from hx_sc sc where c.id = sc.count_id;
    update public.inventory_movements m set occurred_at = sc.t0 + interval '5 minutes', created_at = sc.t0 + interval '5 minutes'
      from public.stock_count_lines l join hx_sc sc on sc.count_id = l.stock_count_id where m.source_stock_count_line_id = l.id;
  end if;

  if n_orders + n_jobs + n_counts > 0 then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (actor, branch, 'sales_ledger.dates_synced', 'sales_ledger', gen_random_uuid(), gen_random_uuid(), array['created_at', 'verified_at', 'recorded_at', 'due_date', 'occurred_at'],
      format('Đồng bộ ngày theo sổ bán hàng (Owner 14/11/2026): %s đơn, %s việc dịch vụ, %s phiếu bù tồn.', n_orders, n_jobs, n_counts));
  end if;
  return jsonb_build_object('don', n_orders, 'dich_vu', n_jobs, 'phieu_bu_ton', n_counts);
end
$dongbo$;

select pg_temp.hx_dong_bo_ngay() as da_dong_bo;   -- QA: pg_temp.hx_dong_bo_ngay('<mã chi nhánh QA>', '<tài khoản chủ QA>')

-- Kiểm tra sau khi chạy: hai cột "lech" phải bằng 0.
select (select count(*) from public.sales_orders o where o.commercial_terms like 'Sổ %dòng %'
          and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date <> (o.requested_delivery_at at time zone 'Asia/Ho_Chi_Minh')::date) as don_lech,
       (select count(*) from public.service_jobs j where j.description like 'Sổ %dòng %'
          and (j.verified_at at time zone 'Asia/Ho_Chi_Minh')::date <> (j.scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date) as dich_vu_lech,
       (select count(*) from public.sales_orders where commercial_terms like 'Sổ %dòng %') as tong_don,
       (select count(*) from public.service_jobs where description like 'Sổ %dòng %') as tong_dich_vu,
       (select coalesce(sum(amount_vnd), 0) from public.revenue_entries) as doanh_thu,
       (select coalesce(sum(original_amount_vnd), 0) from public.receivable_obligations) as cong_no;
