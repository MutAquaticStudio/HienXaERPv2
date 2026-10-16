import Decimal from "decimal.js";

export type AdjustMode = "percent" | "amount";
export type RoundingStep = 1000 | 100 | 1;
export const ROUNDING_STEPS: ReadonlyArray<{ value: RoundingStep; label: string }> = [
  { value: 1000, label: "Làm tròn 1.000 ₫" },
  { value: 100, label: "Làm tròn 100 ₫" },
  { value: 1, label: "Không làm tròn" },
];
const MAX_VND = 9223372036854775807n;

/** Digits only: "95.000 ₫" → "95000"; empty when nothing usable was typed. */
export function vndDigits(text: string): string {
  return text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function isValidAdjustment(mode: AdjustMode, value: string): boolean {
  const trimmed = value.trim();
  return mode === "percent" ? /^[+-]?\d{1,3}(\.\d{1,2})?$/.test(trimmed) && Number(trimmed) !== 0 : /^[+-]?\d{1,15}$/.test(trimmed) && BigInt(trimmed) !== 0n;
}

/**
 * New price from the current one: ±percent or ±amount, then rounded half-up to the step.
 * Returns null when the result would not be a positive VND amount.
 */
export function adjustPrice(current: bigint, mode: AdjustMode, value: string, step: RoundingStep): bigint | null {
  if (!isValidAdjustment(mode, value)) return null;
  const base = new Decimal(current.toString());
  const raw = mode === "percent" ? base.mul(new Decimal(100).plus(value.trim())).div(100) : base.plus(value.trim());
  const rounded = raw.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(step);
  if (rounded.lte(0)) return null;
  const result = BigInt(rounded.toFixed(0));
  return result > MAX_VND ? null : result;
}

/** Change against the current price, for the preview column. */
export function priceChange(current: bigint | null, next: bigint): { amount: bigint; percent: string | null } {
  if (current === null) return { amount: next, percent: null };
  const amount = next - current;
  const percent = current === 0n ? null : new Decimal(amount.toString()).mul(100).div(current.toString()).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toString();
  return { amount, percent };
}
