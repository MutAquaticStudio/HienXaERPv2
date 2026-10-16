import { expect, it } from "vitest";
import { ratioFromDecimal, splitPriceByUnits, unitCostVnd } from "./unit-split";

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
