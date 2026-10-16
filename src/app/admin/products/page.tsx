import Link from "next/link";
import { MaterialListRows, type MaterialListRow } from "@/components/catalog/material-list-rows";
import { VariantGroupButton } from "@/components/catalog/variant-group-editor";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ListPager } from "@/components/ui/list-pager";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { formatQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { CatalogCreateButton } from "@/modules/catalog/catalog-dialog";
import { catalogCreateProps } from "@/modules/catalog/editor-data";
import { currentDefaultPrice, stockSummary, type ListPosition, type ListPriceRule } from "@/modules/catalog/material-list";
import { variantLabel } from "@/modules/catalog/variants";
import { readPricingClock } from "@/modules/pricing/request-clock";

type MaterialRow = { id: string; code: string; name: string; specification: string | null; group_id: string; base_uom_id: string; sale_enabled: boolean; purchase_enabled: boolean; active: boolean; variant_group_id: string | null; variant_attributes: Record<string, string> | null };
type Query = { q?: string; state?: string; page?: string; group?: string; use?: string; variant?: string };
type VariantGroup = { id: string; name: string; attribute_names: string[]; active: boolean };
type Conversion = { material_id: string | null; from_uom_id: string; to_uom_id: string; numerator: string; denominator: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("catalog.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const group = /^[0-9a-f-]{36}$/i.test(query.group ?? "") ? query.group! : "";
  const use = query.use === "SALE" || query.use === "PURCHASE" ? query.use : "";
  const variant = /^[0-9a-f-]{36}$/i.test(query.variant ?? "") ? query.variant! : "";
  const can = {
    manage: access.permissions.has("catalog.manage"),
    price: access.permissions.has("pricing.read"),
    stock: access.permissions.has("inventory.read"),
    cost: access.permissions.has("inventory.read") && access.permissions.has("inventory.cost.read"),
  };
  const supabase = await createServerSupabase();
  let request = supabase.from("materials").select("id, code, name, specification, group_id, base_uom_id, sale_enabled, purchase_enabled, active, variant_group_id, variant_attributes", { count: "exact" });
  if (list.q) request = request.or(`code.ilike.${ilikePattern(list.q)},name.ilike.${ilikePattern(list.q)}`);
  if (list.state === "ACTIVE") request = request.eq("active", true);
  if (list.state === "INACTIVE") request = request.eq("active", false);
  if (group) request = request.eq("group_id", group);
  if (use === "SALE") request = request.eq("sale_enabled", true);
  if (use === "PURCHASE") request = request.eq("purchase_enabled", true);
  if (variant) request = request.eq("variant_group_id", variant);
  const [materialResult, groupResult, unitResult, variantResult] = await Promise.all([
    request.order("name").order("id").range(list.from, list.to),
    supabase.from("material_groups").select("id, name").order("name").limit(500),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
    supabase.from("material_variant_groups").select("id, name, attribute_names, active").order("name").limit(500),
  ]);
  if (materialResult.error || groupResult.error || unitResult.error || variantResult.error) throw new Error("Không thể tải danh mục vật tư.");
  const materials = (materialResult.data ?? []) as MaterialRow[];
  const ids = materials.map((row) => row.id);
  const groups = new Map((groupResult.data ?? []).map((row) => [row.id, row.name]));
  const units = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  const variantGroups = new Map(((variantResult.data ?? []) as VariantGroup[]).map((row) => [row.id, row]));
  const currentVariant = variant ? variantGroups.get(variant) ?? null : null;

  // Prices, stock and cost only for permitted actors and only for the materials on this page (UX-820).
  const none = Promise.resolve({ data: [] as never[], error: null });
  const stockColumns = `material_id, warehouse_id, on_hand_base_quantity::text, available_base_quantity::text${can.cost ? ", inventory_value_vnd::text" : ""}`;
  const [priceResult, stockResult, warehouseResult, conversionResult, now] = await Promise.all([
    can.price && ids.length ? supabase.from("pricing_rule_read").select("material_id, scope_type, price_uom_id, unit_price_vnd::text, version, active, effective_from, effective_to").eq("branch_id", access.branchId).eq("scope_type", "DEFAULT").eq("active", true).in("material_id", ids).limit(1000) : none,
    can.stock && ids.length ? supabase.from("warehouse_inventory_read").select(stockColumns).eq("branch_id", access.branchId).in("material_id", ids).limit(2000) : none,
    can.stock ? supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).limit(200) : none,
    ids.length ? supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id, numerator::text, denominator::text").eq("active", true).in("material_id", ids).limit(1000) : none,
    readPricingClock(),
  ]);
  if (priceResult.error || stockResult.error || warehouseResult.error || conversionResult.error) throw new Error("Không thể tải giá hoặc tồn kho của vật tư.");
  const rules = (priceResult.data ?? []) as unknown as ListPriceRule[];
  const positions = (stockResult.data ?? []) as unknown as ListPosition[];
  const warehouses = new Map(((warehouseResult.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]));
  const conversions = (conversionResult.data ?? []) as unknown as Conversion[];

  const rows: MaterialListRow[] = materials.map((material) => {
    const uom = units.get(material.base_uom_id) ?? "Đơn vị";
    const price = can.price ? currentDefaultPrice(rules, material.id, material.base_uom_id, now) : null;
    const stock = can.stock ? stockSummary(positions, material.id) : null;
    return {
      id: material.id, code: material.code, name: material.name, specification: material.specification,
      group: groups.get(material.group_id) ?? "Chưa phân nhóm", uom, saleEnabled: material.sale_enabled, purchaseEnabled: material.purchase_enabled, active: material.active,
      price: price ? { unitPriceVnd: price.unitPriceVnd, uom: units.get(price.uomId) ?? "Đơn vị" } : null,
      averageCostVnd: can.cost ? stock?.averageCostVnd ?? null : null,
      stock: stock ? { onHand: stock.onHand, available: stock.available, warehouses: stock.warehouses.map((item) => ({ name: warehouses.get(item.warehouseId) ?? "Kho", onHand: item.onHand, available: item.available })) } : null,
      variant: material.variant_group_id && variantGroups.has(material.variant_group_id) ? { groupId: material.variant_group_id, group: variantGroups.get(material.variant_group_id)!.name,
        label: variantLabel(variantGroups.get(material.variant_group_id)!.attribute_names, material.variant_attributes) } : null,
      conversions: conversions.filter((row) => row.material_id === material.id)
        .map((row) => `${row.denominator === "1" ? "1" : formatQuantity(row.denominator)} ${units.get(row.from_uom_id) ?? "Đơn vị"} = ${formatQuantity(row.numerator)} ${units.get(row.to_uom_id) ?? "Đơn vị"}`),
    };
  });
  const filtered = Boolean(list.q || list.state || group || use || variant);
  const create = can.manage ? await catalogCreateProps("materials", access, supabase) : null;

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Kho hàng</p><h1>Vật tư</h1><p className="lede">Danh mục vật tư, giá bán và tồn kho. Bấm vào một dòng để xem chi tiết.</p></div>
      {(can.manage || can.price) && <div className="action-cluster">
        {create && <CatalogCreateButton {...create} label="+ Vật tư" />}
        {can.manage && <VariantGroupButton label="+ Hàng cùng loại" />}
        {can.price && <Link className="button button-secondary" href="/admin/products/pricing">Thiết lập giá</Link>}
        {can.manage && <details className="more-actions"><summary className="button button-secondary">Danh mục khác</summary><div className="more-actions-menu"><Link href="/admin/products/manage?kind=groups">Nhóm vật tư</Link><Link href="/admin/products/manage?kind=units">Đơn vị tính</Link></div></details>}
      </div>}
    </header>
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc vật tư">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã hoặc tên vật tư" /></label>
        <label>Nhóm vật tư<select name="group" defaultValue={group}><option value="">Tất cả</option>{[...groups].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        {variantGroups.size > 0 && <label>Hàng cùng loại<select name="variant" defaultValue={variant}><option value="">Tất cả</option>{[...variantGroups.values()].filter((row) => row.active || row.id === variant).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        <label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="ACTIVE">Đang dùng</option><option value="INACTIVE">Ngừng dùng</option></select></label>
        <label>Cho phép<select name="use" defaultValue={use}><option value="">Tất cả</option><option value="SALE">Được bán</option><option value="PURCHASE">Được mua</option></select></label>
        {filtered && <Link className="code-link" href="/admin/products">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{materialResult.count ?? 0} vật tư</h2><span className="scope-chip">{CORE_LIST_PAGE_SIZE} / trang</span></div>
        {currentVariant && <div className="variant-callout card-pad-x"><p>Hàng cùng loại <strong>{currentVariant.name}</strong> · thuộc tính {currentVariant.attribute_names.join(", ")}{currentVariant.active ? "" : " · đã ngừng"}</p>
          {can.manage && <VariantGroupButton label="Sửa hàng cùng loại" groupId={currentVariant.id} className="button button-secondary button-compact" />}</div>}
        <div className="table-wrap"><table className="row-link-table material-list-table">
          <thead><tr><th><span className="sr-only">Mở rộng</span></th><th>Mã</th><th>Tên vật tư</th><th>Nhóm</th><th>ĐVT</th>{can.price && <th className="numeric">Giá bán</th>}{can.cost && <th className="numeric">Giá vốn</th>}{can.stock && <th className="numeric">Tồn kho</th>}<th>Trạng thái</th></tr></thead>
          <MaterialListRows rows={rows} showPrice={can.price} showCost={can.cost} showStock={can.stock} />
        </table>{!rows.length && <p className="empty-inline">Không có vật tư phù hợp.</p>}</div>
        <ListPager page={list.page} total={materialResult.count ?? 0} params={{ q: list.q, state: list.state, group: group || undefined, use: use || undefined, variant: variant || undefined }} />
      </section>
    </div>
  </div>;
}
