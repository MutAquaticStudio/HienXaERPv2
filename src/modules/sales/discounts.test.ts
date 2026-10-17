import { describe, expect, it } from "vitest";
import { applySalesDiscounts, discountLabel, parseDiscountValue, unitDiscount } from "./discounts";

const ok = (result: ReturnType<typeof applySalesDiscounts>) => {
  if (!result.ok) throw new Error(result.message);
  return result;
};

describe("discount inputs", () => {
  it("reads VND as whole đồng and percentages under 100 with up to two decimals", () => {
    expect(parseDiscountValue("AMOUNT", "3.000")).toBe("3000");
    expect(parseDiscountValue("AMOUNT", "0")).toBeNull();
    expect(parseDiscountValue("PERCENT", "5")).toBe("5");
    expect(parseDiscountValue("PERCENT", "2,5")).toBe("2.5");
    expect(parseDiscountValue("PERCENT", "100")).toBeNull();
    expect(parseDiscountValue("PERCENT", "1,234")).toBeNull();
    expect(unitDiscount(60000n, { mode: "PERCENT", value: "5" })).toBe(3000n);
    expect(unitDiscount(99999n, { mode: "PERCENT", value: "2.5" })).toBe(2500n);
    expect(discountLabel({ mode: "PERCENT", value: "2.5" })).toBe("−2,5%");
    expect(discountLabel({ mode: "AMOUNT", value: "3000" })).toBe("−3.000 ₫");
  });
});

describe("applySalesDiscounts", () => {
  it("lowers each line's unit price by its own discount", () => {
    const result = ok(applySalesDiscounts([
      { quantity: "3", listUnitVnd: "60000", discount: { mode: "PERCENT", value: "5" } },
      { quantity: "2", listUnitVnd: "100000", discount: { mode: "AMOUNT", value: "10000" } },
      { quantity: "1", listUnitVnd: "50000", discount: null },
    ], null));
    expect(result.lines.map((line) => [line.unitPriceVnd, line.lineTotalVnd])).toEqual([["57000", "171000"], ["90000", "180000"], ["50000", "50000"]]);
    expect(result).toMatchObject({ grossTotalVnd: "430000", netTotalVnd: "401000", discountTotalVnd: "29000", orderRequestedVnd: "0" });
  });

  it("spreads an order discount to the đồng over the lines in proportion to their amounts", () => {
    const result = ok(applySalesDiscounts([
      { quantity: "10", listUnitVnd: "90000", discount: null },
      { quantity: "3", listUnitVnd: "300000", discount: null },
    ], { mode: "AMOUNT", value: "50000" }));
    expect(result.orderRequestedVnd).toBe("50000");
    expect(result.orderAppliedVnd).toBe("50000");
    expect(result.netTotalVnd).toBe("1750000");
    for (const line of result.lines) expect(BigInt(line.lineTotalVnd)).toBe(BigInt(line.unitPriceVnd) * (line.listUnitVnd === "90000" ? 10n : 3n));
  });

  it("applies a percentage order discount after line discounts and lands on a round total", () => {
    const result = ok(applySalesDiscounts([
      { quantity: "7", listUnitVnd: "123457", discount: { mode: "AMOUNT", value: "457" } },
      { quantity: "1", listUnitVnd: "2000", discount: null },
    ], { mode: "PERCENT", value: "10" }));
    // 7 × 123.000 + 2.000 = 863.000; 10 % = 86.300.
    expect(result.orderRequestedVnd).toBe("86300");
    expect(result.orderAppliedVnd).toBe("86300");
    expect(result.netTotalVnd).toBe("776700");
  });

  it("says how much could be applied when whole-đồng unit prices cannot reach the exact amount", () => {
    const result = ok(applySalesDiscounts([{ quantity: "10", listUnitVnd: "90000", discount: null }], { mode: "AMOUNT", value: "50005" }));
    expect(result.orderRequestedVnd).toBe("50005");
    expect(result.orderAppliedVnd).toBe("50000");
    expect(result.lines[0].unitPriceVnd).toBe("85000");
  });

  it("handles decimal quantities without overshooting the requested discount", () => {
    const result = ok(applySalesDiscounts([
      { quantity: "1.5", listUnitVnd: "350000", discount: null },
      { quantity: "2.25", listUnitVnd: "180000", discount: null },
    ], { mode: "AMOUNT", value: "30000" }));
    expect(BigInt(result.orderAppliedVnd)).toBeLessThanOrEqual(30000n);
    expect(BigInt(result.orderAppliedVnd)).toBeGreaterThanOrEqual(29998n);
    expect(BigInt(result.grossTotalVnd) - BigInt(result.netTotalVnd)).toBe(BigInt(result.orderAppliedVnd));
  });

  it("refuses a discount that would make a price zero or the order free", () => {
    expect(applySalesDiscounts([{ quantity: "1", listUnitVnd: "1000", discount: { mode: "AMOUNT", value: "1000" } }], null))
      .toEqual({ ok: false, message: "Dòng 1: giảm giá phải nhỏ hơn đơn giá." });
    expect(applySalesDiscounts([{ quantity: "1", listUnitVnd: "1000", discount: null }], { mode: "AMOUNT", value: "1000" }))
      .toEqual({ ok: false, message: "Giảm giá đơn phải nhỏ hơn tổng tiền hàng." });
  });
});
