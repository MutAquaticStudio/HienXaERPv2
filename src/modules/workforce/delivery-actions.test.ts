// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), rpc: vi.fn(), from: vi.fn(), source: vi.fn(),
}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));

import { publishDeliveryWorkItemAction, verifyDeliveryWorkItemAction } from "./delivery-actions";

const deliveryId = "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55";
const operationId = "61c446b6-cb9f-49b2-994c-70c73e3e5802";
const workItemId = "b81b801c-2610-48b9-985e-64b10d859d74";
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ deliveryId, operationId, ...extra }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("Delivery work-item commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ branchId: "qa-branch", permissions: new Set(["delivery.read"]) });
    mocks.rpc.mockResolvedValue({ data: workItemId, error: null });
    mocks.source.mockResolvedValue({ data: { id: workItemId }, error: null });
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.source };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);
  });

  it("publishes only the requested delivery through the existing DIRECT RPC", async () => {
    await expect(publishDeliveryWorkItemAction(form())).rejects.toThrow("notice=work-published");
    expect(mocks.permission).toHaveBeenCalledWith("work.manage");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("publish_work_item", {
      target_branch_id: "qa-branch", source_kind: "DELIVERY", source_id: deliveryId,
      requested_assignment_mode: "DIRECT", target_employee_id: null, operation_id: operationId,
    });
  });

  it("does not call an RPC when the authenticated permission gate rejects", async () => {
    mocks.permission.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(publishDeliveryWorkItemAction(form())).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("also requires delivery read context", async () => {
    mocks.permission.mockResolvedValue({ branchId: "qa-branch", permissions: new Set() });
    await expect(publishDeliveryWorkItemAction(form())).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed input before business writes", async () => {
    await expect(publishDeliveryWorkItemAction(form({ deliveryId: "invalid" }))).rejects.toThrow("invalid-work-publication");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a work item that is not attached to the supplied delivery/branch", async () => {
    mocks.source.mockResolvedValue({ data: null, error: null });
    await expect(verifyDeliveryWorkItemAction(form({ workItemId, version: "3" }))).rejects.toThrow("?error=");
    expect(mocks.from().eq).toHaveBeenCalledWith("delivery_id", deliveryId);
    expect(mocks.from().eq).toHaveBeenCalledWith("branch_id", "qa-branch");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("verifies with the existing work version and idempotency key", async () => {
    await expect(verifyDeliveryWorkItemAction(form({ workItemId, version: "3" }))).rejects.toThrow("notice=verified");
    expect(mocks.permission).toHaveBeenCalledWith("work.verify");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("verify_delivery_work_item", {
      target_work_item_id: workItemId, expected_version: 3, operation_id: operationId,
    });
  });

  it("does not claim publication success after a resource conflict", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "resource_conflict" } });
    await expect(publishDeliveryWorkItemAction(form())).rejects.toThrow(`/admin/deliveries/${deliveryId}?error=`);
  });

  it.each(["publish", "verify"])("preserves the pending-opening posting rejection when attempting to %s", async (command) => {
    mocks.rpc.mockResolvedValue({ error: { code: "PT423", message: "branch_not_operational" } });
    let redirect = "";
    try {
      if (command === "publish") await publishDeliveryWorkItemAction(form());
      else await verifyDeliveryWorkItemAction(form({ workItemId, version: "3" }));
    } catch (error) { redirect = decodeURIComponent((error as Error).message); }
    expect(redirect).toContain("?error=Chưa thể ghi sổ: chưa xác minh được điều kiện vận hành");
    expect(redirect).toContain("phiên bản hệ thống và phạm vi truy cập");
    expect(redirect).not.toMatch(/notice=|branch_not_operational|PT423/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
