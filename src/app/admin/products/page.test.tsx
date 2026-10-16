import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), calls: [] as { table: string; method: string; args: unknown[] }[], tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/products" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/modules/pricing/request-clock", () => ({ readPricingClock: async () => Date.parse("2026-10-16T05:00:00Z") }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const result = { data: m.tables[table] ?? [], error: null, count: (m.tables[table] ?? []).length };
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "in", "order", "range", "limit"]) query[method] = (...args: unknown[]) => { m.calls.push({ table, method, args }); return query; };
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  },
}) }));
import Page from "./page";

const access = (permissions: string[]) => m.access.mockResolvedValue({ branchId: "b", permissions: new Set(["catalog.read", ...permissions]) });
beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.tables = {
    materials: [{ id: "m1", code: "XM01", name: "Xi măng PCB40", specification: "Bao 50kg", group_id: "g1", base_uom_id: "bao", sale_enabled: true, purchase_enabled: true, active: true }],
    material_groups: [{ id: "g1", name: "Xi măng" }],
    units_of_measure: [{ id: "bao", symbol: "bao" }, { id: "kg", symbol: "kg" }],
    pricing_rule_read: [{ material_id: "m1", scope_type: "DEFAULT", price_uom_id: "bao", unit_price_vnd: "95000", version: 2, active: true, effective_from: "2026-01-01T00:00:00+07:00", effective_to: null }],
    warehouse_inventory_read: [
      { material_id: "m1", warehouse_id: "w1", on_hand_base_quantity: "120", available_base_quantity: "100", inventory_value_vnd: "9600000" },
      { material_id: "m1", warehouse_id: "w2", on_hand_base_quantity: "30", available_base_quantity: "30", inventory_value_vnd: "2400000" }],
    warehouses: [{ id: "w1", name: "Kho Bến Lức" }, { id: "w2", name: "Kho Tân An" }],
    material_uom_conversions: [{ material_id: "m1", from_uom_id: "bao", to_uom_id: "kg", numerator: "50", denominator: "1" }],
  };
});
afterEach(cleanup);

it("shows only the catalog to an actor without price, stock or cost rights, and never queries them", async () => {
  access([]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: "Xi măng PCB40" })).toHaveAttribute("href", "/admin/products/m1");
  for (const header of ["Giá bán", "Giá vốn", "Tồn kho"]) expect(screen.queryByRole("columnheader", { name: header })).not.toBeInTheDocument();
  expect(m.calls.some((call) => ["pricing_rule_read", "warehouse_inventory_read", "warehouses"].includes(call.table))).toBe(false);
});

it("shows the current general price, total stock and average cost with the right permissions", async () => {
  access(["pricing.read", "inventory.read", "inventory.cost.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  const row = screen.getByRole("link", { name: "Xi măng PCB40" }).closest("tr")!;
  expect(within(row).getByText("95.000 ₫")).toBeInTheDocument();
  expect(within(row).getByText("80.000 ₫")).toBeInTheDocument();
  expect(row.querySelector('td[data-label="Tồn kho"]')).toHaveTextContent("150");
  expect(row.querySelector('td[data-label="Tồn kho"]')).toHaveTextContent("Khả dụng 130");
  expect(m.calls).toContainEqual({ table: "warehouse_inventory_read", method: "in", args: ["material_id", ["m1"]] });
  expect(m.calls).toContainEqual({ table: "pricing_rule_read", method: "eq", args: ["scope_type", "DEFAULT"] });
});

it("does not request inventory value without inventory.cost.read", async () => {
  access(["inventory.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  const select = m.calls.find((call) => call.table === "warehouse_inventory_read" && call.method === "select");
  expect(String(select?.args[0])).not.toContain("inventory_value_vnd");
  expect(screen.queryByRole("columnheader", { name: "Giá vốn" })).not.toBeInTheDocument();
});

it("expands a row in place with stock per warehouse and unit conversions", async () => {
  access(["inventory.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  fireEvent.click(screen.getByRole("button", { name: "Mở rộng Xi măng PCB40" }));
  expect(screen.getByText("Kho Bến Lức")).toBeInTheDocument();
  expect(screen.getByText("1 bao = 50 kg")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Xem chi tiết vật tư" })).toHaveAttribute("href", "/admin/products/m1");
  expect(screen.getByRole("button", { name: "Thu gọn Xi măng PCB40" })).toHaveAttribute("aria-expanded", "true");
});

it("applies group and sale/purchase filters on the server", async () => {
  access([]);
  render(await Page({ searchParams: Promise.resolve({ group: "10000000-0000-4000-8000-000000000001", use: "PURCHASE", state: "INACTIVE" }) }));
  const calls = m.calls.filter((call) => call.table === "materials");
  expect(calls).toContainEqual({ table: "materials", method: "eq", args: ["group_id", "10000000-0000-4000-8000-000000000001"] });
  expect(calls).toContainEqual({ table: "materials", method: "eq", args: ["purchase_enabled", true] });
  expect(calls).toContainEqual({ table: "materials", method: "eq", args: ["active", false] });
});
