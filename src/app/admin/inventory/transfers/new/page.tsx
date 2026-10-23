import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatQuantity } from "@/lib/core/quantity";
import type { EditorMaterial } from "@/components/documents/editor/types";
import { TransferCreateForm } from "@/modules/inventory/transfer-create-form";

type Conversion = { material_id: string | null; from_uom_id: string; to_uom_id: string; numerator: string; denominator: string };

/** FB10 (5.2): "Tạo phiếu chuyển hàng" — several lines, units of each material, ship at once. */
export default async function NewTransferPage() {
 const access = await requireInternalPermission("inventory.reserve"), db = await createServerSupabase();
 const [warehouses, materials, units, conversions, stock, groups] = await Promise.all([
  db.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(200),
  db.from("materials").select("id, code, name, base_uom_id, group_id").eq("active", true).order("name").limit(1000),
  db.from("units_of_measure").select("id, symbol").limit(1000),
  db.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id, numerator::text, denominator::text").eq("active", true).limit(5000),
  db.from("warehouse_inventory_read").select("warehouse_id, material_id, available_base_quantity").eq("branch_id", access.branchId).limit(10000),
  db.from("material_groups").select("id, name").limit(500),
 ]);
 if (warehouses.error || materials.error) throw new Error("Không thể tải kho và hàng hóa.");
 const symbol = new Map((units.data ?? []).map(unit => [unit.id, unit.symbol]));
 const groupName = new Map((groups.data ?? []).map(group => [group.id, group.name]));
 const rows = (conversions.data ?? []) as unknown as Conversion[];
 const editorMaterials: EditorMaterial[] = (materials.data ?? []).map(material => {
  const extra = rows.filter(row => row.to_uom_id === material.base_uom_id && (row.material_id === material.id || row.material_id === null) && row.from_uom_id !== material.base_uom_id);
  const seen = new Set<string>();
  const uoms = [{ id: material.base_uom_id, symbol: symbol.get(material.base_uom_id) ?? "đơn vị", ratio: { numerator: "1", denominator: "1" } },
   ...extra.filter(row => !seen.has(row.from_uom_id) && seen.add(row.from_uom_id)).map(row => ({ id: row.from_uom_id, symbol: symbol.get(row.from_uom_id) ?? "đơn vị", ratio: { numerator: row.numerator, denominator: row.denominator } }))];
  return { id: material.id, code: material.code, name: material.name, uoms, group: groupName.get(material.group_id) };
 });
 const baseSymbol = new Map((materials.data ?? []).map(material => [material.id, symbol.get(material.base_uom_id) ?? ""]));
 const available = Object.fromEntries((stock.data ?? []).map(row => [`${row.warehouse_id}:${row.material_id}`, `${formatQuantity(row.available_base_quantity)} ${baseSymbol.get(row.material_id) ?? ""}`.trim()]));
 return <><header className="page-heading"><div><p className="eyebrow"><Link href="/admin/inventory/transfers">Chuyển kho</Link></p><h1>Tạo phiếu chuyển hàng</h1>
  <p className="lede">Chọn kho chuyển, kho nhận, thêm hàng (F3) và số lượng theo đơn vị quen dùng. Bỏ chọn “Xuất kho ngay” nếu hàng chưa đi.</p></div></header>
  {(warehouses.data ?? []).length < 2 ? <p className="form-message">Cần ít nhất hai kho đang dùng để chuyển hàng.</p>
   : <TransferCreateForm warehouses={(warehouses.data ?? []).map(item => ({ id: item.id, label: item.name }))} materials={editorMaterials} operationId={randomUUID()} stock={available} />}
 </>;
}
