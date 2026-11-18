import Decimal from "decimal.js";

import { businessDaysBetween, isBusinessDay, shiftBusinessDay } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { portalOrderStateLabel } from "@/modules/portal/presentation";
import type { OrderedReport, OrderedReportDay, OrderedReportGood } from "@/modules/portal/ordered-report-schema";

/** D98: the longest period one report covers (the database refuses more). */
export const ORDERED_REPORT_MAX_DAYS = 92;
export const ORDERED_REPORT_PATH = "/customer/reports/ordered";

export type PeriodPreset = { key: "today" | "yesterday" | "week" | "month"; label: string; from: string; to: string };

/** "Hôm nay · Hôm qua · 7 ngày · Tháng này" for the business day `today`. "7 ngày" is today and the six days before. */
export function periodPresets(today: string): PeriodPreset[] {
  const yesterday = shiftBusinessDay(today, -1);
  return [
    { key: "today", label: "Hôm nay", from: today, to: today },
    { key: "yesterday", label: "Hôm qua", from: yesterday, to: yesterday },
    { key: "week", label: "7 ngày", from: shiftBusinessDay(today, -6), to: today },
    { key: "month", label: "Tháng này", from: `${today.slice(0, 8)}01`, to: today },
  ];
}

/** "17/11/2026" (or "7/1/2026") → "2026-11-17"; null when it is not a real day. */
export function parseDayInput(text: string): string | null {
  const match = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\s*$/.exec(text);
  if (!match) return null;
  const day = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isBusinessDay(day) ? day : null;
}

/** "2026-11-17" → "17/11/2026". */
export function formatDayInput(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

/** "17/11" of a business day. */
export function shortDay(day: string) {
  return formatDayInput(day).slice(0, 5);
}

const WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** "Thứ Hai, 16/11" */
export function weekdayDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]}, ${shortDay(day)}`;
}

/** Why a pair of days cannot be a report period, in words for the customer; null when it can. */
export function periodProblem(from: string, to: string): string | null {
  if (!isBusinessDay(from) || !isBusinessDay(to)) return "Ngày chưa đúng. Nhập theo dạng ngày/tháng/năm, ví dụ 17/11/2026.";
  if (from > to) return "Ngày bắt đầu phải trước hoặc cùng ngày kết thúc.";
  if (businessDaysBetween(from, to) + 1 > ORDERED_REPORT_MAX_DAYS) return `Chọn tối đa ${ORDERED_REPORT_MAX_DAYS} ngày mỗi lần.`;
  return null;
}

export type ResolvedPeriod = {
  from: string;
  to: string;
  /** The day picked in "Theo ngày", only inside a period of several days. */
  day: string | null;
  /** A plain sentence when the address carried a period that cannot be used (the report then shows today). */
  notice: string | null;
  /** What the two date boxes keep showing when the address was wrong. */
  fromText: string;
  toText: string;
};

/** The period of the page from `?from=&to=&day=`; missing → today, wrong → today with a sentence and the typed values kept. */
export function resolveOrderedPeriod(query: { from?: string; to?: string; day?: string }, today: string): ResolvedPeriod {
  const fallback = (notice: string | null, from: string, to: string): ResolvedPeriod => ({
    from: today, to: today, day: null, notice,
    fromText: from ? (isBusinessDay(from) ? formatDayInput(from) : from) : formatDayInput(today),
    toText: to ? (isBusinessDay(to) ? formatDayInput(to) : to) : formatDayInput(today),
  });
  const from = query.from?.trim() ?? "";
  const to = query.to?.trim() ?? "";
  if (!from && !to) return fallback(null, "", "");
  const problem = from && to ? periodProblem(from, to) : "Chọn đủ hai ngày: từ ngày và đến ngày.";
  if (problem) return fallback(`${problem} Đang hiện hôm nay.`, from, to);
  const picked = query.day?.trim() ?? "";
  const day = from !== to && isBusinessDay(picked) && picked >= from && picked <= to ? picked : null;
  return { from, to, day, notice: null, fromText: formatDayInput(from), toText: formatDayInput(to) };
}

export function orderedReportHref(period: { from: string; to: string; day?: string | null }) {
  const query = new URLSearchParams({ from: period.from, to: period.to });
  if (period.day) query.set("day", period.day);
  return `${ORDERED_REPORT_PATH}?${query.toString()}`;
}

export function orderedExportHref(format: "xlsx" | "csv", period: { from: string; to: string }) {
  return `/api/portal/reports/ordered/export?${new URLSearchParams({ format, from: period.from, to: period.to }).toString()}`;
}

/** How an order is told in the report: the portal's own words, for the state the database reports. */
export function reportOrderStateLabel(state: string | null | undefined) {
  if (state === "FULFILLED") return "Đã giao";
  if (state === "PARTIAL") return "Đang giao";
  if (state === "CLOSED_REMAINDER") return "Hoàn tất";
  // A draft in this list is an order the customer sent from the portal, waiting for the shop.
  if (state === "DRAFT") return "Chờ duyệt";
  return portalOrderStateLabel({ state: state ?? undefined });
}

/** Còn lại: "0 · đủ" when nothing is left, otherwise the quantity; the tone tells apart "part delivered" from "not yet". */
export function remainingView(good: OrderedReportGood): { text: string; tone: "done" | "partial" | "none" } {
  const remaining = new Decimal(good.remaining_qty);
  if (remaining.lte(0)) return { text: "0 · đủ", tone: "done" };
  return { text: formatQuantity(good.remaining_qty), tone: new Decimal(good.delivered_qty).gt(0) ? "partial" : "none" };
}

export type DayRow = { day: string; orders: number; services: number; kinds: number; amountVnd?: string };

/** "Theo ngày": newest first; the number of kinds comes from the goods' source orders, services-only days are added. */
export function dayRows(report: OrderedReport): DayRow[] {
  const rows = new Map<string, DayRow>();
  const ensure = (day: string) => rows.get(day) ?? rows.set(day, { day, orders: 0, services: 0, kinds: 0 }).get(day)!;
  report.days.forEach((entry: OrderedReportDay) => { const row = ensure(entry.day); row.orders = entry.order_count; row.amountVnd = entry.amount_vnd; });
  const kinds = new Map<string, Set<string>>();
  report.goods.forEach((good) => good.orders.forEach((order) => {
    ensure(order.day);
    kinds.set(order.day, (kinds.get(order.day) ?? new Set()).add(`${good.material_id}|${good.uom_symbol}`));
  }));
  report.services.forEach((service) => {
    const row = ensure(service.day);
    row.services += 1;
    if (report.show_money && service.amount_vnd !== undefined && !report.days.some((entry) => entry.day === service.day)) {
      row.amountVnd = (BigInt(row.amountVnd ?? "0") + BigInt(service.amount_vnd)).toString();
    }
  });
  kinds.forEach((set, day) => { ensure(day).kinds = set.size; });
  return [...rows.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** The home page's one-line summary of yesterday: "Cát đen 2 xe · Gạch đặc 1.000 viên · và 3 món khác". */
export function goodsSummary(report: OrderedReport, shown = 2) {
  const named = report.goods.slice(0, shown).map((good) => `${good.name} ${formatQuantity(good.ordered_qty)} ${good.uom_symbol}`);
  const more = report.goods.length - named.length;
  return [...named, ...(more > 0 ? [`và ${more} món khác`] : [])].join(" · ");
}
