// Date filters of the order list ("Ngày tạo" and "Ngày giao", each from a day to a day, both ends included).
// A day is a Vietnam business day: it starts at 00:00 +07:00 and ends before the next day's 00:00.
import { parseBusinessDateTime } from "@/lib/core/business-time";

const DAY_MS = 24 * 60 * 60 * 1000;

export type OrderDateFilters = { createdFrom: string; createdTo: string; deliveryFrom: string; deliveryTo: string };

/** "2026-11-13" when it is a real calendar day, else "" (a malformed or impossible date is ignored, never an error). */
export function parseFilterDay(value: unknown): string {
  const day = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && parseBusinessDateTime(`${day}T00:00`) ? day : "";
}

/** First instant of the business day, as an ISO timestamp. */
export function dayStartIso(day: string): string {
  return parseBusinessDateTime(`${day}T00:00`) as string;
}

/** First instant after the business day (Vietnam has no daylight saving, so a day is 24 hours). */
export function dayEndExclusiveIso(day: string): string {
  return new Date(new Date(dayStartIso(day)).getTime() + DAY_MS).toISOString();
}

export function parseOrderDateFilters(query: Partial<Record<keyof OrderDateFilters, string | undefined>>): OrderDateFilters {
  return {
    createdFrom: parseFilterDay(query.createdFrom), createdTo: parseFilterDay(query.createdTo),
    deliveryFrom: parseFilterDay(query.deliveryFrom), deliveryTo: parseFilterDay(query.deliveryTo),
  };
}

export const hasOrderDateFilter = (filters: OrderDateFilters) => Object.values(filters).some(Boolean);

type RangeRequest<T> = { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T };

/** Keeps the rows whose date column lies within the days (an empty end is open). */
export function applyDayRange<T extends RangeRequest<T>>(request: T, column: string, from: string, to: string): T {
  let next = request;
  if (from) next = next.gte(column, dayStartIso(from));
  if (to) next = next.lt(column, dayEndExclusiveIso(to));
  return next;
}
