import { BUSINESS_TIME_ZONE } from "@/lib/core/business-time";

export type MetricQuality = "READY" | "INCOMPLETE" | "NOT_APPLICABLE" | "FORBIDDEN" | "UNAVAILABLE";
export type MoneyMetric = { value_vnd?: string | number | null; quality: MetricQuality };
export type SeriesGranularity = "DAY" | "WEEK" | "MONTH";
export type SeriesPoint = { start: string; end: string; revenue: MoneyMetric; total_cost: MoneyMetric; net_profit: MoneyMetric };
export type ProfitSeries = { granularity: SeriesGranularity; from: string; to: string; points: SeriesPoint[] };
export type SeriesKey = "revenue" | "total_cost" | "net_profit";

/** Fixed categorical order (dataviz reference slots 1-3); validated on the white surface. */
export const PROFIT_SERIES: ReadonlyArray<{ key: SeriesKey; label: string; color: string }> = [
  { key: "revenue", label: "Thu", color: "#2a78d6" },
  { key: "total_cost", label: "Chi", color: "#eb6834" },
  { key: "net_profit", label: "Lợi nhuận", color: "#1baf7a" },
];

/** Exact server value, or null when the metric must not be drawn (non-READY is never 0, SPEC-REPORT-002). */
export function readyValue(metric: MoneyMetric | undefined): bigint | null {
  if (!metric || metric.quality !== "READY" || metric.value_vnd == null) return null;
  return BigInt(String(metric.value_vnd));
}

/** Chi on the KPI row: direct cost + operating expense, with net profit's quality so Thu - Chi = Lợi nhuận. */
export function totalCostMetric(snapshot: { direct_cost: MoneyMetric; operating_expense: MoneyMetric; operating_profit: MoneyMetric }): MoneyMetric {
  const direct = readyValue(snapshot.direct_cost);
  const operating = readyValue(snapshot.operating_expense);
  if (snapshot.operating_profit.quality !== "READY" || direct === null || operating === null) {
    return { quality: snapshot.operating_profit.quality === "READY" ? "UNAVAILABLE" : snapshot.operating_profit.quality };
  }
  return { value_vnd: (direct + operating).toString(), quality: "READY" };
}

/** Consecutive READY runs of one series, as point indexes. A gap is drawn wherever a point is not READY. */
export function readySegments(points: SeriesPoint[], key: SeriesKey): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  points.forEach((point, index) => {
    if (readyValue(point[key]) === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

/** A series with no READY point is hidden; the reason comes from its first non-READY quality. */
export function hiddenReason(points: SeriesPoint[], key: SeriesKey): MetricQuality | null {
  if (!points.length || points.some((point) => readyValue(point[key]) !== null)) return null;
  return points[0][key].quality;
}

/** Clean y-axis ticks covering every drawn value and zero. */
export function valueTicks(values: bigint[], count = 4): bigint[] {
  let min = 0n;
  let max = 0n;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) max = min + 1_000_000n;
  const rawStep = (max - min) / BigInt(count);
  let magnitude = 1n;
  while (magnitude * 10n <= rawStep) magnitude *= 10n;
  const step = [1n, 2n, 5n, 10n].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep) ?? magnitude * 10n;
  const first = min < 0n ? -(((-min) + step - 1n) / step) * step : (min / step) * step;
  const ticks: bigint[] = [];
  for (let tick = first; ; tick += step) {
    ticks.push(tick);
    if (tick >= max) break;
  }
  return ticks;
}

const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
export function compactVnd(value: bigint): string {
  return compact.format(Number(value));
}

export function bucketLabel(point: SeriesPoint, granularity: SeriesGranularity): string {
  const options: Intl.DateTimeFormatOptions = granularity === "MONTH"
    ? { timeZone: BUSINESS_TIME_ZONE, month: "2-digit", year: "numeric" }
    : { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit" };
  // Built from the parts: vi-VN formats day/month as "01-10" in some browsers; the app writes dates as "01/10".
  const parts = Object.fromEntries(new Intl.DateTimeFormat("vi-VN", options).formatToParts(new Date(point.start)).map((part) => [part.type, part.value]));
  return granularity === "MONTH" ? `${parts.month}/${parts.year}` : `${parts.day}/${parts.month}`;
}

export function bucketTitle(point: SeriesPoint, granularity: SeriesGranularity): string {
  const day = new Intl.DateTimeFormat("vi-VN", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
  if (granularity === "DAY") return `Ngày ${day.format(new Date(point.start))}`;
  const lastDay = new Date(new Date(point.end).getTime() - 1);
  const prefix = granularity === "WEEK" ? "Tuần" : "Tháng";
  return `${prefix} ${day.format(new Date(point.start))} – ${day.format(lastDay)}`;
}

export function granularityLabel(granularity: SeriesGranularity): string {
  return granularity === "DAY" ? "Theo ngày" : granularity === "WEEK" ? "Theo tuần" : "Theo tháng";
}
