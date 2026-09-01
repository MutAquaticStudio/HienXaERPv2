import { describe, expect, it } from "vitest";

import {
  assertAllocationWithinBounds,
  assertPaymentTransition,
  resolveFinanceDocumentStatus,
} from "@/modules/finance/workflow";

describe("P8 finance workflow", () => {
  it("keeps posted payments on the explicit lifecycle", () => {
    expect(() => assertPaymentTransition("DRAFT", "POSTED")).not.toThrow();
    expect(() => assertPaymentTransition("POSTED", "RECONCILED")).not.toThrow();
    expect(() => assertPaymentTransition("RECONCILED", "REVERSED")).not.toThrow();
    expect(() => assertPaymentTransition("POSTED", "DRAFT")).toThrow(/Không thể chuyển/);
  });

  it("supports many-to-many payment allocation without over-allocation", () => {
    expect(() => assertAllocationWithinBounds(100, 25, 60, 50)).not.toThrow();
    expect(() => assertAllocationWithinBounds(100, 80, 60, 30)).toThrow(/vượt/);
    expect(() => assertAllocationWithinBounds(100, 10, 20, 30)).toThrow(/vượt/);
  });

  it("derives document status from ledger-backed outstanding amount", () => {
    expect(resolveFinanceDocumentStatus(100, 100)).toBe("OPEN");
    expect(resolveFinanceDocumentStatus(100, 40)).toBe("PARTIALLY_SETTLED");
    expect(resolveFinanceDocumentStatus(100, 0)).toBe("SETTLED");
    expect(() => resolveFinanceDocumentStatus(100, -1)).toThrow(/không hợp lệ/);
  });
});
