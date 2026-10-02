// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: fixture.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: fixture.redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  },
}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: fixture.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: fixture.rpc })) }));
import { openReturnCaseAction } from "./actions";

const ids = {
  delivery: "10000000-0000-4000-8000-000000000001",
  line: "10000000-0000-4000-8000-000000000002",
  operation: "10000000-0000-4000-8000-000000000003",
};
const initial = { success: false, error: null };
function input() {
  const data = new FormData();
  Object.entries({ deliveryId: ids.delivery, verificationLineId: ids.line, caseKind: "CUSTOMER_RETURN", quantity: "3", reason: "QA customer return", operationId: ids.operation })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.permission.mockReset().mockResolvedValue({});
  fixture.rpc.mockReset().mockResolvedValue({ error: null });
});

describe("ReturnCase action feedback and retry safety", () => {
  it("returns quantity rejection as state without redirecting or revalidating", async () => {
    fixture.rpc.mockResolvedValueOnce({ error: { message: "return_quantity_exceeds_available" } });
    expect(await openReturnCaseAction(initial, input())).toEqual({ success: false, error: "Số lượng vượt phần còn lại của nguồn." });
    expect(fixture.permission).toHaveBeenCalledWith("delivery.exception");
    expect(fixture.redirect).not.toHaveBeenCalled();
    expect(fixture.revalidate).not.toHaveBeenCalled();
  });
  it("does not call the database for invalid fields", async () => {
    const data = input(); data.set("quantity", "0");
    expect((await openReturnCaseAction(initial, data)).success).toBe(false);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.redirect).not.toHaveBeenCalled();
  });
  it("does not call the database when permission is denied", async () => {
    fixture.permission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await openReturnCaseAction(initial, input())).success).toBe(false);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("preserves authentication redirects rather than swallowing them", async () => {
    fixture.permission.mockRejectedValueOnce(new Error("REDIRECT:/login"));
    await expect(openReturnCaseAction(initial, input())).rejects.toThrow("REDIRECT:/login");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("returns safe feedback for a thrown transport error", async () => {
    fixture.rpc.mockRejectedValueOnce(new Error("private transport details"));
    const state = await openReturnCaseAction(initial, input());
    expect(state.success).toBe(false);
    expect(state.error).not.toContain("private transport details");
    expect(fixture.revalidate).not.toHaveBeenCalled();
  });
  it("retains the same operation intent when correcting a rejected quantity", async () => {
    fixture.rpc.mockResolvedValueOnce({ error: { message: "return_quantity_exceeds_available" } });
    const data = input();
    const errorState = await openReturnCaseAction(initial, data);
    data.set("quantity", "1");
    expect(await openReturnCaseAction(errorState, data)).toEqual({ success: true, error: null });
    expect(fixture.rpc.mock.calls.map((call) => call[1].operation_id)).toEqual([ids.operation, ids.operation]);
    expect(fixture.rpc.mock.calls[1][1].requested_base_quantity).toBe("1");
  });
  it("revalidates the detail only after success without adding stock or cash operations", async () => {
    expect(await openReturnCaseAction(initial, input())).toEqual({ success: true, error: null });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith("open_return_case", expect.objectContaining({ target_delivery_verification_line_id: ids.line, operation_id: ids.operation }));
    expect(fixture.revalidate).toHaveBeenCalledWith(`/admin/deliveries/${ids.delivery}`);
    expect(fixture.redirect).not.toHaveBeenCalled();
  });
});
