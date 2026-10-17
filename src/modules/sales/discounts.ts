import Decimal from "decimal.js";
import { normalizeDecimalInput } from "@/lib/core/vn-number";

/**
 * KiotViet-style discounts on a sales order (FB3, 17/10/2026). A line discount lowers that line's unit price (by VND per
 * unit or by a percentage of it); an order discount is spread over the lines' unit prices in proportion to their
 * amounts. Every unit price stays a whole đồng, so the order total, credit, deliveries and billing keep working on the
 * stored unit price. Shared by the editor (live totals) and the server action (what is sent to the database).
 */
export type DiscountMode = "AMOUNT" | "PERCENT";
export type DiscountInput = { mode: DiscountMode; value: string } | null;
export type DiscountLine = { quantity: string; listUnitVnd: string; discount: DiscountInput };
export type DiscountedLine = { listUnitVnd: string; discountUnitVnd: string; unitPriceVnd: string; lineTotalVnd: string; grossTotalVnd: string };
export type DiscountResult =
  | { ok: true; lines: DiscountedLine[]; grossTotalVnd: string; netTotalVnd: string; discountTotalVnd: string;
      /** Order discount asked for and the part that could be applied (whole-đồng unit prices may leave a few đồng). */
      orderRequestedVnd: string; orderAppliedVnd: string }
  | { ok: false; message: string };

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const roundVnd = (value: Decimal.Value) => BigInt(new Exact(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
const lineAmount = (quantity: Decimal, unit: bigint) => roundVnd(quantity.mul(unit.toString()));

/** Canonical value of what was typed: whole đồng for AMOUNT, a percentage under 100 with up to 2 decimals for PERCENT. */
export function parseDiscountValue(mode: DiscountMode, raw: string): string | null {
  if (mode === "AMOUNT") {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    return /^[1-9]\d{0,17}$/.test(digits) ? digits : null;
  }
  const value = normalizeDecimalInput(raw, 2);
  return value && new Exact(value).gt(0) && new Exact(value).lt(100) ? value : null;
}

/** Per-unit discount of one line's own input. */
export function unitDiscount(listUnit: bigint, discount: DiscountInput): bigint {
  if (!discount) return 0n;
  return discount.mode === "AMOUNT" ? BigInt(discount.value) : roundVnd(new Exact(listUnit.toString()).mul(discount.value).div(100));
}

type Row = { quantity: Decimal; list: bigint; own: bigint; extra: bigint; gross: bigint; after: bigint };

const SPREAD_LIMIT = 200_000;

/**
 * Whole-đồng unit prices move a line's amount in steps of its quantity, so a proportional split can miss the asked
 * discount by a few đồng (10 bao + 3 m³, 50.000 off: 25.000 + 24.999). Among lines sold in whole units, find extra
 * per-unit amounts that add up exactly (fewest extra units, after easing each proportional share back a little).
 */
function exactSpread(rows: Row[], requested: bigint, applied: () => bigint) {
  const whole = rows.filter((row) => row.quantity.isInteger() && row.quantity.gt(0));
  if (!whole.length) return;
  const start = whole.map((row) => row.extra);
  for (const easeBack of [0n, 1n, 2n, 4n, 8n, 16n]) {
    whole.forEach((row, index) => { row.extra = start[index] > easeBack ? start[index] - easeBack : 0n; });
    const target = requested - applied();
    if (target < 0n || target > BigInt(SPREAD_LIMIT)) continue;
    const goal = Number(target);
    const coins = whole.map((row) => Number(row.quantity.toFixed(0)));
    // used[v] = coin that reached v with the fewest coins; reached[v] = that count.
    const reached = new Int32Array(goal + 1).fill(-1);
    const used = new Int16Array(goal + 1).fill(-1);
    reached[0] = 0;
    for (let value = 1; value <= goal; value += 1) {
      for (let coin = 0; coin < coins.length; coin += 1) {
        const from = value - coins[coin];
        if (from >= 0 && reached[from] >= 0 && (reached[value] < 0 || reached[from] + 1 < reached[value])) {
          reached[value] = reached[from] + 1;
          used[value] = coin;
        }
      }
    }
    if (reached[goal] < 0) continue;
    const added = whole.map(() => 0n);
    for (let value = goal; value > 0; value -= coins[used[value]]) added[used[value]] += 1n;
    if (whole.some((row, index) => row.extra + added[index] > row.list - row.own - 1n)) continue;
    whole.forEach((row, index) => { row.extra += added[index]; });
    if (applied() === requested) return;
  }
  whole.forEach((row, index) => { row.extra = start[index]; });
}

export function applySalesDiscounts(lines: DiscountLine[], order: DiscountInput): DiscountResult {
  const rows: Row[] = [];
  for (const [index, line] of lines.entries()) {
    const quantity = new Exact(line.quantity);
    const list = BigInt(line.listUnitVnd);
    const own = unitDiscount(list, line.discount);
    if (own >= list) return { ok: false, message: `Dòng ${index + 1}: giảm giá phải nhỏ hơn đơn giá.` };
    rows.push({ quantity, list, own, extra: 0n, gross: lineAmount(quantity, list), after: lineAmount(quantity, list - own) });
  }
  const subtotal = rows.reduce((sum, row) => sum + row.after, 0n);
  let requested = 0n;
  if (order) {
    requested = order.mode === "AMOUNT" ? BigInt(order.value) : roundVnd(new Exact(subtotal.toString()).mul(order.value).div(100));
    if (requested >= subtotal) return { ok: false, message: "Giảm giá đơn phải nhỏ hơn tổng tiền hàng." };
  }

  if (requested > 0n) {
    const net = (row: Row, extra: bigint) => lineAmount(row.quantity, row.list - row.own - extra);
    // Proportional share first, rounded down to whole đồng per unit, never below 1 đồng a unit.
    for (const row of rows) {
      const share = new Exact(requested.toString()).mul(row.after.toString()).div(subtotal.toString());
      const perUnit = BigInt(share.div(row.quantity).floor().toFixed(0));
      row.extra = perUnit < row.list - row.own - 1n ? perUnit : row.list - row.own - 1n;
    }
    const applied = () => rows.reduce((sum, row) => sum + row.after - net(row, row.extra), 0n);
    let rest = requested - applied();
    if (rest !== 0n) exactSpread(rows, requested, applied);
    rest = requested - applied();
    // Rounding of decimal quantities can overshoot slightly: step back on the smallest line first.
    for (let guard = 0; rest < 0n && guard < 10_000; guard += 1) {
      const row = [...rows].filter((item) => item.extra > 0n).sort((a, b) => a.quantity.cmp(b.quantity))[0];
      if (!row) break;
      row.extra -= 1n;
      rest = requested - applied();
    }
    // Then close what is left with the largest step that still fits.
    for (let guard = 0; rest > 0n && guard < 100_000; guard += 1) {
      let best: { row: Row; units: bigint; step: bigint } | null = null;
      for (const row of rows) {
        const room = row.list - row.own - 1n - row.extra;
        if (room <= 0n) continue;
        const step = net(row, row.extra) - net(row, row.extra + 1n);
        if (step <= 0n || step > rest) continue;
        const units = row.quantity.isInteger() ? (rest / step < room ? rest / step : room) : 1n;
        if (!best || step * units > best.step * best.units) best = { row, units, step };
      }
      if (!best) break;
      best.row.extra += best.units;
      rest = requested - applied();
    }
  }

  const result = rows.map((row) => {
    const discountUnit = row.own + row.extra;
    const unit = row.list - discountUnit;
    return { listUnitVnd: row.list.toString(), discountUnitVnd: discountUnit.toString(), unitPriceVnd: unit.toString(),
      lineTotalVnd: lineAmount(row.quantity, unit).toString(), grossTotalVnd: row.gross.toString() };
  });
  const gross = rows.reduce((sum, row) => sum + row.gross, 0n);
  const netTotal = result.reduce((sum, row) => sum + BigInt(row.lineTotalVnd), 0n);
  return { ok: true, lines: result, grossTotalVnd: gross.toString(), netTotalVnd: netTotal.toString(), discountTotalVnd: (gross - netTotal).toString(),
    orderRequestedVnd: requested.toString(), orderAppliedVnd: (subtotal - netTotal).toString() };
}

/** "−5%" or "−3.000 ₫/đv"-style label for a line's own discount. */
export function discountLabel(discount: DiscountInput): string | null {
  if (!discount) return null;
  return discount.mode === "PERCENT" ? `−${discount.value.replace(".", ",")}%` : `−${new Intl.NumberFormat("vi-VN").format(BigInt(discount.value))} ₫`;
}

/** Discount inputs posted by the order form: one discountMode/discountValue pair per line, plus the order's own pair. */
export function readDiscountInputs(form: FormData, lineCount: number): { ok: true; lines: DiscountInput[]; order: DiscountInput } | { ok: false; message: string } {
  const modes = form.getAll("discountMode").map(String);
  const values = form.getAll("discountValue").map(String);
  if ((modes.length && modes.length !== lineCount) || values.length !== modes.length) return { ok: false, message: "Thông tin giảm giá từng dòng không khớp." };
  const read = (mode: string, raw: string, label: string): DiscountInput | string => {
    if (!mode && !raw.trim()) return null;
    if (mode !== "AMOUNT" && mode !== "PERCENT") return `${label}: kiểu giảm giá không hợp lệ.`;
    if (!raw.trim()) return null;
    const value = parseDiscountValue(mode, raw);
    return value ? { mode, value } : `${label}: ${mode === "PERCENT" ? "phần trăm giảm phải lớn hơn 0 và nhỏ hơn 100." : "số tiền giảm phải là số đồng dương."}`;
  };
  const lines: DiscountInput[] = [];
  for (let index = 0; index < lineCount; index += 1) {
    const line = read(modes[index] ?? "", values[index] ?? "", `Dòng ${index + 1}`);
    if (typeof line === "string") return { ok: false, message: line };
    lines.push(line);
  }
  const order = read(String(form.get("orderDiscountMode") ?? ""), String(form.get("orderDiscountValue") ?? ""), "Giảm giá đơn");
  if (typeof order === "string") return { ok: false, message: order };
  return { ok: true, lines, order };
}
