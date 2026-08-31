import { describe, expect, it } from "vitest";

import { SYNTHETIC_CUSTOMER_360 } from "@/modules/customer-360/fixtures";
import {
  captureSellingPrice,
  resolveCustomerPrice,
} from "@/modules/customer-360/pricing";

describe("P3 customer price resolution", () => {
  const data = structuredClone(SYNTHETIC_CUSTOMER_360);
  const anPhat = data.customers.find((item) => item.code === "AN-PHAT")!;
  const minhTam = data.customers.find((item) => item.code === "MINH-TAM")!;
  const cement = data.materials.find((item) => item.code === "CEMENT-PCB40")!;
  const sand = data.materials.find((item) => item.code === "SAND-YELLOW")!;

  it("uses the exact four-level precedence", () => {
    expect(
      resolveCustomerPrice(data.priceRules, anPhat, cement, "2026-08-31"),
    ).toMatchObject({ scope: "CUSTOMER_MATERIAL", unitPrice: "82000" });
    expect(
      resolveCustomerPrice(data.priceRules, anPhat, sand, "2026-08-31"),
    ).toMatchObject({
      scope: "CUSTOMER_MATERIAL_GROUP",
      unitPrice: "325000",
    });
    expect(
      resolveCustomerPrice(data.priceRules, minhTam, cement, "2026-08-31"),
    ).toMatchObject({ scope: "DEFAULT", unitPrice: "87000" });
  });

  it("keeps captured history unchanged after a future rule version", () => {
    const oldResolution = resolveCustomerPrice(
      data.priceRules,
      anPhat,
      cement,
      "2026-08-31",
    )!;
    const snapshot = captureSellingPrice({
      resolved: oldResolution,
      transactionRef: "P3-PRICE-001",
      customer: anPhat,
      material: cement,
      capturedAt: "2026-08-31T10:00:00.000Z",
    });

    const futureRules = data.priceRules.map((rule) =>
      rule.id === oldResolution.ruleId ? { ...rule, validTo: "2026-09-30" } : rule,
    );
    futureRules.push({
      ...data.priceRules.find((rule) => rule.id === oldResolution.ruleId)!,
      id: "price-an-phat-cement-v2",
      unitPrice: "85000",
      validFrom: "2026-10-01",
      validTo: null,
      version: 2,
      changeReason: "Điều chỉnh cho quý IV.",
    });

    expect(
      resolveCustomerPrice(futureRules, anPhat, cement, "2026-10-01"),
    ).toMatchObject({ unitPrice: "85000", version: 2 });
    expect(snapshot).toMatchObject({ unitPrice: "82000", version: 1 });
    expect(() => Object.assign(snapshot, { unitPrice: "85000" })).toThrow();
  });
});
