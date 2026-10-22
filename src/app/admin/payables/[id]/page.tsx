import { formatBusinessDate } from "@/lib/core/business-time";
import { financeStateLabel } from "@/modules/finance/presentation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { recordPayableAdjustmentAction } from "@/modules/finance/actions";
import { MoneyInput } from "@/components/ui/money-input";

type Row = { id: string; supplier_name: string; source_label: string; source_id: string; purchase_order_id: string | null; expense_id: string | null; original_amount_vnd: string; adjustment_amount_vnd: string; allocated_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; state: string };

export default async function PayableDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("finance.ap.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [{ data }, { data: allocations }, { data: adjustments }] = await Promise.all([
    supabase.from("payable_read").select("id, supplier_name, source_label, source_id, purchase_order_id, expense_id, original_amount_vnd::text, adjustment_amount_vnd::text, allocated_amount_vnd::text, outstanding_amount_vnd::text, due_date, state").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("payment_allocations").select("id, payment_id, amount_delta_vnd::text, allocated_at").eq("payable_obligation_id", id).order("allocated_at", { ascending: false }),
    supabase.from("payable_adjustments").select("id, amount_delta_vnd::text, reason, evidence_object_id, recorded_at").eq("obligation_id", id).order("recorded_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const row = data as Row;
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Khoản phải trả</p><h1>{row.supplier_name}</h1><p className="lede">{row.source_label}; Công nợ phải trả được theo dõi riêng với chi phí trong kỳ.</p></div><Link className="button button-secondary" href="/admin/payables">Về danh sách</Link></header><ActionNotice notice={query.notice} error={query.error} />
    <section className="metric-grid"><article className="card metric-card"><span className="metric-label">Gốc</span><strong className="metric-value">{formatVnd(vnd(String(row.original_amount_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Điều chỉnh</span><strong className="metric-value">{formatVnd(vnd(String(row.adjustment_amount_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Đã phân bổ</span><strong className="metric-value">{formatVnd(vnd(String(row.allocated_amount_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Còn lại</span><strong className="metric-value">{formatVnd(vnd(String(row.outstanding_amount_vnd)))}</strong></article></section>
    <div className="two-column"><section className="card card-pad"><h2>Nguồn và lịch sử</h2><dl className="detail-grid"><div className="detail-item"><dt>Hạn trả</dt><dd>{formatBusinessDate(row.due_date)}</dd></div><div className="detail-item"><dt>Trạng thái</dt><dd>{financeStateLabel(row.state)}</dd></div><div className="detail-item field-full"><dt>Nguồn chính xác</dt><dd>{row.purchase_order_id ? <Link className="code-link" href={`/admin/purchase-orders/${row.purchase_order_id}`}>Mở đơn mua và tình trạng nhận hàng</Link> : row.expense_id ? <Link className="code-link" href={`/admin/expenses?focus=${row.expense_id}`}>Mở chi phí đã duyệt</Link> : <span className="mono">{row.source_id}</span>}</dd></div></dl><h3>Phân bổ thanh toán</h3><ul className="clean-list">{(allocations ?? []).map((item) => <li key={item.id}><strong>{formatVnd(vnd(String(item.amount_delta_vnd)))}</strong><small>Phiếu thu/chi <span className="mono">{item.payment_id}</span> · {formatBusinessDate(item.allocated_at)}</small></li>)}</ul><h3>Điều chỉnh</h3><ul className="clean-list">{(adjustments ?? []).map((item) => <li key={item.id}><strong>{formatVnd(vnd(String(item.amount_delta_vnd)))}</strong><small>{item.reason} · {item.evidence_object_id ? "Có minh chứng" : "Chưa có minh chứng"}</small></li>)}</ul></section>
      <aside className="card card-pad command-panel"><h2>Điều chỉnh có kiểm chứng</h2>{access.permissions.has("finance.ap.adjust") ? <form className="command-panel" action={recordPayableAdjustmentAction}><input type="hidden" name="obligationId" value={row.id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Số tiền điều chỉnh (VND)</label><MoneyInput name="amount" allowNegative placeholder="-100.000 hoặc 100.000" required /></div><div className="field"><label>Ghi chú (không bắt buộc)</label><textarea name="reason" maxLength={500} /></div><div className="field"><label>Mã minh chứng đã xác minh</label><input name="evidenceId" /></div><button className="button button-danger action-full" type="submit">Ghi điều chỉnh</button></form> : <p className="muted">Bạn không có quyền điều chỉnh.</p>}</aside></div>
  </>;
}
