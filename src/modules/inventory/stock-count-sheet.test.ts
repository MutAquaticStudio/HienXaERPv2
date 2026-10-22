import { describe, expect, it } from "vitest";
import { needsUnitCost, sheetLines, sheetSummary, varianceOf, type SheetRow } from "./stock-count-sheet";

const row = (patch: Partial<SheetRow> & Pick<SheetRow, "materialId">): SheetRow => ({ code: patch.materialId.toUpperCase(), name: patch.materialId, symbol: "kg", book: "100", recorded: null, averageCost: "1500", ...patch });

describe("count sheet", () => {
  it("reads Vietnamese counts and measures the variance exactly", () => {
    expect(varianceOf(row({ materialId: "a" }), "98,5")?.toFixed()).toBe("-1.5");
    expect(varianceOf(row({ materialId: "a" }), "")).toBeNull();
    expect(varianceOf(row({ materialId: "a" }), "1.2.3")).toBeNull();
    expect(needsUnitCost(row({ materialId: "a", book: "0" }), varianceOf(row({ materialId: "a", book: "0" }), "5"))).toBe(true);
    expect(needsUnitCost(row({ materialId: "a" }), varianceOf(row({ materialId: "a" }), "105"))).toBe(false);
  });

  it("sends counted rows with the shared reason for variances and skips empty rows", () => {
    const rows = [row({ materialId: "a" }), row({ materialId: "b" }), row({ materialId: "c" })];
    const check = sheetLines(rows, { a: { counted: "100" }, b: { counted: "1.050" } }, "Kiểm định kỳ");
    expect(check.problems).toEqual({});
    expect(check.lines).toEqual([
      { materialId: "a", counted: "100", reason: "", unitCost: null },
      { materialId: "b", counted: "1050", reason: "Kiểm định kỳ", unitCost: null },
    ]);
  });

  it("keeps a default note for a variance without one (FB7) and flags a bad count and a missing cost basis", () => {
    const rows = [row({ materialId: "a" }), row({ materialId: "b" }), row({ materialId: "c", book: "0" }), row({ materialId: "d", book: "0" })];
    const check = sheetLines(rows, { a: { counted: "90" }, b: { counted: "abc" }, c: { counted: "5", reason: "Tìm thấy ở bãi" }, d: { counted: "5", reason: "Tìm thấy", unitCost: "2.000" } }, "");
    expect(Object.keys(check.problems)).toEqual(["b", "c"]);
    expect(check.problems.c).toContain("giá vốn mỗi kg");
    expect(check.lines).toEqual([{ materialId: "a", counted: "90", reason: "Lệch khi kiểm kho", unitCost: null }, { materialId: "d", counted: "5", reason: "Tìm thấy", unitCost: "2000" }]);
  });

  it("resends only rows changed since they were saved", () => {
    const saved = row({ materialId: "a", recorded: { counted: "98.000000", reason: "Hao hụt", unitCost: null } });
    expect(sheetLines([saved], {}, "").lines).toEqual([]);
    expect(sheetLines([saved], { a: { counted: "98" } }, "Lý do khác").lines).toEqual([]);
    expect(sheetLines([saved], { a: { counted: "97" } }, "").lines).toEqual([{ materialId: "a", counted: "97", reason: "Hao hụt", unitCost: null }]);
  });

  it("summarises counts and values the variance like approval will", () => {
    const rows = [row({ materialId: "a" }), row({ materialId: "b" }), row({ materialId: "c", book: "0", averageCost: null }), row({ materialId: "d" })];
    const summary = sheetSummary(rows, { a: { counted: "98" }, b: { counted: "100" }, c: { counted: "5", unitCost: "2000" } });
    expect(summary).toEqual({ total: 4, counted: 3, increase: 1, decrease: 1, match: 1, valueVnd: { increase: "10000", decrease: "3000" } });
    expect(sheetSummary(rows, { c: { counted: "5" } }).valueVnd).toBeNull();
  });
});
