import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: m.client }));
import { cancelPortalOrderAction, submitPortalOrderAction } from "./order-actions";

const ids = { customer: "11111111-1111-4111-8111-111111111111", site: "22222222-2222-4222-8222-222222222222", op: "33333333-3333-4333-8333-333333333333",
  material: "44444444-4444-4444-8444-444444444444", uom: "55555555-5555-4555-8555-555555555555", order: "66666666-6666-4666-8666-666666666666" };
const input = { customerId: ids.customer, siteId: ids.site, newSite: null, requestedAt: "2026-10-20T08:00", note: "", operationId: ids.op,
  lines: [{ materialId: ids.material, uomId: ids.uom, quantity: "2.5" }] };
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: { rpc: m.rpc } }); });

it("submits the lines with the business-time delivery wish and returns the new order", async () => {
  m.rpc.mockResolvedValue({ data: ids.order, error: null });
  expect(await submitPortalOrderAction(input)).toEqual({ status: "SUCCESS", message: expect.any(String), resultId: ids.order });
  expect(m.rpc).toHaveBeenCalledWith("submit_portal_order", expect.objectContaining({ target_site_id: ids.site, new_site: null, note: null,
    requested_delivery_at: "2026-10-20T01:00:00.000Z", operation_id: ids.op, order_lines: [{ material_id: ids.material, ordered_uom_id: ids.uom, quantity: "2.5" }] }));
});

it("rejects bad input before calling the database", async () => {
  expect((await submitPortalOrderAction({ ...input, lines: [] })).status).toBe("FAILED");
  expect((await submitPortalOrderAction({ ...input, lines: [{ ...input.lines[0], quantity: "1,5" }] })).status).toBe("FAILED");
  expect((await submitPortalOrderAction({ ...input, siteId: null })).status).toBe("FAILED");
  expect((await submitPortalOrderAction({ ...input, requestedAt: "ngày mai" })).status).toBe("FAILED");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains database rejections and keeps transport failures unknown", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "portal_price_unavailable" } });
  expect(await submitPortalOrderAction(input)).toEqual({ status: "FAILED", message: expect.stringContaining("chưa có giá") });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  expect((await submitPortalOrderAction(input)).message).toContain("không được đặt hàng");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  expect((await submitPortalOrderAction(input)).status).toBe("UNKNOWN");
});

it("cancels a waiting order with a reason and returns to it", async () => {
  m.rpc.mockResolvedValue({ data: ids.order, error: null });
  const form = new FormData(); form.set("orderId", ids.order); form.set("reason", "Đặt nhầm"); form.set("operationId", ids.op);
  await expect(cancelPortalOrderAction(form)).rejects.toThrow(`REDIRECT:/customer/orders/${ids.order}?notice=cancelled`);
  expect(m.rpc).toHaveBeenCalledWith("cancel_portal_order", { target_order_id: ids.order, reason: "Đặt nhầm", operation_id: ids.op });
  form.set("reason", "x");
  await expect(cancelPortalOrderAction(form)).rejects.toThrow("notice=cancel-reason");
});
