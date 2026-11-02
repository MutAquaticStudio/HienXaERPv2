import Decimal from "decimal.js";
import { isExactEntryQuantity } from "@/lib/core/quantity";

/** D46: a delivery note shared out into 2–5 notes before loading. */
export const SPLIT_MIN_PARTS = 2;
export const SPLIT_MAX_PARTS = 5;

export type SplitLine = { id: string; planned: string };
export type SplitAssignment = { employeeId: string; vehicleId: string; scheduledStart: string };
/** quantities[lineId][partIndex] for parts 2..n (index 1..n-1); part 1 takes what is left. */
export type SplitQuantities = Record<string, string[]>;
export type SplitPart = {
  lines: { delivery_line_id: string; base_quantity: string }[];
  employee_id?: string; vehicle_id?: string; scheduled_start?: string;
};

/** "12,5" or "12.5" → "12.5"; empty stays empty. */
export function normalizeQuantity(value: string | undefined) {
  return (value ?? "").trim().replace(",", ".");
}

/** What part 1 keeps of a line: the planned quantity minus what the other parts take (may be negative = too much). */
export function remainderOf(line: SplitLine, takes: (string | undefined)[]) {
  return takes.reduce((left, value) => {
    const amount = normalizeQuantity(value);
    return amount && isExactEntryQuantity(amount, true) ? left.minus(amount) : left;
  }, new Decimal(line.planned));
}

export type SplitPlan = { ok: true; parts: SplitPart[] } | { ok: false; message: string };

/**
 * The parts sent to the database. Part 1 keeps the rest of every line; each other part takes what was typed. Every part
 * needs at least one line, nothing may be more than planned, and quantities keep at most 6 decimals (never rounded).
 */
export function buildSplitPlan(lines: SplitLine[], partCount: number, quantities: SplitQuantities, assignments: (SplitAssignment | undefined)[]): SplitPlan {
  if (!Number.isInteger(partCount) || partCount < SPLIT_MIN_PARTS || partCount > SPLIT_MAX_PARTS) {
    return { ok: false, message: `Chọn tách thành ${SPLIT_MIN_PARTS} đến ${SPLIT_MAX_PARTS} phiếu.` };
  }
  const parts: SplitPart[] = Array.from({ length: partCount }, () => ({ lines: [] }));
  for (const line of lines) {
    const takes = (quantities[line.id] ?? []).slice(1, partCount);
    for (const [offset, value] of takes.entries()) {
      const amount = normalizeQuantity(value);
      if (!amount) continue;
      if (!isExactEntryQuantity(amount, true)) return { ok: false, message: "Số lượng chỉ gồm chữ số, tối đa 6 chữ số sau dấu thập phân." };
      if (new Decimal(amount).gt(0)) parts[offset + 1].lines.push({ delivery_line_id: line.id, base_quantity: new Decimal(amount).toFixed() });
    }
    const left = remainderOf(line, takes);
    if (left.isNegative()) return { ok: false, message: "Tổng số lượng chia cho các phiếu vượt số lượng của dòng hàng." };
    if (left.gt(0)) parts[0].lines.push({ delivery_line_id: line.id, base_quantity: left.toFixed() });
  }
  const empty = parts.findIndex((part) => part.lines.length === 0);
  if (empty >= 0) return { ok: false, message: `Phiếu ${empty + 1} chưa có hàng. Nhập số lượng cho phiếu đó hoặc giảm số phiếu.` };
  for (const [index, assignment] of assignments.slice(0, partCount).entries()) {
    if (!assignment || (!assignment.employeeId && !assignment.vehicleId && !assignment.scheduledStart)) continue;
    if (!assignment.employeeId || !assignment.vehicleId || !assignment.scheduledStart) {
      return { ok: false, message: `Phiếu ${index + 1}: chọn đủ người giao, xe và giờ giao, hoặc để trống cả ba để điều phối sau.` };
    }
    parts[index] = { ...parts[index], employee_id: assignment.employeeId, vehicle_id: assignment.vehicleId, scheduled_start: assignment.scheduledStart };
  }
  return { ok: true, parts };
}
