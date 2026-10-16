import { describe, expect, it } from "vitest";
import { hiddenReason, readySegments, readyValue, totalCostMetric, valueTicks, type MoneyMetric, type SeriesPoint } from "./profit-series";

const ready = (value: string): MoneyMetric => ({ value_vnd: value, quality: "READY" });
function point(day: number, revenue: MoneyMetric, cost: MoneyMetric = ready("0"), profit: MoneyMetric = ready("0")): SeriesPoint {
  return { start: `2026-10-${String(day).padStart(2, "0")}T00:00:00+07:00`, end: `2026-10-${String(day + 1).padStart(2, "0")}T00:00:00+07:00`, revenue, total_cost: cost, net_profit: profit };
}

describe("profit series", () => {
  it("never turns a non-READY metric into zero", () => {
    expect(readyValue({ value_vnd: "0", quality: "READY" })).toBe(0n);
    expect(readyValue({ value_vnd: null, quality: "INCOMPLETE" })).toBeNull();
    expect(readyValue({ value_vnd: "120", quality: "FORBIDDEN" })).toBeNull();
    expect(readyValue({ value_vnd: "9007199254740993", quality: "READY" })).toBe(9007199254740993n);
  });

  it("breaks a line where a point is not READY", () => {
    const points = [point(1, ready("10")), point(2, ready("20")), point(3, { quality: "INCOMPLETE" }), point(4, ready("5"))];
    expect(readySegments(points, "revenue")).toEqual([[0, 1], [3]]);
  });

  it("hides a series with no READY point and keeps the reason", () => {
    const na = { quality: "NOT_APPLICABLE" as const };
    const points = [point(1, ready("10"), na, na), point(2, ready("20"), na, na)];
    expect(hiddenReason(points, "net_profit")).toBe("NOT_APPLICABLE");
    expect(hiddenReason(points, "revenue")).toBeNull();
  });

  it("adds direct cost and operating expense exactly, with net profit's quality", () => {
    expect(totalCostMetric({ direct_cost: ready("9007199254740993"), operating_expense: ready("7"), operating_profit: ready("-1") }))
      .toEqual({ value_vnd: "9007199254741000", quality: "READY" });
    expect(totalCostMetric({ direct_cost: ready("5"), operating_expense: { quality: "NOT_APPLICABLE" } as never, operating_profit: { quality: "NOT_APPLICABLE" } }))
      .toEqual({ quality: "NOT_APPLICABLE" });
    expect(totalCostMetric({ direct_cost: { quality: "FORBIDDEN" } as never, operating_expense: ready("5"), operating_profit: { quality: "FORBIDDEN" } }))
      .toEqual({ quality: "FORBIDDEN" });
  });

  it("builds clean ticks that include zero and cover negatives", () => {
    expect(valueTicks([1_200_000n, 300_000n])).toEqual([0n, 500_000n, 1_000_000n, 1_500_000n]);
    const ticks = valueTicks([-400_000n, 900_000n]);
    expect(ticks[0]).toBeLessThanOrEqual(-400_000n);
    expect(ticks).toContain(0n);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(900_000n);
    expect(valueTicks([])).toEqual([0n, 500_000n, 1_000_000n]);
  });
});
