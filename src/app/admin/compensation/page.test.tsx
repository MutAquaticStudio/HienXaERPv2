import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b", authUserId: "u", permissions: m.permissions }) }));
vi.mock("@/modules/workforce/actions", () => ({ approveEarningAction: vi.fn(), calculateEarningAction: vi.fn(), createCompensationRuleAction: vi.fn(), payEarningAction: vi.fn(), recordCompensationBasisAction: vi.fn() }));
vi.mock("@/modules/workforce/recognition-action", () => ({ configureRecognitionAction: vi.fn(), postMonthlySalariesAction: vi.fn() }));
vi.mock("@/modules/workforce/verified-work-earning-form", () => ({ VerifiedWorkEarningForm: () => null }));
vi.mock("@/modules/workforce/commission-review-form", () => ({ CommissionReviewForm: () => null }));
vi.mock("@/components/reliable-command-form", () => ({ CommandRecoveryNotice: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit"]) query[method] = () => query;
    const result = Promise.resolve({ data: m.tables[table] ?? [], error: null });
    query.then = result.then.bind(result);
    return query;
  },
}) }));

import Page from "./page";

beforeEach(() => {
  m.permissions = new Set(["compensation.read", "compensation.manage", "compensation.approve"]);
  m.tables = {
    compensation_rules: [
      { id: "r1", code: "HH_BAN", name: "Hoa hồng bán", version: 2, employee_id: null, earning_type: "SALES_COMMISSION", calculation_kind: "PERCENT_BPS", classification: "SALES_COMMISSION", rate_vnd_per_unit: null, rate_bps: 250, effective_from: "2026-10-01", effective_to: null },
      { id: "r2", code: "CONG_CA", name: "Công ca", version: 1, employee_id: "w1", earning_type: "PER_SHIFT", calculation_kind: "FIXED_PER_BASIS", classification: "DIRECT_LABOR", rate_vnd_per_unit: "350000", rate_bps: null, effective_from: "2026-10-01", effective_to: null },
    ],
    workforce_read: [{ id: "w1", code: "T01", display_name: "Thợ Hùng" }],
  };
});
afterEach(cleanup);

it("keeps the recorded earnings and old rules as history; rules are made in Bảng lương (D35)", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "Thu nhập đã ghi" })).toBeInTheDocument();
  const rules = screen.getByRole("heading", { name: "Quy tắc thu nhập cũ" }).closest("section")!;
  expect(within(rules).getByText("2,5%")).toBeInTheDocument();
  expect(within(rules).getByText("350.000 ₫ / đơn vị")).toBeInTheDocument();
  expect(within(rules).getByText("Thợ Hùng")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Bảng lương" })).toHaveAttribute("href", "/admin/payroll");
  expect(screen.queryByRole("button", { name: /Tạo phiên bản|Ghi căn cứ|Tính lương tháng|Hoa hồng tự động/ })).not.toBeInTheDocument();
});
