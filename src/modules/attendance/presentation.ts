// FB12 (D34a): labels, day codes and helpers of "Chấm công", shared by the worker portal and the office timesheet.

export const ATTENDANCE_STATUSES = ["WORKED", "LEAVE_PAID", "LEAVE_UNPAID", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const statusLabels: Record<AttendanceStatus, string> = {
  WORKED: "Đi làm",
  LEAVE_PAID: "Nghỉ có phép",
  LEAVE_UNPAID: "Nghỉ không phép",
  ABSENT: "Vắng",
};

export function attendanceStatusLabel(status: string) {
  return statusLabels[status as AttendanceStatus] ?? "Không rõ";
}

export type AttendanceCell = {
  status: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  late_minutes: number;
  early_minutes: number;
  overtime_minutes: number;
};

/** The short mark of a timesheet cell and its tone, like KiotViet's grid: worked, late / early, still on shift, leave, absent. */
export function attendanceMark(cell: AttendanceCell): { mark: string; tone: "ok" | "warn" | "open" | "leave" | "off" } {
  if (cell.status === "LEAVE_PAID") return { mark: "P", tone: "leave" };
  if (cell.status === "LEAVE_UNPAID") return { mark: "KP", tone: "off" };
  if (cell.status === "ABSENT") return { mark: "V", tone: "off" };
  if (cell.clock_in_at && !cell.clock_out_at) return { mark: "Đang làm", tone: "open" };
  if (cell.late_minutes > 0 || cell.early_minutes > 0) return { mark: "✓", tone: "warn" };
  return { mark: "✓", tone: "ok" };
}

/** "1 giờ 05 phút", "45 phút". */
export function formatMinutes(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${String(rest).padStart(2, "0")} phút` : `${hours} giờ`;
}

/** "07:30" in Vietnam time of a timestamp. */
export function formatClock(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

/** "07:30" from a Postgres time "07:30:00". */
export function formatShiftTime(value: string) {
  return value.slice(0, 5);
}

/** Every day (YYYY-MM-DD) of a month "YYYY-MM". */
export function monthDays(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

/** Monday-first weekday of a date: 1 = Thứ 2 … 7 = Chủ nhật (ISO), matching `schedule_shifts` weekdays. */
export function isoWeekday(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

const weekdayShort = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
export function weekdayLabel(day: string) {
  return weekdayShort[isoWeekday(day)];
}

export function addDays(day: string, count: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** The Monday of the week of a date. */
export function weekStart(day: string) {
  return addDays(day, 1 - isoWeekday(day));
}

/** "YYYY-MM" of the month before / after. */
export function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** A local date and "HH:MM" in Vietnam time as an instant; a clock-out before the clock-in is on the next day (overnight shift). */
export function vietnamInstant(day: string, time: string, after?: string) {
  const instant = `${day}T${time}:00+07:00`;
  if (after && new Date(instant) < new Date(after)) return `${addDays(day, 1)}T${time}:00+07:00`;
  return instant;
}

/** Vietnamese message of an attendance command error; unknown errors stay generic, never a technical code. */
export function attendanceError(message: string | null | undefined) {
  const text = message ?? "";
  const known: Array<[string, string]> = [
    ["attendance_already_in", "Bạn đang trong ca. Bấm “Ra ca” khi kết thúc."],
    ["attendance_not_in", "Bạn chưa vào ca nên chưa ra ca được."],
    ["attendance_already_recorded", "Ca này đã được chấm công. Liên hệ văn phòng nếu cần sửa."],
    ["attendance_period_closed", "Kỳ chấm công đã chốt. Mở lại kỳ (ghi lý do) trước khi sửa."],
    ["attendance_period_overlaps", "Khoảng ngày này trùng một kỳ đã chốt."],
    ["attendance_location_required", "Cần bật định vị trên điện thoại để chấm công."],
    ["employee_not_in_branch", "Nhân viên không làm việc ở chi nhánh này."],
    ["shift_not_found", "Không tìm thấy ca làm việc (có thể đã ngừng dùng)."],
    ["invalid_shift_time", "Giờ ca chưa hợp lệ."],
    ["invalid_schedule", "Lịch chưa hợp lệ: chọn người, ca và khoảng ngày (tối đa 3 tháng)."],
    ["invalid_attendance", "Thông tin chấm công chưa hợp lệ: giờ ra phải sau giờ vào; ngày nghỉ không có giờ."],
    ["invalid_period", "Khoảng ngày chốt chưa hợp lệ."],
    ["reason_required", "Ghi lý do mở lại kỳ."],
    ["operation_payload_conflict", "Thao tác bị trùng. Tải lại trang rồi thử lại."],
    ["duplicate key", "Mã ca đã có. Chọn mã khác."],
    ["forbidden", "Bạn không có quyền thực hiện thao tác này."],
  ];
  return known.find(([code]) => text.includes(code))?.[1] ?? "Chưa lưu được. Kiểm tra kết nối rồi thử lại.";
}
