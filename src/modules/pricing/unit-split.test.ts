import { expect, it } from "vitest";
import { conversionSentences, ratioFromDecimal, ratioFromDirection, splitPriceByUnits, unitCostVnd } from "./unit-split";

const kg = { uomId: "kg", numerator: "1", denominator: "1" };
const bao = { uomId: "bao", numerator: "50", denominator: "1" };
const ta = { uomId: "ta", numerator: "100", denominator: "1" };
const tan = { uomId: "tan", numerator: "1000", denominator: "1" };

it("splits a per-tonne price into kg, bag and quintal prices", () => {
  const prices = splitPriceByUnits(tan, 6_000_000n, [kg, bao, ta, tan], 1000);
  expect(Object.fromEntries(prices)).toEqual({ kg: 6000n, bao: 300000n, ta: 600000n, tan: 6000000n });
});

it("rounds each suggestion half-up to the chosen step without floating point", () => {
  const cay = { uomId: "cay", numerator: "7.22", denominator: "1" };
  // 18.500 ₫/kg × 7,22 kg = 133.570 ₫ → 134.000 (1.000), 133.600 (100), 133.570 (exact).
  expect(splitPriceByUnits(kg, 18_500n, [cay], 1000).get("cay")).toBe(134000n);
  expect(splitPriceByUnits(kg, 18_500n, [cay], 100).get("cay")).toBe(133600n);
  expect(splitPriceByUnits(kg, 18_500n, [cay], 1).get("cay")).toBe(133570n);
});

it("drops a unit whose suggestion rounds to nothing and keeps the source price as typed", () => {
  const gram = { uomId: "g", numerator: "0.001", denominator: "1" };
  const prices = splitPriceByUnits(kg, 300n, [gram, kg], 1000);
  expect(prices.has("g")).toBe(false);
  expect(prices.get("kg")).toBe(300n);
});

it("derives unit cost and exact ratios", () => {
  expect(unitCostVnd("5400.4", bao)).toBe(270020n);
  expect(ratioFromDecimal("7.220")).toEqual({ numerator: "7.22", denominator: "1" });
});

it("stores a conversion typed either way (Owner 18/10: 1 tấn = 20 bao)", () => {
  expect(ratioFromDirection("50", "UNIT_TO_BASE")).toEqual({ numerator: "50", denominator: "1" });
  expect(ratioFromDirection("20", "BASE_TO_UNIT")).toEqual({ numerator: "1", denominator: "20" });
  expect(ratioFromDirection("1000", "BASE_TO_UNIT")).toEqual({ numerator: "1", denominator: "1000" });
  expect(ratioFromDirection("0.5", "BASE_TO_UNIT")).toEqual({ numerator: "1", denominator: "0.5" });
});

it("refuses a conversion whose one unit is not an exact base amount", () => {
  // 1 tấn = 3 bao → 1 bao = 0,333… tấn: an order of 1 bao could not be counted in tấn.
  expect(ratioFromDirection("3", "BASE_TO_UNIT")).toBeNull();
  expect(ratioFromDirection("10000000", "BASE_TO_UNIT")).toBeNull();
  expect(ratioFromDirection("0", "UNIT_TO_BASE")).toBeNull();
  expect(ratioFromDirection("1.1234567", "UNIT_TO_BASE")).toBeNull();
  expect(ratioFromDirection("abc", "UNIT_TO_BASE")).toBeNull();
});

it("reads a conversion as words both ways, the larger number first", () => {
  expect(conversionSentences("Tấn", "Bao", "20", "1")).toEqual({ main: "1 Tấn = 20 Bao", other: "1 Bao = 0,05 Tấn" });
  expect(conversionSentences("Bao", "Tấn", "1", "20")).toEqual({ main: "1 Tấn = 20 Bao", other: "1 Bao = 0,05 Tấn" });
  expect(conversionSentences("Bao", "kg", "50", "1")).toEqual({ main: "1 Bao = 50 kg", other: "1 kg = 0,02 Bao" });
  expect(conversionSentences("Thùng", "Hộp", "1", "3")).toEqual({ main: "1 Hộp = 3 Thùng", other: "1 Thùng = ≈ 0,333333 Hộp" });
});
