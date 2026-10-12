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
