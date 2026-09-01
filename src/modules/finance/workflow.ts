import { PlatformError } from "@/modules/platform/errors";
import type { FinanceDocumentStatus, PaymentStatus } from "@/modules/finance/types";

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  DRAFT: ["POSTED"],
  POSTED: ["RECONCILED", "REVERSED"],
  RECONCILED: ["REVERSED"],
  REVERSED: [],
};

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus) {
  if (!paymentTransitions[from].includes(to)) {
    throw new PlatformError(
      `Không thể chuyển khoản thu chi từ ${from} sang ${to}.`,
      "INVALID_PAYMENT_TRANSITION",
      409,
    );
  }
}

export function assertAllocationWithinBounds(
  paymentAmount: string | number,
  alreadyAllocated: string | number,
  targetOutstanding: string | number,
  requestedAmount: string | number,
) {
  const values = [paymentAmount, alreadyAllocated, targetOutstanding, requestedAmount].map(Number) as [number, number, number, number];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new PlatformError("Số tiền phân bổ không hợp lệ.", "INVALID_ALLOCATION_AMOUNT", 400);
  }
  const [payment, allocated, outstanding, requested] = values;
  if (payment <= 0 || requested <= 0 || requested > outstanding || allocated + requested > payment) {
    throw new PlatformError(
      "Số tiền phân bổ vượt khoản thanh toán hoặc công nợ còn lại.",
      "ALLOCATION_OUT_OF_RANGE",
      409,
    );
  }
}

export function resolveFinanceDocumentStatus(
  originalAmount: string | number,
  outstandingAmount: string | number,
): FinanceDocumentStatus {
  const original = Number(originalAmount);
  const outstanding = Number(outstandingAmount);
  if (!Number.isFinite(original) || !Number.isFinite(outstanding) || original <= 0 || outstanding < 0 || outstanding > original) {
    throw new PlatformError("Số dư công nợ không hợp lệ.", "INVALID_DOCUMENT_BALANCE", 400);
  }
  if (outstanding === 0) return "SETTLED";
  if (outstanding === original) return "OPEN";
  return "PARTIALLY_SETTLED";
}
