-- Scope balance derivation to obligations selected by each branch/list query.
create index if not exists receivable_obligations_branch_due_id_idx
  on public.receivable_obligations (branch_id, due_date, id);
create index if not exists payable_obligations_branch_due_id_idx
  on public.payable_obligations (branch_id, due_date, id);
create index if not exists receivable_adjustments_obligation_id_idx
  on public.receivable_adjustments (obligation_id);
create index if not exists payable_adjustments_obligation_id_idx
  on public.payable_adjustments (obligation_id);

create or replace view public.receivable_read with (security_invoker = true) as
select r.id, r.branch_id, r.customer_id, r.site_id,
  c.display_name as customer_name, s.name as site_name,
  r.original_amount_vnd,
  coalesce(adj.amount_vnd, 0)::bigint as adjustment_amount_vnd,
  coalesce(alloc.amount_vnd, 0)::bigint as allocated_amount_vnd,
  (r.original_amount_vnd::numeric + coalesce(adj.amount_vnd, 0) - coalesce(alloc.amount_vnd, 0))::bigint as outstanding_amount_vnd,
  r.due_date, r.recorded_at,
  case
    when r.opening_source_id is not null then 'OPENING_BALANCE'
    when r.delivery_verification_id is not null then 'DELIVERY_VERIFICATION'
    else 'SERVICE_VERIFICATION'
  end::text as source_type,
  coalesce(r.opening_source_id, r.delivery_verification_id, r.service_verification_id) as source_id,
  d.id as delivery_id, d.sales_order_id,
  case
    when r.opening_source_id is not null then 'Số dư đầu kỳ'
    when r.delivery_verification_id is not null then 'Giao hàng đã xác minh'
    else 'Dịch vụ đã xác minh'
  end::text as source_label,
  case
    when (r.original_amount_vnd::numeric + coalesce(adj.amount_vnd, 0) - coalesce(alloc.amount_vnd, 0)) <= 0 then 'SETTLED'
    when r.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'OVERDUE'
    else 'OPEN'
  end::text as state,
  sv.service_job_id
from public.receivable_obligations r
join public.customers c on c.id = r.customer_id
left join public.customer_sites s on s.id = r.site_id
left join public.delivery_verifications dv on dv.id = r.delivery_verification_id
left join public.deliveries d on d.id = dv.delivery_id
left join public.service_verifications sv on sv.id = r.service_verification_id
left join lateral (
  select sum(a.amount_delta_vnd) as amount_vnd
  from public.receivable_adjustments a
  where a.obligation_id = r.id
) adj on true
left join lateral (
  select sum(a.amount_delta_vnd) as amount_vnd
  from public.payment_allocations a
  where a.receivable_obligation_id = r.id
) alloc on true;

create or replace view public.payable_read with (security_invoker = true) as
select p.id, p.branch_id, p.supplier_id,
  coalesce(s.name, e.display_name) as supplier_name,
  p.original_amount_vnd,
  coalesce(adj.amount_vnd, 0)::bigint as adjustment_amount_vnd,
  coalesce(alloc.amount_vnd, 0)::bigint as allocated_amount_vnd,
  (p.original_amount_vnd::numeric + coalesce(adj.amount_vnd, 0) - coalesce(alloc.amount_vnd, 0))::bigint as outstanding_amount_vnd,
  p.due_date, p.recorded_at,
  case
    when p.opening_source_id is not null then 'OPENING_BALANCE'
    when p.purchase_receipt_id is not null then 'PURCHASE_RECEIPT'
    when p.supplier_fulfillment_id is not null then 'SUPPLIER_FULFILLMENT'
    when p.expense_id is not null then 'EXPENSE'
    else 'EARNING_EVENT'
  end::text as source_type,
  coalesce(p.opening_source_id, p.purchase_receipt_id, p.supplier_fulfillment_id, p.expense_id, p.earning_event_id) as source_id,
  coalesce(pr.purchase_order_id, sf.purchase_order_id) as purchase_order_id,
  p.expense_id,
  case
    when p.opening_source_id is not null then 'Số dư đầu kỳ'
    when p.purchase_receipt_id is not null then 'Nhận hàng vào kho'
    when p.supplier_fulfillment_id is not null then 'NCC giao thẳng đã xác minh'
    when p.expense_id is not null then 'Chi phí vận hành đã duyệt'
    else 'Thu nhập nhân sự đã duyệt'
  end::text as source_label,
  case
    when (p.original_amount_vnd::numeric + coalesce(adj.amount_vnd, 0) - coalesce(alloc.amount_vnd, 0)) <= 0 then 'SETTLED'
    when p.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'OVERDUE'
    else 'OPEN'
  end::text as state,
  p.employee_id, p.earning_event_id
from public.payable_obligations p
left join public.suppliers s on s.id = p.supplier_id
left join public.employees e on e.id = p.employee_id
left join public.purchase_receipts pr on pr.id = p.purchase_receipt_id
left join public.supplier_fulfillments sf on sf.id = p.supplier_fulfillment_id
left join lateral (
  select sum(a.amount_delta_vnd) as amount_vnd
  from public.payable_adjustments a
  where a.obligation_id = p.id
) adj on true
left join lateral (
  select sum(a.amount_delta_vnd) as amount_vnd
  from public.payment_allocations a
  where a.payable_obligation_id = p.id
) alloc on true;
