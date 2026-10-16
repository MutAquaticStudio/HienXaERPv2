import { describe, expect, it } from "vitest";
import { adjustPrice, isValidAdjustment, priceChange, vndDigits } from "./bulk-adjust";

describe("bulk price adjustment (QA-FB-A11)", () => {
  it("raises by a percentage and rounds half-up to the chosen step", () => {
    expect(adjustPrice(95000n, "percent", "10", 1000)).toBe(105000n); // 104.500 → 105.000
    expect(adjustPrice(95000n, "percent", "10", 100)).toBe(104500n);
    expect(adjustPrice(95123n, "percent", "10", 1)).toBe(104635n); // 104.635,3
    expect(adjustPrice(16500000n, "percent", "-2.5", 1000)).toBe(16088000n); // 16.087.500 → 16.088.000
  });

  it("adds or subtracts an amount", () => {
    expect(adjustPrice(95000n, "amount", "+2500", 1000)).toBe(98000n); // 97.500 → 98.000
    expect(adjustPrice(95000n, "amount", "-5000", 1)).toBe(90000n);
  });

  it("stays exact beyond the safe JavaScript integer range", () => {
    expect(adjustPrice(9007199254740993n, "amount", "1", 1)).toBe(9007199254740994n);
  });

  it("never produces zero, negative or out-of-range prices", () => {
    expect(adjustPrice(400n, "percent", "-100", 1)).toBeNull();
    expect(adjustPrice(400n, "amount", "-400", 1)).toBeNull();
    expect(adjustPrice(400n, "percent", "-90", 1000)).toBeNull(); // 40 rounds to 0
    expect(adjustPrice(9223372036854775000n, "percent", "10", 1)).toBeNull();
  });

  it("accepts only sensible adjustment input", () => {
    for (const ok of ["10", "+5", "-2.5", "0.25"]) expect(isValidAdjustment("percent", ok)).toBe(true);
    for (const bad of ["", "0", "abc", "10%", "1.234", "1000"]) expect(isValidAdjustment("percent", bad)).toBe(false);
    expect(isValidAdjustment("amount", "-5000")).toBe(true);
    expect(isValidAdjustment("amount", "2.5")).toBe(false);
    expect(adjustPrice(95000n, "percent", "abc", 1)).toBeNull();
  });

  it("reads typed prices and describes the change", () => {
    expect(vndDigits("95.000 ₫")).toBe("95000");
    expect(vndDigits("000120")).toBe("120");
    expect(vndDigits("")).toBe("");
    expect(priceChange(95000n, 104500n)).toEqual({ amount: 9500n, percent: "10" });
    expect(priceChange(null, 50000n)).toEqual({ amount: 50000n, percent: null });
  });
});
