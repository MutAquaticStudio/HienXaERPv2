import { isExactEntryQuantity } from "@/lib/core/quantity";

export function validCompensationRate(kind: "FIXED_PER_BASIS" | "PERCENT_BPS", value: string): boolean {
  if (kind === "FIXED_PER_BASIS") return isExactEntryQuantity(value);
  return /^\d+$/.test(value) && BigInt(value) > 0n && BigInt(value) <= 10000n;
}
