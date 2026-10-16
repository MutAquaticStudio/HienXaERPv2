import Decimal from "decimal.js";
import { effectivePriceState } from "@/modules/pricing/effective-state";

export type ListPriceRule = { material_id: string | null; scope_type: string; price_uom_id: string; unit_price_vnd: string; version: number; active: boolean; effective_from: string; effective_to: string | null };
export type ListPosition = { material_id: string; warehouse_id: string; on_hand_base_quantity: string; available_base_quantity: string; inventory_value_vnd?: string | null };

/** The general (DEFAULT-scope) selling price in force now; the base unit wins, then the newest version. */
export function currentDefaultPrice(rules: ListPriceRule[], materialId: string, baseUomId: string, now: number): { unitPriceVnd: string; uomId: string } | null {
  const candidates = rules.filter((rule) => rule.material_id === materialId && rule.scope_type === "DEFAULT" && effectivePriceState(rule, now) === "ACTIVE")
    .sort((left, right) => Number(right.price_uom_id === baseUomId) - Number(left.price_uom_id === baseUomId) || right.version - left.version);
  const chosen = candidates[0];
  return chosen ? { unitPriceVnd: String(chosen.unit_price_vnd), uomId: chosen.price_uom_id } : null;
}

/**
 * Stock across the branch's warehouses. Average cost is only given when every position carries a value
 * (i.e. the actor may read costs) and something is on hand; it is display-rounded to whole đồng.
 */
export function stockSummary(positions: ListPosition[], materialId: string) {
  const rows = positions.filter((row) => row.material_id === materialId);
  if (!rows.length) return null;
  const onHand = rows.reduce((sum, row) => sum.plus(row.on_hand_base_quantity), new Decimal(0));
  const available = rows.reduce((sum, row) => sum.plus(row.available_base_quantity), new Decimal(0));
  const valued = rows.every((row) => row.inventory_value_vnd != null);
  const value = valued ? rows.reduce((sum, row) => sum.plus(row.inventory_value_vnd!), new Decimal(0)) : null;
  const averageCostVnd = value && onHand.gt(0) ? value.div(onHand).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0) : null;
  return { onHand: onHand.toString(), available: available.toString(), averageCostVnd, warehouses: rows.map((row) => ({ warehouseId: row.warehouse_id, onHand: row.on_hand_base_quantity, available: row.available_base_quantity })) };
}
