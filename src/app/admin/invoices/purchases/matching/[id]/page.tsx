import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatVnd, vnd } from "@/lib/core/money";
import Decimal from "decimal.js";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatQuantity } from "@/lib/core/quantity";
import { SupplierDocumentReviewForm } from "@/modules/invoicing/supplier-document-forms";
import { PRICE_SOURCE } from "@/modules/invoicing/price-source";

/** Unit prices may carry decimals (per base unit on credit notes); whole numbers show as đồng. */
function formatVndText(value: string) { return /^\d+$/.test(value) ? formatVnd(vnd(value)) : `${formatQuantity(value)} ₫`; }

export default async function SupplierDocumentDetail({ params }: { params: Promise<{ id: string }> }) {
 const access = await requireInternalPermission("finance.ap.read"), { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound(); const db = await createServerSupabase();
 const [source, rows] = await Promise.all([db.from("supplier_document_read").select("id,branch_id,supplier_id,supplier_name,document_kind,document_number,document_date,declared_value_vnd::text,source_value_vnd::text,match_state,business_state,legal_state,version,created_at,reviewed_at,review_reason").eq("id", id).eq("branch_id", access.branchId).maybeSingle(), db.from("supplier_document_line_read").select("id,document_id,line_number,source_kind,source_id,purchase_order_line_id,material_id,material_name,document_uom_id,uom_symbol,source_quantity,document_quantity,source_unit_cost::text,document_unit_cost::text,source_value_vnd::text,document_value_vnd::text,approved_return_charge_vnd::text,match_result,covered").eq("document_id", id).order("line_number")]);
 if (source.error || rows.error) throw new Error("Không thể tải nguồn đối chiếu."); if (!source.data) notFound(); const d = source.data;
 const lines = rows.data ?? [];
 const context = lines.length ? await db.from("supplier_document_source_context_read").select("source_kind, source_id, source_number, purchase_order_number, ordered_quantity, received_quantity, price_source_type").eq("branch_id", access.branchId).in("source_id", lines.map(l => l.source_id)) : { data: [], error: null };
 if (context.error) throw new Error("Không thể tải đơn mua của phiếu nhập.");
 const contextByKey = new Map((context.data ?? []).map(c => [`${c.source_kind}:${c.source_id}`, c]));
 const matched = lines.filter(l => l.match_result.startsWith("MATCHED")).length;
 const off = (left: string, right: string) => !new Decimal(left || "0").eq(right || "0");
 const resultLabel: Record<string, string> = { MATCHED: "Khớp", MATCHED_APPROVED_RETURN_CHARGE: "Khớp khoản giảm / phí giữ lại đã duyệt", QUANTITY_VARIANCE: "Lệch lượng", PRICE_VARIANCE: "Lệch giá", VALUE_VARIANCE: "Lệch giá trị", ARITHMETIC_VARIANCE: "Lệch tính tiền" };
 return <><header className="page-heading"><div><p className="eyebrow">Đối chiếu nguồn nội bộ</p><h1>{d.document_number}</h1><p className="lede">{d.supplier_name} · {d.document_date}</p></div><Link className="button button-secondary" href="/admin/invoices/purchases/matching">Chứng từ đối chiếu</Link></header>
  <section className="card card-pad"><h2>{d.match_state === "MATCHED" ? "Đã khớp nguồn" : "Còn ngoại lệ đối chiếu"}</h2><p>Khai báo {formatVnd(vnd(d.declared_value_vnd))}; nguồn đã ghi {formatVnd(vnd(d.source_value_vnd))}.</p><p>{d.business_state === "BUSINESS_APPROVED" ? "Đã duyệt nội bộ" : d.business_state === "CANCELLED" ? "Đã hủy bản nháp, giữ lịch sử" : "Chờ rà soát"}. Chưa xác minh pháp lý, không phát hành hóa đơn điện tử.</p>{d.review_reason && <p>{d.review_reason}</p>}<a className="button button-secondary" href={`/api/supplier-documents/${id}/review/csv`}>Xuất bảng đối chiếu theo nguồn</a></section>
  <section className="card"><div className="section-head"><h2>Dòng hóa đơn</h2><p className="muted">{matched}/{lines.length} dòng khớp</p></div><div className="table-wrap"><table className="matching-table"><thead><tr><th>Phiếu nhập / đơn mua</th><th>Hàng · ĐVT</th><th className="numeric">SL đặt</th><th className="numeric">SL nhận</th><th className="numeric">SL hóa đơn</th><th className="numeric">Giá đơn mua</th><th className="numeric">Giá hóa đơn</th><th className="numeric">Thành tiền nhận → hóa đơn</th><th>Kết quả</th></tr></thead><tbody>{lines.map(l => {
   const c = contextByKey.get(`${l.source_kind}:${l.source_id}`);
   return <tr key={l.id}><td><span className="code-link">{c?.source_number ?? "—"}</span>{c?.purchase_order_number && <small className="table-subline">Đơn mua {c.purchase_order_number}</small>}</td><td>{l.material_name}<small className="table-subline">{l.uom_symbol}</small></td>
    <td className="numeric">{c?.ordered_quantity ? formatQuantity(c.ordered_quantity) : "—"}</td><td className="numeric">{formatQuantity(l.source_quantity)}</td>
    <td className={`numeric${off(l.source_quantity, l.document_quantity) ? " variance" : ""}`}>{formatQuantity(l.document_quantity)}</td>
    <td className="numeric">{formatVndText(l.source_unit_cost)}{c?.price_source_type && <small className="table-subline">{PRICE_SOURCE[c.price_source_type] ?? c.price_source_type}</small>}</td>
    <td className={`numeric${off(l.source_unit_cost, l.document_unit_cost) ? " variance" : ""}`}>{formatVndText(l.document_unit_cost)}</td>
    <td className={`numeric${l.source_value_vnd !== l.document_value_vnd ? " variance" : ""}`}>{formatVnd(vnd(l.source_value_vnd))} → {formatVnd(vnd(l.document_value_vnd))}{BigInt(l.approved_return_charge_vnd) > 0n && <small className="table-subline">Khoản giữ lại đã duyệt {formatVnd(vnd(l.approved_return_charge_vnd))}</small>}</td>
    <td>{l.match_result.startsWith("MATCHED") ? <StatusBadge tone="success">{resultLabel[l.match_result]}</StatusBadge> : <StatusBadge tone="warning">{resultLabel[l.match_result]}</StatusBadge>}</td></tr>;
  })}</tbody></table></div></section>
  <div className="two-column">{access.permissions.has("finance.reconcile") && <details className="card card-pad"><summary>Duyệt đối chiếu đã khớp</summary><SupplierDocumentReviewForm documentId={id} version={d.version} decision="APPROVE_MATCH" operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:supplier-document:${id}:approve`} canReview={d.business_state === "DRAFT" && d.match_state === "MATCHED"} /></details>}{access.permissions.has("finance.ap.adjust") && <details className="card card-pad"><summary>Hủy bản nháp để sửa đối chiếu</summary><SupplierDocumentReviewForm documentId={id} version={d.version} decision="CANCEL" operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:supplier-document:${id}:cancel`} canReview={d.business_state === "DRAFT"} /></details>}</div>
 </>;
}
