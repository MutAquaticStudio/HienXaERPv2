import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/deliveries" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ["select", "or", "in", "order", "range", "limit"]) query[method] = () => query;
    query.eq = (column: string, value: unknown) => { filters[column] = value; return query; };
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = (m.tables[table] ?? []).filter((row) => !filters.execution_state || (row as { execution_state?: string }).execution_state === filters.execution_state);
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    };
    return query;
  },
}) }));

import Page from "./page";

beforeEach(() => {
  m.permissions = new Set(["delivery.read", "delivery.exception"]);
  m.tables = {
    delivery_read: [{ id: "d1", sales_order_id: "o1", delivery_number: "DL-2026-000031", customer_name_snapshot: "Anh Tuấn", site_name_snapshot: "Công trình Q.7", execution_state: "PLANNED",
      result_kind: null, scheduled_at: null, external_carrier_name: null, vehicle_id: null, created_at: "2026-10-23T01:00:00Z" }],
    delivery_line_read: [{ id: "x", delivery_id: "d1", material_name_snapshot: "Cát vàng", planned_base_quantity: "4", actual_base_quantity: null, base_uom_symbol: "m³" }],
  };
});
afterEach(cleanup);

it("counts deliveries per state and opens the lines, with cancel for planned ones", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("radio", { name: /Chờ phân giao/ }).closest("label")).toHaveTextContent("1");
  fireEvent.click(screen.getByRole("button", { name: "Xem nhanh DL-2026-000031" }));
  expect(screen.getByText(/Cát vàng · 4 m³/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Hủy kế hoạch" })).toHaveAttribute("href", "/admin/deliveries/d1/cancel");
  expect(screen.getByRole("link", { name: "Mở đơn bán" })).toHaveAttribute("href", "/admin/orders/o1");
});
