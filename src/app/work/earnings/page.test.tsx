import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const tables: Record<string, unknown[]> = {};
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: async () => ({ employeeId: "e1", branchId: "b1" }) }));
vi.mock("@/modules/portal/actions", () => ({
  getWorkerPortalSnapshot: async () => ({ employee: { display_name: "Tuấn" }, earnings: [
    { id: "1", type: "FIXED_MONTHLY", amount_vnd: "6500000", state: "APPROVED", occurred_at: "2026-10-20T03:00:00Z" },
    { id: "2", type: "PER_TRIP", amount_vnd: "100000", state: "APPROVED", occurred_at: "2026-10-21T03:00:00Z" },
    { id: "3", type: "BONUS", amount_vnd: "150000", state: "DRAFT", occurred_at: "2026-10-22T03:00:00Z" },
    { id: "4", type: "PER_TRIP", amount_vnd: "100000", state: "PAID", occurred_at: "2026-09-10T03:00:00Z" },
  ] }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "gte", "lte", "is", "in", "limit"]) chain[name] = () => chain;
      chain.then = (resolve: (value: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
      return chain;
    },
  }),
}));
import WorkEarningsPage from "./page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T05:00:00Z"));
  tables.attendance_records = [
    { work_date: "2026-10-26", status: "WORKED", clock_in_at: "2026-10-26T01:00:00Z", clock_out_at: "2026-10-26T10:00:00Z", late_minutes: 0, early_minutes: 0, overtime_minutes: 0 },
    { work_date: "2026-10-28", status: "WORKED", clock_in_at: "2026-10-28T01:12:00Z", clock_out_at: "2026-10-28T10:00:00Z", late_minutes: 12, early_minutes: 0, overtime_minutes: 0 },
  ];
  tables.shift_assignments = [{ work_date: "2026-10-26" }, { work_date: "2026-10-28" }, { work_date: "2026-10-29" }, { work_date: "2026-10-30" }];
  tables.payroll_lines = [{ id: "s1", work_days: "26", standard_work_days: "26", base_amount_vnd: "9000000", overtime_amount_vnd: "0", allowance_vnd: "0", bonus_vnd: "0",
    deduction_vnd: "0", manual_bonus_vnd: "0", manual_deduction_vnd: "0", manual_note: null, net_pay_vnd: "10240000", details: [], earning_event_id: "ev1",
    payroll_periods: { name: "Tháng 9/2026", period_start: "2026-09-01", period_end: "2026-09-30" } }];
  tables.earning_event_read = [{ id: "ev1", outstanding_amount_vnd: "0" }];
});
afterEach(() => vi.useRealTimers());

it("shows this month's estimate split like the concept, the week strip and paid payslips", async () => {
  render(await WorkEarningsPage());
  expect(screen.getByRole("heading", { name: "Thu nhập của tôi" })).toBeTruthy();
  expect(screen.getByText("Tháng 10/2026 · tạm tính")).toBeTruthy();
  const card = screen.getByRole("region", { name: "Dự kiến nhận tháng này" });
  expect(within(card).getByText(/6\.750\.000/)).toBeTruthy();
  expect(within(card).getByText("Tiền chuyến · 1")).toBeTruthy();
  expect(within(card).getByText(/150\.000/)).toBeTruthy();

  expect(screen.getByText("2 / 4 ngày")).toBeTruthy();
  expect(screen.getByText("vào ca trễ 12 phút")).toBeTruthy();
  const days = screen.getAllByRole("listitem").filter((item) => item.hasAttribute("data-tone"));
  expect(days.map((item) => item.getAttribute("data-tone"))).toEqual(["done", "off", "late", "today", "planned", "off", "off"]);

  expect(screen.getByText("Đã chi trả")).toBeTruthy();
  expect(screen.getAllByText(/10\.240\.000/).length).toBeGreaterThan(0);
  // September's trip is not part of this month's list.
  expect(within(screen.getByRole("region", { name: "Các khoản tháng này" })).getAllByRole("listitem")).toHaveLength(3);
});
