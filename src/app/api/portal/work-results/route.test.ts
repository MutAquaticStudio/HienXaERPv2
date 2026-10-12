// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
const portal = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: portal.client, portalRpc: portal.rpc }));
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { portal.client.mockReset().mockResolvedValue({ supabase: {} }); portal.rpc.mockReset().mockResolvedValue(id); });
it("passes the exact service quantity through the public HTTP boundary", async () => {
  const response = await POST(new Request("http://localhost/api/portal/work-results", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ workItemId: id, operationId: id,
      expectedVersion: 1, actualQuantity: "99999999999999.123456" }) }));
  expect(response.status).toBe(200);
  expect(portal.rpc).toHaveBeenCalledWith({}, "submit_portal_work_result", expect.objectContaining({ actual_quantity: "99999999999999.123456" }));
});
it("rejects unsupported precision without calling the writer", async () => {
  const response = await POST(new Request("http://localhost/api/portal/work-results", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ workItemId: id, operationId: id,
      expectedVersion: 1, actualQuantity: "1.0000001" }) }));
  expect(response.status).toBe(409);
  expect(portal.rpc).not.toHaveBeenCalled();
});
it.each(["99999999999999.0000001", "99999999999999.123456"])("rejects numeric JSON %s that loses quantity digits during parsing", async (literal) => {
  const response = await POST(new Request("http://localhost/api/portal/work-results", { method: "POST",
    headers: { "content-type": "application/json" },
    body: `{"workItemId":"${id}","operationId":"${id}","expectedVersion":1,"actualQuantity":${literal}}` }));
  expect(response.status).toBe(409);
  expect(portal.rpc).not.toHaveBeenCalled();
});
