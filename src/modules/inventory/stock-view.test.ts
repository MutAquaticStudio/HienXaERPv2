import { expect, it } from "vitest";
import { inUnit, largestUnit, stockCard } from "./stock-view";

const symbols = new Map([["kg", "kg"], ["bao", "bao"], ["tan", "tấn"], ["ta", "tạ"]]);

it("picks the largest unit that converts to the base unit", () => {
  const conversions = [
    { material_id: "xm", from_uom_id: "bao", to_uom_id: "kg", numerator: "50", denominator: "1" },
    { material_id: "xm", from_uom_id: "tan", to_uom_id: "kg", numerator: "1000", denominator: "1" },
    { material_id: "xm", from_uom_id: "ta", to_uom_id: "kg", numerator: "100", denominator: "1" },
    { material_id: "other", from_uom_id: "tan", to_uom_id: "kg", numerator: "2000", denominator: "1" },
  ];
  expect(largestUnit(conversions, "xm", "kg", symbols)).toEqual({ symbol: "tấn", numerator: "1000", denominator: "1" });
  expect(largestUnit(conversions, "cat", "kg", symbols)).toBeNull();
});

it("shows base quantities in a larger unit exactly, or rounded with ≈", () => {
  expect(inUnit("4850", { symbol: "tấn", numerator: "1000", denominator: "1" })).toBe("4,85 tấn");
  expect(inUnit("4850", { symbol: "bao", numerator: "50", denominator: "1" })).toBe("97 bao");
  expect(inUnit("100", { symbol: "xe", numerator: "3", denominator: "1" })).toBe("≈ 33,333 xe");
});

it("works the warehouse balance back from today's on-hand", () => {
  const card = stockCard([
    { id: "3", location_kind: "WAREHOUSE", warehouse_id: "k", base_quantity_delta: "-150", occurred_at: "2026-10-17" },
    { id: "2", location_kind: "VEHICLE", warehouse_id: null, base_quantity_delta: "150", occurred_at: "2026-10-17" },
    { id: "1", location_kind: "WAREHOUSE", warehouse_id: "k", base_quantity_delta: "5000", occurred_at: "2026-10-16" },
  ], "4850");
  expect(card.map((row) => row.balanceAfter)).toEqual(["4850", null, "5000"]);
});
