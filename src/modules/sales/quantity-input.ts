import { isExactEntryQuantity } from "@/lib/core/quantity";

// Sales lines are strictly positive; stock/return quantities may legitimately be zero.
export function isPositiveSalesQuantity(value: string): boolean {
  try {
    return isExactEntryQuantity(value);
  } catch {
    return false;
  }
}
