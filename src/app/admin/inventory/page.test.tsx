import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: new Set(["inventory.adjust"]) }) }));
vi.mock("./actions", () => ({ saveInventoryThresholdAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from: (name: string) => {
    const rows: Record<string, unknown[]> = {
      warehouses: [{ id: "warehouse", name: "Kho chính" }],
      materials: [{ id: "material", name: "Cát", base_uom_id: "unit" }],
      units_of_measure: [{ id: "unit", symbol: "m³" }],
      inventory_stock_thresholds: [{ id: "threshold", warehouse_id: "warehouse", material_id: "material", threshold_base_quantity: "1234.5", active: true, version: 1 }],
    };
    const result = Promise.resolve({ data: rows[name] ?? [], error: null });
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, then: result.then.bind(result) };
    return query;
  },
}) }));

import InventoryPage from "./page";

it("displays a Vietnamese decimal while preserving the canonical threshold submitted by the form", async () => {
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("<td>1.234,5</td>");
  const input = html.match(/<input[^>]*aria-label="Ngưỡng mới"[^>]*>/)?.[0];
  expect(input).toContain('value="1234.5"');
  expect(input).not.toContain('value="1.234,5"');
  expect(html).toContain("Kho hàng");
  expect(html).not.toMatch(/movement ledger|On-hand|Append-only/);
});
