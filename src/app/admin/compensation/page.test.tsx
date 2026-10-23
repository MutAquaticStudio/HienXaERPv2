import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b", authUserId: "u", permissions: m.permissions }) }));
vi.mock("@/modules/workforce/actions", () => ({ approveEarningAction: vi.fn(), calculateEarningAction: vi.fn(), createCompensationRuleAction: vi.fn(), payEarningAction: vi.fn(), recordCompensationBasisAction: vi.fn() }));
vi.mock("@/modules/workforce/recognition-action", () => ({ configureRecognitionAction: vi.fn() }));
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

it("opens the rule, manual basis and recognition forms in popups and lists the rules", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  const rules = screen.getByRole("heading", { name: "Quy tắc thu nhập" }).closest("section")!;
  expect(within(rules).getByText("2,5%")).toBeInTheDocument();
  expect(within(rules).getByText("350.000 ₫ / đơn vị")).toBeInTheDocument();
  expect(within(rules).getByText("Thợ Hùng")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tạo phiên bản quy tắc mới" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tạo phiên bản quy tắc" }));
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Tạo phiên bản quy tắc mới" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ghi căn cứ tính thủ công" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Phê duyệt ghi nhận tự động theo sự kiện" })).toBeInTheDocument();
});

it("shows no create popups to readers", async () => {
  m.permissions = new Set(["compensation.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole("button", { name: /Tạo phiên bản|Ghi căn cứ|Phê duyệt ghi nhận/ })).not.toBeInTheDocument();
});

it("lets a trip rule for every worker be approved for automatic recognition (D31)", async () => {
  m.tables.compensation_rules = [...m.tables.compensation_rules,
    { id: "r3", code: "CHUYEN", name: "Tiền chuyến", version: 1, employee_id: null, earning_type: "PER_TRIP", calculation_kind: "FIXED_PER_BASIS", classification: "DIRECT_LABOR", rate_vnd_per_unit: "30000", rate_bps: null, effective_from: "2026-10-18", effective_to: null },
    { id: "r4", code: "CHUYEN_CU", name: "Tiền chuyến cũ", version: 1, employee_id: null, earning_type: "PER_TRIP", calculation_kind: "FIXED_PER_BASIS", classification: "DIRECT_LABOR", rate_vnd_per_unit: "25000", rate_bps: null, effective_from: "2026-10-01", effective_to: null }];
  m.tables.compensation_recognition_policies = [{ rule_id: "r4", employee_id: null, recognition_kind: "WORK_ITEM_VERIFICATION", effective_at: "2026-10-02T01:00:00Z" }];
  render(await Page({ searchParams: Promise.resolve({}) }));
  fireEvent.click(screen.getByRole("button", { name: "Phê duyệt ghi nhận tự động theo sự kiện" }));
  const dialog = screen.getByRole("dialog");
  const options = within(dialog.querySelector<HTMLSelectElement>("select[name=ruleId]")!).getAllByRole("option").map(option => option.textContent);
  expect(options).toEqual(["Chọn quy tắc", "CONG_CA · Phiên bản 1 · Thợ Hùng", "CHUYEN · Phiên bản 1 · Mọi thợ"]);
  expect(within(dialog).getByRole("option", { name: "Việc của thợ được xác minh (gồm chuyến giao thợ báo đã giao)" })).toBeInTheDocument();
  expect(within(dialog).getByText(/CHUYEN_CU · Mọi thợ/)).toBeInTheDocument();
});
