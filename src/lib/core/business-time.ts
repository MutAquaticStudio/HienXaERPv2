export const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function parseBusinessDateTime(value: string): string | null {
  const input = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(input);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) return null;
  // A datetime-local value is a Vietnam business time, not the server's local time.
  const instant = new Date(match[8] ? input : `${input}+07:00`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function formatBusinessDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
}

export function formatBusinessDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  const time = new Intl.DateTimeFormat("vi-VN", {
    timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
  return `${formatBusinessDate(value)} ${time}`;
}

/** An instant as a datetime-local value in business time ("2026-10-18T10:30"). */
export function businessInputValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date).replace(" ", "T");
}

/** The business day ("YYYY-MM-DD", Vietnam time) an instant falls on; "now" by default. */
export function businessDay(value: Date | string = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** True for a real calendar day written "YYYY-MM-DD" (2026-02-30 is not). */
export function isBusinessDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function dayParts(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
}

/** A business day moved by whole calendar days (negative = earlier); pure calendar arithmetic, no time zone involved. */
export function shiftBusinessDay(day: string, delta: number) {
  const { year, month, date } = dayParts(day);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

/** Whole calendar days from one business day to another (to − from). */
export function businessDaysBetween(from: string, to: string) {
  const a = dayParts(from);
  const b = dayParts(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.date) - Date.UTC(a.year, a.month - 1, a.date)) / 86_400_000);
}
