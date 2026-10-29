// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), permission: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: mocks.access, requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { clockAttendanceAction, saveAttendanceAction, scheduleShiftsAction } from "./actions";

const operationId = "61c446b6-cb9f-49b2-994c-70c73e3e5802";
const employeeId = "b81b801c-2610-48b9-985e-64b10d859d74";
const shiftId = "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55";
function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) data.append(key, item);
  return data;
}

describe("attendance commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ branchId: "branch-a" });
    mocks.permission.mockResolvedValue({ branchId: "branch-a" });
    mocks.rpc.mockResolvedValue({ data: "record", error: null });
  });

  it("clocks in with the phone position, or without it", async () => {
    const outcome = await clockAttendanceAction(undefined, form({ kind: "IN", lat: "10.762622", lng: "106.660172", operationId }));
    expect(outcome?.success).toBe(true);
    expect(mocks.access).toHaveBeenCalledWith("/work/login");
    expect(mocks.rpc).toHaveBeenCalledWith("clock_attendance", { target_branch_id: "branch-a", kind: "IN", lat: 10.762622, lng: 106.660172, operation_id: operationId });
    await clockAttendanceAction(undefined, form({ kind: "OUT", lat: "", lng: "", operationId }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("clock_attendance", expect.objectContaining({ kind: "OUT", lat: null, lng: null }));
  });

  it("says the database refusal in Vietnamese", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "attendance_already_in" } });
    const outcome = await clockAttendanceAction(undefined, form({ kind: "IN", operationId }));
    expect(outcome).toEqual({ message: "Bạn đang trong ca. Bấm “Ra ca” khi kết thúc." });
  });

  it("records an office correction in Vietnam time, an overnight clock-out on the next day", async () => {
    await saveAttendanceAction(undefined, form({ employeeId, day: "2026-10-29", shiftId, status: "WORKED", clockIn: "22:00", clockOut: "06:00", note: "Chấm hộ", operationId }));
    expect(mocks.permission).toHaveBeenCalledWith("attendance.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("save_attendance", {
      target_branch_id: "branch-a", target_employee_id: employeeId, day: "2026-10-29", target_shift_id: shiftId, day_status: "WORKED",
      clock_in: "2026-10-29T22:00:00+07:00", clock_out: "2026-10-30T06:00:00+07:00", day_note: "Chấm hộ", operation_id: operationId,
    });
  });

  it("keeps a leave day without hours and needs a clock-in for a worked day", async () => {
    await saveAttendanceAction(undefined, form({ employeeId, day: "2026-10-29", status: "LEAVE_PAID", clockIn: "07:00", operationId }));
    expect(mocks.rpc).toHaveBeenCalledWith("save_attendance", expect.objectContaining({ day_status: "LEAVE_PAID", clock_in: null, clock_out: null, target_shift_id: null }));
    mocks.rpc.mockClear();
    expect(await saveAttendanceAction(undefined, form({ employeeId, day: "2026-10-29", status: "WORKED", operationId }))).toEqual({ message: "Nhập giờ vào khi chấm đi làm." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("schedules many people on chosen weekdays", async () => {
    mocks.rpc.mockResolvedValue({ data: 12, error: null });
    const outcome = await scheduleShiftsAction(undefined, form({ employeeId: [employeeId, shiftId], shiftId, fromDate: "2026-11-02", toDate: "2026-11-08", weekday: ["1", "2", "3", "4", "5", "6"], operationId }));
    expect(outcome).toEqual({ success: true, message: "Đã xếp 12 ca." });
    expect(mocks.rpc).toHaveBeenCalledWith("schedule_shifts", expect.objectContaining({ employee_ids: [employeeId, shiftId], weekdays: [1, 2, 3, 4, 5, 6] }));
  });
});
