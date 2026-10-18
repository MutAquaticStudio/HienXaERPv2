// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  class PortalRpcError extends Error {
    code?: string; rawMessage: string;
    constructor(error: { message: string; code?: string }) { super(error.message); this.code = error.code; this.rawMessage = error.message; }
  }
  return { client: vi.fn(), rpc: vi.fn(), PortalRpcError };
});
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: m.client, portalRpc: m.rpc, PortalRpcError: m.PortalRpcError }));
import { POST } from "./route";

const valid = { workItemId: "11111111-1111-4111-8111-111111111111", version: 3, operationId: "22222222-2222-4222-8222-222222222222", reason: "Xe hỏng lốp" };
const post = (body: unknown) => POST(new Request("http://localhost/api/portal/work-items/decline", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: {}, user: { id: "u1" } }); m.rpc.mockResolvedValue("w1"); });

it("hands the job back to dispatch with the reason", async () => {
  expect((await post(valid)).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith({}, "decline_portal_work_item", { target_work_item_id: valid.workItemId, reason: "Xe hỏng lốp", expected_version: 3, operation_id: valid.operationId });
});

it("needs a reason and a signed-in worker; a started job is explained in Vietnamese", async () => {
  expect((await post({ ...valid, reason: "x" })).status).toBe(400);
  m.client.mockResolvedValueOnce(null);
  expect((await post(valid)).status).toBe(401);
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "23514", message: "work_already_started" }));
  const response = await post(valid);
  expect((await response.json()).error).toContain("không từ chối được nữa");
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  const unknown = await post(valid);
  expect(unknown.status).toBe(503);
  expect((await unknown.json()).unknown).toBe(true);
});
