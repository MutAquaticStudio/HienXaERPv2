vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPurchaseOrderAction, previewWarehousePurchaseAction } from "./actions";

const fixture = vi.hoisted(() => ({ price: "120000", permissions: new Set<string>(), rpc: vi.fn() }));
const ids = {
  branch: "10000000-0000-4000-8000-000000000001", supplier: "10000000-0000-4000-8000-000000000002",
  customer: "10000000-0000-4000-8000-000000000003", site: "10000000-0000-4000-8000-000000000004",
  material: "10000000-0000-4000-8000-000000000005", uom: "10000000-0000-4000-8000-000000000006",
  rule: "10000000-0000-4000-8000-000000000007", operation: "10000000-0000-4000-8000-000000000008",
};
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/purchasing/form-options", () => ({ loadPurchaseSuppliers: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: ids.branch, permissions: fixture.permissions })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({
  rpc: fixture.rpc,
  from(table: string) {
    const values: Record<string, unknown> = {
      suppliers: { id: ids.supplier }, customers: { tier_code: null },
      materials: [{ id: ids.material, base_uom_id: ids.uom, group_id: ids.material }],
      material_uom_conversions: [],
      purchase_price_rules: [{ id: ids.rule, material_id: ids.material, purchase_uom_id: ids.uom, unit_cost_vnd: "80000", version: 1, source_type: "LIST" }],
      pricing_rules: [{ id: ids.rule, branch_id: ids.branch, scope_type: "DEFAULT", material_id: ids.material, price_uom_id: ids.uom, unit_price_vnd: fixture.price, version: 1, source_type: "LIST", effective_from: "2020-01-01T00:00:00Z", active: true }],
    };
    const response = { data: values[table], error: null };
    const query = {
      select: () => query, eq: () => query, in: () => query, lte: () => query, or: () => query, order: () => query,
      maybeSingle: async () => response,
      then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
    };
    return query;
  },
})) }));

const input = () => ({ mode: "LINKED_DIRECT", supplierId: ids.supplier, customerId: ids.customer,
  siteId: ids.site, operationId: ids.operation, expectedAt: "", terms: "UAT",
  lines: [{ materialId: ids.material, orderedUomId: ids.uom, quantity: "2", manualCostVnd: "", manualCostReason: "" }],
});
beforeEach(() => {
  fixture.price = "120000";
  fixture.permissions = new Set(["purchasing.create", "purchasing.price.read", "orders.create"]);
  fixture.rpc.mockReset();
});
describe("linked PO sales price contract", () => {
  it("previews purchase and sales totals independently", async () => {
    const result = await previewWarehousePurchaseAction(input());
    expect(result.success).toBe(true);
    expect(result.totalVnd).toBe("160000");
    expect(result.sales?.totalVnd).toBe("240000");
    expect(result.sales?.lines[0].priceSourceType).toBe("LIST");
  });
  it("does not expose purchase costs to a sales creator without cost-read permission", async () => {
    fixture.permissions.delete("purchasing.price.read");
    const result = await previewWarehousePurchaseAction(input());
    expect(result.success).toBe(true);
    expect(result.lines).toBeUndefined();
    expect(result.totalVnd).toBeUndefined();
    expect(result.sales?.totalVnd).toBe("240000");
  });
  it("rejects changed sales prices before creating either draft", async () => {
    const value = input();
    const preview = await previewWarehousePurchaseAction(value);
    fixture.price = "130000";
    const form = new FormData();
    for (const [key, data] of Object.entries(value)) if (key !== "lines") form.set(key, String(data));
    for (const [key, data] of Object.entries(value.lines[0])) form.set(key, data);
    form.set("costPreview", JSON.stringify(preview.lines));
    form.set("salesPreview", JSON.stringify(preview.sales?.lines));
    const result = await createPurchaseOrderAction(undefined, form);
    expect(result?.message).toContain("Giá bán hoặc dòng hàng đã thay đổi");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("requires sales pricing permission and reason for manual overrides", async () => {
    const value = input();
    const lines = [{ ...value.lines[0], manualSalesPriceVnd: "110000", manualSalesReason: "Giá UAT đã duyệt" }];
    expect((await previewWarehousePurchaseAction({ ...value, lines })).success).toBe(false);
    fixture.permissions.add("pricing.manage");
    const result = await previewWarehousePurchaseAction({ ...value, lines });
    expect(result.sales?.totalVnd).toBe("220000");
    expect(result.sales?.lines[0].priceSourceType).toBe("MANUAL_APPROVED");
  });
});

describe("routine price reasons and exact VND",()=>{
 it("generates purchase reference audit without a routine note",async()=>{fixture.permissions.add("purchasing.price.manage");const value=input();const result=await previewWarehousePurchaseAction({...value,lines:[{...value.lines[0],manualCostVnd:"70000",manualCostReason:""}]});expect(result.success).toBe(true);expect(result.totalVnd).toBe("140000");expect(JSON.parse(result.lines![0].overrideReason!)).toMatchObject({beforeVnd:"80000",afterVnd:"70000",reasonSource:"SYSTEM"});});
 it("does not authorize a crafted purchase override",async()=>{const value=input();expect((await previewWarehousePurchaseAction({...value,lines:[{...value.lines[0],manualCostVnd:"70000",manualCostReason:""}]})).success).toBe(false)});
 it("uses existing final-price policy for linked Sales without a routine note",async()=>{fixture.permissions.add("pricing.manage");const value=input();const result=await previewWarehousePurchaseAction({...value,lines:[{...value.lines[0],manualSalesPriceVnd:"110000",manualSalesReason:""}]});expect(result.success).toBe(true);expect(result.sales?.totalVnd).toBe("220000");expect(JSON.parse(result.sales!.lines[0].overrideReason!)).toMatchObject({beforeVnd:"120000",afterVnd:"110000"});});
 it("keeps increased cost an explicit exception",async()=>{fixture.permissions.add("purchasing.price.manage");const value=input();expect((await previewWarehousePurchaseAction({...value,lines:[{...value.lines[0],manualCostVnd:"90000",manualCostReason:""}]})).success).toBe(false)});
});
