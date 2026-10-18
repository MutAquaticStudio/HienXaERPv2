// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), from: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc, from: m.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, unstable_rethrow: (error: unknown) => { throw error; } }));
import { confirmPurchaseOrderAction, createSupplierDirectDeliveryAction } from "./actions";
import { derivedOperationId } from "@/modules/sales/auto-sourcing";

const po = "11111111-1111-4111-8111-111111111111", op = "22222222-2222-4222-8222-222222222222", delivery = "33333333-3333-4333-8333-333333333333";
const form = () => { const data = new FormData(); data.set("entityId", po); data.set("operationId", op); return data; };
const target = async (action: (data: FormData) => Promise<unknown>) => { await expect(action(form())).rejects.toThrow("NEXT_REDIRECT"); return String(m.redirect.mock.lastCall![0]); };
function purchase(destination: string) {
  m.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { destination_type: destination }, error: null }) }) }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  m.rpc.mockResolvedValue({ data: delivery, error: null });
});

it("confirming a supplier-direct purchase order makes its delivery when the person may plan deliveries", async () => {
  m.permission.mockResolvedValue({ permissions: new Set(["purchasing.confirm", "delivery.create", "delivery.assign"]) });
  purchase("CUSTOMER_SITE");
  expect(await target(confirmPurchaseOrderAction)).toBe(`/admin/purchase-orders/${po}?notice=supplier-delivery-created`);
  expect(m.rpc).toHaveBeenLastCalledWith("create_supplier_direct_delivery", { target_purchase_order_id: po, operation_id: derivedOperationId(op, "supplier-delivery") });
});

it("a warehouse purchase order, or a confirmer without delivery rights, only confirms", async () => {
  m.permission.mockResolvedValue({ permissions: new Set(["purchasing.confirm", "delivery.create", "delivery.assign"]) });
  purchase("WAREHOUSE");
  expect(await target(confirmPurchaseOrderAction)).toBe(`/admin/purchase-orders/${po}?notice=confirmed`);
  expect(m.rpc).toHaveBeenCalledTimes(1);
  m.permission.mockResolvedValue({ permissions: new Set(["purchasing.confirm"]) });
  purchase("CUSTOMER_SITE");
  expect(await target(confirmPurchaseOrderAction)).toBe(`/admin/purchase-orders/${po}?notice=confirmed`);
  expect(m.rpc).toHaveBeenCalledTimes(2);
});

it("the purchase order button opens the new delivery or explains why not", async () => {
  m.permission.mockResolvedValue({ permissions: new Set(["delivery.create"]) });
  expect(await target(createSupplierDirectDeliveryAction)).toBe(`/admin/deliveries/${delivery}?notice=supplier-delivery-created`);
  m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "nothing_to_deliver" } });
  expect(decodeURIComponent(await target(createSupplierDirectDeliveryAction))).toContain("đã có phiếu giao cho toàn bộ lượng");
});
