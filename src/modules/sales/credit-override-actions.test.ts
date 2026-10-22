import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: { branchId: "branch-a", permissions: new Set(["orders.confirm", "finance.ar.adjust"]) },
  requirePermission: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), select: vi.fn(), from: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.requirePermission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ from: mocks.from, rpc: mocks.rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { confirmSalesOrderCreditOverride } from "./credit-override-actions";

const orderId = "c65ac1e8-871f-40b1-8e20-9a16f283e846";
function input(reason = "HXQA approval") {
  const form = new FormData();
  for (const [key, value] of Object.entries({ orderId, reason,
    operationId: "baadf00d-1234-4234-8234-123456789abc", snapshotHash: "a".repeat(64) })) form.set(key, value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.context.permissions = new Set(["orders.confirm", "finance.ar.adjust"]);
  mocks.requirePermission.mockResolvedValue(mocks.context);
  mocks.from.mockReturnValue({ select: mocks.select }); mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { id: orderId }, error: null });
  mocks.rpc.mockResolvedValue({ data: orderId, error: null });
});
describe("one-confirmation credit override server action", () => {
  it("requires confirmation and financial authority, not a UI-only guard", async () => {
    mocks.context.permissions.delete("finance.ar.adjust");
    await expect(confirmSalesOrderCreditOverride(input())).rejects.toThrow("error=");
    expect(mocks.requirePermission).toHaveBeenCalledWith("orders.confirm"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("confirms without a note and records a plain description (FB7)", async () => {
    await expect(confirmSalesOrderCreditOverride(input(" "))).rejects.toThrow("notice=confirmed-override");
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_sales_order_with_credit_override", expect.objectContaining({ override_reason: "Vượt hạn mức tín dụng" }));
  });
  it("rejects an over-long note before any write", async () => {
    await expect(confirmSalesOrderCreditOverride(input("x".repeat(501)))).rejects.toThrow("error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not confirm another active branch's order", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(confirmSalesOrderCreditOverride(input())).rejects.toThrow("error=");
    expect(mocks.eq).toHaveBeenCalledWith("branch_id", "branch-a"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes the exact snapshot, intent and reason to the protected RPC", async () => {
    // The order page shows `notice`, so the success message must travel under that name.
    await expect(confirmSalesOrderCreditOverride(input())).rejects.toThrow(new RegExp(`/admin/orders/${orderId}\\?notice=confirmed-override(-sourced|-unsourced)?$`));
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_sales_order_with_credit_override", {
      target_order_id: orderId, override_reason: "HXQA approval", expected_snapshot_hash: "a".repeat(64),
      operation_id: "baadf00d-1234-4234-8234-123456789abc",
    }); expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/orders/${orderId}`);
  });
  it("stale snapshot or failed RPC never reports success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "credit_snapshot_changed", code: "40001" } });
    await expect(confirmSalesOrderCreditOverride(input())).rejects.toThrow("error=");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("preserves the posting guard and explains the activation block in Vietnamese", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "branch_not_operational", code: "PT423" } });
    let destination = "";
    try { await confirmSalesOrderCreditOverride(input()); }
    catch (error) { destination = error instanceof Error ? error.message : ""; }
    expect(decodeURIComponent(destination)).toContain("Chưa thể ghi sổ");
    expect(decodeURIComponent(destination)).toContain("phiên bản hệ thống");
    expect(destination).not.toContain("branch_not_operational");
    expect(destination).not.toContain("notice=");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_sales_order_with_credit_override", expect.objectContaining({
      target_order_id: orderId, expected_snapshot_hash: "a".repeat(64),
    }));
  });
});
