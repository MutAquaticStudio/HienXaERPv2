import { describe, expect, it } from "vitest";

import { parseProfitabilityForm } from "@/modules/profitability/commands";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("P9 profitability command validation", () => {
  it("accepts a direct actual cost with explicit reason and occurrence time", () => {
    expect(
      parseProfitabilityForm(
        form({
          kind: "profitability.cost.record",
          salesOrderId: "order-001",
          basis: "ACTUAL",
          category: "TRANSPORT",
          amount: "3250000",
          occurredAt: "2026-09-01T09:00",
          reason: "Cước xe theo phiếu giao hàng số 15",
        }),
      ),
    ).toMatchObject({
      basis: "ACTUAL",
      category: "TRANSPORT",
      amount: "3250000",
    });
  });

  it("rejects overhead-like or unknown direct-cost categories", () => {
    expect(() =>
      parseProfitabilityForm(
        form({
          kind: "profitability.cost.record",
          salesOrderId: "order-001",
          basis: "ACTUAL",
          category: "GENERAL_OVERHEAD",
          amount: "1000000",
          occurredAt: "2026-09-01T09:00",
          reason: "Phân bổ chi phí văn phòng chung vào đơn",
        }),
      ),
    ).toThrow(/Nhóm chi phí/);
  });

  it("requires an auditable reason to finalize or reopen", () => {
    expect(() =>
      parseProfitabilityForm(
        form({
          kind: "profitability.reopen",
          salesOrderId: "order-001",
        reason: "Sai",
        }),
      ),
    ).toThrow(/ít nhất 10/);
  });
});
