-- Gỡ MỘT dòng sổ bán hàng đã nhập vào ERP (đơn hàng kho hoặc NCC giao thẳng) để nhập lại đúng luật.
-- Dùng khi Owner xác nhận một dòng đã nhập sai cách (ví dụ 15/11/2026: dòng 22 sổ 11.26 không phải Văn An giao thẳng mà là hàng kho).
-- Gỡ: đơn bán + dòng, phân bổ nguồn, phiếu giao (giao, nộp kết quả, xác nhận), việc của thợ, chuyển động kho của phiếu giao, doanh thu,
-- công nợ phải thu, giá vốn trực tiếp, đơn mua liên kết + phiếu NCC giao + công nợ phải trả, thông báo, và biên nhận lệnh (để nhập lại được).
-- KHÔNG gỡ nếu dòng đó đã có tiền thu/chi, điều chỉnh công nợ, hóa đơn, trả hàng, hay đã vào lương (earning_events): báo lý do và dừng.
-- Không đụng phiếu kiểm kho bù tồn (giữ nguyên; lần nhập lại sẽ chỉ bù phần còn thiếu). Ghi một dòng nhật ký (audit).
-- Cuối cùng soát toàn bộ khóa ngoại của schema public: còn dòng mồ côi thì hủy cả khối.
--
-- Dùng: gửi nguyên file + một dòng gọi, ví dụ
--   select pg_temp.hx_xoa_dong_so('11.26', 22, 'Owner 15/11/2026: dòng 22 là hàng kho, không phải Văn An giao thẳng', true);   -- chạy khô
--   select pg_temp.hx_xoa_dong_so('11.26', 22, '…', false);                                                                       -- chạy thật
-- QA: thêm 'HXQA-A', '<tài khoản chủ QA>' ở cuối. Sau đó chạy nhap-so-hang-ngay.sql với dòng đó rồi dong-bo-ngay.sql.

create or replace function pg_temp.hx_xoa_dong_so(tab text, tt integer, ly_do text, dry boolean,
  branch_code text default 'HX', actor uuid default '1a5a03c5-df68-4c95-af31-4f254c87216a') returns jsonb language plpgsql as $xoa$
declare
  tag constant text := 'so' || replace(tab, '.', '');
  branch uuid; so uuid; so_no text; n bigint; r record; orphans bigint := 0; report jsonb := '{}'; why text;
  sol uuid[]; dl uuid[]; dll uuid[]; dv uuid[]; dres uuid[]; dh uuid[]; wi uuid[]; po uuid[]; pol uuid[]; sf uuid[]; sfl uuid[]; ro uuid[]; pa uuid[];
  all_ids uuid[]; ops uuid[];
begin
  set local session_replication_role = replica;
  if char_length(trim(coalesce(ly_do, ''))) < 5 then raise exception 'cần ghi lý do'; end if;
  select id into branch from public.branches where code = branch_code;
  select count(*), min(o.id::text)::uuid, min(o.order_number) into n, so, so_no from public.sales_orders o
    where o.branch_id = branch and o.commercial_terms like 'Sổ ' || tab || ' dòng ' || tt || ' ·%';
  if n <> 1 then raise exception 'dòng % sổ %: có % đơn bán, cần đúng 1', tt, tab, n; end if;

  sol := array(select id from public.sales_order_lines where sales_order_id = so);
  dl := array(select id from public.deliveries where sales_order_id = so);
  dll := array(select id from public.delivery_lines where delivery_id = any(dl));
  dv := array(select id from public.delivery_verifications where delivery_id = any(dl));
  dres := array(select id from public.delivery_results where delivery_id = any(dl));
  dh := array(select id from public.delivery_handoffs where delivery_id = any(dl));
  wi := array(select id from public.work_items where delivery_id = any(dl));
  po := array(select id from public.purchase_orders where source_sales_order_id = so);
  pol := array(select id from public.purchase_order_lines where purchase_order_id = any(po));
  sf := array(select id from public.supplier_fulfillments where purchase_order_id = any(po));
  sfl := array(select id from public.supplier_fulfillment_lines where supplier_fulfillment_id = any(sf));
  ro := array(select id from public.receivable_obligations where delivery_verification_id = any(dv));
  pa := array(select id from public.payable_obligations where supplier_fulfillment_id = any(sf));

  -- Chặn: đã có tiền, điều chỉnh, hóa đơn, trả hàng, lương hay chứng từ khác bám vào.
  why := case
    when exists (select 1 from public.payment_allocations where receivable_obligation_id = any(ro) or payable_obligation_id = any(pa)) then 'đã có phiếu thu/chi gắn vào công nợ'
    when exists (select 1 from public.receivable_adjustments where obligation_id = any(ro)) or exists (select 1 from public.payable_adjustments where obligation_id = any(pa)) then 'đã có điều chỉnh công nợ'
    when exists (select 1 from public.customer_credits where obligation_id = any(ro)) or exists (select 1 from public.supplier_return_credits where obligation_id = any(pa)) then 'đã có tín dụng / trả hàng'
    when exists (select 1 from public.invoice_intents where source_obligation_id = any(ro)) or exists (select 1 from public.invoice_coverage where source_obligation_id = any(ro))
      or exists (select 1 from public.purchase_invoice_registry where payable_obligation_id = any(pa)) then 'đã có hóa đơn'
    when exists (select 1 from public.payment_request_lines where sales_order_id = so or receivable_obligation_id = any(ro)) then 'đã có yêu cầu thanh toán'
    when exists (select 1 from public.bank_transactions where sales_order_id = so) then 'đã có giao dịch ngân hàng'
    when exists (select 1 from public.earning_events where sales_order_id = so or payable_obligation_id = any(pa)) then 'đã vào lương'
    when exists (select 1 from public.expenses where sales_order_id = so) then 'đã có chi phí gắn vào đơn'
    when exists (select 1 from public.revenue_adjustments where sales_order_id = so) then 'đã có điều chỉnh doanh thu'
    when exists (select 1 from public.return_cases where delivery_line_id = any(dll)) or exists (select 1 from public.supplier_return_cases where source_fulfillment_line_id = any(sfl) or source_payable_id = any(pa)) then 'đã có trả hàng'
    when exists (select 1 from public.purchase_receipts where purchase_order_id = any(po)) or exists (select 1 from public.supplier_document_lines where purchase_order_line_id = any(pol)) then 'đơn mua đã có phiếu nhận / chứng từ NCC'
    when exists (select 1 from public.work_item_verifications v join public.earning_events e on e.work_item_verification_id = v.id where v.work_item_id = any(wi)) then 'việc của thợ đã vào lương'
  end;
  if why is not null then raise exception 'không gỡ dòng % (đơn %): %', tt, so_no, why; end if;

  report := jsonb_build_object('dong', tt, 'don', so_no, 'phieu_giao', cardinality(dl), 'don_mua', cardinality(po),
    'doanh_thu', (select coalesce(sum(amount_vnd), 0) from public.revenue_entries where sales_order_id = so),
    'phai_thu', (select coalesce(sum(original_amount_vnd), 0) from public.receivable_obligations where id = any(ro)),
    'phai_tra', (select coalesce(sum(original_amount_vnd), 0) from public.payable_obligations where id = any(pa)),
    'kho', (select coalesce(jsonb_agg(jsonb_build_object('loai', movement_type, 'so_luong', trim_scale(base_quantity_delta)::text)), '[]') from public.inventory_movements where delivery_id = any(dl)));

  all_ids := array[so] || sol || dl || dll || dv || dres || dh || wi || po || pol || sf || sfl || ro || pa;
  -- Biên nhận lệnh của bộ nhập cho dòng này (cả kiểu cũ "vanan"), và mọi biên nhận trả về chứng từ bị gỡ: để nhập lại không bị trả lại chứng từ cũ.
  ops := array(select md5(tag || x)::uuid from unnest(array[
      ':' || tt || ':draft', ':' || tt || ':confirm', ':' || tt || ':delivery',
      ':' || tt || ':GOODS:handoff', ':' || tt || ':GOODS:result', ':' || tt || ':GOODS:verify',
      ':' || tt || ':DIRECT:handoff', ':' || tt || ':DIRECT:result', ':' || tt || ':DIRECT:verify',
      ':' || tt || ':handoff', ':' || tt || ':result', ':' || tt || ':verify',
      ':ncc:' || tt || ':draft', ':ncc:' || tt || ':po', ':ncc:' || tt || ':so', ':ncc:' || tt || ':del', ':ncc:' || tt || ':assign',
      ':vanan:' || tt || ':draft', ':vanan:' || tt || ':po', ':vanan:' || tt || ':so', ':vanan:' || tt || ':del', ':vanan:' || tt || ':assign',
      ':vanan:' || tt || ':handoff', ':vanan:' || tt || ':result', ':vanan:' || tt || ':verify']) x);

  delete from public.notification_reads where notification_id in (select id from public.notifications where entity_id = any(all_ids));
  delete from public.notifications where entity_id = any(all_ids);
  delete from public.gps_positions where delivery_id = any(dl);
  delete from public.gps_tracking_sessions where delivery_id = any(dl);
  delete from public.route_plan_stops where delivery_id = any(dl);
  delete from public.delivery_dispatch_proposals where delivery_id = any(dl);
  delete from public.delivery_dispatch_exclusions where delivery_id = any(dl);
  delete from public.delivery_expense_sources where delivery_id = any(dl);
  delete from public.portal_evidence_objects where work_item_id = any(wi);
  delete from public.work_item_verifications where work_item_id = any(wi);
  delete from public.work_item_results where work_item_id = any(wi);
  delete from public.work_item_heartbeats where work_item_id = any(wi);
  delete from public.work_item_assignments where work_item_id = any(wi);
  delete from public.work_items where id = any(wi);
  delete from public.inventory_movements where delivery_id = any(dl);
  delete from public.payable_obligations where id = any(pa);
  delete from public.direct_cost_entries where sales_order_id = so or supplier_fulfillment_id = any(sf) or delivery_verification_id = any(dv);
  delete from public.revenue_entries where sales_order_id = so or delivery_verification_id = any(dv);
  delete from public.receivable_obligations where id = any(ro);
  delete from public.delivery_verification_lines where delivery_verification_id = any(dv);
  delete from public.delivery_verifications where id = any(dv);
  delete from public.delivery_result_lines where delivery_result_id = any(dres);
  delete from public.delivery_results where id = any(dres);
  delete from public.delivery_handoff_portal_evidence where delivery_handoff_id = any(dh);
  delete from public.delivery_handoff_lines where delivery_handoff_id = any(dh);
  delete from public.delivery_handoffs where id = any(dh);
  delete from public.delivery_assignments where delivery_id = any(dl);
  delete from public.inventory_reservations where delivery_line_id = any(dll) or sales_order_line_id = any(sol);
  delete from public.supplier_fulfillment_lines where id = any(sfl);
  delete from public.supplier_fulfillments where id = any(sf);
  delete from public.delivery_lines where id = any(dll);
  delete from public.deliveries where id = any(dl);
  delete from public.supply_allocations where sales_order_line_id = any(sol) or purchase_order_line_id = any(pol);
  delete from public.purchase_order_dispatches where purchase_order_id = any(po);
  delete from public.purchase_order_lines where id = any(pol);
  delete from public.purchase_orders where id = any(po);
  delete from public.sales_order_sourcing_runs where sales_order_id = so;
  delete from public.sales_order_credit_overrides where sales_order_id = so;
  delete from public.credit_commitments where sales_order_id = so;
  delete from public.sales_order_lines where id = any(sol);
  delete from public.sales_orders where id = so;
  delete from public.command_receipts where operation_id = any(ops) or result_entity_id = any(all_ids);

  -- Soát khóa ngoại một cột trong public: không được còn dòng trỏ tới chứng từ đã gỡ.
  for r in select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent, a.attname as ccol, pa2.attname as pcol
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute pa2 on pa2.attrelid = c.confrelid and pa2.attnum = c.confkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.connamespace = 'public'::regnamespace
      and c.confrelid::regclass::text in ('sales_orders', 'sales_order_lines', 'deliveries', 'delivery_lines', 'delivery_verifications', 'delivery_results',
        'delivery_handoffs', 'work_items', 'purchase_orders', 'purchase_order_lines', 'supplier_fulfillments', 'supplier_fulfillment_lines',
        'receivable_obligations', 'payable_obligations', 'supply_allocations', 'revenue_entries') loop
    execute format('select count(*) from %s ch where ch.%I = any($1)', r.child, r.ccol) into n using all_ids;
    if n > 0 then orphans := orphans + n; report := report || jsonb_build_object('mo_coi_' || r.child, n); end if;
  end loop;
  if orphans > 0 then raise exception 'còn % dòng trỏ tới chứng từ đã gỡ, hủy: %', orphans, report::text; end if;

  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (actor, branch, 'sales_ledger.row_removed', 'sales_order', so, gen_random_uuid(), array['sales_orders', 'deliveries', 'purchase_orders'],
    left(format('Gỡ dòng %s sổ bán hàng %s (đơn %s) để nhập lại: %s', tt, tab, so_no, ly_do), 500));
  if dry then raise exception 'DRY OK %', report::text; end if;
  return report;
end
$xoa$;
