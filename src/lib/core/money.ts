import { AppError } from "./errors";

export type Vnd = bigint & { readonly __currency: "VND" };

function asVnd(value: bigint): Vnd {
  return value as Vnd;
}

export function vnd(value: string | bigint): Vnd {
  if (typeof value === "string" && !/^-?\d+$/.test(value)) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Số tiền phải là số nguyên đồng.", status: 422 });
  }
  return asVnd(BigInt(value));
}

export function addVnd(left: Vnd, right: Vnd): Vnd {
  return asVnd(left + right);
}

export function subtractVnd(left: Vnd, right: Vnd): Vnd {
  return asVnd(left - right);
}

export function multiplyVnd(amount: Vnd, multiplier: bigint): Vnd {
  return asVnd(amount * multiplier);
}

export function applyBasisPoints(amount: Vnd, basisPoints: number): Vnd {
  if (!Number.isInteger(basisPoints)) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Tỷ lệ điều chỉnh phải là số nguyên.", status: 422 });
  }
  return asVnd(divideHalfUp(amount * BigInt(basisPoints), BigInt(10_000)));
}

export function serializeVnd(amount: Vnd): string {
  return amount.toString();
}

export function formatVnd(amount: Vnd): string {
  const negative = amount < BigInt(0);
  const digits = (negative ? -amount : amount).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped} ₫`;
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) throw new RangeError("Denominator must be positive.");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absoluteRemainder = remainder < BigInt(0) ? -remainder : remainder;
  if (absoluteRemainder * BigInt(2) < denominator) return quotient;
  return quotient + (numerator < BigInt(0) ? BigInt(-1) : BigInt(1));
}
