import { describe, expect, it } from "vitest";
import { isExactEntryQuantity, isExactBaseQuantity } from "./quantity";
import { quantityInputError } from "./errors";

describe("stored input quantity boundaries", () => {
  it.each(["1.0000004", "NaN", "Infinity", "-1", "1,5", "1e2", "100000000000000", ""]) ("rejects unsupported input %s", (input) => {
    expect(isExactEntryQuantity(input)).toBe(false);
  });
  it("keeps all six decimal digits and the supported upper boundary", () => {
    expect(isExactEntryQuantity("15.000003")).toBe(true);
    expect(isExactEntryQuantity("99999999999999.999999")).toBe(true);
    expect(isExactEntryQuantity("0")).toBe(false);
    expect(isExactEntryQuantity("0", true)).toBe(true);
  });
  it("explains the failure without technical enums or silent rounding", () => {
    expect(quantityInputError("quantity_precision_exceeds_six")).toContain("không tự làm tròn");
    expect(quantityInputError("quantity_format_invalid")).not.toContain("quantity_");
  });
  it("rejects a recurring conversion before calculating money", () => {
    expect(isExactBaseQuantity("1", "1", "3")).toBe(false);
    expect(isExactBaseQuantity("3", "1", "3")).toBe(true);
    expect(isExactBaseQuantity("0.000001", "1", "1000000")).toBe(false);
  });
  it("preserves a large exact rational cancellation and rejects conversion overflow", () => {
    const factor = "99999999999999.999999";
    expect(isExactBaseQuantity("1.000001", factor, factor)).toBe(true);
    expect(isExactBaseQuantity(factor, "2", "1")).toBe(false);
  });
});
