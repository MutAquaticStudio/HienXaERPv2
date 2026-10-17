import Decimal from "decimal.js";
import { formatQuantity } from "@/lib/core/quantity";

export type DisplayUnit = { symbol: string; numerator: string; denominator: string };
type Conversion = { material_id: string | null; from_uom_id: string; to_uom_id: string; numerator: string; denominator: string };

/** The material's largest unit that converts straight to its base unit (tấn over tạ over bao), if any. */
export function largestUnit(conversions: Conversion[], materialId: string, baseUomId: string, symbols: Map<string, string>): DisplayUnit | null {
  const ratio = (row: Conversion) => new Decimal(row.numerator).div(row.denominator);
  const best = conversions.filter((row) => row.material_id === materialId && row.to_uom_id === baseUomId && row.from_uom_id !== baseUomId && ratio(row).gt(1))
    .sort((left, right) => ratio(right).comparedTo(ratio(left)))[0];
  return best ? { symbol: symbols.get(best.from_uom_id) ?? "đơn vị", numerator: best.numerator, denominator: best.denominator } : null;
}

/** A base quantity shown in `unit` ("4,85 tấn"); "≈" marks a value rounded to 3 decimals for display. */
export function inUnit(baseQuantity: string, unit: DisplayUnit): string {
  const value = new Decimal(baseQuantity).mul(unit.denominator).div(unit.numerator);
  return value.decimalPlaces() > 3 ? `≈ ${formatQuantity(value.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed())} ${unit.symbol}` : `${formatQuantity(value.toFixed())} ${unit.symbol}`;
}

export type CardMovement = { id: string; location_kind: string; warehouse_id: string | null; base_quantity_delta: string; occurred_at: string };

/**
 * Stock card ("thẻ kho"): movements newest first, each warehouse movement with the warehouse balance right after it,
 * worked back from today's on-hand. Movements outside a warehouse (on a vehicle, at a customer) have no balance.
 */
export function stockCard<T extends CardMovement>(movements: T[], onHand: string): (T & { balanceAfter: string | null })[] {
  let balance = new Decimal(onHand);
  return movements.map((movement) => {
    if (movement.location_kind !== "WAREHOUSE") return { ...movement, balanceAfter: null };
    const after = balance.toFixed();
    balance = balance.minus(movement.base_quantity_delta);
    return { ...movement, balanceAfter: after };
  });
}
