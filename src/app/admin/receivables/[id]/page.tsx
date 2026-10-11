import { formatBusinessDate } from "@/lib/core/business-time";
import { financeStateLabel } from "@/modules/finance/presentation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { recordReceivableAdjustmentAction } from "@/modules/finance/actions";

type Row = { id: string; customer_id: string; customer_name: string; site_name: string | null; source_label: string; source_id: string; delivery_id: string | null; sales_order_id: string | null; original_amount_vnd: string; adjustment_amount_vnd: string; allocated_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; state: string };

export default async function ReceivableDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("finance.ar.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [{ data }, { data: allocations }, { data: adjustments }] = await Promise.all([
    supabase.from("receivable_read").select("id, customer_id, customer_name, site_name, source_label, source_id, delivery_id, sales_order_id, original_amount_vnd, adjustment_amount_vnd, allocated_amount_vnd, outstanding_amount_vnd, due_date, state").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("payment_allocations").select("id, payment_id, amount_delta_vnd, allocated_at").eq("receivable_obligation_id", id).order("allocated_at", { ascending: false }),
    supabase.from("receivable_adjustments").select("id, amount_delta_vnd, adjustment_kind, return_case_id, reason, evidence_object_id, recorded_at").eq("obligation_id", id).order("recorded_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const row = data as Row;
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Khoản phải thu</p><h1>{row.customer_name}</h1><p className="lede">{row.site_name ?? "Chưa gắn công trình"} · {row.source_label}</p></div><div className="inline-actions"><Link className="button button-primary" href={`/api/customers/${row.customer_id}/debt-statement/pdf`}>Đối chiếu công nợ</Link><Link className="button button-secondary" href="/admin/receivables">Về danh sách</Link></div></header><ActionNotice notice={query.notice} error={query.error} />
    <section className="metric-grid"><article className="card metric-card"><span className="metric-label">Gốc</span><strong className="metric-value">{formatVnd(vnd(String(row.original_amount_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Điều chỉnh</span><strong className="metric-value">{formatVnd(vnd(String(row.adjustment_amount_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Đã phân bổ</span><strong className="metric-value">{formatVnd(vnd(String(row.allocated_amount_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Còn lại</span><strong className="metric-value">{formatVnd(vnd(String(row.outstanding_amount_vnd)))}</strong></article></section>
    <div className="two-column"><section className="card card-pad"><h2>Nguồn và lịch sử</h2><dl className="detail-grid"><div className="detail-item"><dt>Hạn trả</dt><dd>{formatBusinessDate(row.due_date)}</dd></div><div className="detail-item"><dt>Trạng thái</dt><dd>{financeStateLabel(row.state)}</dd></div><div className="detail-item field-full"><dt>Nguồn chính xác</dt><dd>{row.delivery_id ? <Link className="code-link" href={`/admin/deliveries/${row.delivery_id}`}>Mở kết quả giao hàng đã xác minh</Link> : <span className="mono">{row.source_id}</span>}</dd></div></dl><h3>Phân bổ thanh toán</h3><ul className="clean-list">{(allocations ?? []).map((item) => <li key={item.id}><strong>{formatVnd(vnd(String(item.amount_delta_vnd)))}</strong><small>Phiếu thu/chi <span className="mono">{item.payment_id}</span> · {formatBusinessDate(item.allocated_at)}</small></li>)}</ul><h3>Điều chỉnh</h3><ul className="clean-list">{(adjustments ?? []).map((item) => <li key={item.id}><strong>{formatVnd(vnd(String(item.amount_delta_vnd)))}</strong><small>{item.return_case_id ? "Trả hàng" : item.adjustment_kind === "PRICE" ? "Điều chỉnh giá" : item.adjustment_kind === "WRITE_OFF" ? "Xóa nợ" : "Điều chỉnh nghĩa vụ khác"} · {item.reason} · {item.evidence_object_id ? "Có minh chứng" : "Chưa có minh chứng"}</small></li>)}</ul></section>
      <aside className="card card-pad command-panel"><h2>Điều chỉnh có kiểm chứng</h2>{access.permissions.has("finance.ar.adjust") ? <form className="command-panel" action={recordReceivableAdjustmentAction}><input type="hidden" name="obligationId" value={row.id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Bản chất điều chỉnh</label><select name="adjustmentKind" defaultValue="OTHER" required><option value="OTHER">Điều chỉnh nghĩa vụ khác</option><option value="PRICE">Điều chỉnh giá theo nguồn đã duyệt</option><option value="WRITE_OFF">Xóa nợ</option></select></div><p className="muted">Hàng trả dùng hồ sơ riêng và khoản có. Điều chỉnh giá ảnh hưởng doanh thu; xóa nợ và nghĩa vụ khác được theo dõi riêng.</p><div className="field"><label>Số tiền điều chỉnh (VND)</label><input name="amount" inputMode="numeric" placeholder="-100000 hoặc 100000" required /></div><div className="field"><label>Lý do</label><textarea name="reason" minLength={3} required /></div><div className="field"><label>Mã minh chứng đã xác minh</label><input name="evidenceId" /></div><button className="button button-danger action-full" type="submit">Ghi điều chỉnh</button></form> : <p className="muted">Bạn không có quyền điều chỉnh.</p>}</aside></div>
  </>;
}
