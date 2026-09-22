import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceCommand } from "@/components/invoicing/invoice-command";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireInternalPermission("finance.ar.read");
  const supabase = await createServerSupabase();
  const { data: invoice, error } = await supabase.from("invoice_intents").select("*").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error) throw error;
  if (!invoice) notFound();
  const [{ data: lines, error: linesError }, { data: adjustments, error: adjustmentError }, { data: sourceAdjustments, error: sourceError }] = await Promise.all([
    supabase.from("invoice_draft_lines").select("id,line_number,source_line_id,description_snapshot,quantity_snapshot,source_amount_vnd").eq("invoice_intent_id", id).order("line_number").limit(100),
    supabase.from("invoice_adjustment_drafts").select("id,receivable_adjustment_id,amount_delta_vnd,reason_snapshot,status,created_at").eq("invoice_intent_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("receivable_adjustments").select("id,amount_delta_vnd,reason,recorded_at").eq("obligation_id", invoice.source_obligation_id).order("recorded_at", { ascending: false }).limit(50),
  ]);
  if (linesError || adjustmentError || sourceError) throw linesError ?? adjustmentError ?? sourceError;
  const existing = new Set((adjustments ?? []).map((row) => row.receivable_adjustment_id));
  const money = (value: string | number) => Number(value).toLocaleString("vi-VN") + " ₫";
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Hồ sơ lập hóa đơn · chưa phát hành</p><h1>{invoice.customer_name_snapshot}</h1><p className="lede">Mã {invoice.id} · nguồn {invoice.source_type}</p></div><Link className="button button-secondary" href="/admin/invoices">Về danh sách</Link></header>
    <section className="card card-pad"><div className="section-head flush"><div><h2>Rà soát nguồn</h2><p className="muted">Không phải hóa đơn điện tử. Không phát sinh AR/doanh thu lần hai.</p></div><a className="button button-secondary" href={`/api/invoices/${id}/review/pdf`}>Tải phiếu rà soát PDF</a></div>
      <div className="detail-grid"><div className="detail-item"><dt>Số tiền nguồn</dt><dd>{money(invoice.source_amount_vnd)}</dd></div><div className="detail-item"><dt>Xác minh nghiệp vụ</dt><dd>{new Date(invoice.billing_verified_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</dd></div><div className="detail-item"><dt>Hạn lập hóa đơn</dt><dd>{invoice.invoice_due_at ? new Date(invoice.invoice_due_at).toLocaleString("vi-VN") : "Chờ policy được xác nhận"}</dd></div><div className="detail-item"><dt>Trạng thái</dt><dd>{invoice.status === "BUSINESS_APPROVED" ? "Đã duyệt nguồn · chờ policy/provider" : invoice.status === "CANCELLED" ? "Đã hủy" : "Nháp rà soát"}</dd></div><div className="detail-item"><dt>Provider</dt><dd>Chưa cấu hình</dd></div><div className="detail-item"><dt>Hóa đơn pháp lý</dt><dd>Chưa phát hành</dd></div></div>
      <div className="table-wrap"><table><thead><tr><th>Dòng</th><th>Mô tả nguồn</th><th>Số lượng</th><th>Giá trị nguồn</th></tr></thead><tbody>{(lines ?? []).map((line) => <tr key={line.id}><td>{line.line_number}</td><td>{line.description_snapshot}</td><td>{Number(line.quantity_snapshot).toLocaleString("vi-VN")}</td><td>{money(line.source_amount_vnd)}</td></tr>)}</tbody></table></div>
      {invoice.status === "DRAFT" && <div className="form-grid">{access.permissions.has("finance.reconcile") && <InvoiceCommand kind="approve" invoiceId={id} version={invoice.version} />}{access.permissions.has("finance.ar.adjust") && <InvoiceCommand kind="cancel" invoiceId={id} version={invoice.version} />}</div>}
    </section>
    <section className="card card-pad"><h2>Điều chỉnh từ nguồn AR</h2><p className="muted">Nháp điều chỉnh không sửa hóa đơn/hồ sơ cũ và không phát hành tự động.</p>{(sourceAdjustments ?? []).length ? <div className="clean-list">{(sourceAdjustments ?? []).map((row) => <div className="detail-item" key={row.id}><strong>{money(row.amount_delta_vnd)} · {row.reason}</strong><span>{existing.has(row.id) ? "Đã ghi nháp điều chỉnh" : "Chưa ghi nháp"}</span>{invoice.status === "BUSINESS_APPROVED" && !existing.has(row.id) && access.permissions.has("finance.ar.adjust") && <InvoiceCommand kind="adjustment" invoiceId={id} adjustmentId={row.id} />}</div>)}</div> : <p className="empty-inline">Nguồn AR chưa có điều chỉnh.</p>}</section>
  </div>;
}
