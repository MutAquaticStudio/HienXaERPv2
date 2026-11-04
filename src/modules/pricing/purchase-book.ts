import { formatBusinessDate } from "@/lib/core/business-time";
import type { PurchaseBookRow } from "@/components/pricing/purchase-price-book-editor";
import { currentBookPrice, type ListPriceRule } from "@/modules/catalog/material-list";
import { effectivePriceState } from "@/modules/pricing/effective-state";

export type BookAssignment = { supplier_id: string; material_id: string; purchase_uom_id: string };
export type BookMaterial = { id: string; code: string; name: string; group_id: string | null };
export type BookPurchaseRule = { id: string; supplier_id: string; material_id: string; purchase_uom_id: string; unit_cost_vnd: string; version: number;
  active: boolean; effective_from: string; effective_to: string | null };

const vn = (value: string) => new Intl.NumberFormat("vi-VN").format(BigInt(value));

/**
 * D61: the rows of the purchase price book — one per material a supplier sells (its assignment), priced in the
 * assignment's unit. "Hiện tại" is the price in force now; the row saves over the newest active version (a price set for
 * a later day included), the one save_purchase_price_rule requires. In the overview a material sold by several suppliers
 * in the same unit marks its cheapest current price, the one auto-sourcing picks.
 */
export function purchaseBookRows({ assignments, materials, rules, saleRules, suppliers, units, groups, now, missingOnly }: {
  assignments: BookAssignment[]; materials: BookMaterial[]; rules: BookPurchaseRule[]; saleRules: ListPriceRule[] | null;
  suppliers: Map<string, string>; units: Map<string, string>; groups: Map<string, string>; now: number; missingOnly?: boolean;
}): PurchaseBookRow[] {
  const byMaterial = new Map(materials.map((material) => [material.id, material]));
  const rows = assignments.flatMap((assignment): PurchaseBookRow[] => {
    const material = byMaterial.get(assignment.material_id);
    if (!material) return [];
    const own = rules.filter((rule) => rule.supplier_id === assignment.supplier_id && rule.material_id === assignment.material_id);
    const scope = own.filter((rule) => rule.purchase_uom_id === assignment.purchase_uom_id);
    const current = scope.filter((rule) => effectivePriceState(rule, now) === "ACTIVE").sort((left, right) => right.version - left.version)[0] ?? null;
    const latest = scope.filter((rule) => rule.active).sort((left, right) => right.version - left.version)[0] ?? null;
    const otherUnits = [...new Set(own.map((rule) => rule.purchase_uom_id).filter((uom) => uom !== assignment.purchase_uom_id))].flatMap((uom) => {
      const price = own.filter((rule) => rule.purchase_uom_id === uom && effectivePriceState(rule, now) === "ACTIVE").sort((left, right) => right.version - left.version)[0];
      return price ? [`${units.get(uom) ?? "Đơn vị"} ${vn(price.unit_cost_vnd)} ₫`] : [];
    });
    return [{
      key: `${assignment.supplier_id}:${assignment.material_id}`, supplierId: assignment.supplier_id, supplierName: suppliers.get(assignment.supplier_id) ?? "Nhà cung cấp",
      materialId: material.id, code: material.code, name: material.name, group: (material.group_id && groups.get(material.group_id)) || "Chưa phân nhóm",
      uomId: assignment.purchase_uom_id, uom: units.get(assignment.purchase_uom_id) ?? "Đơn vị",
      currentVnd: current ? String(current.unit_cost_vnd) : null, since: current ? formatBusinessDate(current.effective_from).slice(0, 5) : null, otherUnits,
      saleVnd: saleRules ? currentBookPrice(saleRules, material.id, assignment.purchase_uom_id, now) : null,
      cheapest: false,
      target: latest ? { ruleId: latest.id, version: latest.version } : null,
    }];
  });
  const lowest = new Map<string, { price: bigint; count: number }>();
  for (const row of rows) {
    if (row.currentVnd === null) continue;
    const key = `${row.materialId}:${row.uomId}`, price = BigInt(row.currentVnd), seen = lowest.get(key);
    lowest.set(key, { price: seen && seen.price < price ? seen.price : price, count: (seen?.count ?? 0) + 1 });
  }
  for (const row of rows) {
    const seen = lowest.get(`${row.materialId}:${row.uomId}`);
    row.cheapest = Boolean(seen && seen.count > 1 && row.currentVnd !== null && BigInt(row.currentVnd) === seen.price);
  }
  return rows.filter((row) => !missingOnly || row.currentVnd === null)
    .sort((left, right) => left.name.localeCompare(right.name, "vi") || left.supplierName.localeCompare(right.supplierName, "vi"));
}
