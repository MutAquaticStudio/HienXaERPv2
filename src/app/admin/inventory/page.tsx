import Decimal from "decimal.js";
import Link from "next/link";
import { ThresholdButton, type ThresholdSetting } from "@/components/inventory/threshold-button";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { inventoryMovementLabel } from "@/modules/inventory/presentation";
import { inUnit, largestUnit, stockCard, type CardMovement, type DisplayUnit } from "@/modules/inventory/stock-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOCK = ["in", "out", "low"] as const;
/** Materials read for one view; the list is filtered and paged on the server from these. */
const MATERIAL_LIMIT = 3000;

type Query = { q?: string; warehouse?: string; group?: string; stock?: string; unit?: string; page?: string; card?: string; material?: string; notice?: string; error?: string };
type Material = { id: string; code: string; name: string; group_id: string; base_uom_id: string };
type Position = { warehouse_id: string; material_id: string; on_hand_base_quantity: string; reserved_base_quantity: string; available_base_quantity: string; promised_base_quantity?: string; inventory_value_vnd: string | null };
type Threshold = { warehouse_id: string; material_id: string; threshold_base_quantity: string; active: boolean };
type Alert = { warehouse_id: string; material_id: string };
type Conversion = { material_id: string | null; from_uom_id: string; to_uom_id: string; numerator: string; denominator: string };
type Movement = CardMovement & { movement_type: string; delivery_id: string | null };

const zero = new Decimal(0);
const sum = (rows: Position[], key: "on_hand_base_quantity" | "reserved_base_quantity" | "available_base_quantity" | "promised_base_quantity") => rows.reduce((total, row) => total.plus(row[key] ?? 0), zero);

/**
 * Inventory (FB2 Đợt 5, KiotViet style): one row per material with on hand, held for orders, available to sell and value,
 * filtered by warehouse, group and stock state. A row opens its stock card (movements with the balance after each) and
 * per-warehouse stock; low-stock thresholds are edited in a popup. Balances are never edited here (UX-360).
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("inventory.read");
  const query = await searchParams;
  const list = parseCoreListQuery({ q: query.q, page: query.page });
  const warehouseId = UUID.test(query.warehouse ?? "") ? query.warehouse! : "";
  const group = UUID.test(query.group ?? "") ? query.group! : "";
  const stockFilter = (STOCK as readonly string[]).includes(query.stock ?? "") ? query.stock! : "";
  const largeUnit = query.unit === "large";
  const only = UUID.test(query.material ?? "") ? query.material! : "";
  const cardId = UUID.test(query.card ?? "") ? query.card! : only;
  const can = { adjust: access.permissions.has("inventory.adjust"), cost: access.permissions.has("inventory.cost.read"), purchase: access.permissions.has("purchasing.create"), count: access.permissions.has("inventory.count") };
  const supabase = await createServerSupabase();

  let materialRequest = supabase.from("materials").select("id, code, name, group_id, base_uom_id").eq("active", true);
  if (only) materialRequest = materialRequest.eq("id", only);
  if (list.q) materialRequest = materialRequest.or(`code.ilike.${ilikePattern(list.q)},name.ilike.${ilikePattern(list.q)}`);
  if (group) materialRequest = materialRequest.eq("group_id", group);
  let positionRequest = supabase.from("warehouse_inventory_read").select(`warehouse_id, material_id, on_hand_base_quantity, reserved_base_quantity, available_base_quantity${can.cost ? ", inventory_value_vnd" : ""}`).eq("branch_id", access.branchId);
  let thresholdRequest = supabase.from("inventory_stock_thresholds").select("warehouse_id, material_id, threshold_base_quantity, active").eq("branch_id", access.branchId);
  let alertRequest = supabase.from("low_stock_alert_read").select("warehouse_id, material_id").eq("branch_id", access.branchId);
  if (warehouseId) {
    positionRequest = positionRequest.eq("warehouse_id", warehouseId);
    thresholdRequest = thresholdRequest.eq("warehouse_id", warehouseId);
    alertRequest = alertRequest.eq("warehouse_id", warehouseId);
  }
  const [materialResult, positionResult, thresholdResult, alertResult, warehouseResult, groupResult, unitResult, promisedResult] = await Promise.all([
    materialRequest.order("name").order("id").limit(MATERIAL_LIMIT),
    positionRequest.limit(10000),
    thresholdRequest.limit(5000),
    alertRequest.limit(5000),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(200),
    supabase.from("material_groups").select("id, name").order("name").limit(500),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
    supabase.rpc("warehouse_stock_promised", { target_branch_id: access.branchId }),
  ]);
  if (materialResult.error || positionResult.error || warehouseResult.error) throw new Error("Không thể tải tồn kho.");
  // FB10 (5.1): "Có thể bán" = tồn − chờ xuất giao − đã hứa cho đơn chưa lập phiếu giao (the figure automatic sourcing uses).
  const promised = new Map(((promisedResult.data ?? []) as { warehouse_id: string; material_id: string; promised_base_quantity: string }[]).map((row) => [`${row.warehouse_id}:${row.material_id}`, row.promised_base_quantity]));
  const positions = ((positionResult.data ?? []) as unknown as Position[]).map((row) => {
    const held = promised.get(`${row.warehouse_id}:${row.material_id}`) ?? "0";
    return { ...row, promised_base_quantity: held, available_base_quantity: new Decimal(row.available_base_quantity).minus(held).toFixed() };
  });
  const thresholds = (thresholdResult.data ?? []) as Threshold[];
  const alerts = (alertResult.data ?? []) as Alert[];
  const warehouses = (warehouseResult.data ?? []) as { id: string; name: string }[];
  const warehouseName = new Map(warehouses.map((row) => [row.id, row.name]));
  const groups = new Map((groupResult.data ?? []).map((row) => [row.id, row.name]));
  const symbols = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  const lowIds = new Set(alerts.map((row) => row.material_id));
  const byMaterial = new Map<string, Position[]>();
  for (const row of positions) byMaterial.set(row.material_id, [...(byMaterial.get(row.material_id) ?? []), row]);
  const onHandOf = (materialId: string) => sum(byMaterial.get(materialId) ?? [], "on_hand_base_quantity");

  const materials = (materialResult.data ?? []) as Material[];
  const inScope = materials.filter((material) => stockFilter === "in" ? onHandOf(material.id).gt(0)
    : stockFilter === "out" ? onHandOf(material.id).lte(0) : stockFilter === "low" ? lowIds.has(material.id) : true);
  const pageRows = inScope.slice(list.from, list.to + 1);
  const pageIds = pageRows.map((row) => row.id);
  const none = Promise.resolve({ data: [] as never[] });
  const [conversionResult, movementResult] = await Promise.all([
    largeUnit && pageIds.length ? supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id, numerator::text, denominator::text").eq("active", true).in("material_id", pageIds).limit(2000) : none,
    cardId ? (() => {
      let request = supabase.from("inventory_movement_read").select("id, location_kind, warehouse_id, delivery_id, movement_type, base_quantity_delta, occurred_at").eq("branch_id", access.branchId).eq("material_id", cardId);
      if (warehouseId) request = request.eq("warehouse_id", warehouseId);
      return request.order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(50);
    })() : none,
  ]);
  const conversions = (conversionResult.data ?? []) as unknown as Conversion[];
  const card = cardId ? stockCard((movementResult.data ?? []) as Movement[], onHandOf(cardId).toFixed()) : [];

  // KPIs over every material in the warehouse/group/search scope, not only this page.
  const scoped = materials.flatMap((material) => byMaterial.get(material.id) ?? []);
  const inStock = materials.filter((material) => onHandOf(material.id).gt(0)).length;
  const valued = can.cost && scoped.every((row) => row.inventory_value_vnd != null);
  const totalValue = valued ? scoped.reduce((total, row) => total + BigInt(row.inventory_value_vnd ?? "0"), 0n) : null;

  const params = { q: list.q || undefined, warehouse: warehouseId || undefined, group: group || undefined, stock: stockFilter || undefined, unit: largeUnit ? "large" : undefined, material: only || undefined };
  const href = (patch: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, page: list.page > 1 ? String(list.page) : undefined, ...patch })) if (value) search.set(key, value);
    return `/admin/inventory${search.size ? `?${search}` : ""}`;
  };
  const back = href({ card: cardId || undefined });
  const filtered = Boolean(list.q || warehouseId || group || stockFilter || only);
  const columns = 6 + (can.cost ? 1 : 0);

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Kho hàng</p><h1>Tồn kho</h1><p className="lede">Có thể bán = Tồn kho − Chờ xuất giao (đã lên phiếu giao, chưa lấy lên xe) − Đã hứa cho đơn (đơn đã xác nhận lấy từ kho, chưa lập phiếu giao). Bấm một dòng để xem thẻ kho.</p></div>
      <div className="action-cluster">
        <Link className="button button-secondary" href="/admin/inventory/transfers">Chuyển kho</Link>
        <Link className={`button ${can.count ? "button-primary" : "button-secondary"}`} href="/admin/stock-counts">Kiểm kho</Link>
        {access.permissions.has("roles.manage") && <Link className="button button-secondary" href="/admin/inventory/warehouses">Quản lý kho</Link>}
      </div>
    </header>
    {query.notice === "threshold-saved" && <p className="form-message success" role="status">Đã lưu ngưỡng cảnh báo.</p>}
    {query.error && <p className="form-message" role="alert">Không thể lưu ngưỡng. Kiểm tra kho, vật tư và số lượng rồi thử lại.</p>}
    <section className="metric-grid" aria-label="Tổng quan tồn kho">
      <Link className="card metric-card metric-link" href={href({ stock: "in", page: undefined, card: undefined })}><span className="metric-label">Vật tư còn hàng</span><strong className="metric-value">{inStock}</strong></Link>
      <Link className="card metric-card metric-link" href={href({ stock: "out", page: undefined, card: undefined })}><span className="metric-label">Hết hàng</span><strong className="metric-value">{materials.length - inStock}</strong></Link>
      <Link className="card metric-card metric-link" href={href({ stock: "low", page: undefined, card: undefined })}><span className="metric-label">Dưới ngưỡng</span><strong className={`metric-value${lowIds.size ? " text-danger" : ""}`}>{lowIds.size}</strong></Link>
      <article className="card metric-card"><span className="metric-label">Giá trị tồn</span><strong className="metric-value">{totalValue === null ? "—" : formatVnd(vnd(totalValue))}</strong></article>
    </section>
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc tồn kho">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã hoặc tên vật tư" /></label>
        <label>Kho<select name="warehouse" defaultValue={warehouseId}><option value="">Tất cả kho</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Nhóm vật tư<select name="group" defaultValue={group}><option value="">Tất cả</option>{[...groups].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Tồn kho<select name="stock" defaultValue={stockFilter}><option value="">Tất cả</option><option value="in">Còn hàng</option><option value="out">Hết hàng</option><option value="low">Dưới ngưỡng</option></select></label>
        <label>Hiển thị theo<select name="unit" defaultValue={largeUnit ? "large" : ""}><option value="">Đơn vị cơ sở</option><option value="large">Đơn vị lớn nhất (tấn, bao…)</option></select></label>
        {only && <input type="hidden" name="material" value={only} />}
        {filtered && <Link className="code-link" href="/admin/inventory">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{inScope.length} vật tư</h2><span className="scope-chip">{warehouseId ? warehouseName.get(warehouseId) ?? "Kho" : "Tất cả kho"}</span></div>
        {materials.length >= MATERIAL_LIMIT && <p className="card-scope-note">Đang xem {MATERIAL_LIMIT} vật tư đầu tiên; thu hẹp bằng tìm kiếm hoặc nhóm.</p>}
        <div className="table-wrap"><table className="row-link-table inventory-table">
          <thead><tr><th scope="col">Vật tư</th><th scope="col" className="numeric">Tồn kho</th><th scope="col" className="numeric" title="Đã lên phiếu giao, chưa lấy lên xe">Chờ xuất giao</th><th scope="col" className="numeric" title="Đơn đã xác nhận lấy từ kho, chưa lập phiếu giao">Đã hứa cho đơn</th><th scope="col" className="numeric">Có thể bán</th>
            {can.cost && <th scope="col" className="numeric">Giá trị tồn</th>}<th scope="col">Ngưỡng</th></tr></thead>
          <tbody>{pageRows.map((material) => {
            const rows = byMaterial.get(material.id) ?? [];
            const symbol = symbols.get(material.base_uom_id) ?? "đơn vị";
            const unit: DisplayUnit | null = largeUnit ? largestUnit(conversions, material.id, material.base_uom_id, symbols) : null;
            const show = (value: Decimal) => unit ? <>{inUnit(value.toFixed(), unit)}<small className="table-subline">{formatQuantity(value.toFixed())} {symbol}</small></> : <>{formatQuantity(value.toFixed())} {symbol}</>;
            const value = can.cost && rows.length && rows.every((row) => row.inventory_value_vnd != null) ? rows.reduce((total, row) => total + BigInt(row.inventory_value_vnd!), 0n) : null;
            const settings: ThresholdSetting[] = thresholds.filter((row) => row.material_id === material.id).map((row) => ({ warehouseId: row.warehouse_id, threshold: String(row.threshold_base_quantity), active: row.active }));
            const low = alerts.filter((row) => row.material_id === material.id);
            const opened = cardId === material.id;
            return [<tr key={material.id} className={opened ? "row-open" : undefined}>
              <td className="row-title" data-label="Vật tư"><Link className="row-link" href={href({ card: opened ? undefined : material.id })} scroll={false} aria-expanded={opened}><strong>{material.name}</strong></Link><small className="table-subline"><span className="mono">{material.code}</span> · {groups.get(material.group_id) ?? "Chưa phân nhóm"}</small></td>
              <td className="numeric mono" data-label="Tồn kho">{show(sum(rows, "on_hand_base_quantity"))}</td>
              <td className="numeric mono" data-label="Chờ xuất giao">{show(sum(rows, "reserved_base_quantity"))}</td>
              <td className="numeric mono" data-label="Đã hứa cho đơn">{show(sum(rows, "promised_base_quantity"))}</td>
              <td className="numeric mono" data-label="Có thể bán"><strong>{show(sum(rows, "available_base_quantity"))}</strong></td>
              {can.cost && <td className="numeric mono" data-label="Giá trị tồn">{value === null ? "—" : formatVnd(vnd(value))}</td>}
              <td className="table-actions" data-label="Ngưỡng"><div className="inventory-threshold">{low.length ? <StatusBadge tone="warning">Dưới ngưỡng{warehouseId ? "" : ` · ${low.length} kho`}</StatusBadge>
                : warehouseId && settings[0] ? <span className="muted">{settings[0].active ? `${formatQuantity(settings[0].threshold)} ${symbol}` : "Đã tắt"}</span> : <span className="muted">—</span>}
                {can.adjust && warehouses.length > 0 && <ThresholdButton material={{ id: material.id, name: material.name, symbol }} warehouses={warehouses} settings={settings} defaultWarehouseId={warehouseId || undefined} back={back} />}
                {low.length > 0 && can.purchase && <Link className="code-link" href={`/admin/purchase-orders/new?warehouse=${low[0].warehouse_id}&material=${material.id}`}>Đặt mua</Link>}
              </div></td>
            </tr>,
            opened && <tr key={`${material.id}-card`} className="row-expansion"><td colSpan={columns}>
              <div className="stock-card">
                <section><h3>Tồn theo kho</h3>{rows.length ? <ul className="clean-list">{rows.map((row) => <li key={row.warehouse_id}><span>{warehouseName.get(row.warehouse_id) ?? "Kho"}</span>
                  <small>Tồn {formatQuantity(row.on_hand_base_quantity)} · chờ xuất giao {formatQuantity(row.reserved_base_quantity)} · đã hứa {formatQuantity(row.promised_base_quantity ?? "0")} · có thể bán {formatQuantity(row.available_base_quantity)} {symbol}</small></li>)}</ul> : <p className="muted">Chưa có tồn ở kho nào.</p>}
                  <Link className="code-link" href={`/admin/products/${material.id}`}>Mở vật tư</Link>{sum(rows, "reserved_base_quantity").gt(0) && <> · <Link className="code-link" href="/admin/dispatch">Xem phiếu giao đang chờ xuất</Link></>}</section>
                <section><h3>Thẻ kho{warehouseId ? ` · ${warehouseName.get(warehouseId) ?? "Kho"}` : ""}</h3>{card.length ? <div className="table-wrap"><table>
                  <thead><tr><th scope="col">Thời điểm</th><th scope="col">Loại</th>{!warehouseId && <th scope="col">Vị trí</th>}<th scope="col" className="numeric">Nhập / xuất</th><th scope="col" className="numeric">Tồn sau</th><th scope="col">Chứng từ</th></tr></thead>
                  <tbody>{card.map((row) => <tr key={row.id}>
                    <td data-label="Thời điểm">{formatBusinessDateTime(row.occurred_at)}</td>
                    <td data-label="Loại">{inventoryMovementLabel(row.movement_type)}</td>
                    {!warehouseId && <td data-label="Vị trí">{row.warehouse_id ? warehouseName.get(row.warehouse_id) ?? "Kho" : "Đang giao"}</td>}
                    <td className={`numeric mono${new Decimal(row.base_quantity_delta).gt(0) ? " text-success" : ""}`} data-label="Nhập / xuất">{new Decimal(row.base_quantity_delta).gt(0) ? "+" : ""}{formatQuantity(row.base_quantity_delta)}</td>
                    <td className="numeric mono" data-label="Tồn sau">{row.balanceAfter === null ? "—" : formatQuantity(row.balanceAfter)}</td>
                    <td data-label="Chứng từ">{row.delivery_id ? <Link className="code-link" href={`/admin/deliveries/${row.delivery_id}`}>Phiếu giao</Link> : "Chứng từ kho"}</td>
                  </tr>)}</tbody>
                </table></div> : <p className="muted">Chưa có phát sinh kho.</p>}
                  {card.length === 50 && <p className="card-scope-note">50 phát sinh gần nhất.</p>}</section>
              </div>
            </td></tr>,
            ];
          })}</tbody>
        </table>{!pageRows.length && <p className="empty-inline">{filtered ? "Không có vật tư phù hợp bộ lọc." : "Chưa có vật tư đang dùng."}</p>}</div>
        <ListPager page={list.page} total={inScope.length} params={params} />
      </section>
    </div>
  </div>;
}
