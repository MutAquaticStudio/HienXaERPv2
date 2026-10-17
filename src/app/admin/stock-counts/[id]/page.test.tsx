import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, sheet: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/components/inventory/stock-count-sheet", () => ({ StockCountSheet: (props: unknown) => { m.sheet(props); return <div>Phiếu</div>; } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit"]) query[method] = () => query;
    const rows = m.tables[table] ?? [];
    query.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    const result = Promise.resolve({ data: rows, error: null });
    query.then = result.then.bind(result);
    return query;
  },
}) }));

import Page from "./page";

const count = { id: "c1", warehouse_id: "w1", count_number: "SC-2026-000002", state: "OPEN", cutoff_at: "2026-10-17T03:00:00Z", version: 4, line_count: 1, variance_count: 1, approved_at: null };
beforeEach(() => {
  vi.clearAllMocks();
  m.permissions = new Set(["inventory.read", "inventory.count", "inventory.adjust"]);
  m.tables = {
    stock_count_read: [count],
    stock_count_line_read: [{ material_id: "a", expected_base_quantity: "100", counted_base_quantity: "98", reason: "Hao hụt", adjustment_unit_cost_vnd: null }],
    warehouse_inventory_read: [
      { material_id: "a", on_hand_base_quantity: "100", average_cost_vnd_per_base: "1500" },
      { material_id: "b", on_hand_base_quantity: "7", average_cost_vnd_per_base: "300000" },
      { material_id: "z", on_hand_base_quantity: "0", average_cost_vnd_per_base: null },
    ],
    warehouses: [{ id: "w1", name: "Kho chính" }],
    units_of_measure: [{ id: "kg", symbol: "kg" }],
    materials: [{ id: "a", code: "XM40", name: "Xi măng", base_uom_id: "kg" }, { id: "b", code: "CAT", name: "Cát", base_uom_id: "kg" }, { id: "n", code: "GACH", name: "Gạch", base_uom_id: "kg" }],
  };
});
afterEach(cleanup);
const page = async () => render(await Page({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({}) }));

it("fills an open sheet with every stocked material and the saved counts", async () => {
  await page();
  expect(screen.getByRole("heading", { name: "SC-2026-000002" })).toBeInTheDocument();
  expect(screen.getByText(/Kho chính · chốt sổ lúc/)).toBeInTheDocument();
  const props = m.sheet.mock.calls[0][0];
  expect(props).toMatchObject({ countId: "c1", version: 4, open: true, can: { count: true, approve: true, cost: false } });
  expect(props.rows).toEqual([
    { materialId: "b", code: "CAT", name: "Cát", symbol: "kg", book: "7", recorded: null, averageCost: null },
    { materialId: "a", code: "XM40", name: "Xi măng", symbol: "kg", book: "100", recorded: { counted: "98", reason: "Hao hụt", unitCost: null }, averageCost: null },
  ]);
  expect(props.extraMaterials).toEqual([{ id: "n", code: "GACH", name: "Gạch", symbol: "kg" }]);
});

it("shows only the counted lines of a closed count", async () => {
  m.tables.stock_count_read = [{ ...count, state: "APPROVED", approved_at: "2026-10-17T05:00:00Z" }];
  m.permissions = new Set(["inventory.read", "inventory.cost.read"]);
  await page();
  expect(screen.getByText(/Đã cân bằng kho theo các dòng/)).toBeInTheDocument();
  const props = m.sheet.mock.calls[0][0];
  expect(props.open).toBe(false);
  expect(props.rows.map((row: { materialId: string; averageCost: string | null }) => [row.materialId, row.averageCost])).toEqual([["a", "1500"]]);
  expect(props.extraMaterials).toEqual([]);
});
