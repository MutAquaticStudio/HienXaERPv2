import { randomUUID } from "node:crypto";
import Link from "next/link";
import { PriceBookEditor, type PriceBookRow } from "@/components/pricing/price-book-editor";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { requireInternalPermission } from "@/lib/access/context";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { currentDefaultPrice, latestDefaultRule, stockSummary, type ListPosition, type ListPriceRule } from "@/modules/catalog/material-list";
import { readPricingClock } from "@/modules/pricing/request-clock";

const PRICE_BOOK_LIMIT = 500;
type MaterialRow = { id: string; code: string; name: string; group_id: string; base_uom_id: string };

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Price book: general selling prices per material in its base unit (owner decision D4). */
export default async function PriceBookPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string }> }) {
  const access = await requireInternalPermission("pricing.read");
  const query = await searchParams;
  const q = parseCoreListQuery({ q: query.q }).q;
  const group = /^[0-9a-f-]{36}$/i.test(query.group ?? "") ? query.group! : "";
  const canManage = access.permissions.has("pricing.manage");
  const showCost = access.permissions.has("inventory.read") && access.permissions.has("inventory.cost.read");
  const supabase = await createServerSupabase();
  let request = supabase.from("materials").select("id, code, name, group_id, base_uom_id", { count: "exact" }).eq("active", true).eq("sale_enabled", true);
  if (q) request = request.or(`code.ilike.${ilikePattern(q)},name.ilike.${ilikePattern(q)}`);
  if (group) request = request.eq("group_id", group);
  const [materialResult, groupResult, unitResult, now] = await Promise.all([
    request.order("name").order("id").limit(PRICE_BOOK_LIMIT),
    supabase.from("material_groups").select("id, name").order("name").limit(500),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
    readPricingClock(),
  ]);
  if (materialResult.error || groupResult.error || unitResult.error) throw new Error("Không thể tải bảng giá.");
  const materials = (materialResult.data ?? []) as MaterialRow[];
  const ids = materials.map((row) => row.id);
  const none = Promise.resolve({ data: [] as never[], error: null });
  const [ruleResult, stockResult] = await Promise.all([
    ids.length ? supabase.from("pricing_rule_read").select("id, material_id, scope_type, price_uom_id, unit_price_vnd::text, version, active, effective_from, effective_to").eq("branch_id", access.branchId).eq("scope_type", "DEFAULT").eq("active", true).in("material_id", ids).limit(5000) : none,
    showCost && ids.length ? supabase.from("warehouse_inventory_read").select("material_id, warehouse_id, on_hand_base_quantity::text, available_base_quantity::text, inventory_value_vnd::text").eq("branch_id", access.branchId).in("material_id", ids).limit(5000) : none,
  ]);
  if (ruleResult.error || stockResult.error) throw new Error("Không thể tải giá hiện tại.");
  const rules = (ruleResult.data ?? []) as unknown as ListPriceRule[];
  const positions = (stockResult.data ?? []) as unknown as ListPosition[];
  const groups = new Map((groupResult.data ?? []).map((row) => [row.id, row.name]));
  const units = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  const rows: PriceBookRow[] = materials.map((material) => {
    const current = currentDefaultPrice(rules, material.id, material.base_uom_id, now);
    const target = latestDefaultRule(rules, material.id, material.base_uom_id);
    return {
      materialId: material.id, code: material.code, name: material.name, group: groups.get(material.group_id) ?? "Chưa phân nhóm",
      uomId: material.base_uom_id, uom: units.get(material.base_uom_id) ?? "Đơn vị",
      currentVnd: current && current.uomId === material.base_uom_id ? current.unitPriceVnd : null,
      costVnd: showCost ? stockSummary(positions, material.id)?.averageCostVnd ?? null : null,
      target: target?.id ? { ruleId: target.id, version: target.version } : null,
    };
  });
  const total = materialResult.count ?? rows.length;

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Kho hàng</p><h1>Thiết lập giá</h1><p className="lede">Giá bán chung theo đơn vị gốc. Sửa trực tiếp hoặc tăng/giảm hàng loạt, rồi lưu một lần.</p></div>
      <div className="action-cluster"><Link className="button button-secondary" href="/admin/settings/pricing">Giá theo khách & lịch sử</Link></div>
    </header>
    <AutoFilterForm className="card card-pad price-book-filters" aria-label="Bộ lọc bảng giá">
      <label>Tìm vật tư<input type="search" name="q" defaultValue={q} placeholder="Mã hoặc tên" /></label>
      <label>Nhóm vật tư<select name="group" defaultValue={group}><option value="">Tất cả</option>{[...groups].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {(q || group) && <Link className="code-link" href="/admin/products/pricing">Xóa lọc</Link>}
    </AutoFilterForm>
    {total > rows.length && <p className="quality-callout">Đang hiện {rows.length}/{total} vật tư. Lọc theo nhóm hoặc tên để sửa phần còn lại (mỗi lần lưu tối đa {PRICE_BOOK_LIMIT} dòng).</p>}
    <PriceBookEditor rows={rows} operationId={randomUUID()} today={businessToday()} canManage={canManage} showCost={showCost} />
  </div>;
}
