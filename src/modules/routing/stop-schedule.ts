/**
 * Expected stop windows of a route (FB2 Đợt 7): stop n starts at departure + (n - 1) × minutes per stop and lasts that
 * long. A delivery that already has a schedule keeps it when the route is applied; one without gets its stop window.
 */
export const STOP_MINUTES_MIN = 10;
export const STOP_MINUTES_MAX = 480;
/** Prefilled in the form, editable: driving plus unloading at one stop. */
export const STOP_MINUTES_SUGGESTED = 60;
/** The window the database assumes for a schedule without an end (assign_delivery). */
const DEFAULT_SCHEDULE_HOURS = 4;

export type StopWindow = { start: string; end: string };

export function parseStopMinutes(value: unknown): number | null {
  const minutes = Number(String(value ?? "").trim());
  return Number.isInteger(minutes) && minutes >= STOP_MINUTES_MIN && minutes <= STOP_MINUTES_MAX ? minutes : null;
}

export function stopWindows(departureIso: string, minutes: number, count: number): StopWindow[] {
  const departure = Date.parse(departureIso);
  if (Number.isNaN(departure) || count < 1) return [];
  const step = minutes * 60_000;
  return Array.from({ length: count }, (_, index) => ({
    start: new Date(departure + index * step).toISOString(),
    end: new Date(departure + (index + 1) * step).toISOString(),
  }));
}

/** The window a stop will occupy on the vehicle once applied: its own schedule if it has one, otherwise the stop window. */
export function effectiveWindow(scheduledAt: string | null, scheduledEndAt: string | null, planned: StopWindow | null): StopWindow | null {
  if (scheduledAt) {
    const end = scheduledEndAt ?? new Date(Date.parse(scheduledAt) + DEFAULT_SCHEDULE_HOURS * 3_600_000).toISOString();
    return { start: new Date(scheduledAt).toISOString(), end: new Date(end).toISOString() };
  }
  return planned;
}

/** Indexes of windows that overlap another one ([start, end), like the database check). */
export function overlappingIndexes(windows: (StopWindow | null)[]): Set<number> {
  const result = new Set<number>();
  windows.forEach((left, i) => windows.forEach((right, j) => {
    if (i >= j || !left || !right) return;
    if (Date.parse(left.start) < Date.parse(right.end) && Date.parse(right.start) < Date.parse(left.end)) { result.add(i); result.add(j); }
  }));
  return result;
}
