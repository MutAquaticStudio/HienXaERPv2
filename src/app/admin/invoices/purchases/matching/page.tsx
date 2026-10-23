import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseCoreListQuery, CORE_LIST_PAGE_SIZE } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import { formatVnd, vnd } from "@/lib/core/money";
import { SupplierDocumentForm, type DocumentSource } from "@/modules/invoicing/supplier-document-forms";
import { StatusBadge } from "@/components/ui/status-badge";
import { InvoiceTabs } from "@/components/finance/finance-tabs";

export default async function SupplierDocumentMatchingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
 const access = await requireInternalPermission("finance.ap.read"), db = await createServerSupabase(), list = parseCoreListQuery(await searchParams);
 const [documents, sources] = await Promise.all([
  db.from("supplier_document_read").select("id, supplier_name, document_kind, document_number, declared_value_vnd::text, match_state, business_state, legal_state").eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  access.permissions.has("finance.ap.adjust") ? db.from("supplier_document_eligible_source_read").select("branch_id,supplier_id,supplier_name,source_kind,source_id,source_number,material_name,uom_symbol,source_quantity,source_unit_cost::text,source_value_vnd::text,document_kind").eq("branch_id", access.branchId).order("source_number", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
 ]);
 if (documents.error || sources.error) throw new Error("Không thể tải đối chiếu chứng từ nhà cung cấp.");
 const sourceIds = (sources.data ?? []).map(s => s.source_id);
 const context = sourceIds.length ? await db.from("supplier_document_source_context_read").select("source_kind, source_id, purchase_order_number, ordered_quantity, received_quantity, ordered_unit_cost::text, price_source_type").eq("branch_id", access.branchId).in("source_id", sourceIds) : { data: [], error: null };
 if (context.error) throw new Error("Không thể tải đơn mua của phiếu nhập.");
 const contextByKey = new Map((context.data ?? []).map(c => [`${c.source_kind}:${c.source_id}`, c]));
 const documentSources = (sources.data ?? []).map(s => ({ ...s, ...contextByKey.get(`${s.source_kind}:${s.source_id}`) })) as DocumentSource[];
 const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
 return <><header className="page-heading"><div><p className="eyebrow">Hóa đơn mua</p><h1>Đối chiếu hóa đơn nhà cung cấp</h1><p className="lede">Nhập hóa đơn của nhà cung cấp và so với đơn mua, phiếu nhập: số lượng đặt, đã nhận, trên hóa đơn và giá. Dòng lệch được tô màu.</p></div></header><InvoiceTabs active="/admin/invoices/purchases/matching" permissions={access.permissions} />
  <p className="quality-callout">Duyệt nội bộ và xuất bảng đối chiếu được hỗ trợ. Chưa có kết nối dịch vụ hóa đơn để phát hành hoặc xác minh pháp lý; không báo đã phát hành.</p>
  {access.permissions.has("finance.ap.adjust") && <details className="card card-pad"><summary>+ Đối chiếu hóa đơn mới</summary><SupplierDocumentForm sources={documentSources} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:supplier-document-create`} today={today} /></details>}
  <section className="card"><div className="section-head"><h2>Chứng từ đã đối chiếu</h2></div><div className="table-wrap"><table><thead><tr><th>Số hóa đơn</th><th>Nhà cung cấp</th><th>Loại</th><th className="numeric">Giá trị hóa đơn</th><th>Đối chiếu / duyệt</th><th>Pháp lý</th></tr></thead><tbody>{(documents.data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map(d => <tr key={d.id}><td><Link className="code-link" href={`/admin/invoices/purchases/matching/${d.id}`}>{d.document_number}</Link></td><td>{d.supplier_name}</td><td>{d.document_kind === "CREDIT_NOTE" ? "Chứng từ giảm" : "Chứng từ mua"}</td><td className="numeric">{formatVnd(vnd(d.declared_value_vnd))}</td><td>{d.match_state === "MATCHED" ? <StatusBadge tone="success">Khớp</StatusBadge> : <StatusBadge tone="warning">Có lệch</StatusBadge>} · {d.business_state === "BUSINESS_APPROVED" ? "Đã duyệt nội bộ" : d.business_state === "CANCELLED" ? "Đã hủy bản nháp" : "Chờ rà soát"}</td><td>Chưa xác minh pháp lý</td></tr>)}</tbody></table></div><ListPager page={list.page} hasNext={(documents.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} /></section>
 </>;
}
