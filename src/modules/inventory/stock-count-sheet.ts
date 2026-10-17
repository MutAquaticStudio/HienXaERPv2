import Decimal from "decimal.js";
import { normalizeDecimalInput } from "@/lib/core/vn-number";

/** One material of a count sheet (FB2 Đợt 5). Quantities are canonical base-unit decimals. */
export type SheetRow = {
  materialId: string;
  code: string;
  name: string;
  symbol: string;
  /** Book quantity: what the saved line was counted against, else on hand in the warehouse now. */
  book: string;
  /** The count already saved for this material, if any. */
  recorded: { counted: string; reason: string | null; unitCost: string | null } | null;
  /** Average cost per base unit; only for actors who may read costs. */
  averageCost: string | null;
};
/** What the user typed on the sheet, keyed by material. Missing fields fall back to the saved count. */
export type SheetEntry = { counted?: string; reason?: string; unitCost?: string };
export type SheetLine = { materialId: string; counted: string; reason: string; unitCost: string | null };
export type SheetCheck = { lines: SheetLine[]; problems: Record<string, string> };

export function entryOf(row: SheetRow, typed: SheetEntry | undefined) {
  return {
    counted: typed?.counted ?? row.recorded?.counted ?? "",
    reason: typed?.reason ?? row.recorded?.reason ?? "",
    unitCost: typed?.unitCost ?? row.recorded?.unitCost ?? "",
  };
}

/** Counted minus book, or null while the count is empty or unreadable. */
export function varianceOf(row: SheetRow, countedText: string): Decimal | null {
  const counted = countedText.trim() ? normalizeDecimalInput(countedText) : null;
  return counted === null ? null : new Decimal(counted).minus(row.book);
}

/** An increase needs a cost basis when nothing is on the books to average from. */
export function needsUnitCost(row: SheetRow, variance: Decimal | null) {
  return !!variance && variance.gt(0) && new Decimal(row.book).lte(0);
}

const sameDecimal = (left: string | null, right: string | null) => left === right || (left !== null && right !== null && new Decimal(left).eq(right));

/**
 * Lines to send to record_stock_count_lines_batch: every counted row that is new or changed since it was saved.
 * A variance needs a reason (its own, else the shared one); an increase with nothing on the books needs a unit cost.
 * Rows left empty are not counted yet and are skipped.
 */
export function sheetLines(rows: SheetRow[], typed: Record<string, SheetEntry>, sharedReason: string): SheetCheck {
  const lines: SheetLine[] = [];
  const problems: Record<string, string> = {};
  for (const row of rows) {
    const entry = entryOf(row, typed[row.materialId]);
    if (!entry.counted.trim()) continue;
    const counted = normalizeDecimalInput(entry.counted);
    if (counted === null) { problems[row.materialId] = "Số đếm không hợp lệ (tối đa 6 chữ số thập phân)."; continue; }
    const variance = new Decimal(counted).minus(row.book);
    const reason = entry.reason.trim() || (variance.isZero() ? "" : sharedReason.trim());
    if (!variance.isZero() && reason.length < 3) { problems[row.materialId] = "Nhập lý do chênh lệch (ít nhất 3 ký tự) hoặc lý do chung."; continue; }
    const unitCost = entry.unitCost.trim() ? normalizeDecimalInput(entry.unitCost) : null;
    if (entry.unitCost.trim() && (unitCost === null || new Decimal(unitCost).lte(0))) { problems[row.materialId] = "Giá vốn phải là số lớn hơn 0."; continue; }
    if (needsUnitCost(row, variance) && unitCost === null) { problems[row.materialId] = `Chưa có giá vốn: nhập giá vốn mỗi ${row.symbol} cho phần tăng.`; continue; }
    const saved = row.recorded;
    const changed = !saved || !sameDecimal(saved.counted, counted) || (saved.reason ?? "") !== reason || !sameDecimal(saved.unitCost, unitCost);
    if (changed) lines.push({ materialId: row.materialId, counted, reason, unitCost });
  }
  return { lines, problems };
}

export type SheetSummary = { total: number; counted: number; increase: number; decrease: number; match: number; valueVnd: { increase: string; decrease: string } | null };

/**
 * Counts and, when every varied row has a cost, the value of the variance: decreases at the average cost, increases at
 * the typed cost or else the average cost (as approval will post them). Rounded to whole đồng for display.
 */
export function sheetSummary(rows: SheetRow[], typed: Record<string, SheetEntry>): SheetSummary {
  let counted = 0, increase = 0, decrease = 0, match = 0, valued = true;
  let up = new Decimal(0), down = new Decimal(0);
  for (const row of rows) {
    const entry = entryOf(row, typed[row.materialId]);
    const variance = varianceOf(row, entry.counted);
    if (!variance) continue;
    counted += 1;
    if (variance.isZero()) { match += 1; continue; }
    const typedCost = entry.unitCost.trim() ? normalizeDecimalInput(entry.unitCost) : null;
    const cost = variance.gt(0) ? typedCost ?? row.averageCost : row.averageCost;
    if (variance.gt(0)) increase += 1; else decrease += 1;
    if (!cost) { valued = false; continue; }
    if (variance.gt(0)) up = up.plus(variance.mul(cost)); else down = down.plus(variance.abs().mul(cost));
  }
  const round = (value: Decimal) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
  return { total: rows.length, counted, increase, decrease, match, valueVnd: valued ? { increase: round(up), decrease: round(down) } : null };
}
