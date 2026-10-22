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
 it("accepts an increased cost without a note and records a plain description (FB7)",async()=>{fixture.permissions.add("purchasing.price.manage");const value=input();const result=await previewWarehousePurchaseAction({...value,lines:[{...value.lines[0],manualCostVnd:"90000",manualCostReason:""}]});expect(result.success).toBe(true);expect(result.lines![0].overrideReason).toBe("Giá mua nhập tay")});
});

describe("'Tạo đơn mua' saves then confirms a warehouse PO", () => {
  const confirmId = "10000000-0000-4000-8000-000000000009", order = "10000000-0000-4000-8000-00000000000a", warehouse = "10000000-0000-4000-8000-00000000000b";
  async function warehouseForm(intent: string, confirm = confirmId) {
    const value: Record<string, unknown> & { lines: ReturnType<typeof input>["lines"] } = { ...input(), mode: "WAREHOUSE", warehouseId: warehouse };
    delete value.customerId;
    delete value.siteId;
    const preview = await previewWarehousePurchaseAction(value);
    const form = new FormData();
    for (const [key, data] of Object.entries(value)) if (key !== "lines") form.set(key, String(data));
    for (const [key, data] of Object.entries(value.lines[0])) form.set(key, data);
    form.set("costPreview", JSON.stringify(preview.lines));
    form.set("intent", intent);
    form.set("confirmOperationId", confirm);
    return form;
  }
  const redirectTo = async () => String(vi.mocked((await import("next/navigation")).redirect).mock.calls[0]?.[0]);
  beforeEach(async () => {
    vi.mocked((await import("next/navigation")).redirect).mockClear();
    fixture.rpc.mockResolvedValue({ data: order, error: null });
  });

  it("confirms with its own operation ID after the draft is created", async () => {
    fixture.permissions.add("purchasing.confirm");
    expect(await createPurchaseOrderAction(undefined, await warehouseForm("confirm"))).toBeUndefined();
    expect(fixture.rpc.mock.calls.map((call) => call[0])).toEqual(["create_purchase_order_draft", "confirm_purchase_order"]);
    expect(fixture.rpc.mock.calls[0][1]).toMatchObject({ operation_id: ids.operation });
    expect(fixture.rpc.mock.calls[1][1]).toEqual({ target_purchase_order_id: order, operation_id: confirmId });
    expect(await redirectTo()).toBe(`/admin/purchase-orders/${order}?notice=confirmed`);
  });

  it("keeps the draft and explains when confirmation is rejected", async () => {
    fixture.permissions.add("purchasing.confirm");
    fixture.rpc.mockImplementation(async (name: string) => name === "confirm_purchase_order" ? { data: null, error: { message: "purchase_order_not_confirmable" } } : { data: order, error: null });
    await createPurchaseOrderAction(undefined, await warehouseForm("confirm"));
    const target = new URL(await redirectTo(), "http://localhost");
    expect(target.pathname).toBe(`/admin/purchase-orders/${order}`);
    expect(target.searchParams.get("error")).toMatch(/^Đã lưu đơn mua nháp nhưng chưa xác nhận được: /);
  });

  it("creates nothing without purchasing.confirm, or with a reused operation ID", async () => {
    expect((await createPurchaseOrderAction(undefined, await warehouseForm("confirm")))?.message).toBe("Bạn không có quyền xác nhận đơn mua. Hãy chọn Lưu nháp.");
    fixture.permissions.add("purchasing.confirm");
    expect((await createPurchaseOrderAction(undefined, await warehouseForm("confirm", ids.operation)))?.message).toContain("Thông tin xác nhận đơn mua chưa hợp lệ");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("'Lưu nháp' only creates the draft", async () => {
    fixture.permissions.add("purchasing.confirm");
    await createPurchaseOrderAction(undefined, await warehouseForm("draft"));
    expect(fixture.rpc.mock.calls.map((call) => call[0])).toEqual(["create_purchase_order_draft"]);
    expect(await redirectTo()).toBe(`/admin/purchase-orders/${order}?notice=created`);
  });
});
