import type {
  CreditDecision,
  CreditExposure,
  CreditPolicy,
} from "@/modules/customer-360/types";
import { PlatformError } from "@/modules/platform/errors";

const MONEY_SCALE = 2;
const MONEY_FACTOR = 10n ** BigInt(MONEY_SCALE);

function parseMoney(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new PlatformError(
      "Số tiền phải là số không âm, tối đa 2 chữ số thập phân.",
      "INVALID_MONEY",
      400,
    );
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  return BigInt(whole) * MONEY_FACTOR + BigInt(fraction.padEnd(2, "0"));
}

function formatMoney(value: bigint): string {
  const whole = value / MONEY_FACTOR;
  const fraction = (value % MONEY_FACTOR).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}

export function evaluateCustomerCredit(input: {
  policy: CreditPolicy | null;
  exposure: CreditExposure;
  orderAmount: string;
}): CreditDecision {
  const receivable = parseMoney(input.exposure.receivableAmount);
  const uninvoiced = parseMoney(input.exposure.uninvoicedOrderAmount);
  const advances = parseMoney(input.exposure.customerAdvanceAmount);
  const newOrder = parseMoney(input.orderAmount);
  const gross = receivable + uninvoiced + newOrder;
  const projected = gross > advances ? gross - advances : 0n;

  if (!input.policy) {
    return {
      status: "BLOCKED",
      projectedExposure: formatMoney(projected),
      availableCredit: "0",
      reasons: ["Khách hàng chưa có chính sách tín dụng hiệu lực."],
    };
  }

  const limit = parseMoney(input.policy.creditLimit);
  const reasons: string[] = [];
  if (projected > limit) {
    reasons.push("Dư nợ dự kiến vượt hạn mức tín dụng.");
  }
  if (
    parseMoney(input.exposure.overdueAmount) > 0n &&
    input.exposure.oldestOverdueDays > input.policy.allowedOverdueDays
  ) {
    reasons.push("Khách hàng có khoản quá hạn vượt số ngày cho phép.");
  }

  return {
    status: reasons.length > 0 ? "BLOCKED" : "CLEAR",
    projectedExposure: formatMoney(projected),
    availableCredit: formatMoney(limit > projected ? limit - projected : 0n),
    reasons,
    policyId: input.policy.id,
  };
}

export function assertCreditOverride(input: {
  decision: CreditDecision;
  canOverride: boolean;
  reason: string;
}): void {
  if (input.decision.status !== "BLOCKED") return;
  if (!input.canOverride) {
    throw new PlatformError(
      "Đơn bán bị chặn tín dụng và bạn không có quyền vượt chặn.",
      "CREDIT_OVERRIDE_DENIED",
      403,
    );
  }
  if (input.reason.trim().length < 10) {
    throw new PlatformError(
      "Lý do vượt chặn tín dụng phải có ít nhất 10 ký tự.",
      "CREDIT_OVERRIDE_REASON_REQUIRED",
      400,
    );
  }
}
