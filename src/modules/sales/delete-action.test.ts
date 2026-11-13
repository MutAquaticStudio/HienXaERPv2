import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission, requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: m.order }) }) }) }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error("REDIRECT:" + path); } }));

import { deleteSalesOrderAction } from "./actions";
import { commandError } from "./command-messages";

const id = "11111111-1111-4111-8111-111111111111";
const op = "22222222-2222-4222-8222-222222222222";
function form(fields: Partial<Record<"reason" | "confirmNumber" | "entityId" | "operationId", string>> = {}) {
  const data = new FormData();
  data.set("entityId", fields.entityId ?? id);
  data.set("operationId", fields.operationId ?? op);
  data.set("reason", fields.reason ?? "Nhập nhầm khách");
  data.set("confirmNumber", fields.confirmNumber ?? "SO-2026-000123");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.permission.mockResolvedValue({ branchId: "branch" });
  m.order.mockResolvedValue({ data: { order_number: "SO-2026-000123" } });
  m.rpc.mockResolvedValue({ data: id, error: null });
});

it("deletes through the audited command with a stable operation id, after the order number is typed", async () => {
  await expect(deleteSalesOrderAction(form())).rejects.toThrow("REDIRECT:/admin/orders?notice=order-deleted");
  expect(m.permission).toHaveBeenCalledWith("orders.cancel");
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("delete_sales_order", { target_order_id: id, delete_reason: "Nhập nhầm khách", operation_id: op });
  expect(m.revalidate).toHaveBeenCalledWith("/admin/orders");
});

it("accepts the order number in any letter case and with spaces around it", async () => {
  await expect(deleteSalesOrderAction(form({ confirmNumber: "  so-2026-000123 " }))).rejects.toThrow("notice=order-deleted");
  expect(m.rpc).toHaveBeenCalledTimes(1);
});

it("refuses when the typed order number does not match, without calling the database", async () => {
  await expect(deleteSalesOrderAction(form({ confirmNumber: "SO-2026-000124" }))).rejects.toThrow("REDIRECT:/admin/orders/" + id + "?error=");
  expect(m.rpc).not.toHaveBeenCalled();
});

it.each(["", "ab", "x".repeat(301)])("needs a reason of 3 to 300 characters: %j", async (reason) => {
  await expect(deleteSalesOrderAction(form({ reason }))).rejects.toThrow("REDIRECT:/admin/orders/" + id + "?error=");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("rejects malformed ids before any access", async () => {
  await expect(deleteSalesOrderAction(form({ entityId: "not-a-guid" }))).rejects.toThrow("invalid-command");
  expect(m.permission).not.toHaveBeenCalled();
});

it("enforces the permission at the action boundary", async () => {
  m.permission.mockRejectedValue(Error("FORBIDDEN"));
  await expect(deleteSalesOrderAction(form())).rejects.toThrow("FORBIDDEN");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("does not claim success when the order is not in the branch", async () => {
  m.order.mockResolvedValue({ data: null });
  await expect(deleteSalesOrderAction(form())).rejects.toThrow("invalid-command");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("shows the database refusal in Vietnamese and deletes nothing", async () => {
  m.rpc.mockResolvedValue({ error: { message: "sales_order_has_delivery" } });
  await expect(deleteSalesOrderAction(form())).rejects.toThrow(encodeURIComponent("Hệ thống giữ lịch sử phiếu giao"));
  expect(m.revalidate).not.toHaveBeenCalled();
});

it.each([
  ["sales_order_has_delivery", "phiếu giao"],
  ["sales_order_has_credit_override", "vượt hạn mức"],
  ["sales_order_has_purchase", "đơn mua"],
  ["sales_order_has_prepayment", "trả trước"],
  ["sales_order_has_ledger_records", "sổ sách"],
  ["sales_order_not_deletable", "đã đóng"],
  ["delete_reason_required", "lý do"],
])("maps %s to a plain message", (code, fragment) => {
  const message = commandError(code);
  expect(message).toContain(fragment);
  expect(message).not.toContain(code);
});
