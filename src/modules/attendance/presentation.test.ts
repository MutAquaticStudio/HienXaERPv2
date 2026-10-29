import { describe, expect, it } from "vitest";

import {
  addDays, attendanceError, attendanceMark, formatMinutes, isoWeekday, monthDays, shiftMonth, vietnamInstant, weekStart,
} from "./presentation";

const cell = { status: "WORKED", clock_in_at: "2026-10-29T00:30:00Z", clock_out_at: "2026-10-29T10:00:00Z", late_minutes: 0, early_minutes: 0, overtime_minutes: 0 };

describe("attendance presentation", () => {
  it("marks a timesheet cell like KiotViet", () => {
    expect(attendanceMark(cell)).toEqual({ mark: "✓", tone: "ok" });
    expect(attendanceMark({ ...cell, late_minutes: 15 }).tone).toBe("warn");
    expect(attendanceMark({ ...cell, clock_out_at: null })).toEqual({ mark: "Đang làm", tone: "open" });
    expect(attendanceMark({ ...cell, status: "LEAVE_PAID", clock_in_at: null, clock_out_at: null }).mark).toBe("P");
    expect(attendanceMark({ ...cell, status: "LEAVE_UNPAID", clock_in_at: null, clock_out_at: null }).mark).toBe("KP");
    expect(attendanceMark({ ...cell, status: "ABSENT", clock_in_at: null, clock_out_at: null }).mark).toBe("V");
  });

  it("formats minutes in Vietnamese", () => {
    expect(formatMinutes(45)).toBe("45 phút");
    expect(formatMinutes(65)).toBe("1 giờ 05 phút");
    expect(formatMinutes(120)).toBe("2 giờ");
  });

  it("walks months and weeks Monday-first", () => {
    expect(monthDays("2026-02")).toHaveLength(28);
    expect(monthDays("2026-10").at(-1)).toBe("2026-10-31");
    expect(isoWeekday("2026-11-01")).toBe(7);
    expect(weekStart("2026-10-29")).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("reads hours in Vietnam time and puts an earlier clock-out on the next day", () => {
    expect(vietnamInstant("2026-10-29", "07:30")).toBe("2026-10-29T07:30:00+07:00");
    expect(vietnamInstant("2026-10-29", "02:00", "2026-10-29T22:00:00+07:00")).toBe("2026-10-30T02:00:00+07:00");
  });

  it("never shows a technical code", () => {
    expect(attendanceError("attendance_period_closed")).toContain("đã chốt");
    expect(attendanceError('duplicate key value violates unique constraint "work_shifts_branch_id_code_key"')).toContain("Mã ca đã có");
    expect(attendanceError("something odd")).toBe("Chưa lưu được. Kiểm tra kết nối rồi thử lại.");
  });
});
