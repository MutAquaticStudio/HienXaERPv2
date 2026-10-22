import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), rpc: vi.fn(), calls: [] as { table: string; method: string; args: unknown[] }[], tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/admin/cashbook" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b", permissions: m.permissions }) }));
vi.mock("@/modules/finance/actions", () => ({ createFinanceAccountAction: vi.fn(), reconcilePaymentAction: vi.fn(), reversePaymentAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lt", "order", "range", "limit"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    const result = Promise.resolve({ data: m.tables[table] ?? [], error: null });
    query.then = result.then.bind(result);
    return query;
  },
  rpc(name: string, args: unknown) {
    m.calls.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
    const result = Promise.resolve(m.rpc(name, args));
    return Object.assign(result, { select: () => ({ single: () => result }) });
  },
}) }));

import CashbookPage from "./page";

beforeEach(() => {
  m.calls = [];
  m.permissions = new Set(["finance.ar.read", "finance.ap.read", "finance.payment.post", "finance.reconcile", "finance.payment.reverse", "finance.account.manage"]);
  m.tables = {
    payment_read: [{ id: "p1", payment_number: "PT-1", direction: "RECEIPT", counterparty_name: "Công ty An Phát", account_code: "TM", amount_vnd: "500000", allocated_amount_vnd: "500000", advance_amount_vnd: "0", unallocated_amount_vnd: "0", effective_at: "2026-10-05T03:00:00Z", posting_state: "POSTED", reconciliation_state: "UNMATCHED", reconciliation_difference_vnd: "500000", reversal_of_payment_id: null }],
    finance_accounts: [{ id: "11111111-1111-4111-8111-111111111111", code: "TM", name: "Tiền mặt", account_kind: "CASH", active: true }],
    advance_position_read: [],
    customers: [{ id: "c1", code: "KH01", display_name: "Công ty An Phát" }],
    suppliers: [{ id: "s1", code: "NCC1", name: "Thép Hòa Phát" }],
  };
  m.rpc.mockImplementation((name: string) => name === "cashbook_summary"
    ? { data: { net_cash_vnd: "3200000", unmatched_count: 1 }, error: null }
    : { data: { opening_vnd: "1000000", receipts_vnd: "2500000", disbursements_vnd: "300000", closing_vnd: "3200000", payment_count: 3 }, error: null });
});
afterEach(cleanup);
const page = async (query: Record<string, string> = {}) => render(await CashbookPage({ searchParams: Promise.resolve(query) }));

it("shows the period's opening, receipts, disbursements and closing balance", async () => {
  await page({ from: "2026-10-01", to: "2026-10-31", account: "11111111-1111-4111-8111-111111111111", direction: "RECEIPT" });
  expect(m.calls).toContainEqual({ table: "rpc:cashbook_period_summary", method: "rpc", args: [{ target_branch_id: "b", from_at: "2026-09-30T17:00:00.000Z", to_at: "2026-10-31T17:00:00.000Z", target_account_id: "11111111-1111-4111-8111-111111111111" }] });
  expect(m.calls).toEqual(expect.arrayContaining([
    { table: "payment_read", method: "gte", args: ["effective_at", "2026-09-30T17:00:00.000Z"] },
    { table: "payment_read", method: "lt", args: ["effective_at", "2026-10-31T17:00:00.000Z"] },
    { table: "payment_read", method: "eq", args: ["direction", "RECEIPT"] },
  ]));
  const period = screen.getByRole("region", { name: "Quỹ trong kỳ" });
  for (const value of ["1.000.000 ₫", "2.500.000 ₫", "300.000 ₫", "3.200.000 ₫"]) expect(period.textContent).toContain(value);
  expect(screen.getByText("Dòng tiền ròng")).toBeInTheDocument();
});

it("offers receipts, payments and row handling in popups by permission", async () => {
  await page();
  expect(screen.getByRole("button", { name: "Lập phiếu thu" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lập phiếu chi" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tạo tài khoản tiền" })).toBeInTheDocument();
  const row = screen.getByText("PT-1").closest("tr")!;
  expect(within(row).getByRole("link", { name: "In phiếu thu" })).toHaveAttribute("href", "/api/payments/p1/voucher/pdf");
  expect(within(row).getByRole("button", { name: "Xử lý" })).toBeInTheDocument();
  fireEvent.click(within(row).getByRole("button", { name: "Xử lý" }));
  // FB7: reversing takes an optional note; nothing has to be typed.
  expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();
  expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument();
  cleanup();
  m.calls = [];
  m.permissions = new Set(["finance.ar.read"]);
  await page();
  expect(screen.queryByRole("button", { name: /Lập phiếu|Xử lý|Tạo tài khoản/ })).not.toBeInTheDocument();
  expect(m.calls.some((call) => call.table === "customers")).toBe(false);
});

it("falls back to this month for an impossible date", async () => {
  await page({ from: "2026-02-31" });
  const call = m.calls.find((item) => item.table === "rpc:cashbook_period_summary")!;
  expect((call.args[0] as { from_at: string }).from_at).toMatch(/^\d{4}-\d{2}-(?:\d{2})T17:00:00\.000Z$/);
});

it("lists stock-count losses as non-cash expenses beside the cash, and links other expenses (FB7)", async () => {
  m.permissions = new Set([...m.permissions, "finance.expense.read", "finance.expense.manage"]);
  m.tables.expense_read = [{ id: "e1", expense_number: "EXP-202610-000001", category_name: "Hao hụt kiểm kho", description: "Kiểm kho KK-1: Thép −2 kg",
    amount_vnd: "3000", effective_at: "2026-10-22T03:00:00Z" }];
  await page();
  const panel = screen.getByRole("region", { name: "Chi phí không dùng tiền" });
  expect(within(panel).getByText("Tổng 3.000 ₫")).toBeInTheDocument();
  expect(within(panel).getByText("không tính vào số dư quỹ", { exact: false })).toBeInTheDocument();
  expect(within(panel).getByRole("link", { name: "EXP-202610-000001" })).toHaveAttribute("href", "/admin/expenses?focus=e1");
  expect(m.calls).toEqual(expect.arrayContaining([{ table: "expense_read", method: "eq", args: ["settlement", "NON_CASH"] }]));
  expect(screen.getByRole("link", { name: "Chi phí khác" })).toHaveAttribute("href", "/admin/expenses?new=1");
});
