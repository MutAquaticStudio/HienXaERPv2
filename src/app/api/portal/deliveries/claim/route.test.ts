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

const valid = { deliveryId: "11111111-1111-4111-8111-111111111111", vehicleId: "33333333-3333-4333-8333-333333333333", version: 2,
  operationId: "22222222-2222-4222-8222-222222222222" };
const post = (body: unknown) => POST(new Request("http://localhost/api/portal/deliveries/claim", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: {}, user: { id: "u1" } }); m.rpc.mockResolvedValue({ work_item_id: "w1" }); });

it("takes the delivery with the chosen truck and returns the job to open", async () => {
  const response = await post(valid);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ workItemId: "w1" });
  expect(m.rpc).toHaveBeenCalledWith({}, "claim_delivery", { target_delivery_id: valid.deliveryId, target_vehicle_id: valid.vehicleId,
    expected_version: 2, operation_id: valid.operationId });
});

it("needs a signed-in worker and a truck", async () => {
  expect((await post({ ...valid, vehicleId: "" })).status).toBe(400);
  m.client.mockResolvedValueOnce(null);
  expect((await post(valid)).status).toBe(401);
});

it("explains a delivery someone else took, a busy truck and an unknown outcome in Vietnamese", async () => {
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "55000", message: "delivery_not_claimable" }));
  let response = await post(valid);
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("đã có người nhận");
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "55000", message: "claim_vehicle_unavailable" }));
  expect((await (await post(valid)).json()).error).toContain("Chọn xe khác");
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ code: "42501", message: "forbidden" }));
  expect((await post(valid)).status).toBe(403);
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  response = await post(valid);
  expect(response.status).toBe(503);
  expect((await response.json()).unknown).toBe(true);
});
