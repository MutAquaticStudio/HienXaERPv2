import { describe, expect, it } from "vitest";

import { evaluatePriceSafety } from "@/modules/commercial/price-safety";

describe("P4 price safety", () => {
  it("accepts a resolved price without approval", () => {
    expect(
      evaluatePriceSafety({
        referenceUnitPrice: "82000",
        requestedUnitPrice: "82000",
        canOverride: false,
        reason: "",
      }),
    ).toMatchObject({ status: "RULE_MATCH", discountPercent: "0" });
  });

  it("requires permission and reason when selling below the resolved price", () => {
    expect(() =>
      evaluatePriceSafety({
        referenceUnitPrice: "82000",
        requestedUnitPrice: "80000",
        canOverride: false,
        reason: "Khách mua số lượng lớn",
      }),
    ).toThrowError(/không có quyền điều chỉnh giá/i);
    expect(() =>
      evaluatePriceSafety({
        referenceUnitPrice: "82000",
        requestedUnitPrice: "80000",
        canOverride: true,
        reason: "Giảm giá",
      }),
    ).toThrowError(/ít nhất 10 ký tự/i);
    expect(
      evaluatePriceSafety({
        referenceUnitPrice: "82000",
        requestedUnitPrice: "80000",
        canOverride: true,
        reason: "Khách mua khối lượng lớn trong tháng.",
      }),
    ).toMatchObject({ status: "APPROVED_OVERRIDE", discountPercent: "2.44" });
  });
});
