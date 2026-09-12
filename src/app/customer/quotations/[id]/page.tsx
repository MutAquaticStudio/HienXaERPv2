import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireCustomerAccess } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { acceptCustomerQuotationAction } from "@/modules/sales/actions";
import { salesStateLabel, salesStateTone } from "@/modules/sales/presentation";

type Quote = { id: string; quotation_number: string; current_revision_id: string };
type Revision = { id: string; revision_number: number; state: string; total_vnd: string; customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string; commercial_terms: string | null; expires_at: string | null };
type Line = { id: string; material_name_snapshot: string; quantity: string; line_total_vnd: string; units_of_measure: { symbol: string } | { symbol: string }[] | null };
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export default async function CustomerQuotationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const membership = await requireCustomerAccess();
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: quoteData } = await supabase.from("quotations").select("id, quotation_number, current_revision_id").eq("id", id).eq("customer_id", membership.customerId).maybeSingle();
  if (!quoteData) notFound();
  const quote = quoteData as Quote;
  const [revisionResult, lineResult] = await Promise.all([
    supabase.from("quotation_revisions").select("id, revision_number, state, total_vnd, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, commercial_terms, expires_at").eq("id", quote.current_revision_id).maybeSingle(),
    supabase.from("quotation_lines").select("id, material_name_snapshot, quantity, line_total_vnd, units_of_measure:ordered_uom_id(symbol)").eq("revision_id", quote.current_revision_id).order("line_number"),
  ]);
  if (!revisionResult.data) notFound();
  const revision = revisionResult.data as Revision;
  const lines = (lineResult.data ?? []) as unknown as Line[];
  const query = await searchParams;
  const canAccept = ["OWNER", "FINANCE_CONTACT"].includes(membership.role) && revision.state === "SENT";
  return <><header className="page-heading"><div><p className="eyebrow">{quote.quotation_number} · Revision {revision.revision_number}</p><h1>{revision.customer_name_snapshot}</h1><p className="lede">{revision.site_name_snapshot} · {revision.delivery_address_snapshot}</p></div><div className="action-cluster"><Link className="button button-secondary" href={`/api/quotation-revisions/${revision.id}/pdf`}>Tải PDF</Link><Link className="button button-secondary" href="/customer/quotations">Về danh sách</Link></div></header><ActionNotice notice={query.notice} error={query.error} /><section className="card card-pad document-sheet"><div className="section-head flush"><h2>Nội dung revision {revision.revision_number}</h2><StatusBadge tone={salesStateTone(revision.state)}>{salesStateLabel(revision.state)}</StatusBadge></div><p className="muted">Hiệu lực: {revision.expires_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.expires_at)) : "không giới hạn"}</p><div className="table-wrap"><table><thead><tr><th>Vật tư</th><th>Số lượng</th><th>Thành tiền</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td>{line.material_name_snapshot}</td><td>{line.quantity} {one(line.units_of_measure)?.symbol}</td><td className="mono">{formatVnd(vnd(line.line_total_vnd))}</td></tr>)}</tbody></table></div><p className="document-total">Tổng cộng <strong>{formatVnd(vnd(revision.total_vnd))}</strong></p><p><strong>Điều khoản:</strong> {revision.commercial_terms ?? "Không có điều khoản bổ sung."}</p>{canAccept && <form action={acceptCustomerQuotationAction} className="portal-accept"><input type="hidden" name="entityId" value={revision.id} /><input type="hidden" name="quoteId" value={quote.id} /><input type="hidden" name="operationId" value={randomUUID()} /><p>Tôi xác nhận đã xem đúng báo giá <strong>{quote.quotation_number}, revision {revision.revision_number}</strong>.</p><button className="button button-primary" type="submit">Chấp nhận revision này</button></form>}{membership.role === "RECEIVER" && <p className="form-message">Vai trò người nhận chỉ được xem; Owner hoặc Finance Contact mới có thể chấp nhận.</p>}</section></>;
}
