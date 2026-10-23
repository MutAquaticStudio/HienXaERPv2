import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/purchase-orders" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ["select", "or", "in", "order", "range", "limit", "neq"]) query[method] = () => query;
    query.eq = (column: string, value: unknown) => { filters[column] = value; return query; };
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = (m.tables[table] ?? []).filter((row) => !filters.state || (row as { state?: string }).state === filters.state);
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
    };
    return query;
  },
}) }));

import Page from "./page";

const po = { id: "p1", purchase_order_number: "PO-2026-000044", supplier_name_snapshot: "NCC Xi măng Hà Tiên", destination_type: "WAREHOUSE", destination_name_snapshot: "Kho chính",
  source_sales_order_id: null, state: "CONFIRMED", expected_at: null, created_at: "2026-10-23T01:00:00Z", total_cost_vnd: "8200000" };
beforeEach(() => {
  m.permissions = new Set(["purchasing.read", "purchasing.price.read", "purchasing.create"]);
  m.tables = {
    purchase_order_read: [po],
    purchase_order_line_read: [{ purchase_order_id: "p1", id: "l1", material_name_snapshot: "Xi măng PCB40", quantity: "100", ordered_uom_id: "u1", line_total_cost_vnd: "8200000" }],
    units_of_measure: [{ id: "u1", symbol: "bao" }],
    purchase_order_dispatches: [],
  };
});
afterEach(cleanup);

it("filters on the left and shows the lines of an order under its row", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("radio", { name: /Đã xác nhận/ }).closest("label")).toHaveTextContent("1");
  expect(screen.getByText("Chưa gửi")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem nhanh PO-2026-000044" }));
  expect(screen.getByText(/Xi măng PCB40 · 100 bao/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở đơn mua" })).toHaveAttribute("href", "/admin/purchase-orders/p1");
});

it("hides costs from staff without the price permission", async () => {
  m.permissions = new Set(["purchasing.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByText("8.200.000 ₫")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "+ Tạo đơn mua" })).not.toBeInTheDocument();
});
