import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));
vi.mock("@/modules/purchasing/form-options", () => ({ loadPurchaseSuppliers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, unstable_rethrow: vi.fn() }));
import { closePurchaseOrderRemainingAction } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";
const op = "22222222-2222-4222-8222-222222222222";
const form = (reason: string) => { const data = new FormData(); data.set("entityId", id); data.set("operationId", op); data.set("reason", reason); return data; };
const redirectOf = (promise: Promise<unknown>) => promise.then(() => "no redirect", (error: Error) => decodeURIComponent(error.message));
beforeEach(() => { vi.clearAllMocks(); m.permission.mockResolvedValue({}); m.rpc.mockResolvedValue({ data: id, error: null }); });

it("closes the remainder with the reason, the operation id and the cancel permission (D95)", async () => {
  expect(await redirectOf(closePurchaseOrderRemainingAction(form("  NCC báo hết hàng  ")))).toBe(`REDIRECT:/admin/purchase-orders/${id}?notice=purchase-remaining-closed`);
  expect(m.permission).toHaveBeenCalledWith("purchasing.cancel");
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("close_purchase_order_remaining", { target_purchase_order_id: id, close_reason: "NCC báo hết hàng", operation_id: op });
  expect(m.revalidate).toHaveBeenCalledWith("/admin/purchase-orders");
});

it("asks for a reason before calling the database", async () => {
  const url = await redirectOf(closePurchaseOrderRemainingAction(form("x")));
  expect(url).toContain("Vui lòng nhập lý do đóng phần còn lại");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("rejects a malformed command", async () => {
  const data = form("NCC báo hết hàng");
  data.set("entityId", "không-phải-mã");
  expect(await redirectOf(closePurchaseOrderRemainingAction(data))).toBe("REDIRECT:/admin/purchase-orders?error=invalid-command");
  expect(m.rpc).not.toHaveBeenCalled();
});

it.each([
  ["purchase_order_nothing_received", "chưa nhận được hàng nào"],
  ["purchase_order_has_no_remaining", "đã nhận đủ"],
  ["purchase_order_not_closeable", "không còn ở trạng thái có thể đóng"],
  ["forbidden", "không có quyền"],
])("explains %s in Vietnamese without claiming success", async (code, text) => {
  m.rpc.mockResolvedValue({ data: null, error: { message: code } });
  const url = await redirectOf(closePurchaseOrderRemainingAction(form("NCC báo hết hàng")));
  expect(url).toContain(text);
  expect(url).not.toContain(code);
  expect(m.revalidate).not.toHaveBeenCalled();
});
