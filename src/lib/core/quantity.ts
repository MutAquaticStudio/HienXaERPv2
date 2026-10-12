import Decimal from "decimal.js";
import { AppError } from "./errors";

export type QuantityUnit = "kg" | "ton" | "bag";
export type Quantity = Readonly<{ value: string; unit: QuantityUnit }>;

/** Input contract shared with numeric(20,6) commands; display never rounds stored values. */
export function isExactEntryQuantity(value: string, allowZero = false): boolean {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value.trim())) return false;
  const amount = new Decimal(value.trim());
  return amount.isFinite() && amount.lessThan("100000000000000")
    && (allowZero ? !amount.isNegative() : amount.greaterThan(0));
}

/** Integer arithmetic preserves all six storage digits, including large rational factors. */
export function isExactBaseQuantity(value: string, numerator: string, denominator: string): boolean {
  if (![value, numerator, denominator].every((part) => isExactEntryQuantity(part))) return false;
  const scaled = (part: string) => {
    const [whole, fraction = ""] = part.trim().split(".");
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  };
  const product = scaled(value) * scaled(numerator);
  const divisor = scaled(denominator);
  if (product % divisor !== 0n) return false;
  const base = product / divisor;
  return base > 0n && base < 100000000000000000000n;
}

// Display the stored quantity exactly, without database scale padding or rounding.
export function formatQuantity(value: string) {
  const [integer, fraction] = new Decimal(value).toFixed().split(".");
  const whole = `${integer === "-0" ? "-" : ""}${new Intl.NumberFormat("vi-VN").format(BigInt(integer))}`;
  return fraction ? `${whole},${fraction}` : whole;
}

export function quantity(value: string, unit: QuantityUnit): Quantity {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Số lượng phải là số hữu hạn không âm.", status: 422 });
  }
  return { value: decimal.toString(), unit };
}

export function convertQuantity(
  input: Quantity,
  target: QuantityUnit,
  options: { bagWeightKg?: string } = {},
): Quantity {
  if (input.unit === target) return quantity(input.value, target);
  const bagWeight = options.bagWeightKg ? new Decimal(options.bagWeightKg) : null;
  if ((input.unit === "bag" || target === "bag") && (!bagWeight || !bagWeight.isPositive())) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Cần khối lượng bao theo kg để quy đổi.", status: 422 });
  }

  const value = new Decimal(input.value);
  const kilograms = input.unit === "ton" ? value.times(1000) : input.unit === "bag" ? value.times(bagWeight!) : value;
  const converted = target === "ton" ? kilograms.div(1000) : target === "bag" ? kilograms.div(bagWeight!) : kilograms;
  return quantity(converted.toString(), target);
}

export function roundQuantity(input: Quantity, decimalPlaces: number, mode: "half-up" | "down" = "half-up"): Quantity {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Số chữ số làm tròn không hợp lệ.", status: 422 });
  }
  const rounding = mode === "half-up" ? Decimal.ROUND_HALF_UP : Decimal.ROUND_DOWN;
  return quantity(new Decimal(input.value).toDecimalPlaces(decimalPlaces, rounding).toFixed(decimalPlaces), input.unit);
}
