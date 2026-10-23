import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, calls: [] as { table: string; method: string; args: unknown[] }[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/inventory" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("./actions", () => ({ saveInventoryThresholdAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "in", "order", "limit", "range"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    const result = Promise.resolve({ data: m.tables[table] ?? [], error: null });
    query.then = result.then.bind(result);
    return query;
  },
  rpc: async (name: string) => ({ data: m.tables[`rpc:${name}`] ?? [], error: null }),
}) }));

import InventoryPage from "./page";

const W1 = "11111111-1111-4111-8111-111111111111", W2 = "22222222-2222-4222-8222-222222222222";
const XM = "33333333-3333-4333-8333-333333333333", CAT = "44444444-4444-4444-8444-444444444444", DA = "55555555-5555-4555-8555-555555555555";
beforeEach(() => {
  m.calls = [];
  m.permissions = new Set(["inventory.read", "inventory.adjust", "purchasing.create"]);
  m.tables = {
    materials: [
      { id: XM, code: "XM40", name: "Xi măng PCB40", group_id: "g", base_uom_id: "kg" },
      { id: CAT, code: "CAT", name: "Cát vàng", group_id: "g", base_uom_id: "m3" },
      { id: DA, code: "DA12", name: "Đá 1x2", group_id: "g", base_uom_id: "m3" },
    ],
    warehouse_inventory_read: [
      { warehouse_id: W1, material_id: XM, on_hand_base_quantity: "4000", reserved_base_quantity: "150", available_base_quantity: "3850", inventory_value_vnd: null },
      { warehouse_id: W2, material_id: XM, on_hand_base_quantity: "850", reserved_base_quantity: "0", available_base_quantity: "850", inventory_value_vnd: null },
      { warehouse_id: W1, material_id: CAT, on_hand_base_quantity: "2", reserved_base_quantity: "0", available_base_quantity: "2", inventory_value_vnd: null },
    ],
    inventory_stock_thresholds: [{ warehouse_id: W1, material_id: CAT, threshold_base_quantity: "5", active: true }],
    low_stock_alert_read: [{ warehouse_id: W1, material_id: CAT }],
    warehouses: [{ id: W1, name: "Kho chính" }, { id: W2, name: "Kho phụ" }],
    material_groups: [{ id: "g", name: "Vật liệu thô" }],
    units_of_measure: [{ id: "kg", symbol: "kg" }, { id: "m3", symbol: "m³" }, { id: "tan", symbol: "tấn" }, { id: "bao", symbol: "bao" }],
    material_uom_conversions: [
      { material_id: XM, from_uom_id: "bao", to_uom_id: "kg", numerator: "50", denominator: "1" },
      { material_id: XM, from_uom_id: "tan", to_uom_id: "kg", numerator: "1000", denominator: "1" },
    ],
    "rpc:warehouse_stock_promised": [{ warehouse_id: W1, material_id: XM, promised_base_quantity: "200" }],
    inventory_movement_read: [
      { id: "mv2", location_kind: "WAREHOUSE", warehouse_id: W1, delivery_id: "d1", movement_type: "DELIVERY_HANDOFF", base_quantity_delta: "-150", occurred_at: "2026-10-17T03:00:00Z" },
      { id: "mv1", location_kind: "WAREHOUSE", warehouse_id: W1, delivery_id: null, movement_type: "PURCHASE_RECEIPT", base_quantity_delta: "5000", occurred_at: "2026-10-16T03:00:00Z" },
    ],
  };
});
afterEach(cleanup);
const page = async (query: Record<string, string> = {}) => render(await InventoryPage({ searchParams: Promise.resolve(query) }));

it("shows one row per material with stock summed over warehouses and the overview counts", async () => {
  await page();
  const metrics = screen.getByRole("region", { name: "Tổng quan tồn kho" });
  expect(within(metrics).getByRole("link", { name: /Vật tư còn hàng\s*2/ })).toHaveAttribute("href", "/admin/inventory?stock=in");
  expect(within(metrics).getByRole("link", { name: /Hết hàng\s*1/ })).toBeInTheDocument();
  expect(within(metrics).getByRole("link", { name: /Dưới ngưỡng\s*1/ })).toBeInTheDocument();
  const cement = screen.getByRole("link", { name: "Xi măng PCB40" }).closest("tr")!;
  expect(within(cement).getByText("4.850 kg")).toBeInTheDocument();
  // FB10 (5.1): 150 kg waiting to load, 200 kg promised to an order without a delivery → 4 850 − 150 − 200 = 4 500 for sale.
  expect(within(cement).getByText("150 kg")).toBeInTheDocument();
  expect(within(cement).getByText("200 kg")).toBeInTheDocument();
  expect(within(cement).getByText("4.500 kg")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Chờ xuất giao" })).toBeInTheDocument();
  const sand = screen.getByRole("link", { name: "Cát vàng" }).closest("tr")!;
  expect(within(sand).getByText(/Dưới ngưỡng/)).toBeInTheDocument();
  expect(within(sand).getByRole("link", { name: "Đặt mua" })).toHaveAttribute("href", `/admin/purchase-orders/new?warehouse=${W1}&material=${CAT}`);
  expect(within(sand).getByRole("button", { name: "Ngưỡng" })).toBeInTheDocument();
  expect(screen.queryByText("Giá trị tồn", { selector: "th" })).not.toBeInTheDocument();
  expect(m.calls.some((call) => call.table === "inventory_movement_read")).toBe(false);
});

it("filters by stock state on the server", async () => {
  await page({ stock: "low" });
  expect(screen.getByRole("heading", { name: "1 vật tư" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cát vàng" })).toBeInTheDocument();
  cleanup();
  await page({ stock: "out" });
  expect(screen.getByRole("link", { name: "Đá 1x2" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Xi măng PCB40" })).not.toBeInTheDocument();
});

it("opens the stock card of a row with the balance after each movement", async () => {
  await page({ card: XM, warehouse: W1 });
  expect(screen.getByRole("link", { name: "Xi măng PCB40" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("heading", { name: "Thẻ kho · Kho chính" })).toBeInTheDocument();
  const handoff = screen.getByText("Bàn giao lên xe").closest("tr")!;
  expect(within(handoff).getByText("-150")).toBeInTheDocument();
  expect(within(handoff).getByRole("link", { name: "Phiếu giao" })).toHaveAttribute("href", "/admin/deliveries/d1");
  const receipt = screen.getByText("Nhận hàng NCC").closest("tr")!;
  expect(within(receipt).getByText("+5.000")).toBeInTheDocument();
  expect(within(receipt).getAllByText("5.000").length).toBeGreaterThan(0);
});

it("shows quantities in the material's largest unit on request and values only with cost rights", async () => {
  m.permissions = new Set(["inventory.read", "inventory.cost.read"]);
  m.tables.warehouse_inventory_read = (m.tables.warehouse_inventory_read as Record<string, unknown>[]).map((row) => ({ ...row, inventory_value_vnd: "1000000" }));
  await page({ unit: "large" });
  const cement = screen.getByRole("link", { name: "Xi măng PCB40" }).closest("tr")!;
  expect(within(cement).getByText("4,85 tấn")).toBeInTheDocument();
  expect(within(cement).getByText("2.000.000 ₫")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ngưỡng" })).not.toBeInTheDocument();
});
