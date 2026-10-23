import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import Decimal from "decimal.js";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupplierReturnCreateForm } from "@/modules/purchasing/supplier-return-forms";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";

export default async function SupplierReturnsPage({ searchParams }: { searchParams: Promise<{ page?: string; notice?: string }> }) {
 const access = await requireInternalAccess(), db = await createServerSupabase(), query = await searchParams, list = parseCoreListQuery(query);
 if (!["purchasing.read", "inventory.read", "finance.ap.read"].some(p => access.permissions.has(p))) return <p>Không có quyền đọc hồ sơ trả nhà cung cấp.</p>;
 const create = access.permissions.has("purchasing.create");
 const [cases, sources] = await Promise.all([
  db.from("supplier_return_read").select("id, return_number, supplier_name, material_name, requested_base_quantity, physically_returned_base_quantity, supplier_accepted_base_quantity, dispatch_closed, source_value_vnd::text, source_receipt_line_id, created_at").eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  create ? db.from("supplier_return_eligible_source_read").select("source_receipt_line_id, source_fulfillment_line_id, source_return_case_id, source_number, material_name, warehouse_id, source_base_quantity, custody_base_quantity").eq("branch_id", access.branchId).not("source_fulfillment_line_id", "is", null).order("source_number", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
 ]);
 if (cases.error || sources.error) throw new Error("Không thể tải hồ sơ trả nhà cung cấp.");
 const options = (sources.data ?? []).map(item => ({ id: `${item.source_receipt_line_id || ""}|${item.source_fulfillment_line_id || ""}|${item.source_return_case_id || ""}`, label: `${item.source_number} · ${item.material_name} · ${item.source_return_case_id ? `giao thẳng / ${item.warehouse_id ? "đã nhận thực về kho" : "trả thẳng NCC"} / còn ${item.custody_base_quantity}` : `nhận kho / nguồn ${item.source_base_quantity}`}` }));
 const status = (c: { requested_base_quantity: string; supplier_accepted_base_quantity: string; dispatch_closed: boolean }) =>
  new Decimal(c.supplier_accepted_base_quantity).gte(c.requested_base_quantity) || c.dispatch_closed ? <StatusBadge tone="success">Hoàn thành</StatusBadge> : <StatusBadge tone="warning">Đang xử lý</StatusBadge>;
 return <><header className="page-heading"><div><p className="eyebrow">Mua hàng</p><h1>Trả hàng nhập</h1><p className="lede">Trả lại nhà cung cấp hàng đã nhập kho: chọn phiếu nhập, nhập số lượng trả, bấm Hoàn thành.</p></div>
   <div className="action-cluster">{create && <Link className="button button-primary" href="/admin/purchases/returns/new">+ Trả hàng nhập</Link>}<Link className="button button-secondary" href="/admin/purchase-orders">Đơn mua</Link></div></header>
  {query.notice === "returned" && <p className="form-message success">Đã trả hàng nhập: hàng đã xuất khỏi kho và công nợ nhà cung cấp đã giảm.</p>}
  <section className="card"><div className="table-wrap"><table><thead><tr><th>Mã phiếu trả</th><th>Thời gian</th><th>Nhà cung cấp</th><th>Hàng hóa</th><th className="numeric">SL trả (đv gốc)</th><th className="numeric">Giá trị</th><th>Trạng thái</th></tr></thead><tbody>
   {(cases.data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map(c => <tr key={c.id}><td><Link className="code-link" href={`/admin/purchases/returns/${c.id}`}>{c.return_number}</Link></td><td>{formatBusinessDate(c.created_at)}</td><td>{c.supplier_name}</td><td>{c.material_name}{!c.source_receipt_line_id && <small className="table-subline">NCC giao thẳng</small>}</td>
    <td className="numeric">{formatQuantity(c.requested_base_quantity)}</td><td className="numeric">{c.source_value_vnd ? formatVnd(vnd(c.source_value_vnd)) : "—"}</td><td>{status(c)}</td></tr>)}
   {!(cases.data ?? []).length && <tr><td colSpan={7} className="muted">Chưa có phiếu trả hàng nhập.</td></tr>}
  </tbody></table></div><ListPager page={list.page} hasNext={(cases.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} /></section>
  {create && options.length > 0 && <details className="card card-pad"><summary>Trả hàng NCC giao thẳng đã nhận lại từ khách (nhiều bước)</summary><SupplierReturnCreateForm operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:supplier-return-create`} sources={options} /></details>}
 </>;
}
