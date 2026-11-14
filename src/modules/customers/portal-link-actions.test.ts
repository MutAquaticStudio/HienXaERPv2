// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { decidePortalLinkRequestAction } from "./portal-account-actions";

const customerId = "7f780000-0000-4000-8000-000000000001";
const requestId = "7f780000-0000-4000-8000-000000000011";
const operationId = "7f780000-0000-4000-8000-000000000021";
const form = (values: Record<string, string>) => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };

beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: customerId, error: null }); });

it("links a waiting registration to the customer with the chosen role (D78)", async () => {
  const outcome = await decidePortalLinkRequestAction(undefined, form({ customerId, requestId, decision: "LINK", role: "FINANCE_CONTACT", note: "Đã gọi xác nhận", operationId }));
  expect(m.permission).toHaveBeenCalledWith("customers.manage");
  expect(m.rpc).toHaveBeenCalledWith("decide_portal_link_request", { target_request_id: requestId, decision: "LINK", membership_role: "FINANCE_CONTACT", note: "Đã gọi xác nhận", operation_id: operationId });
  expect(outcome).toEqual({ success: true, message: "Đã gắn tài khoản vào khách này. Khách đăng nhập lại là dùng được." });
  expect(m.revalidate).toHaveBeenCalledWith(`/admin/customers/${customerId}`);
});

it("makes a new customer or refuses, with an empty note sent as none", async () => {
  expect((await decidePortalLinkRequestAction(undefined, form({ customerId, requestId, decision: "NEW_CUSTOMER", note: "", operationId })))?.message).toBe("Đã tạo khách mới cho tài khoản này.");
  expect(m.rpc).toHaveBeenLastCalledWith("decide_portal_link_request", expect.objectContaining({ decision: "NEW_CUSTOMER", membership_role: "OWNER", note: null }));
  expect((await decidePortalLinkRequestAction(undefined, form({ customerId, requestId, decision: "REJECT", operationId })))?.message).toBe("Đã từ chối đăng ký này.");
});

it("explains a refusal in Vietnamese and refuses a bad form before the database", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "portal_link_request_decided" } });
  expect((await decidePortalLinkRequestAction(undefined, form({ customerId, requestId, decision: "LINK", operationId })))?.message).toBe("Yêu cầu này đã được xử lý. Tải lại trang để xem.");
  m.rpc.mockClear();
  expect((await decidePortalLinkRequestAction(undefined, form({ customerId, requestId, decision: "MERGE", operationId })))?.success).toBeUndefined();
  expect((await decidePortalLinkRequestAction(undefined, form({ customerId, requestId, decision: "LINK", note: "ok", operationId })))?.message).toBe("Ghi chú cần ít nhất 3 ký tự, hoặc để trống.");
  expect(m.rpc).not.toHaveBeenCalled();
});
