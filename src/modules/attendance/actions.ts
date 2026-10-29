"use server";

// FB12 (D34a): commands of "Chấm công". The database decides who may do what (attendance.manage, own record for the worker)
// and keeps every rule; these actions only validate the form, call the RPC and say the result in Vietnamese.
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalAccess, requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { ATTENDANCE_STATUSES, attendanceError, vietnamInstant } from "@/modules/attendance/presentation";

export type AttendanceFormState = { success?: boolean; message?: string } | undefined;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalClock = z.union([clock, z.literal("")]).optional();
const coordinate = (limit: number) => z.union([z.literal(""), z.coerce.number().min(-limit).max(limit)]).optional()
  .transform((value) => (value === "" || value === undefined ? null : value));

function done(message: string): AttendanceFormState {
  revalidatePath("/admin/attendance");
  revalidatePath("/work/attendance");
  return { success: true, message };
}

/** Vào ca / Ra ca from the worker portal, with the phone's position when the person allowed it. */
export async function clockAttendanceAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({ kind: z.enum(["IN", "OUT"]), lat: coordinate(90), lng: coordinate(180), operationId: z.guid() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Chưa chấm công được. Tải lại trang rồi thử lại." };
  const access = await requireInternalAccess("/work/login");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("clock_attendance", {
    target_branch_id: access.branchId, kind: parsed.data.kind, lat: parsed.data.lat, lng: parsed.data.lng, operation_id: parsed.data.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  return done(parsed.data.kind === "IN" ? "Đã vào ca. Chúc bạn làm việc tốt!" : "Đã ra ca. Văn phòng sẽ duyệt ngày công.");
}

export async function saveWorkShiftAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({
    shiftId: z.union([z.guid(), z.literal("")]).optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,24}$/),
    name: z.string().trim().min(1).max(80),
    startTime: clock,
    endTime: clock,
    breakMinutes: z.coerce.number().int().min(0).max(600),
    active: z.enum(["on"]).optional(),
    operationId: z.guid(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Kiểm tra mã ca (chữ in hoa, số), tên ca, giờ bắt đầu, giờ kết thúc và phút nghỉ." };
  if (parsed.data.startTime === parsed.data.endTime) return { message: "Giờ kết thúc phải khác giờ bắt đầu." };
  const access = await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_work_shift", {
    target_branch_id: access.branchId, target_shift_id: parsed.data.shiftId || null, shift_code: parsed.data.code, shift_name: parsed.data.name,
    starts: parsed.data.startTime, ends: parsed.data.endTime, break_minutes: parsed.data.breakMinutes,
    is_active: parsed.data.shiftId ? parsed.data.active === "on" : true, operation_id: parsed.data.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  return done(parsed.data.shiftId ? "Đã lưu ca làm việc." : "Đã thêm ca làm việc.");
}

export async function scheduleShiftsAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({
    employeeIds: z.array(z.guid()).min(1).max(200),
    shiftId: z.guid(),
    fromDate: date,
    toDate: date,
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1),
    operationId: z.guid(),
  }).safeParse({
    employeeIds: form.getAll("employeeId"), shiftId: form.get("shiftId"), fromDate: form.get("fromDate"), toDate: form.get("toDate"),
    weekdays: form.getAll("weekday"), operationId: form.get("operationId"),
  });
  if (!parsed.success) return { message: "Chọn ít nhất một người, một ca, khoảng ngày và các ngày trong tuần." };
  if (parsed.data.toDate < parsed.data.fromDate) return { message: "Ngày kết thúc phải sau ngày bắt đầu." };
  const access = await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("schedule_shifts", {
    target_branch_id: access.branchId, employee_ids: parsed.data.employeeIds, target_shift_id: parsed.data.shiftId,
    from_date: parsed.data.fromDate, to_date: parsed.data.toDate, weekdays: parsed.data.weekdays, operation_id: parsed.data.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  const added = Number(data ?? 0);
  return done(added > 0 ? `Đã xếp ${added} ca.` : "Các ngày đã chọn đều đã có lịch ca này, không thêm ca mới.");
}

export async function cancelShiftAssignmentAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({ assignmentId: z.guid(), operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Không xác định được lịch cần bỏ." };
  await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_shift_assignment", { target_assignment_id: parsed.data.assignmentId, operation_id: parsed.data.operationId });
  if (error) return { message: attendanceError(error.message) };
  return done("Đã bỏ ca khỏi lịch.");
}

/** Chấm hộ / sửa công / nghỉ phép by the office for one person, day and shift. */
export async function saveAttendanceAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({
    employeeId: z.guid(),
    day: date,
    shiftId: z.union([z.guid(), z.literal("")]).optional(),
    status: z.enum(ATTENDANCE_STATUSES),
    clockIn: optionalClock,
    clockOut: optionalClock,
    note: z.string().trim().max(300).optional(),
    operationId: z.guid(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Thông tin chấm công chưa hợp lệ." };
  const input = parsed.data;
  if (input.status === "WORKED" && !input.clockIn) return { message: "Nhập giờ vào khi chấm đi làm." };
  const clockIn = input.status === "WORKED" && input.clockIn ? vietnamInstant(input.day, input.clockIn) : null;
  const clockOut = input.status === "WORKED" && input.clockOut ? vietnamInstant(input.day, input.clockOut, clockIn ?? undefined) : null;
  const access = await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_attendance", {
    target_branch_id: access.branchId, target_employee_id: input.employeeId, day: input.day, target_shift_id: input.shiftId || null,
    day_status: input.status, clock_in: clockIn, clock_out: clockOut, day_note: input.note || null, operation_id: input.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  return done("Đã lưu chấm công.");
}

export async function saveAttendanceSettingsAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({
    lateGrace: z.coerce.number().int().min(0).max(120),
    earlyClockIn: z.coerce.number().int().min(0).max(240),
    standardDays: z.coerce.number().gt(0).max(31),
    requireLocation: z.enum(["on"]).optional(),
    operationId: z.guid(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Kiểm tra số phút cho phép đi muộn (0–120), vào ca sớm (0–240) và ngày công chuẩn (1–31)." };
  const access = await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_attendance_settings", {
    target_branch_id: access.branchId,
    settings: {
      late_grace_minutes: parsed.data.lateGrace, early_clock_in_minutes: parsed.data.earlyClockIn,
      standard_work_days: parsed.data.standardDays, require_location: parsed.data.requireLocation === "on",
    },
    operation_id: parsed.data.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  return done("Đã lưu cài đặt chấm công.");
}

export async function closeAttendancePeriodAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({ fromDate: date, toDate: date, operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success || parsed.data.toDate < parsed.data.fromDate) return { message: "Chọn khoảng ngày cần chốt." };
  const access = await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("close_attendance_period", {
    target_branch_id: access.branchId, from_date: parsed.data.fromDate, to_date: parsed.data.toDate, operation_id: parsed.data.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  return done("Đã chốt chấm công. Các ngày trong kỳ không sửa được cho tới khi mở lại.");
}

export async function reopenAttendancePeriodAction(_: AttendanceFormState, form: FormData): Promise<AttendanceFormState> {
  const parsed = z.object({ periodId: z.guid(), reason: z.string().trim().min(3).max(300), operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Ghi lý do mở lại kỳ (ít nhất 3 ký tự)." };
  await requireInternalPermission("attendance.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("reopen_attendance_period", {
    target_period_id: parsed.data.periodId, reason: parsed.data.reason, operation_id: parsed.data.operationId,
  });
  if (error) return { message: attendanceError(error.message) };
  return done("Đã mở lại kỳ chấm công.");
}
