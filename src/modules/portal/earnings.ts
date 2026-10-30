import { addDays, attendanceMark, formatMinutes, weekdayLabel, type AttendanceCell } from "@/modules/attendance/presentation";
import type { WorkerEarning } from "./types";

/** Pay that depends on time worked (salary, per day / shift / hour). */
const TIME_PAY = new Set(["SALARY", "FIXED_MONTHLY", "PER_DAY", "PER_SHIFT", "PER_HOUR"]);
/** Pay per delivery trip. */
const TRIP_PAY = new Set(["PER_TRIP", "DELIVERY_PIECEWORK"]);

const toBig = (value?: string) => (value && /^-?\d+$/.test(value) ? BigInt(value) : 0n);

/**
 * "Thu nhập của tôi" card (concept cổng thợ): this month's earnings split into time pay, trips (with their count) and
 * the rest (bonus, commission, other jobs). Amounts are whole đồng as strings; nothing is rounded.
 */
export function monthEarnings(earnings: readonly WorkerEarning[], month: string) {
  let time = 0n, trips = 0n, other = 0n, tripCount = 0;
  const items = earnings.filter((item) => businessMonth(item.occurred_at) === month);
  for (const item of items) {
    const amount = toBig(item.amount_vnd);
    if (TIME_PAY.has(item.type ?? "")) time += amount;
    else if (TRIP_PAY.has(item.type ?? "")) { trips += amount; tripCount += 1; }
    else other += amount;
  }
  return { items, total: String(time + trips + other), time: String(time), trips: String(trips), tripCount, other: String(other) };
}

/** "YYYY-MM" of an instant in business time (Asia/Ho_Chi_Minh). */
export function businessMonth(at?: string) {
  if (!at) return "";
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(date);
}

export type WeekDay = {
  date: string;
  weekday: string;
  day: string;
  /** done: worked in full · late: late or left early · open: on shift now · leave · absent · today · planned (future shift) · off */
  tone: "done" | "late" | "open" | "leave" | "absent" | "today" | "planned" | "off";
  note?: string;
};

/** "Chấm công tuần này": Monday → Sunday with what happened (or is planned) each day, and worked / scheduled days. */
export function attendanceWeek(monday: string, today: string, records: ReadonlyArray<AttendanceCell & { work_date: string }>, plannedDates: readonly string[]) {
  const planned = new Set(plannedDates);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const record = records.find((item) => item.work_date === date);
    const base = { date, weekday: weekdayLabel(date), day: String(Number(date.slice(8, 10))) };
    if (record) {
      const { tone } = attendanceMark(record);
      if (tone === "warn") {
        const parts = [record.late_minutes ? `vào ca trễ ${formatMinutes(record.late_minutes)}` : "", record.early_minutes ? `về sớm ${formatMinutes(record.early_minutes)}` : ""].filter(Boolean);
        return { ...base, tone: "late", note: parts.join(", ") };
      }
      return { ...base, tone: tone === "ok" ? "done" : tone === "open" ? "open" : tone === "leave" ? "leave" : "absent" };
    }
    if (date === today) return { ...base, tone: "today" };
    return { ...base, tone: date > today && planned.has(date) ? "planned" : "off" };
  });
  const worked = days.filter((day) => day.tone === "done" || day.tone === "late" || day.tone === "open").length;
  const scheduled = new Set([...plannedDates.filter((date) => date >= monday && date <= addDays(monday, 6)),
    ...records.filter((item) => item.work_date >= monday && item.work_date <= addDays(monday, 6) && item.status === "WORKED").map((item) => item.work_date)]).size;
  return { days, worked, scheduled };
}
