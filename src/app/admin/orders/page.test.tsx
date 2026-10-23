import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/orders" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ["select", "or", "in", "order", "range", "limit", "neq"]) query[method] = () => query;
    query.eq = (column: string, value: unknown) => { filters[column] = value; return query; };
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = (m.tables[table] ?? []).filter((row) => !filters.commercial_state || (row as { commercial_state?: string }).commercial_state === filters.commercial_state);
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    };
    return query;
  },
}) }));

import Page from "./page";

const order = { id: "o1", order_number: "SO-2026-000123", customer_name_snapshot: "Anh Tuấn", site_name_snapshot: "Công trình Q.7", commercial_state: "DRAFT",
  fulfillment_state: "NOT_STARTED", payment_state: "UNPAID", total_vnd: "7250000", requested_delivery_at: null, created_at: "2026-10-23T01:00:00Z" };
beforeEach(() => {
  m.permissions = new Set(["orders.read", "orders.create"]);
  m.tables = {
    sales_orders: [{ id: "o1", commercial_state: "DRAFT" }, { id: "o2", commercial_state: "CONFIRMED" }],
    sales_order_read: [order, { ...order, id: "o2", order_number: "SO-2026-000122", customer_name_snapshot: "KH01", commercial_state: "CONFIRMED" }],
    sales_order_lines: [{ sales_order_id: "o1", line_number: 1, material_name_snapshot: "Xi măng PCB40", quantity: "60", line_total_vnd: "5460000", units_of_measure: { symbol: "bao" } }],
  };
});
afterEach(cleanup);

it("filters on the left with counts and opens a summary of the lines under a row (D29)", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  const filters = screen.getByRole("form", { name: "Bộ lọc đơn bán" });
  expect(within(filters).getByRole("radio", { name: /Đang làm việc/ })).toBeChecked();
  expect(within(filters).getByRole("radio", { name: /Nháp/ }).closest("label")).toHaveTextContent("1");
  expect(screen.getByRole("link", { name: "+ Tạo đơn bán" })).toHaveClass("button-commerce");
  expect(screen.getByRole("link", { name: "Anh Tuấn" })).toHaveAttribute("href", "/admin/orders/o1");
  fireEvent.click(screen.getByRole("button", { name: "Xem nhanh SO-2026-000123" }));
  expect(screen.getByText(/Xi măng PCB40 · 60 bao/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tải PDF" })).toHaveAttribute("href", "/api/orders/o1/pdf");
});

it("hides the create button from readers and shows an empty state with a reset", async () => {
  m.permissions = new Set(["orders.read"]);
  m.tables.sales_orders = [];
  render(await Page({ searchParams: Promise.resolve({ q: "zzz" }) }));
  expect(screen.queryByRole("link", { name: "+ Tạo đơn bán" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Không có đơn bán phù hợp");
  expect(screen.getAllByRole("link", { name: /Xóa/ }).length).toBeGreaterThan(0);
});
