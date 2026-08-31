import { PlatformError } from "@/modules/platform/errors";

const SCALE = 100n;

function parseMoney(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new PlatformError(
      `${label} phải là số không âm, tối đa 2 chữ số thập phân.`,
      "INVALID_COMMERCIAL_MONEY",
      400,
    );
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(2, "0"));
}

function formatPercent(hundredths: bigint): string {
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}

export function evaluatePriceSafety(input: {
  referenceUnitPrice: string;
  requestedUnitPrice: string;
  canOverride: boolean;
  reason: string;
}) {
  const reference = parseMoney(input.referenceUnitPrice, "Giá theo quy tắc");
  const requested = parseMoney(input.requestedUnitPrice, "Giá đề nghị");
  if (reference <= 0n || requested <= 0n) {
    throw new PlatformError(
      "Đơn giá phải lớn hơn 0.",
      "INVALID_COMMERCIAL_PRICE",
      400,
    );
  }

  if (requested === reference) {
    return { status: "RULE_MATCH" as const, discountPercent: "0" };
  }
  if (requested > reference) {
    return { status: "ABOVE_RULE" as const, discountPercent: "0" };
  }
  if (!input.canOverride) {
    throw new PlatformError(
      "Giá đề nghị thấp hơn giá quy tắc và bạn không có quyền điều chỉnh giá.",
      "PRICE_OVERRIDE_DENIED",
      403,
    );
  }
  if (input.reason.trim().length < 10) {
    throw new PlatformError(
      "Lý do điều chỉnh giá phải có ít nhất 10 ký tự.",
      "PRICE_OVERRIDE_REASON_REQUIRED",
      400,
    );
  }

  const discountHundredths =
    ((reference - requested) * 10_000n + reference / 2n) / reference;
  return {
    status: "APPROVED_OVERRIDE" as const,
    discountPercent: formatPercent(discountHundredths),
  };
}
