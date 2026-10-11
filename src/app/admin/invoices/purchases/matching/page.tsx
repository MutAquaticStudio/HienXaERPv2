import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseCoreListQuery, CORE_LIST_PAGE_SIZE } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import { formatVnd, vnd } from "@/lib/core/money";
import { SupplierDocumentForm, type DocumentSource } from "@/modules/invoicing/supplier-document-forms";

export default async function SupplierDocumentMatchingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
 const access = await requireInternalPermission("finance.ap.read"), db = await createServerSupabase(), list = parseCoreListQuery(await searchParams);
 const [documents, sources] = await Promise.all([
  db.from("supplier_document_read").select("id, supplier_name, document_kind, document_number, declared_value_vnd, match_state, business_state, legal_state").eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  access.permissions.has("finance.ap.adjust") ? db.from("supplier_document_eligible_source_read").select("*").eq("branch_id", access.branchId).order("source_number", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
 ]);
 if (documents.error || sources.error) throw new Error("Không thể tải đối chiếu chứng từ nhà cung cấp.");
 const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
 return <><header className="page-heading"><div><p className="eyebrow">Đối chiếu mua theo nguồn</p><h1>Đơn mua · nhận hàng · chứng từ nhà cung cấp</h1><p className="lede">So lượng, đơn giá và giá trị với nguồn đã ghi. Chứng từ giảm nối khoản trả đã duyệt; không giảm phải trả lần hai.</p></div><Link className="button button-secondary" href="/admin/invoices/purchases">Sổ nguồn mua</Link></header>
  <p className="quality-callout">Duyệt nội bộ và xuất bảng đối chiếu được hỗ trợ. Chưa có kết nối dịch vụ hóa đơn để phát hành hoặc xác minh pháp lý; không báo đã phát hành.</p>
  {access.permissions.has("finance.ap.adjust") && <details className="card card-pad"><summary>Đối chiếu chứng từ mới</summary><SupplierDocumentForm sources={(sources.data ?? []) as DocumentSource[]} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:supplier-document-create`} today={today} /></details>}
  <section className="card"><div className="section-head"><h2>Chứng từ đã đối chiếu</h2></div><div className="table-wrap"><table><thead><tr><th>Tham chiếu</th><th>Nhà cung cấp</th><th>Loại</th><th>Giá trị khai báo</th><th>Đối chiếu / duyệt</th><th>Pháp lý</th></tr></thead><tbody>{(documents.data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map(d => <tr key={d.id}><td><Link href={`/admin/invoices/purchases/matching/${d.id}`}>{d.document_number}</Link></td><td>{d.supplier_name}</td><td>{d.document_kind === "CREDIT_NOTE" ? "Chứng từ giảm" : "Chứng từ mua"}</td><td>{formatVnd(vnd(d.declared_value_vnd))}</td><td>{d.match_state === "MATCHED" ? "Đã khớp nguồn" : "Còn lệch nguồn"} · {d.business_state === "BUSINESS_APPROVED" ? "Đã duyệt nội bộ" : d.business_state === "CANCELLED" ? "Đã hủy bản nháp" : "Chờ rà soát"}</td><td>Chưa xác minh pháp lý</td></tr>)}</tbody></table></div><ListPager page={list.page} hasNext={(documents.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} /></section>
 </>;
}
