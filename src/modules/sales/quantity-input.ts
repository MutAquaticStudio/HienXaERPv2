import Decimal from "decimal.js";

// Sales lines are strictly positive; stock/return quantities may legitimately be zero.
export function isPositiveSalesQuantity(value: string): boolean {
  try {
    if (!value.trim()) return false;
    const parsed = new Decimal(value.trim());
    return parsed.isFinite() && parsed.greaterThan(0) && parsed.decimalPlaces() <= 6;
  } catch {
    return false;
  }
}
