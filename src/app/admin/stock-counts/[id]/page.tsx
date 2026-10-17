import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { StockCountSheet } from "@/components/inventory/stock-count-sheet";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { stockCountStateLabel, stockCountTone } from "@/modules/inventory/presentation";
import type { SheetRow } from "@/modules/inventory/stock-count-sheet";

type Count = { id: string; warehouse_id: string; count_number: string; state: string; cutoff_at: string; version: number; line_count: number; variance_count: number; approved_at: string | null };
type CountLine = { material_id: string; expected_base_quantity: string; counted_base_quantity: string; reason: string | null; adjustment_unit_cost_vnd: string | null };
type Position = { material_id: string; on_hand_base_quantity: string; average_cost_vnd_per_base: string | null };
type Material = { id: string; code: string; name: string; base_uom_id: string };

/**
 * Count sheet page (FB2 Đợt 5): an open count lists every material with stock in the warehouse, with its book quantity,
 * ready for counts; closed counts show what was counted.
 */
export default async function StockCountDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("inventory.read");
  const { id } = await params;
  const can = { count: access.permissions.has("inventory.count"), approve: access.permissions.has("inventory.adjust"), cost: access.permissions.has("inventory.cost.read") };
  const supabase = await createServerSupabase();
  const countResult = await supabase.from("stock_count_read").select("id, warehouse_id, count_number, state, cutoff_at, version, line_count, variance_count, approved_at").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (!countResult.data) notFound();
  const count = countResult.data as Count;
  const open = count.state === "OPEN";
  const none = Promise.resolve({ data: [] as never[] });
  const [lineResult, positionResult, warehouseResult, unitResult, activeResult] = await Promise.all([
    supabase.from("stock_count_line_read").select("material_id, expected_base_quantity, counted_base_quantity, reason, adjustment_unit_cost_vnd").eq("stock_count_id", id).limit(2000),
    supabase.from("warehouse_inventory_read").select("material_id, on_hand_base_quantity, average_cost_vnd_per_base").eq("branch_id", access.branchId).eq("warehouse_id", count.warehouse_id).limit(2000),
    supabase.from("warehouses").select("id, name").eq("id", count.warehouse_id).maybeSingle(),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
    open && can.count ? supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).order("code").limit(2000) : none,
  ]);
  const lines = (lineResult.data ?? []) as CountLine[];
  const positions = ((positionResult.data ?? []) as Position[]);
  const stocked = open ? positions.filter((row) => Number(row.on_hand_base_quantity) !== 0) : [];
  const ids = [...new Set([...lines.map((line) => line.material_id), ...stocked.map((row) => row.material_id)])];
  const materialResult = ids.length ? await supabase.from("materials").select("id, code, name, base_uom_id").in("id", ids).limit(2000) : { data: [] };
  const materials = new Map(((materialResult.data ?? []) as Material[]).map((row) => [row.id, row]));
  const units = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  const position = new Map(positions.map((row) => [row.material_id, row]));
  const symbol = (material?: Material) => (material && units.get(material.base_uom_id)) ?? "đơn vị";

  const rows: SheetRow[] = ids.map((materialId) => {
    const material = materials.get(materialId);
    const line = lines.find((item) => item.material_id === materialId);
    return {
      materialId, code: material?.code ?? "—", name: material?.name ?? "Vật tư đang cập nhật", symbol: symbol(material),
      book: line ? String(line.expected_base_quantity) : String(position.get(materialId)?.on_hand_base_quantity ?? "0"),
      recorded: line ? { counted: String(line.counted_base_quantity), reason: line.reason, unitCost: line.adjustment_unit_cost_vnd == null ? null : String(line.adjustment_unit_cost_vnd) } : null,
      averageCost: can.cost ? position.get(materialId)?.average_cost_vnd_per_base ?? null : null,
    };
  }).sort((left, right) => left.code.localeCompare(right.code, "vi"));
  const extraMaterials = ((activeResult.data ?? []) as Material[]).filter((row) => !ids.includes(row.id)).map((row) => ({ id: row.id, code: row.code, name: row.name, symbol: symbol(row) }));
  const query = await searchParams;

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Phiếu kiểm kho</p><h1>{count.count_number}</h1>
      <p className="lede">{warehouseResult.data?.name ?? "Kho"} · chốt sổ lúc {formatBusinessDateTime(count.cutoff_at)}{count.approved_at && ` · cân bằng lúc ${formatBusinessDateTime(count.approved_at)}`}</p></div>
      <div className="action-cluster"><StatusBadge tone={stockCountTone(count.state)}>{stockCountStateLabel(count.state)}</StatusBadge><ButtonLink href="/admin/stock-counts" variant="secondary">Về danh sách</ButtonLink></div>
    </header>
    <ActionNotice notice={query.notice} error={query.error} />
    {open && <p className="card-scope-note">Nhập số thực tế theo đơn vị cơ sở. Vật tư chưa đếm không bị điều chỉnh. Nếu kho có nhập/xuất sau lúc chốt sổ, dòng của vật tư đó phải kiểm lại ở phiếu mới.</p>}
    {count.state === "CANCELLED" && <p className="card-scope-note">Phiếu đã hủy, tồn kho không thay đổi. Số đã đếm dưới đây chỉ để tra cứu.</p>}
    {count.state === "APPROVED" && <p className="card-scope-note">Đã cân bằng kho theo các dòng dưới đây. Mọi điều chỉnh tiếp theo phải qua phiếu kiểm mới.</p>}
    <StockCountSheet countId={count.id} version={count.version} open={open} rows={rows} extraMaterials={extraMaterials} can={can} />
  </div>;
}
