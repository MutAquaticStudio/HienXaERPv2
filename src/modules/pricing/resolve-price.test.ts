import { describe, expect, it } from "vitest";
import { createPriceSnapshot, type PriceRule, resolvePrice } from "./resolve-price";

const base = {
  branchId: "branch-a", materialId: "cement", priceUomId: "ton", unitPriceVnd: "3000000",
  version: 1, sourceType: "LIST" as const, effectiveFrom: "2026-01-01T00:00:00Z", active: true,
};

describe("pricing precedence and snapshots", () => {
  it("prefers customer material then latest version", () => {
    const rules: PriceRule[] = [
      { ...base, id: "default", scope: "DEFAULT" },
      { ...base, id: "customer-v1", scope: "CUSTOMER_MATERIAL", customerId: "customer-a" },
      { ...base, id: "customer-v2", scope: "CUSTOMER_MATERIAL", customerId: "customer-a", version: 2, unitPriceVnd: "2900000" },
    ];
    const selected = resolvePrice({ branchId: "branch-a", customerId: "customer-a", customerTierCode: "A", materialId: "cement", materialGroupId: "cement-group", priceUomId: "ton", at: new Date("2026-09-12T00:00:00Z"), rules });
    expect(selected.id).toBe("customer-v2");
  });

  it("does not use expired rules", () => {
    expect(() => resolvePrice({ branchId: "branch-a", customerId: "customer-a", materialId: "cement", materialGroupId: "cement-group", priceUomId: "ton", at: new Date("2026-09-12T00:00:00Z"), rules: [{ ...base, id: "expired", scope: "DEFAULT", effectiveTo: "2026-08-01T00:00:00Z" }] })).toThrow();
  });

  it("keeps a transaction snapshot unchanged when the rule later changes", () => {
    const rule: PriceRule = { ...base, id: "rule-1", scope: "DEFAULT" };
    const snapshot = createPriceSnapshot({ rule, orderedUomId: "ton", baseUomId: "kg", conversionNumerator: "1000", conversionDenominator: "1", roundingMode: "HALF_UP" });
    const changedRule = { ...rule, unitPriceVnd: "3500000", version: 2 };
    expect(changedRule.unitPriceVnd).toBe("3500000");
    expect(snapshot.unitPriceVnd).toBe("3000000");
    expect(snapshot.ruleVersion).toBe(1);
  });

  it("requires approval metadata for a manual price", () => {
    expect(() => createPriceSnapshot({ manualPriceVnd: "2800000", orderedUomId: "ton", baseUomId: "kg", conversionNumerator: "1000", conversionDenominator: "1", roundingMode: "HALF_UP" })).toThrow();
  });
});
