import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc, auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) } })) }));
vi.mock("@/modules/portal/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/portal/server")>()), authenticatedPortalClient: m.client }));
import { cancelServiceRequestAction, getCustomerServiceRequest, getPortalServiceCatalog, submitServiceRequestAction } from "./service-actions";

const ids = { customer: "11111111-1111-4111-8111-111111111111", site: "22222222-2222-4222-8222-222222222222", op: "33333333-3333-4333-8333-333333333333",
  type: "44444444-4444-4444-8444-444444444444", request: "66666666-6666-4666-8666-666666666666" };
const input = { customerId: ids.customer, siteId: ids.site, newSite: null, serviceTypeId: ids.type, quantity: "2", date: "2026-11-15", slot: "MORNING" as const, time: null,
  contactName: "Anh Tuấn", contactPhone: "0901 234 567", note: "", operationId: ids.op };
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "user" } }); });

it("sends the request with the customer's wish and returns the new request without charging anything (D75)", async () => {
  m.rpc.mockResolvedValue({ data: ids.request, error: null });
  expect(await submitServiceRequestAction(input)).toEqual({ status: "SUCCESS", message: expect.stringContaining("Cửa hàng sẽ xác nhận lịch"), resultId: ids.request });
  expect(m.rpc).toHaveBeenCalledWith("submit_service_request", {
    target_customer_id: ids.customer, target_site_id: ids.site, new_site: null, target_service_type_id: ids.type, requested_quantity: "2", requested_date: "2026-11-15",
    requested_slot: "MORNING", requested_time: null, contact_name: "Anh Tuấn", contact_phone: "0901 234 567", request_note: null, operation_id: ids.op,
  });
});

it("sends a new site and a specific time as given", async () => {
  m.rpc.mockResolvedValue({ data: ids.request, error: null });
  await submitServiceRequestAction({ ...input, siteId: null, newSite: { name: "Nhà mới", address: "9 Nguyễn Trãi" }, slot: "TIME", time: "13:30", note: " Hẻm nhỏ " });
  expect(m.rpc).toHaveBeenCalledWith("submit_service_request", expect.objectContaining({ target_site_id: null, new_site: { name: "Nhà mới", address: "9 Nguyễn Trãi" },
    requested_slot: "TIME", requested_time: "13:30", request_note: "Hẻm nhỏ" }));
});

it("rejects bad input before calling the database", async () => {
  const bad = [{ quantity: "0" }, { quantity: "1,5" }, { quantity: "1.1234567" }, { date: "15/11" }, { slot: "TIME" as const }, { slot: "EVENING" as never },
    { time: "08:00" }, { contactName: "A" }, { contactPhone: "12ab" }, { siteId: null }, { newSite: { name: "A", address: "9 Nguyễn Trãi" } }, { serviceTypeId: "abc" },
    { note: "x".repeat(1001) }];
  for (const change of bad) expect((await submitServiceRequestAction({ ...input, ...change })).status, JSON.stringify(change)).toBe("FAILED");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("keeps the operation after a send whose answer was lost and whose details were then changed, so no second request is made (D75)", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "operation_payload_conflict" } });
  const outcome = await submitServiceRequestAction(input);
  expect(outcome.status).toBe("UNKNOWN");
  expect(outcome.message).toContain("Đơn hàng → Dịch vụ");
  expect(outcome.message).not.toMatch(/operation_payload|23505/);
});

it("explains database rejections in Vietnamese, without codes, and keeps transport failures unknown so the same operation can be sent again", async () => {
  const cases: Array<[{ code?: string; message: string }, string]> = [
    [{ code: "22023", message: "portal_service_request_invalid" }, "ngày mong muốn"],
    [{ code: "23503", message: "service_type_unavailable" }, "không còn nhận đặt"],
    [{ code: "23503", message: "customer_or_site_invalid" }, "Công trình không còn dùng được"],
    [{ code: "22023", message: "quantity_invalid_or_out_of_range" }, "Số lượng phải lớn hơn 0"],
    [{ code: "42501", message: "forbidden" }, "Chỉ chủ tài khoản đặt được"],
    [{ code: "22000", message: "something_else" }, "Kiểm tra lại thông tin"],
  ];
  for (const [error, text] of cases) {
    m.rpc.mockResolvedValueOnce({ data: null, error });
    const outcome = await submitServiceRequestAction(input);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.message).toContain(text);
    expect(outcome.message).not.toMatch(/portal_service|service_type_unavailable|operation_payload|22023|23503/);
  }
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  const unknown = await submitServiceRequestAction(input);
  expect(unknown.status).toBe("UNKNOWN");
  expect(unknown.message).toContain("hệ thống không tạo yêu cầu trùng");
  m.rpc.mockResolvedValueOnce({ data: { not: "an id" }, error: null });
  expect((await submitServiceRequestAction(input)).status).toBe("UNKNOWN");
});

it("asks to sign in again when the session is gone", async () => {
  m.client.mockResolvedValue(null);
  expect(await submitServiceRequestAction(input)).toMatchObject({ status: "FAILED", message: expect.stringContaining("Đăng nhập lại") });
  expect(m.rpc).not.toHaveBeenCalled();
});

it("cancels a waiting request with an optional note", async () => {
  m.rpc.mockResolvedValue({ data: ids.request, error: null });
  expect(await cancelServiceRequestAction({ requestId: ids.request, reason: "Đặt nhầm", operationId: ids.op })).toEqual({ status: "SUCCESS", message: "Đã hủy yêu cầu.", resultId: ids.request });
  expect(m.rpc).toHaveBeenCalledWith("cancel_service_request", { target_request_id: ids.request, reason: "Đặt nhầm", operation_id: ids.op });
  await cancelServiceRequestAction({ requestId: ids.request, reason: "", operationId: ids.op });
  expect(m.rpc).toHaveBeenLastCalledWith("cancel_service_request", { target_request_id: ids.request, reason: "Khách hủy yêu cầu", operation_id: ids.op });
  expect((await cancelServiceRequestAction({ requestId: ids.request, reason: "x".repeat(301), operationId: ids.op })).status).toBe("FAILED");
});

it("says plainly why a scheduled request cannot be cancelled on the portal, and who may cancel", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "service_request_not_cancellable" } });
  const refused = await cancelServiceRequestAction({ requestId: ids.request, operationId: ids.op });
  expect(refused.status).toBe("FAILED");
  expect(refused.message).toContain("đã xếp lịch");
  expect(refused.message).toContain("Nhắn tin hoặc gọi cửa hàng");
  expect(refused.message).not.toContain("service_request_not_cancellable");
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  expect((await cancelServiceRequestAction({ requestId: ids.request, operationId: ids.op })).message).toContain("Chỉ chủ tài khoản");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  expect((await cancelServiceRequestAction({ requestId: ids.request, operationId: ids.op })).status).toBe("UNKNOWN");
});

it("reads the catalog through the portal RPC and sends a customer who may not order back home with an explanation", async () => {
  m.rpc.mockResolvedValueOnce({ data: { groups: [] }, error: null });
  expect(await getPortalServiceCatalog("c")).toEqual({ groups: [] });
  expect(m.rpc).toHaveBeenCalledWith("customer_portal_service_catalog", { target_customer_id: "c" });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  await expect(getPortalServiceCatalog()).rejects.toThrow("REDIRECT:/customer?notice=order-not-allowed");
});

it("sends a request that is not the customer's back to the list instead of an error page", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  await expect(getCustomerServiceRequest(ids.request)).rejects.toThrow("REDIRECT:/customer/orders?kind=services&notice=request-unavailable");
});
