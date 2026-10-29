// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { closePayrollAction, createPayrollAction, savePayrollComponentAction, saveSalaryProfileAction } from "./actions";

const operationId = "61c446b6-cb9f-49b2-994c-70c73e3e5802";
const employeeId = "b81b801c-2610-48b9-985e-64b10d859d74";
const payrollId = "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55";
function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) data.append(key, item);
  return data;
}

describe("payroll commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ branchId: "branch-a" });
    mocks.rpc.mockResolvedValue({ data: payrollId, error: null });
  });

  it("saves a salary profile with money as whole-đồng text", async () => {
    const outcome = await saveSalaryProfileAction(undefined, form({ employeeId, payBasis: "MONTHLY_WORKDAYS", baseRate: "8000000", overtime: "on",
      overtimeHourly: "", weekdayPct: "150", restdayPct: "200", holidayPct: "300", restWeekday: "7", active: "on", operationId }));
    expect(outcome?.success).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("compensation.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("save_salary_profile", expect.objectContaining({ base_rate: "8000000", overtime: true, overtime_hourly: null, rest_day: 7 }));
  });

  it("turns sales tiers in percent into basis points and skips empty rows", async () => {
    await savePayrollComponentAction(undefined, form({ code: "thuong-ds", name: "Thưởng doanh số", kind: "BONUS", method: "SALES_TIERS",
      tierFrom: ["0", "100000000", ""], tierPercent: ["0,5", "1.5", ""], operationId }));
    expect(mocks.rpc).toHaveBeenCalledWith("save_payroll_component", expect.objectContaining({
      component_code: "THUONG-DS", amount: null, component_tiers: [{ from_vnd: "0", rate_bps: 50 }, { from_vnd: "100000000", rate_bps: 150 }],
    }));
  });

  it("needs an amount for a fixed allowance", async () => {
    expect(await savePayrollComponentAction(undefined, form({ code: "AN", name: "Ăn trưa", kind: "ALLOWANCE", method: "PER_WORKDAY", amount: "", operationId })))
      .toEqual({ message: "Nhập số tiền lớn hơn 0." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns the new payroll so the page opens it", async () => {
    const outcome = await createPayrollAction(undefined, form({ fromDate: "2026-09-01", toDate: "2026-09-30", name: "Lương tháng 9", operationId }));
    expect(outcome).toMatchObject({ success: true, payrollId });
  });

  it("closes only with the approve permission and explains a refusal", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "payroll_attendance_not_closed" } });
    const outcome = await closePayrollAction(undefined, form({ payrollId, version: "3", operationId }));
    expect(mocks.permission).toHaveBeenCalledWith("compensation.approve");
    expect(outcome?.message).toContain("Chốt chấm công trước");
  });
});
