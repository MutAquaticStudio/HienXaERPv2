import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, drafts: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/expenses" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b", authUserId: "u", permissions: m.permissions }) }));
vi.mock("@/modules/finance/actions", () => ({ createExpenseCategoryAction: vi.fn() }));
vi.mock("@/modules/finance/operating-expense-actions", () => ({ recordOperatingExpenseAction: vi.fn() }));
vi.mock("@/modules/finance/delivery-expense-form", () => ({
  DeliveryExpenseForm: () => <form><button type="submit">Ghi chi phí chuyến</button></form>,
  ExpenseApprovalForm: ({ expenseId }: { expenseId: string }) => <form data-expense={expenseId}><button type="submit">Duyệt và ghi công nợ phải trả</button></form>,
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    let state: string | undefined;
    query.select = () => query;
    query.eq = (column: string, value: string) => { if (column === "approval_state") state = value; return query; };
    let counting = false;
    query.limit = (rows: number) => { counting = rows === 100; return query; };
    for (const method of ["or", "order", "range"]) query[method] = () => query;
    query.maybeSingle = () => Promise.resolve({ data: (m.tables[table] ?? [])[0] ?? null, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: counting && state === "DRAFT" && table === "expense_read" ? m.drafts : m.tables[table] ?? [], error: null }).then(resolve);
    return query;
  },
}) }));

import ExpensesPage from "./page";

const expense = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", expense_number: "CP-1", category_name: "Xăng dầu", supplier_name: "Petrolimex", payee_display: "Petrolimex", settlement: "PAYABLE", counts_in_profit: true, amount_vnd: "250000", effective_at: "2026-10-16T03:00:00Z", due_date: "2026-10-30", description: "Đổ dầu xe 29C", activity_kind: "DELIVERY", approval_state: "DRAFT", version: 1 };
beforeEach(() => {
  m.permissions = new Set(["finance.expense.read", "finance.expense.manage"]);
  m.drafts = Array.from({ length: 100 }, () => expense);
  m.tables = { expense_read: [expense], expense_categories: [{ id: "k1", code: "XD", name: "Xăng dầu" }], suppliers: [], sales_order_read: [], delivery_expense_assignment_read: [], delivery_expense_sources: [] };
});
afterEach(cleanup);
const page = async (query: Record<string, string> = {}) => render(await ExpensesPage({ searchParams: Promise.resolve(query) }));

it("groups expenses in status tabs and creates them through popups", async () => {
  await page({ state: "DRAFT" });
  expect(screen.getByRole("link", { name: /Chờ duyệt/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Chờ duyệt/ })).toHaveTextContent("99+");
  expect(screen.getByRole("link", { name: /Đã duyệt/ })).toHaveTextContent("Đã duyệt1");
  expect(screen.getByRole("link", { name: /Đã duyệt/ })).toHaveAttribute("href", "/admin/expenses?state=APPROVED");
  expect(screen.getByRole("button", { name: "Ghi chi phí" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nhóm chi phí" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Duyệt và ghi công nợ phải trả" })).not.toBeInTheDocument();
  const row = screen.getByText("CP-1").closest("tr")!;
  expect(within(row).getByRole("button", { name: "Duyệt" })).toBeInTheDocument();
  expect(within(row).getByText("Ghi nợ NCC")).toBeInTheDocument();
});

it("records a KiotViet-style expense: any payee, paid now from a fund or owed to a supplier (FB7)", async () => {
  m.permissions = new Set(["finance.expense.read", "finance.expense.manage", "finance.payment.post"]);
  m.tables.expense_read = [{ ...expense, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", expense_number: "CP-2", supplier_name: null, payee_display: "Công ty quảng cáo ABC",
    settlement: "PAID_NOW", counts_in_profit: false, approval_state: "APPROVED" }];
  m.tables.finance_accounts = [{ id: "a1", code: "TM", name: "Két", account_kind: "CASH" }];
  m.tables.employee_branch_access = [{ employees: { id: "e1", code: "NV01", display_name: "Thợ 01" } }];
  await page();
  const row = screen.getByText("CP-2").closest("tr")!;
  expect(within(row).getByText("Công ty quảng cáo ABC")).toBeInTheDocument();
  expect(within(row).getByText("Đã trả ngay · không tính lợi nhuận")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  const dialog = screen.getByRole("dialog", { name: "Ghi chi phí" });
  expect(within(dialog).getByLabelText("Loại chi")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Chi từ quỹ")).toHaveValue("a1");
  expect(within(dialog).queryByLabelText("Nhà cung cấp nhận tiền")).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("radio", { name: "Nhân viên" }));
  expect(within(dialog).getByRole("option", { name: "Thợ 01 (NV01)" })).toBeInTheDocument();
});

it("opens the approval popup of a focused draft expense", async () => {
  await page({ focus: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" });
  const dialog = screen.getByRole("dialog", { name: "Duyệt chi phí CP-1" });
  expect(within(dialog).getByText(/250\.000 ₫/)).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Duyệt và ghi công nợ phải trả" })).toBeInTheDocument();
});

it("is read-only without the right to manage expenses", async () => {
  m.permissions = new Set(["finance.expense.read"]);
  await page();
  expect(screen.queryByRole("button", { name: /Ghi chi phí|Nhóm chi phí|Duyệt/ })).not.toBeInTheDocument();
});
