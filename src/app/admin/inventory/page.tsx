import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { inventoryMovementLabel } from "@/modules/inventory/presentation";
import { saveInventoryThresholdAction } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Query = { warehouse?: string; material?: string; q?: string; notice?: string; error?: string };
type Position = { warehouse_id: string; material_id: string; base_uom_id: string; on_hand_base_quantity: string; reserved_base_quantity: string; available_base_quantity: string; inventory_value_vnd: string | null; average_cost_vnd_per_base: string | null };
type Movement = { id: string; material_id: string; warehouse_id: string | null; delivery_id: string | null; movement_type: string; base_quantity_delta: string; inventory_value_delta_vnd: string | null; occurred_at: string };
type Threshold = { id: string; warehouse_id: string; material_id: string; threshold_base_quantity: string; active: boolean; version: number };
type Alert = { threshold_id: string; warehouse_id: string; warehouse_name: string; material_id: string; material_name: string; base_uom_symbol: string; threshold_base_quantity: string; on_hand_base_quantity: string; reserved_base_quantity: string; available_base_quantity: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("inventory.read");
  const supabase = await createServerSupabase();
  const query = await searchParams;
  const warehouseId = UUID.test(query.warehouse ?? "") ? query.warehouse! : null;
  const materialId = UUID.test(query.material ?? "") ? query.material! : null;
  const term = query.q?.trim() ?? "";

  let materialRequest = supabase.from("materials").select("id, name, base_uom_id").eq("active", true).order("name").limit(300);
  if (materialId) materialRequest = materialRequest.eq("id", materialId);
  else if (term) materialRequest = materialRequest.ilike("name", `%${term.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);

  const [warehouseResult, materialResult, uomResult] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(200),
    materialRequest,
    supabase.from("units_of_measure").select("id, symbol").limit(200),
  ]);
  const materialIds = (materialResult.data ?? []).map((row) => row.id);

  let positionRequest = supabase.from("warehouse_inventory_read").select("warehouse_id, material_id, base_uom_id, on_hand_base_quantity, reserved_base_quantity, available_base_quantity, inventory_value_vnd, average_cost_vnd_per_base").eq("branch_id", access.branchId).order("warehouse_id").order("material_id").limit(200);
  let movementRequest = supabase.from("inventory_movement_read").select("id, material_id, warehouse_id, delivery_id, movement_type, base_quantity_delta, inventory_value_delta_vnd, occurred_at").eq("branch_id", access.branchId).order("occurred_at", { ascending: false }).limit(30);
  let alertRequest = supabase.from("low_stock_alert_read").select("threshold_id, warehouse_id, warehouse_name, material_id, material_name, base_uom_symbol, threshold_base_quantity, on_hand_base_quantity, reserved_base_quantity, available_base_quantity").eq("branch_id", access.branchId).order("available_base_quantity").limit(100);
  let thresholdRequest = supabase.from("inventory_stock_thresholds").select("id, warehouse_id, material_id, threshold_base_quantity, active, version").eq("branch_id", access.branchId).order("updated_at", { ascending: false }).limit(100);

  if (warehouseId) {
    positionRequest = positionRequest.eq("warehouse_id", warehouseId);
    movementRequest = movementRequest.eq("warehouse_id", warehouseId);
    alertRequest = alertRequest.eq("warehouse_id", warehouseId);
    thresholdRequest = thresholdRequest.eq("warehouse_id", warehouseId);
  }
  if (materialId) {
    positionRequest = positionRequest.eq("material_id", materialId);
    movementRequest = movementRequest.eq("material_id", materialId);
    alertRequest = alertRequest.eq("material_id", materialId);
    thresholdRequest = thresholdRequest.eq("material_id", materialId);
  } else if (term && materialIds.length) {
    positionRequest = positionRequest.in("material_id", materialIds);
    movementRequest = movementRequest.in("material_id", materialIds);
    alertRequest = alertRequest.in("material_id", materialIds);
    thresholdRequest = thresholdRequest.in("material_id", materialIds);
  }

  const emptySearch = Boolean(term && !materialIds.length);
  const [positionResult, movementResult, alertResult, thresholdResult] = emptySearch
    ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([positionRequest, movementRequest, alertRequest, thresholdRequest]);

  const warehouses = new Map((warehouseResult.data ?? []).map((row) => [row.id, row.name]));
  const materials = new Map((materialResult.data ?? []).map((row) => [row.id, row.name]));
  const symbols = new Map((uomResult.data ?? []).map((row) => [row.id, row.symbol]));
  const positions = (positionResult.data ?? []) as Position[];
  const movements = (movementResult.data ?? []) as Movement[];
  const alerts = (alertResult.data ?? []) as Alert[];
  const thresholds = (thresholdResult.data ?? []) as Threshold[];
  const canAdjust = access.permissions.has("inventory.adjust");
  const canCreatePurchase = access.permissions.has("purchasing.create");
  const filterContextKey = JSON.stringify([warehouseId, materialId, term]);
  const clearMaterialParams = new URLSearchParams();
  if (warehouseId) clearMaterialParams.set("warehouse", warehouseId);
  if (term) clearMaterialParams.set("q", term);
  const clearMaterialHref = `/admin/inventory${clearMaterialParams.size ? `?${clearMaterialParams}` : ""}`;

  return <>
    <header className="page-heading"><div><p className="eyebrow">Kho & custody</p><h1>Tồn kho</h1><p className="lede">Số dư được suy ra từ movement ledger; reservation chỉ giảm khả dụng, không giảm on-hand.</p></div><div className="form-actions">{access.permissions.has("roles.manage") && <ButtonLink href="/admin/inventory/warehouses" variant="secondary">Quản lý kho</ButtonLink>}<ButtonLink href="/admin/stock-counts" variant="secondary">Kiểm kho</ButtonLink></div></header>
    {query.notice === "threshold-saved" && <p className="form-message success" role="status">Đã lưu ngưỡng cảnh báo.</p>}
    {query.error && <p className="form-message" role="alert">Không thể lưu ngưỡng. Kiểm tra kho, vật tư và số lượng rồi thử lại.</p>}
    <form key={filterContextKey} className="card filter-bar" method="get">{materialId && <input type="hidden" name="material" value={materialId} />}<label>Kho<select name="warehouse" defaultValue={warehouseId ?? ""}><option value="">Tất cả kho</option>{[...warehouses].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Tìm vật tư<input name="q" defaultValue={term} placeholder="Tên vật tư" /></label><button className="button button-secondary" type="submit">Lọc</button></form>
    {materialId && <p className="card-scope-note">Vật tư đang lọc: {materials.get(materialId) ?? "Vật tư đã chọn"} · <Link className="code-link" href={clearMaterialHref}>Xóa lọc vật tư</Link></p>}

    <section className="card" id="low-stock-alerts"><div className="section-head"><div><p className="eyebrow">Cảnh báo trong ứng dụng</p><h2>Tồn khả dụng dưới ngưỡng</h2></div><StatusBadge tone={alerts.length ? "warning" : "success"}>{alerts.length} cảnh báo</StatusBadge></div>{alerts.length ? <ul className="rank-list">{alerts.map((alert) => <li key={alert.threshold_id}><span><strong>{alert.material_name} · {alert.warehouse_name}</strong><small>Khả dụng {alert.available_base_quantity} / ngưỡng {alert.threshold_base_quantity} {alert.base_uom_symbol}</small></span><span className="inline-actions"><Link className="code-link" href={`/admin/inventory?warehouse=${alert.warehouse_id}&material=${alert.material_id}`}>Xem tồn kho</Link>{canCreatePurchase && <Link className="code-link" href={`/admin/purchase-orders/new?warehouse=${alert.warehouse_id}&material=${alert.material_id}`}>Tạo nháp PO</Link>}</span></li>)}</ul> : <p className="empty-inline">Không có vật tư nào dưới ngưỡng trong phạm vi đang lọc.</p>}<p className="card-scope-note">Cảnh báo được dedupe theo kho và vật tư. Hệ thống không tự đặt hàng.</p></section>

    {canAdjust && <section className="card card-pad"><div className="section-head flush"><div><p className="eyebrow">Cấu hình</p><h2>Ngưỡng theo kho và vật tư</h2></div><span className="scope-chip">Đơn vị cơ sở</span></div><form key={`${warehouseId ?? ""}:${materialId ?? ""}`} action={saveInventoryThresholdAction} className="form-grid"><label className="field">Kho<select name="warehouseId" required defaultValue={warehouseId ?? ""}><option value="" disabled>Chọn kho</option>{[...warehouses].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="field">Vật tư<select name="materialId" required defaultValue={materialId ?? ""}><option value="" disabled>Chọn vật tư</option>{[...materials].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="field">Ngưỡng khả dụng<input name="threshold" inputMode="decimal" pattern="\d+(?:\.\d{1,6})?" required /></label><label className="field">Trạng thái<select name="active" defaultValue="true"><option value="true">Bật cảnh báo</option><option value="false">Tắt cảnh báo</option></select></label><div className="form-actions"><button className="button button-primary" type="submit">Lưu ngưỡng</button></div></form>{thresholds.length > 0 && <div className="table-wrap"><table><thead><tr><th>Kho</th><th>Vật tư</th><th>Ngưỡng</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead><tbody>{thresholds.map((row) => <tr key={row.id}><td>{warehouses.get(row.warehouse_id) ?? row.warehouse_id}</td><td>{materials.get(row.material_id) ?? row.material_id}</td><td>{row.threshold_base_quantity}</td><td>{row.active ? "Đang bật" : "Đã tắt"}</td><td><form action={saveInventoryThresholdAction} className="inline-actions"><input type="hidden" name="warehouseId" value={row.warehouse_id} /><input type="hidden" name="materialId" value={row.material_id} /><input name="threshold" defaultValue={row.threshold_base_quantity} inputMode="decimal" pattern="\d+(?:\.\d{1,6})?" aria-label="Ngưỡng mới" required /><select name="active" defaultValue={String(row.active)} aria-label="Trạng thái"><option value="true">Bật</option><option value="false">Tắt</option></select><button className="button button-secondary" type="submit">Lưu</button></form></td></tr>)}</tbody></table></div>}</section>}

    <section className="card"><div className="section-head"><h2>Vị trí kho</h2><StatusBadge tone="info">{positions.length} dòng</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Kho</th><th>Vật tư</th><th>On-hand</th><th>Đã giữ</th><th>Khả dụng</th><th>Giá trị / MWA</th></tr></thead><tbody>{positions.map((row) => <tr key={`${row.warehouse_id}-${row.material_id}`}><td>{warehouses.get(row.warehouse_id)}</td><td>{materials.get(row.material_id)}</td><td className="mono">{row.on_hand_base_quantity} {symbols.get(row.base_uom_id)}</td><td className="mono">{row.reserved_base_quantity}</td><td><strong className="mono">{row.available_base_quantity}</strong></td><td>{row.inventory_value_vnd == null ? "Ẩn theo quyền" : <span className="mono">{row.inventory_value_vnd} ₫ · {row.average_cost_vnd_per_base} ₫/base</span>}</td></tr>)}</tbody></table>{positions.length === 0 && <p className="empty-inline">Chưa có movement phù hợp bộ lọc.</p>}</div></section>
    <section className="card inventory-ledger"><div className="section-head"><h2>Movement gần nhất</h2><span className="muted">Append-only · tối đa 30 dòng</span></div><div className="table-wrap"><table><thead><tr><th>Thời điểm</th><th>Loại</th><th>Vật tư</th><th>Vị trí</th><th>Delta</th><th>Nguồn</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.occurred_at))}</td><td>{inventoryMovementLabel(row.movement_type)}</td><td>{materials.get(row.material_id) ?? row.material_id}</td><td>{row.warehouse_id ? warehouses.get(row.warehouse_id) : "Đang giao"}</td><td className="mono">{row.base_quantity_delta}</td><td>{row.delivery_id ? <Link className="code-link" href={`/admin/deliveries/${row.delivery_id}`}>Phiếu giao</Link> : "Chứng từ kho"}</td></tr>)}</tbody></table></div></section>
  </>;
}
