import { describe, expect, it } from "vitest";
import { convertQuantity, formatQuantity, quantity, roundQuantity } from "./quantity";

describe("quantity conversion", () => {
  it("converts the canonical cement flow exactly", () => {
    const bags = convertQuantity(quantity("2", "ton"), "bag", { bagWeightKg: "50" });
    expect(bags).toEqual({ value: "40", unit: "bag" });
  });

  it("only rounds when a policy is supplied", () => {
    const exact = convertQuantity(quantity("1", "kg"), "ton");
    expect(exact.value).toBe("0.001");
    expect(roundQuantity(quantity("1.235", "kg"), 2).value).toBe("1.24");
  });
  it("preserves the sign of stock reductions below one base unit", () => {
    expect(formatQuantity("-0.500000")).toBe("-0,5");
    expect(formatQuantity("-0.000001")).toBe("-0,000001");
    expect(formatQuantity("-1234.567000")).toBe("-1.234,567");
    expect(formatQuantity("0.000001")).toBe("0,000001");
  });
});
