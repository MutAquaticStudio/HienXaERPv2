"use server";

// FB12 (D34b): commands of "Bảng lương". The database checks the permissions, computes every payslip from the attendance
// and posts the closed payroll; these actions validate the form and say the result in Vietnamese.
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { COMPONENT_KINDS, COMPONENT_METHODS, PAY_BASES, payrollError, percentToBps } from "@/modules/payroll/presentation";

export type PayrollFormState = { success?: boolean; message?: string; payrollId?: string } | undefined;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^\d{1,15}$/);
const optionalMoney = z.union([money, z.literal("")]).optional();
const percent = z.coerce.number().int().min(100).max(1000);

function done(message: string, extra: Partial<NonNullable<PayrollFormState>> = {}): PayrollFormState {
  revalidatePath("/admin/payroll", "layout");
  revalidatePath("/admin/compensation");
  revalidatePath("/work/earnings");
  return { success: true, message, ...extra };
}

export async function saveSalaryProfileAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = z.object({
    employeeId: z.guid(),
    payBasis: z.enum(PAY_BASES),
    baseRate: money,
    overtime: z.enum(["on"]).optional(),
    overtimeHourly: optionalMoney,
    weekdayPct: percent,
    restdayPct: percent,
    holidayPct: percent,
    restWeekday: z.coerce.number().int().min(1).max(7),
    active: z.enum(["on"]).optional(),
    operationId: z.guid(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Nhập mức lương (0 nếu chỉ trả theo chuyến / việc) và hệ số làm thêm từ 100% đến 1000%." };
  const input = parsed.data;
  const access = await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_salary_profile", {
    target_branch_id: access.branchId, target_employee_id: input.employeeId, basis: input.payBasis, base_rate: input.baseRate,
    overtime: input.overtime === "on", overtime_hourly: input.overtimeHourly || null, weekday_pct: input.weekdayPct, restday_pct: input.restdayPct,
    holiday_pct: input.holidayPct, rest_day: input.restWeekday, is_active: input.active === "on", operation_id: input.operationId,
  });
  if (error) return { message: payrollError(error.message) };
  return done("Đã lưu thiết lập lương.");
}

export async function savePayrollComponentAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = z.object({
    componentId: z.union([z.guid(), z.literal("")]).optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,24}$/),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(COMPONENT_KINDS),
    method: z.enum(COMPONENT_METHODS),
    amount: optionalMoney,
    employeeId: z.union([z.guid(), z.literal("")]).optional(),
    active: z.enum(["on"]).optional(),
    operationId: z.guid(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Kiểm tra mã (chữ in hoa, số), tên, loại và cách tính." };
  const input = parsed.data;
  let tiers: Array<{ from_vnd: string; rate_bps: number }> | null = null;
  if (input.method === "SALES_TIERS") {
    const froms = form.getAll("tierFrom").map(String);
    const rates = form.getAll("tierPercent").map(String);
    tiers = [];
    for (let index = 0; index < froms.length; index += 1) {
      if (!froms[index] && !rates[index]?.trim()) continue;
      const bps = percentToBps(rates[index] ?? "");
      if (!/^\d{1,15}$/.test(froms[index] || "0") || bps === null) return { message: "Mỗi bậc cần doanh thu từ (đ) và % thưởng (tối đa 100%, 2 chữ số thập phân)." };
      tiers.push({ from_vnd: froms[index] || "0", rate_bps: bps });
    }
    if (!tiers.length) return { message: "Nhập ít nhất một bậc doanh thu." };
  } else if (!input.amount || BigInt(input.amount) <= 0n) {
    return { message: "Nhập số tiền lớn hơn 0." };
  }
  const access = await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_payroll_component", {
    target_branch_id: access.branchId, target_component_id: input.componentId || null, component_code: input.code, component_name: input.name,
    component_kind: input.kind, component_method: input.method, amount: input.method === "SALES_TIERS" ? null : input.amount,
    component_tiers: tiers, target_employee_id: input.employeeId || null, is_active: input.componentId ? input.active === "on" : true,
    operation_id: input.operationId,
  });
  if (error) return { message: payrollError(error.message) };
  return done(input.componentId ? "Đã lưu khoản thu nhập khác." : "Đã thêm khoản thu nhập khác.");
}

export async function savePayrollHolidayAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = z.object({ day: date, name: z.string().trim().min(1).max(80), active: z.enum(["on", "off"]).optional(), operationId: z.guid() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Nhập ngày và tên ngày lễ." };
  const access = await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_payroll_holiday", {
    target_branch_id: access.branchId, day: parsed.data.day, holiday_name: parsed.data.name, is_active: parsed.data.active !== "off",
    operation_id: parsed.data.operationId,
  });
  if (error) return { message: payrollError(error.message) };
  return done(parsed.data.active === "off" ? "Đã bỏ ngày lễ." : "Đã lưu ngày lễ.");
}

export async function createPayrollAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = z.object({ fromDate: date, toDate: date, name: z.string().trim().min(1).max(80), operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success || parsed.data.toDate < parsed.data.fromDate) return { message: "Nhập tên và khoảng ngày của kỳ lương." };
  const access = await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_payroll", {
    target_branch_id: access.branchId, from_date: parsed.data.fromDate, to_date: parsed.data.toDate, payroll_name: parsed.data.name,
    operation_id: parsed.data.operationId,
  });
  if (error) return { message: payrollError(error.message) };
  return done("Đã lập bảng lương tạm tính.", { payrollId: String(data) });
}

const periodCommand = z.object({ payrollId: z.guid(), version: z.coerce.number().int().positive(), operationId: z.guid() });

export async function recalculatePayrollAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = periodCommand.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Không xác định được bảng lương." };
  await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("recalculate_payroll", { target_period_id: parsed.data.payrollId, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
  if (error) return { message: payrollError(error.message) };
  return done("Đã tính lại từ chấm công mới nhất.");
}

export async function cancelPayrollAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = periodCommand.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Không xác định được bảng lương." };
  await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_payroll", { target_period_id: parsed.data.payrollId, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
  if (error) return { message: payrollError(error.message) };
  return done("Đã hủy bảng lương tạm tính.");
}

export async function closePayrollAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = periodCommand.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Không xác định được bảng lương." };
  await requireInternalPermission("compensation.manage");
  await requireInternalPermission("compensation.approve");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("close_payroll", { target_period_id: parsed.data.payrollId, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
  if (error) return { message: payrollError(error.message) };
  const posted = Number((data as { posted?: number } | null)?.posted ?? 0);
  return done(`Đã chốt bảng lương: ${posted} phiếu lương thành khoản phải trả. Chi trả ở mục Thu nhập.`);
}

export async function adjustPayrollLineAction(_: PayrollFormState, form: FormData): Promise<PayrollFormState> {
  const parsed = z.object({ lineId: z.guid(), bonus: optionalMoney, deduction: optionalMoney, note: z.string().trim().max(300).optional(), operationId: z.guid() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Kiểm tra số tiền cộng / trừ." };
  await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("adjust_payroll_line", {
    target_line_id: parsed.data.lineId, bonus: parsed.data.bonus || "0", deduction: parsed.data.deduction || "0", note: parsed.data.note || null,
    operation_id: parsed.data.operationId,
  });
  if (error) return { message: payrollError(error.message) };
  return done("Đã cập nhật phiếu lương.");
}
