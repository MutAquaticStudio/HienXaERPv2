import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMaterialDetail, materialReadCapabilities } from "./material-detail";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({ permission: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: boundary.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: boundary.client }));
const materialId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const baseUom = "33333333-3333-4333-8333-333333333333";
const material = { id: materialId, group_id: groupId, base_uom_id: baseUom, code: "SYN_UNIT", name: "Synthetic", active: true, sale_enabled: true, purchase_enabled: true, specification: null };

function fixture(permissions: string[], overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { materials: material, material_groups: { id: groupId, name: "Group" }, ...overrides };
  const requests: { table: string; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; or: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => {
    const response = { data: Object.hasOwn(data, table) ? data[table] : [], error: null };
    const request = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(response), then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve) };
    for (const key of ["select", "eq", "or", "order", "limit"] as const) request[key].mockReturnValue(request);
    requests.push({ table, select: request.select, eq: request.eq, or: request.or });
    return request;
  });
  boundary.permission.mockResolvedValue({ branchId: "branch-a", branchName: "QA A", permissions: new Set(["catalog.read", ...permissions]) });
  boundary.client.mockResolvedValue({ from });
  return { from, requests };
}

beforeEach(() => vi.clearAllMocks());
describe("material read composition boundaries", () => {
  it.each([
    [[], false], [["purchasing.read"], false], [["purchasing.price.read"], false],
    [["purchasing.read", "purchasing.price.read"], true],
  ] as [string[], boolean][])('requires both purchase permissions: %j', (permissions, allowed) => {
    expect(materialReadCapabilities(new Set(permissions)).purchasePrice).toBe(allowed);
  });
  it("requires catalog.read and rejects invalid UUID before constructing queries", async () => {
    fixture([]);
    expect(await loadMaterialDetail("../private")).toBeNull();
    expect(boundary.permission).toHaveBeenCalledWith("catalog.read");
    expect(boundary.client).not.toHaveBeenCalled();
  });
  it("does not load price, stock or supplier data for a catalog-only actor", async () => {
    const { from } = fixture([]);
    const result = await loadMaterialDetail(materialId);
    for (const table of ["pricing_rule_read", "purchase_price_rules", "warehouse_inventory_read", "warehouses", "suppliers"]) expect(from).not.toHaveBeenCalledWith(table);
    expect(result?.purchasePrices).toEqual([]);
    expect(result?.positions).toEqual([]);
  });
  it.each([["purchasing.read"], ["purchasing.price.read"]])("does not query costs with only %s", async permission => {
    const { from } = fixture([permission]);
    await loadMaterialDetail(materialId);
    expect(from).not.toHaveBeenCalledWith("purchase_price_rules");
  });
  it("scopes authorized purchase prices to branch/material and transports VND as exact text", async () => {
    const { requests } = fixture(["purchasing.read", "purchasing.price.read"]);
    await loadMaterialDetail(materialId);
    const request = requests.find(x => x.table === "purchase_price_rules")!;
    expect(request.eq).toHaveBeenCalledWith("branch_id", "branch-a");
    expect(request.eq).toHaveBeenCalledWith("material_id", materialId);
    expect(request.select.mock.calls[0][0]).toContain("unit_cost_vnd::text");
  });
  it("keeps stock quantities exact and never requests inventory cost fields", async () => {
    const quantity = "9007199254740993.123456";
    const { requests } = fixture(["inventory.read"], { warehouse_inventory_read: [{ warehouse_id: "warehouse-a", base_uom_id: baseUom, on_hand_base_quantity: quantity, reserved_base_quantity: "0.000000", available_base_quantity: quantity }] });
    const result = await loadMaterialDetail(materialId);
    expect(result?.positions[0].on_hand_base_quantity).toBe(quantity);
    const request = requests.find(x => x.table === "warehouse_inventory_read")!;
    expect(request.eq).toHaveBeenCalledWith("branch_id", "branch-a");
    expect(request.select.mock.calls[0][0]).not.toMatch(/cost|value_vnd/);
  });
  it("keeps global conversions only when relevant to this material's base UOM", async () => {
    fixture([], { material_uom_conversions: [
      { id: "own", material_id: materialId, from_uom_id: "bag", to_uom_id: "kg" },
      { id: "global-base", material_id: null, from_uom_id: "bag", to_uom_id: baseUom },
      { id: "unrelated", material_id: null, from_uom_id: "m", to_uom_id: "m2" },
    ] });
    expect((await loadMaterialDetail(materialId))?.conversions.map(row => row.id)).toEqual(["own", "global-base"]);
  });
  it("returns absence rather than inventing an opening zero", async () => {
    fixture(["inventory.read"]);
    expect((await loadMaterialDetail(materialId))?.positions).toEqual([]);
  });
  it("does not load subordinate data for a missing material", async () => {
    const { from } = fixture([], { materials: null });
    expect(await loadMaterialDetail(materialId)).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });
});
