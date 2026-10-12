import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { activateOperations } from "./actions";

const branchId = "a3cc4dcf-aa24-44c7-9186-c631a5571d7a";
const operationId = "2b217e87-7375-4c61-b1b9-5f0de6a2b4b8";
function confirmation() {
  const form = new FormData();
  form.set("version", "2");
  form.set("operationId", operationId);
  form.set("recoveryAccepted", "on");
  form.set("confirmation", `ACTIVATE:${branchId}:2`);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ branchId });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("explicit operational activation action", () => {
  it("retains one canonical command with exact branch, version, recovery and confirmation", async () => {
    await expect(activateOperations(confirmation())).rejects.toThrow("/admin/operations?notice=activated");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("activate_branch_operations", {
      target_branch_id: branchId, expected_version: 2, recovery_accepted: true,
      confirmation: `ACTIVATE:${branchId}:2`, operation_id: operationId,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin", "layout");
  });

  it("never invokes the command when authentication or branch access is denied", async () => {
    mocks.access.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(activateOperations(confirmation())).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["forbidden", "operational_activation_confirmation_required", "operational_activation_preconditions_failed"])("keeps backend rejection blocked: %s", async (message) => {
    mocks.rpc.mockResolvedValue({ error: { message } });
    await expect(activateOperations(confirmation())).rejects.toThrow("/admin/operations?error=activation-denied");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("leaves recovery and confirmation validation to the same protected RPC", async () => {
    const form = confirmation();
    form.delete("recoveryAccepted");
    form.set("confirmation", "incorrect");
    mocks.rpc.mockResolvedValue({ error: { message: "operational_activation_confirmation_required" } });
    await expect(activateOperations(form)).rejects.toThrow("activation-denied");
    expect(mocks.rpc).toHaveBeenCalledWith("activate_branch_operations", expect.objectContaining({ recovery_accepted: false, confirmation: "incorrect" }));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
