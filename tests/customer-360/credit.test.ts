import { describe, expect, it } from "vitest";

import {
  assertCreditOverride,
  evaluateCustomerCredit,
} from "@/modules/customer-360/credit";
import { SYNTHETIC_CUSTOMER_360 } from "@/modules/customer-360/fixtures";

describe("P3 customer credit control", () => {
  const data = structuredClone(SYNTHETIC_CUSTOMER_360);

  it("allows an order within limit and blocks limit or overdue breaches", () => {
    const anPhatExposure = data.creditExposures.find(
      (item) => item.customerId === "customer-an-phat",
    )!;
    const anPhatPolicy = data.creditPolicies.find(
      (item) => item.customerId === "customer-an-phat",
    )!;
    expect(
      evaluateCustomerCredit({
        policy: anPhatPolicy,
        exposure: anPhatExposure,
        orderAmount: "50000000",
      }),
    ).toMatchObject({ status: "CLEAR", projectedExposure: "400000000" });

    const blockedExposure = data.creditExposures.find(
      (item) => item.customerId === "customer-minh-tam",
    )!;
    const blockedPolicy = data.creditPolicies.find(
      (item) => item.customerId === "customer-minh-tam",
    )!;
    const decision = evaluateCustomerCredit({
      policy: blockedPolicy,
      exposure: blockedExposure,
      orderAmount: "1000000",
    });
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons).toHaveLength(2);
  });

  it("never represents a customer advance as negative receivables", () => {
    const exposure = {
      ...data.creditExposures[0]!,
      receivableAmount: "100",
      uninvoicedOrderAmount: "0",
      customerAdvanceAmount: "200",
      overdueAmount: "0",
    };
    const decision = evaluateCustomerCredit({
      policy: data.creditPolicies[0]!,
      exposure,
      orderAmount: "0",
    });
    expect(decision.projectedExposure).toBe("0");
    expect(exposure.receivableAmount).toBe("100");
    expect(exposure.customerAdvanceAmount).toBe("200");
  });

  it("requires both explicit permission and a meaningful override reason", () => {
    const blocked = {
      status: "BLOCKED" as const,
      projectedExposure: "118000000",
      availableCredit: "0",
      reasons: ["Vượt hạn mức."],
    };
    expect(() =>
      assertCreditOverride({
        decision: blocked,
        canOverride: false,
        reason: "Đã gọi khách hàng và được giám đốc duyệt.",
      }),
    ).toThrowError(/không có quyền/i);
    expect(() =>
      assertCreditOverride({
        decision: blocked,
        canOverride: true,
        reason: "Duyệt",
      }),
    ).toThrowError(/ít nhất 10/i);
    expect(() =>
      assertCreditOverride({
        decision: blocked,
        canOverride: true,
        reason: "Giám đốc đã duyệt cho đơn giao trong ngày.",
      }),
    ).not.toThrow();
  });
});
