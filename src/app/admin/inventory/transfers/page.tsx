import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { quickTransferStepAction } from "@/modules/inventory/transfer-actions";
import { transferStatus } from "@/modules/inventory/transfer-presentation";

const NOTICE: Record<string, string> = { created: "Đã tạo phiếu chuyển kho.", shipped: "Đã tạo phiếu và xuất kho. Kho nhận bấm “Nhận đủ” khi hàng tới." };

/** FB10 (5.2): KiotViet-style transfer list — blue codes, from → to, goods with units, status, one-tap next step. */
export default async function WarehouseTransfersPage({ searchParams }: { searchParams: Promise<{ page?: string; notice?: string }> }) {
 const access = await requireInternalPermission("inventory.read"), db = await createServerSupabase(), query = await searchParams, list = parseCoreListQuery(query);
 const manage = access.permissions.has("inventory.reserve"), receive = access.permissions.has("inventory.receive");
 const [transfers, units] = await Promise.all([
  db.from("warehouse_transfer_read").select("id, transfer_number, created_at, from_warehouse_name, to_warehouse_name, material_code, material_name, base_uom_id, planned_base_quantity, shipped_base_quantity, received_base_quantity, in_transit_base_quantity, transfer_state, dispatch_closed").eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  db.from("units_of_measure").select("id, symbol").limit(1000),
 ]);
 if (transfers.error) throw new Error("Không thể tải phiếu chuyển kho.");
 const symbol = new Map((units.data ?? []).map(unit => [unit.id, unit.symbol]));
 const rows = (transfers.data ?? []).slice(0, CORE_LIST_PAGE_SIZE);
 return <><header className="page-heading"><div><p className="eyebrow">Kho hàng</p><h1>Chuyển kho</h1><p className="lede">Chuyển hàng giữa các kho: tạo phiếu (xuất ngay), kho nhận bấm “Nhận đủ” khi hàng tới.</p></div>
   <div className="action-cluster">{manage && <Link className="button button-primary" href="/admin/inventory/transfers/new">+ Chuyển hàng</Link>}<Link className="button button-secondary" href="/admin/inventory">Tồn kho</Link></div></header>
  {query.notice && NOTICE[query.notice] && <p className="form-message success" role="status">{NOTICE[query.notice]}</p>}
  <section className="card"><div className="table-wrap"><table><thead><tr><th>Mã chuyển hàng</th><th>Thời gian</th><th>Từ kho → Tới kho</th><th>Hàng hóa</th><th className="numeric">SL chuyển</th><th className="numeric">Đã nhận</th><th>Trạng thái</th><th /></tr></thead><tbody>{rows.map(item => {
   const unit = symbol.get(item.base_uom_id) ?? "", status = transferStatus(item);
   const canShip = manage && status.step === "DISPATCH_ALL", canReceive = receive && status.step === "RECEIVE_ALL";
   return <tr key={item.id}><td><Link className="code-link" href={`/admin/inventory/transfers/${item.id}`}>{item.transfer_number}</Link></td><td>{formatBusinessDateTime(item.created_at)}</td>
    <td>{item.from_warehouse_name} → {item.to_warehouse_name}</td><td>{item.material_name}<small className="table-subline">{item.material_code}</small></td>
    <td className="numeric">{formatQuantity(item.planned_base_quantity)} {unit}</td><td className="numeric">{formatQuantity(item.received_base_quantity)} {unit}</td>
    <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
    <td>{(canShip || canReceive) && <form action={quickTransferStepAction}><input type="hidden" name="transferId" value={item.id} /><input type="hidden" name="step" value={status.step!} /><input type="hidden" name="operationId" value={randomUUID()} />
     <button className="button button-secondary" type="submit">{canShip ? "Xuất kho" : "Nhận đủ"}</button></form>}</td></tr>;
  })}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có phiếu chuyển kho.</p>}</div><ListPager page={list.page} hasNext={(transfers.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} /></section>
 </>;
}
