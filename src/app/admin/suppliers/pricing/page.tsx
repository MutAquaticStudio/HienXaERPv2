import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { PurchasePriceBookEditor, type AssignCandidate } from "@/components/pricing/purchase-price-book-editor";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { requireInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ListPriceRule } from "@/modules/catalog/material-list";
import { purchaseBookRows, type BookAssignment, type BookMaterial, type BookPurchaseRule } from "@/modules/pricing/purchase-book";
import { readPricingClock } from "@/modules/pricing/request-clock";

export const metadata: Metadata = { title: "Giá mua" };

const BOOK_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Query = { supplier?: string; q?: string; group?: string; missing?: string };

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * D61 Bảng giá mua: like Giá bán, but the first filter is the supplier. One supplier shows the materials assigned to it;
 * no supplier is the overview, one row per material × supplier. Every version stays in "Lịch sử giá mua".
 */
export default async function PurchasePriceBookPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalAccess();
  const query = await searchParams;
  const canManage = access.permissions.has("purchasing.price.manage");
  const canRead = access.permissions.has("purchasing.price.read") && access.permissions.has("purchasing.read");
  if (!canManage && !canRead) throw new AppError({ code: "FORBIDDEN", message: "Không có quyền bảng giá mua.", status: 403 });
  const showSale = access.permissions.has("pricing.read");
  const supplierId = UUID.test(query.supplier ?? "") ? query.supplier! : "";
  const group = UUID.test(query.group ?? "") ? query.group! : "";
  const q = parseCoreListQuery({ q: query.q }).q;
  const missingOnly = query.missing === "1";
  const db = await createServerSupabase();

  const header = <header className="page-heading"><div><h1>Giá mua</h1><p className="lede">Giá mua theo nhà cung cấp và đơn vị mua. Chọn nhà cung cấp để sửa nhanh giá hôm nay, hoặc xem tổng quan mọi nhà cung cấp; lưu một lần.</p></div>
    <Link className="button button-secondary" href="/admin/suppliers/pricing/history">Lịch sử giá mua</Link></header>;
  // Managing purchase prices does not grant reading them (existing rule): such a person enters prices in the history page.
  if (!canRead) return <div className="page-stack">{header}<p className="quality-callout">Bạn nhập được giá mua nhưng chưa có quyền xem giá mua. Dùng “Lịch sử giá mua” để thêm giá, hoặc nhờ quản lý cấp quyền xem.</p></div>;

  const [supplierResult, groupResult, unitResult, now] = await Promise.all([
    db.from("suppliers").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(500),
    db.from("material_groups").select("id, name").order("name").limit(500),
    db.from("units_of_measure").select("id, symbol").limit(1000),
    readPricingClock(),
  ]);
  if (supplierResult.error || groupResult.error || unitResult.error) throw new Error("Không thể tải bảng giá mua.");
  const supplierList = (supplierResult.data ?? []) as { id: string; name: string }[];
  const suppliers = new Map(supplierList.map((row) => [row.id, row.name]));
  const groups = new Map(((groupResult.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]));
  const units = new Map(((unitResult.data ?? []) as { id: string; symbol: string }[]).map((row) => [row.id, row.symbol]));
  const chosen = supplierId && suppliers.has(supplierId) ? supplierId : "";

  const assignmentResult = await db.from("supplier_materials").select("supplier_id, material_id, purchase_uom_id").eq("branch_id", access.branchId).eq("active", true).limit(5000);
  if (assignmentResult.error) throw new Error("Không thể tải vật tư đã gán cho nhà cung cấp.");
  const branchAssignments = ((assignmentResult.data ?? []) as BookAssignment[]).filter((row) => suppliers.has(row.supplier_id));
  const allAssignments = chosen ? branchAssignments.filter((row) => row.supplier_id === chosen) : branchAssignments;
  const materialIds = [...new Set(allAssignments.map((row) => row.material_id))];

  let materialRequest = materialIds.length ? db.from("materials").select("id, code, name, group_id").eq("active", true).in("id", materialIds).limit(5000) : null;
  if (materialRequest && q) materialRequest = materialRequest.or(`code.ilike.${ilikePattern(q)},name.ilike.${ilikePattern(q)}`);
  if (materialRequest && group) materialRequest = materialRequest.eq("group_id", group);
  const none = Promise.resolve({ data: [] as never[], error: null });
  const [materialResult, ruleResult, saleResult, candidateResult] = await Promise.all([
    materialRequest ?? none,
    materialIds.length ? (chosen ? db.from("purchase_price_rules").select("id, supplier_id, material_id, purchase_uom_id, unit_cost_vnd::text, version, active, effective_from, effective_to").eq("branch_id", access.branchId).eq("active", true).in("material_id", materialIds).eq("supplier_id", chosen).limit(10000)
      : db.from("purchase_price_rules").select("id, supplier_id, material_id, purchase_uom_id, unit_cost_vnd::text, version, active, effective_from, effective_to").eq("branch_id", access.branchId).eq("active", true).in("material_id", materialIds).limit(10000)) : none,
    showSale && materialIds.length ? db.from("pricing_rule_read").select("id, material_id, scope_type, price_uom_id, unit_price_vnd::text, version, active, effective_from, effective_to").eq("branch_id", access.branchId).eq("scope_type", "DEFAULT").eq("active", true).in("material_id", materialIds).limit(10000) : none,
    // Materials this supplier does not sell yet, with the units they are bought in (base unit + settlement conversions).
    canManage && chosen ? db.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("purchase_enabled", true).order("name").limit(1000) : none,
  ]);
  if (materialResult.error || ruleResult.error || saleResult.error || candidateResult.error) throw new Error("Không thể tải giá mua hiện tại.");
  const assigned = new Set(allAssignments.map((row) => row.material_id));
  const candidateMaterials = ((candidateResult.data ?? []) as { id: string; code: string; name: string; base_uom_id: string }[]).filter((row) => !assigned.has(row.id));
  const conversionResult = candidateMaterials.length ? await db.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id").in("material_id", candidateMaterials.map((row) => row.id)).eq("active", true).eq("settlement_allowed", true).limit(5000) : { data: [], error: null };
  const candidates: AssignCandidate[] = candidateMaterials.map((material) => {
    const extra = ((conversionResult.data ?? []) as { material_id: string; from_uom_id: string; to_uom_id: string }[])
      .filter((row) => row.material_id === material.id && row.to_uom_id === material.base_uom_id).map((row) => row.from_uom_id);
    // The unit other suppliers already buy this material in comes first (a bag of cement, not its base kg).
    const usage = (uom: string) => branchAssignments.filter((row) => row.material_id === material.id && row.purchase_uom_id === uom).length;
    const ids = [...new Set([material.base_uom_id, ...extra])].sort((left, right) => usage(right) - usage(left));
    return { materialId: material.id, code: material.code, name: material.name, units: ids.map((id) => ({ id, symbol: units.get(id) ?? "Đơn vị" })) };
  });

  const rows = purchaseBookRows({ assignments: allAssignments, materials: (materialResult.data ?? []) as BookMaterial[], rules: (ruleResult.data ?? []) as unknown as BookPurchaseRule[],
    saleRules: showSale ? (saleResult.data ?? []) as unknown as ListPriceRule[] : null, suppliers, units, groups, now, missingOnly });
  const shown = rows.slice(0, BOOK_LIMIT);
  const supplierRows = chosen ? purchaseBookRows({ assignments: allAssignments, materials: (materialResult.data ?? []) as BookMaterial[], rules: (ruleResult.data ?? []) as unknown as BookPurchaseRule[], saleRules: null, suppliers, units, groups, now }) : [];

  return <div className="page-stack">
    {header}
    <AutoFilterForm className="card card-pad price-book-filters" aria-label="Bộ lọc bảng giá mua">
      <label>Nhà cung cấp<select name="supplier" defaultValue={chosen}><option value="">Tất cả nhà cung cấp (tổng quan)</option>
        {supplierList.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Tìm vật tư<input type="search" name="q" defaultValue={q} placeholder="Mã hoặc tên" /></label>
      <label>Nhóm vật tư<select name="group" defaultValue={group}><option value="">Tất cả</option>{[...groups].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="purchase-book-missing-filter"><input type="checkbox" name="missing" value="1" defaultChecked={missingOnly} /> Chỉ dòng chưa có giá</label>
      {(chosen || q || group || missingOnly) && <Link className="code-link" href="/admin/suppliers/pricing">Xóa lọc</Link>}
    </AutoFilterForm>
    {rows.length > shown.length && <p className="quality-callout">Đang hiện {shown.length}/{rows.length} dòng. Chọn nhà cung cấp hoặc lọc theo nhóm để sửa phần còn lại (mỗi lần lưu tối đa {BOOK_LIMIT} dòng).</p>}
    <PurchasePriceBookEditor key={chosen || "all"} rows={shown} operationId={randomUUID()} today={businessToday()} canManage={canManage} showSale={showSale}
      supplier={chosen ? { id: chosen, name: suppliers.get(chosen)!, assigned: allAssignments.length, missing: supplierRows.filter((row) => row.currentVnd === null).length } : undefined}
      candidates={candidates} />
  </div>;
}
