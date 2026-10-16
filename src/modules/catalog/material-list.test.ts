import { describe, expect, it } from "vitest";
import { currentDefaultPrice, stockSummary, type ListPriceRule } from "./material-list";

const now = Date.parse("2026-10-16T05:00:00Z");
const rule = (change: Partial<ListPriceRule>): ListPriceRule => ({ material_id: "m", scope_type: "DEFAULT", price_uom_id: "bao", unit_price_vnd: "95000", version: 1, active: true, effective_from: "2026-01-01T00:00:00+07:00", effective_to: null, ...change });

describe("current default price", () => {
  it("takes the newest version in force, preferring the base unit", () => {
    const rules = [rule({ version: 1 }), rule({ version: 3, unit_price_vnd: "99000" }), rule({ version: 9, price_uom_id: "tan", unit_price_vnd: "1900000" })];
    expect(currentDefaultPrice(rules, "m", "bao", now)).toEqual({ unitPriceVnd: "99000", uomId: "bao" });
  });
  it("ignores customer prices, future, expired and inactive rules", () => {
    const rules = [rule({ scope_type: "CUSTOMER_MATERIAL" }), rule({ effective_from: "2026-11-01T00:00:00+07:00" }), rule({ effective_to: "2026-10-01T00:00:00+07:00" }), rule({ active: false })];
    expect(currentDefaultPrice(rules, "m", "bao", now)).toBeNull();
  });
  it("falls back to another unit when the base unit has no price", () => {
    expect(currentDefaultPrice([rule({ price_uom_id: "tan", unit_price_vnd: "1900000" })], "m", "bao", now)).toEqual({ unitPriceVnd: "1900000", uomId: "tan" });
  });
});

describe("stock summary", () => {
  const rows = [
    { material_id: "m", warehouse_id: "w1", on_hand_base_quantity: "10.5", available_base_quantity: "8", inventory_value_vnd: "1000000" },
    { material_id: "m", warehouse_id: "w2", on_hand_base_quantity: "2.5", available_base_quantity: "2.5", inventory_value_vnd: "300001" },
    { material_id: "x", warehouse_id: "w1", on_hand_base_quantity: "99", available_base_quantity: "99", inventory_value_vnd: "1" },
  ];
  it("adds exact quantities across warehouses and averages cost by value / quantity", () => {
    expect(stockSummary(rows, "m")).toMatchObject({ onHand: "13", available: "10.5", averageCostVnd: "100000" });
  });
  it("gives no average cost when values are hidden or nothing is on hand", () => {
    expect(stockSummary(rows.map((row) => ({ ...row, inventory_value_vnd: null })), "m")?.averageCostVnd).toBeNull();
    expect(stockSummary([{ ...rows[0], on_hand_base_quantity: "0" }], "m")?.averageCostVnd).toBeNull();
    expect(stockSummary(rows, "none")).toBeNull();
  });
});
