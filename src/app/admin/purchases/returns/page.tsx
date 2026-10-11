import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import { SupplierReturnCreateForm } from "@/modules/purchasing/supplier-return-forms";

export default async function SupplierReturnsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
 const access = await requireInternalAccess(), db = await createServerSupabase(), list = parseCoreListQuery(await searchParams);
 if (!["purchasing.read", "inventory.read", "finance.ap.read"].some(p => access.permissions.has(p))) return <p>Không có quyền đọc hồ sơ trả nhà cung cấp.</p>;
 const create = access.permissions.has("purchasing.create");
 const [cases, sources] = await Promise.all([
  db.from("supplier_return_read").select("id, return_number, supplier_name, material_name, requested_base_quantity, physically_returned_base_quantity, supplier_accepted_base_quantity, dispatch_closed").eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  create ? db.from("supplier_return_eligible_source_read").select("source_receipt_line_id, source_fulfillment_line_id, source_return_case_id, source_number, material_name, warehouse_id, source_base_quantity, custody_base_quantity").eq("branch_id", access.branchId).order("source_number", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
 ]);
 if (cases.error || sources.error) throw new Error("Không thể tải hồ sơ trả nhà cung cấp.");
 const options = (sources.data ?? []).map(item => ({ id: `${item.source_receipt_line_id || ""}|${item.source_fulfillment_line_id || ""}|${item.source_return_case_id || ""}`, label: `${item.source_number} · ${item.material_name} · ${item.source_return_case_id ? `giao thẳng / ${item.warehouse_id ? "đã nhận thực về kho" : "trả thẳng NCC"} / còn ${item.custody_base_quantity}` : `nhận kho / nguồn ${item.source_base_quantity}`}` }));
 return <><header className="page-heading"><div><p className="eyebrow">Mua hàng theo nguồn</p><h1>Trả nhà cung cấp</h1><p className="lede">Thực trả, nhà cung cấp chấp nhận, giảm phải trả và hoàn / bù trừ tiền được ghi riêng. Giao thẳng có đường trả trực tiếp tới nhà cung cấp.</p></div><Link className="button button-secondary" href="/admin/purchase-orders">Đơn mua</Link></header>
  {create && <details className="card card-pad"><summary>Mở hồ sơ trả nhà cung cấp</summary><SupplierReturnCreateForm operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:supplier-return-create`} sources={options} /></details>}
  <section className="card"><div className="section-head"><h2>Hồ sơ theo nguồn</h2></div><div className="table-wrap"><table><thead><tr><th>Hồ sơ</th><th>Nhà cung cấp / vật tư</th><th>Dự kiến trả</th><th>Thực trả</th><th>Chấp nhận</th><th>Phần chưa trả</th></tr></thead><tbody>{(cases.data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map(c => <tr key={c.id}><td><Link href={`/admin/purchases/returns/${c.id}`}>{c.return_number}</Link></td><td>{c.supplier_name}<small className="table-subline">{c.material_name}</small></td><td>{c.requested_base_quantity}</td><td>{c.physically_returned_base_quantity}</td><td>{c.supplier_accepted_base_quantity}</td><td>{c.dispatch_closed ? "Đã đóng phần chưa trả" : "Theo lượng thực ghi"}</td></tr>)}</tbody></table></div><ListPager page={list.page} hasNext={(cases.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} /></section>
 </>;
}
