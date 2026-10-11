import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import { CreateTransferForm } from "@/modules/inventory/transfer-forms";

export default async function WarehouseTransfersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
 const access = await requireInternalPermission("inventory.read"), db = await createServerSupabase(), list = parseCoreListQuery(await searchParams);
 const manage = access.permissions.has("inventory.reserve");
 const [transfers, warehouses, materials] = await Promise.all([
  db.from("warehouse_transfer_read").select("id, transfer_number, from_warehouse_name, to_warehouse_name, material_name, shipped_base_quantity, received_base_quantity, in_transit_base_quantity, transfer_state").eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  manage ? db.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(200) : Promise.resolve({ data: [], error: null }),
  manage ? db.from("materials").select("id, code, name").eq("active", true).order("name").limit(300) : Promise.resolve({ data: [], error: null }),
 ]);
 if (transfers.error || warehouses.error || materials.error) throw new Error("Không thể tải phiếu chuyển kho.");
 const rows = (transfers.data ?? []).slice(0, CORE_LIST_PAGE_SIZE);
 return <><header className="page-heading"><div><p className="eyebrow">Kho hàng</p><h1>Chuyển kho</h1><p className="lede">Mỗi phiếu một vật tư giữa hai kho cùng chi nhánh. Xuất, đang chuyển và nhận thực tế giữ cùng nguồn; phần thiếu có hồ sơ riêng.</p></div><Link className="button button-secondary" href="/admin/inventory">Tồn kho</Link></header>
  {manage && <details className="card card-pad"><summary>Mở phiếu chuyển kho</summary><CreateTransferForm operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:transfer-create`} warehouses={(warehouses.data ?? []).map(item => ({ id: item.id, label: item.name }))} materials={(materials.data ?? []).map(item => ({ id: item.id, label: `${item.code} · ${item.name}` }))} /></details>}
  <section className="card"><div className="section-head"><h2>Phiếu chuyển kho</h2></div><div className="table-wrap"><table><thead><tr><th>Phiếu</th><th>Kho đi → kho đến</th><th>Vật tư</th><th>Thực xuất</th><th>Thực nhận</th><th>Đang chuyển</th><th>Trạng thái</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><Link href={`/admin/inventory/transfers/${item.id}`}>{item.transfer_number}</Link></td><td>{item.from_warehouse_name} → {item.to_warehouse_name}</td><td>{item.material_name}</td><td>{item.shipped_base_quantity}</td><td>{item.received_base_quantity}</td><td>{item.in_transit_base_quantity}</td><td>{item.transfer_state === "CLOSED" ? "Đã xử lý hết" : item.transfer_state === "OPEN" ? "Chưa xuất" : "Còn phải xử lý"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có phiếu chuyển kho.</p>}</div><ListPager page={list.page} hasNext={(transfers.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} /></section>
 </>;
}
