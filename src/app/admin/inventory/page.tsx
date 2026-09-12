import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { inventoryMovementLabel } from "@/modules/inventory/presentation";

type Position = { warehouse_id: string; material_id: string; base_uom_id: string; on_hand_base_quantity: string; reserved_base_quantity: string; available_base_quantity: string; inventory_value_vnd: string | null; average_cost_vnd_per_base: string | null };
type Movement = { id: string; material_id: string; warehouse_id: string | null; delivery_id: string | null; movement_type: string; base_quantity_delta: string; inventory_value_delta_vnd: string | null; occurred_at: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ warehouse?: string; q?: string }> }) {
  const access = await requireInternalPermission("inventory.read");
  const supabase = await createServerSupabase();
  const query = await searchParams;
  const [positionResult, movementResult, warehouseResult, materialResult, uomResult] = await Promise.all([
    supabase.from("warehouse_inventory_read").select("warehouse_id, material_id, base_uom_id, on_hand_base_quantity, reserved_base_quantity, available_base_quantity, inventory_value_vnd, average_cost_vnd_per_base").eq("branch_id", access.branchId),
    supabase.from("inventory_movement_read").select("id, material_id, warehouse_id, delivery_id, movement_type, base_quantity_delta, inventory_value_delta_vnd, occurred_at").eq("branch_id", access.branchId).order("occurred_at", { ascending: false }).limit(30),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
    supabase.from("materials").select("id, name").eq("active", true).order("name"),
    supabase.from("units_of_measure").select("id, symbol"),
  ]);
  const warehouses = new Map((warehouseResult.data ?? []).map((row) => [row.id, row.name]));
  const materials = new Map((materialResult.data ?? []).map((row) => [row.id, row.name]));
  const symbols = new Map((uomResult.data ?? []).map((row) => [row.id, row.symbol]));
  const term = query.q?.trim().toLocaleLowerCase("vi") ?? "";
  const positions = ((positionResult.data ?? []) as Position[]).filter((row) => (!query.warehouse || row.warehouse_id === query.warehouse) && (!term || materials.get(row.material_id)?.toLocaleLowerCase("vi").includes(term)));
  const movements = ((movementResult.data ?? []) as Movement[]).filter((row) => !query.warehouse || row.warehouse_id === query.warehouse);
  return <>
    <header className="page-heading"><div><p className="eyebrow">Kho & custody</p><h1>Tồn kho</h1><p className="lede">Số dư được suy ra từ movement ledger; reservation chỉ giảm khả dụng, không giảm on-hand.</p></div><ButtonLink href="/admin/stock-counts" variant="secondary">Kiểm kho</ButtonLink></header>
    <form className="card filter-bar" method="get"><label>Kho<select name="warehouse" defaultValue={query.warehouse ?? ""}><option value="">Tất cả kho</option>{[...warehouses].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Tìm vật tư<input name="q" defaultValue={query.q ?? ""} placeholder="Tên vật tư" /></label><button className="button button-secondary" type="submit">Lọc</button></form>
    <section className="card"><div className="section-head"><h2>Vị trí kho</h2><StatusBadge tone="info">{positions.length} dòng</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Kho</th><th>Vật tư</th><th>On-hand</th><th>Đã giữ</th><th>Khả dụng</th><th>Giá trị / MWA</th></tr></thead><tbody>{positions.map((row) => <tr key={`${row.warehouse_id}-${row.material_id}`}><td>{warehouses.get(row.warehouse_id)}</td><td>{materials.get(row.material_id)}</td><td className="mono">{row.on_hand_base_quantity} {symbols.get(row.base_uom_id)}</td><td className="mono">{row.reserved_base_quantity}</td><td><strong className="mono">{row.available_base_quantity}</strong></td><td>{row.inventory_value_vnd == null ? "Ẩn theo quyền" : <span className="mono">{row.inventory_value_vnd} ₫ · {row.average_cost_vnd_per_base} ₫/base</span>}</td></tr>)}</tbody></table>{positions.length === 0 && <p className="empty-inline">Chưa có movement phù hợp bộ lọc.</p>}</div></section>
    <section className="card inventory-ledger"><div className="section-head"><h2>Movement gần nhất</h2><span className="muted">Append-only</span></div><div className="table-wrap"><table><thead><tr><th>Thời điểm</th><th>Loại</th><th>Vật tư</th><th>Vị trí</th><th>Delta</th><th>Nguồn</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.occurred_at))}</td><td>{inventoryMovementLabel(row.movement_type)}</td><td>{materials.get(row.material_id)}</td><td>{row.warehouse_id ? warehouses.get(row.warehouse_id) : "Đang giao"}</td><td className="mono">{row.base_quantity_delta}</td><td>{row.delivery_id ? <Link className="code-link" href={`/admin/deliveries/${row.delivery_id}`}>Phiếu giao</Link> : "Chứng từ kho"}</td></tr>)}</tbody></table></div></section>
  </>;
}
