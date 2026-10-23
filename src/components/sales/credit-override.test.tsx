import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, rpc: {} as Record<string, unknown>, calls: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/modules/sales/credit-override-actions", () => ({ confirmSalesOrderCreditOverride: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) query[method] = () => query;
    query.maybeSingle = () => Promise.resolve({ data: (m.tables[table] ?? [])[0] ?? null, error: null });
    return query;
  },
  rpc(name: string) { m.calls.push(name); return Promise.resolve({ data: m.rpc[name] ?? null, error: m.rpc[name] ? null : { message: "forbidden" } }); },
}) }));

import { SalesOrderCreditOverride, approverText, nameInitials } from "./credit-override";

const snapshot = { state: "DRAFT", customer_active: true, order_amount_vnd: "30000000", approved_limit_vnd: "50000000", exposure_vnd: "40000000",
  overdue_vnd: "0", snapshot_hash: "a".repeat(64) };
const people = { approved: { name: "Nguyễn Kế Toán", code: "NV02", roles: "Kế toán", at: "2026-10-23T02:00:00Z" },
  approvers: [{ name: "Chủ doanh nghiệp", roles: "Chủ" }, { name: "Nguyễn Kế Toán", roles: "Kế toán" }] };
beforeEach(() => {
  m.calls = [];
  m.permissions = new Set(["orders.read", "orders.confirm", "finance.ar.adjust"]);
  m.tables = { sales_orders: [{ commercial_state: "DRAFT" }] };
  m.rpc = { preview_sales_order_credit_override: snapshot, sales_order_credit_people: people };
});
afterEach(cleanup);
const view = async (blocked: "limit" | null = null) => render(<>{await SalesOrderCreditOverride({ orderId: "order", blocked })}</>);

it("opens the approval popup by itself when confirming was stopped by credit", async () => {
  await view("limit");
  const dialog = screen.getByRole("dialog", { name: "Duyệt vượt hạn mức tín dụng" });
  expect(dialog).toHaveTextContent("vượt hạn mức tín dụng, nên đơn chưa xác nhận được");
  expect(dialog).toHaveTextContent(/Tổng sau xác nhận\s*70\.000\.000/);
  expect(within(dialog).getByRole("button", { name: "Duyệt vượt hạn mức và xác nhận đơn" })).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();
  // 40M committed + 30M order against a 50M limit: the bar is drawn to 70M, the limit mark at 71.4%.
  expect(dialog.querySelector(".credit-meter-committed")).toHaveStyle({ width: "57.1%" });
  expect(dialog.querySelector(".credit-meter-limit")).toHaveStyle({ left: "71.4%" });
  expect(dialog).toHaveTextContent(/Công nợ và đơn đã cam kết 40\.000\.000/);
});

it("makes two-letter badges from the first and last word of a name", () => {
  expect(nameInitials("Nguyễn Kế Toán")).toBe("NT");
  expect(nameInitials("ánh")).toBe("Á");
  expect(nameInitials("  ")).toBe("?");
});

it("keeps the popup closed on a normal visit, with a button to open it", async () => {
  await view();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Duyệt vượt hạn mức" }));
  expect(screen.getByRole("dialog", { name: "Duyệt vượt hạn mức tín dụng" })).toBeInTheDocument();
});

it("shows nothing when the order is within credit", async () => {
  m.rpc.preview_sales_order_credit_override = { ...snapshot, order_amount_vnd: "1000000" };
  const { container } = await view();
  expect(container).toBeEmptyDOMElement();
});

it("tells staff who cannot approve which people can, by name and role", async () => {
  m.permissions = new Set(["orders.read", "orders.confirm"]);
  await view("limit");
  const dialog = screen.getByRole("dialog", { name: "Cần duyệt vượt hạn mức" });
  expect(within(dialog).getByText("Chủ doanh nghiệp")).toBeInTheDocument();
  expect(within(dialog).getByText("Kế toán")).toBeInTheDocument();
  expect(within(dialog).getByText("CN")).toHaveAttribute("aria-hidden", "true");
  expect(m.calls).not.toContain("preview_sales_order_credit_override");
});

it("names the approver of a confirmed order instead of a login id", async () => {
  m.tables = { sales_orders: [{ commercial_state: "CONFIRMED" }], sales_order_credit_overrides: [{ reason: "Khách quen", created_at: "2026-10-23T02:00:00Z",
    approved_limit_vnd: "50000000", exposure_before_vnd: "40000000", order_amount_vnd: "30000000", exposure_after_vnd: "70000000", overdue_vnd: "0" }] };
  await view();
  const box = screen.getByRole("region", { name: "Đã duyệt vượt hạn mức" });
  expect(within(box).getByText("Đã duyệt")).toBeInTheDocument();
  expect(within(box).getByText("Nguyễn Kế Toán (NV02) · Kế toán")).toBeInTheDocument();
  expect(within(box).getByText("NT")).toHaveAttribute("aria-hidden", "true");
  expect(within(box).getByText("Hạn mức lúc duyệt").nextSibling).toHaveTextContent("50.000.000 ₫");
  expect(within(box).getByText("Sau khi xác nhận đơn").nextSibling).toHaveTextContent("70.000.000 ₫");
  expect(box).toHaveTextContent("Ghi chú: Khách quen");
  expect(approverText(null)).toBe("Người duyệt không còn trong danh sách nhân viên");
});

it("FB9: hides the default note when the approver left it empty", async () => {
  m.tables = { sales_orders: [{ commercial_state: "CONFIRMED" }], sales_order_credit_overrides: [{ reason: "Vượt hạn mức tín dụng", created_at: "2026-10-23T02:00:00Z",
    approved_limit_vnd: "50000000", exposure_before_vnd: "40000000", order_amount_vnd: "30000000", exposure_after_vnd: "70000000", overdue_vnd: "0" }] };
  await view();
  expect(screen.getByRole("region", { name: "Đã duyệt vượt hạn mức" })).not.toHaveTextContent("Ghi chú");
});
