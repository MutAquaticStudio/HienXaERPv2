import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/core/errors";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), client: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission, requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: (error: unknown) => { throw error; } }));
import { cancelSalesOrderAction, confirmSalesOrderAction } from "./actions";
import { cancelPurchaseOrderAction, confirmPurchaseOrderAction } from "@/modules/purchasing/actions";

const documentId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const cases = [
  { label: "đơn bán", action: confirmSalesOrderAction, cancel: cancelSalesOrderAction, permission: "orders.confirm",
    rpc: "confirm_sales_order", args: { target_order_id: documentId, operation_id: operationId },
    list: "/admin/orders", detail: `/admin/orders/${documentId}`, revalidation: `/admin/orders/${documentId}`,
    wrongState: "sales_order_not_confirmable", missingLines: "order_lines_required" },
  { label: "đơn mua", action: confirmPurchaseOrderAction, cancel: cancelPurchaseOrderAction, permission: "purchasing.confirm",
    rpc: "confirm_purchase_order", args: { target_purchase_order_id: documentId, operation_id: operationId },
    list: "/admin/purchase-orders", detail: `/admin/purchase-orders/${documentId}`, revalidation: "/admin/purchase-orders",
    wrongState: "purchase_order_not_confirmable", missingLines: "purchase_lines_required" },
];
function input(entityId = documentId, operation = operationId) {
  const form = new FormData(); form.set("entityId", entityId); form.set("operationId", operation);
  return form;
}
async function destination(action: (form: FormData) => Promise<unknown>, form = input()) {
  await expect(action(form)).rejects.toThrow("NEXT_REDIRECT");
  return new URL(mocks.redirect.mock.lastCall![0], "http://localhost");
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.permission.mockResolvedValue({}); mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: documentId, error: null });
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

describe.each(cases)("confirmation feedback for $label", (flow) => {
  it("retains canonical authority, payload and success refresh after an accepted RPC", async () => {
    const url = await destination(flow.action);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith(flow.permission);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(flow.rpc, flow.args);
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(flow.revalidation);
    expect(url.pathname).toBe(flow.detail); expect(url.searchParams.get("notice")).toBe("confirmed");
    expect(url.searchParams.has("error")).toBe(false);
  });

  it("explains the confirmation policy block without reporting posting or success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT423", message: "branch_not_operational: ordinary posting requires ACTIVE" } });
    const url = await destination(flow.action); const message = url.searchParams.get("error");
    expect(message).toContain(`Chưa thể xác nhận ${flow.label}`);
    expect(message).toContain("chi nhánh chưa được kích hoạt vận hành");
    expect(message).toContain("Thiết lập hệ thống → Chuẩn bị vận hành");
    expect(message).not.toMatch(/ghi sổ|branch_not_operational|ACTIVE|PT423/);
    expect(url.pathname).toBe(flow.detail); expect(url.searchParams.has("notice")).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(flow.rpc, flow.args);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("provides a reload path when the document state no longer permits confirmation", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "23514", message: flow.wrongState } });
    const url = await destination(flow.action);
    expect(url.searchParams.get("error")).toContain(`${flow.label === "đơn bán" ? "Đơn bán" : "Đơn mua"} không còn ở trạng thái có thể xác nhận`);
    expect(url.searchParams.get("error")).toContain("tải lại");
    expect(url.searchParams.get("error")).not.toContain(flow.wrongState);
    expect(url.searchParams.has("notice")).toBe(false); expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("explains missing document lines rather than displaying a raw backend code", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "22023", message: flow.missingLines } });
    const url = await destination(flow.action);
    expect(url.searchParams.get("error")).toContain(`ít nhất một dòng vật tư cho ${flow.label}`);
    expect(url.searchParams.get("error")).not.toContain(flow.missingLines);
    expect(url.searchParams.has("notice")).toBe(false); expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not call the database after action authorization is denied", async () => {
    const denial = new AppError({ code: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này.", status: 403 });
    mocks.permission.mockRejectedValue(denial);
    await expect(flow.action(input())).rejects.toBe(denial);
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("shows a permission refusal returned by the authoritative RPC", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501", message: "forbidden" } });
    const url = await destination(flow.action);
    expect(url.searchParams.get("error")).toContain("không có quyền");
    expect(url.searchParams.has("notice")).toBe(false); expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("never refreshes or reports success for a server error response", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "XX000", message: "synthetic_server_failure" } });
    const url = await destination(flow.action);
    expect(url.searchParams.get("error")).toBeTruthy(); expect(url.searchParams.get("error")).not.toContain("synthetic_server_failure");
    expect(url.searchParams.has("notice")).toBe(false); expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not manufacture a success redirect after a connection failure", async () => {
    const networkError = new Error("Connection unavailable"); mocks.rpc.mockRejectedValue(networkError);
    await expect(flow.action(input())).rejects.toBe(networkError);
    expect(mocks.redirect).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([["", operationId], [documentId, "invalid-operation"]])("rejects malformed document or operation IDs before authorization/RPC", async (entity, operation) => {
    const url = await destination(flow.action, input(entity, operation));
    expect(url.pathname).toBe(flow.list); expect(url.searchParams.get("error")).toBe("invalid-command");
    expect(mocks.permission).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("preserves the supplied idempotency intent across repeated confirmation requests", async () => {
    await destination(flow.action); await destination(flow.action);
    expect(mocks.rpc.mock.calls).toEqual([[flow.rpc, flow.args], [flow.rpc, flow.args]]);
  });

  it("leaves the existing posting wording for guarded cancellation unchanged", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "PT423", message: "branch_not_operational" } });
    const form = input(); form.set("reason", "Hủy bản nháp kiểm thử");
    const url = await destination(flow.cancel, form);
    expect(url.searchParams.get("error")).toContain("Chưa thể ghi sổ");
    expect(url.searchParams.has("notice")).toBe(false); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
