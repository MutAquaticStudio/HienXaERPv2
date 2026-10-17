function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function routePlanStateLabel(value?: string | null) {
  return lookupLabel({ DRAFT: "Bản đề xuất", APPLIED: "Đã phân giao", CANCELLED: "Đã hủy" }, value, "Trạng thái đang cập nhật");
}

const businessDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
const businessClock = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** dd/mm in Vietnam time (vi-VN alone prints "01-03" without a year). */
const businessDayMonth = (date: Date) => { const [year, month, day] = businessDay.format(date).split("-"); return year ? `${day}/${month}` : ""; };

/** YYYY-MM-DD of an instant in Vietnam time, to match a date filter. */
export function businessDateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : businessDay.format(date);
}

/** "07:00–08:00 · 01/03" for a stop or delivery window in Vietnam time. */
export function windowLabel(start: string, end: string | null) {
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return "Chưa có";
  const to = end ? new Date(end) : null;
  const sameDay = to && businessDateKey(start) === businessDateKey(end!);
  const tail = to && !Number.isNaN(to.getTime()) ? `–${businessClock.format(to)}${sameDay ? "" : ` ${businessDayMonth(to)}`}` : "";
  return `${businessClock.format(from)}${tail} · ${businessDayMonth(from)}`;
}
