import { describe, expect, it } from "vitest";
import { convertQuantity, quantity, roundQuantity } from "./quantity";

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
});
