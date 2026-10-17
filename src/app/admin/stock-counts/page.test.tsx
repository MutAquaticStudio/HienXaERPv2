import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, calls: [] as { table: string; method: string; args: unknown[] }[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/stock-counts" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/modules/inventory/actions", () => ({ openStockCountAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "ilike", "order", "limit", "range"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    const rows = m.tables[table] ?? [];
    const result = Promise.resolve({ data: rows, error: null, count: rows.length });
    query.then = result.then.bind(result);
    return query;
  },
}) }));

import StockCountsPage from "./page";

beforeEach(() => {
  m.calls = [];
  m.permissions = new Set(["inventory.read", "inventory.count"]);
  m.tables = {
    stock_count_read: [
      { id: "c1", warehouse_id: "w1", count_number: "SC-2026-000002", state: "OPEN", cutoff_at: "2026-10-17T03:00:00Z", line_count: 3, variance_count: 2 },
      { id: "c2", warehouse_id: "w1", count_number: "SC-2026-000001", state: "CANCELLED", cutoff_at: "2026-10-16T03:00:00Z", line_count: 0, variance_count: 0 },
    ],
    stock_count_line_read: [
      { stock_count_id: "c1", expected_base_quantity: "100", counted_base_quantity: "98" },
      { stock_count_id: "c1", expected_base_quantity: "0", counted_base_quantity: "5" },
      { stock_count_id: "c1", expected_base_quantity: "7", counted_base_quantity: "7.000000" },
    ],
    warehouses: [{ id: "w1", name: "Kho chính" }],
  };
});
afterEach(cleanup);

it("lists counts with how many materials went up and down", async () => {
  render(await StockCountsPage({ searchParams: Promise.resolve({}) }));
  const open = screen.getByRole("link", { name: "SC-2026-000002" }).closest("tr")!;
  expect(open).toHaveTextContent("Đang kiểm");
  expect(within(open).getAllByText("1")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "SC-2026-000001" }).closest("tr")).toHaveTextContent("Đã hủy");
  expect(screen.getByRole("button", { name: "+ Tạo phiếu kiểm" })).toBeInTheDocument();
});

it("filters by warehouse and state and hides creation without the count right", async () => {
  m.permissions = new Set(["inventory.read"]);
  render(await StockCountsPage({ searchParams: Promise.resolve({ state: "OPEN", warehouse: "11111111-1111-4111-8111-111111111111" }) }));
  expect(m.calls).toEqual(expect.arrayContaining([
    { table: "stock_count_read", method: "eq", args: ["state", "OPEN"] },
    { table: "stock_count_read", method: "eq", args: ["warehouse_id", "11111111-1111-4111-8111-111111111111"] },
  ]));
  expect(screen.queryByRole("button", { name: "+ Tạo phiếu kiểm" })).not.toBeInTheDocument();
});
