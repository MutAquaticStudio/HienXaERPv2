import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/attendance/actions", () => ({
  cancelShiftAssignmentAction: vi.fn(), clockAttendanceAction: vi.fn(), closeAttendancePeriodAction: vi.fn(), reopenAttendancePeriodAction: vi.fn(),
  saveAttendanceAction: vi.fn(), saveAttendanceSettingsAction: vi.fn(), saveWorkShiftAction: vi.fn(), scheduleShiftsAction: vi.fn(),
}));

import { TimesheetGrid } from "./timesheet-grid";

const shift = { id: "s1", code: "SANG", name: "Ca sáng", start_time: "07:00:00", end_time: "11:30:00", break_minutes: 0, active: true };
const people = [{ id: "e1", display_name: "Thợ A" }, { id: "e2", display_name: "Thợ B" }];
const records = [{
  id: "r1", employee_id: "e1", work_date: "2026-10-01", shift_id: "s1", status: "WORKED", clock_in_at: "2026-10-01T00:20:00Z",
  clock_out_at: "2026-10-01T04:30:00Z", worked_minutes: 250, late_minutes: 20, early_minutes: 0, overtime_minutes: 0, note: null, source: "WORKER",
}];

describe("TimesheetGrid", () => {
  afterEach(cleanup);

  it("shows marks, counts and opens the office correction for a scheduled day", () => {
    render(<TimesheetGrid days={["2026-10-01", "2026-10-02", "2026-10-03"]} people={people} records={records}
      plans={[{ employee_id: "e2", work_date: "2026-10-02", shift_id: "s1" }]} shifts={[shift]} lockedDays={["2026-10-03"]} today="2026-10-02" canManage />);
    expect(screen.getByRole("button", { name: /Thợ A ngày 01\/10: 07:20–11:30/ })).toHaveTextContent("✓");
    fireEvent.click(screen.getByRole("button", { name: /Thợ B ngày 02\/10: Đã xếp: Ca sáng/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Chấm công Thợ B");
    expect(screen.getByLabelText("Giờ vào")).toHaveValue("07:00");
    expect(screen.getByLabelText("Giờ ra")).toHaveValue("11:30");
    // A closed day cannot be edited.
    expect(screen.queryByRole("button", { name: /ngày 03\/10/ })).toBeNull();
  });

  it("is read-only without attendance.manage", () => {
    render(<TimesheetGrid days={["2026-10-01"]} people={people} records={records} plans={[]} shifts={[shift]} lockedDays={[]} today="2026-10-01" canManage={false} />);
    expect(screen.queryByRole("button", { name: /Thợ A/ })).toBeNull();
    expect(screen.getByTitle("07:20–11:30")).toHaveTextContent("✓");
  });
});
