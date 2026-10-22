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

const valid = { workItemId: "11111111-1111-4111-8111-111111111111", operationId: "22222222-2222-4222-8222-222222222222", lines: null,
  evidenceIds: ["33333333-3333-4333-8333-333333333333"], expectedVersion: 2, expectedDeliveryVersion: 4, expectedAssignmentVersion: 1 };
const post = (body: unknown) => POST(new Request("http://localhost/api/portal/delivery-loaded", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: {}, user: { id: "u1" } }); m.rpc.mockResolvedValue("h1"); });

it("confirms the loading through the database command with the photos", async () => {
  const response = await post({ ...valid, lines: [{ deliveryLineId: "44444444-4444-4444-8444-444444444444", loadedBaseQuantity: "2000" }] });
  expect(response.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith({}, "portal_delivery_loaded", {
    target_work_item_id: valid.workItemId, loaded_lines: [{ delivery_line_id: "44444444-4444-4444-8444-444444444444", loaded_base_quantity: "2000" }],
    evidence_ids: valid.evidenceIds, expected_work_version: 2, expected_delivery_version: 4, expected_assignment_version: 1, operation_id: valid.operationId,
  });
});

it("needs a photo and a signed-in worker before the database", async () => {
  expect((await post({ ...valid, evidenceIds: [] })).status).toBe(400);
  m.client.mockResolvedValueOnce(null);
  expect((await post(valid)).status).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains a refusal in Vietnamese", async () => {
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ message: "insufficient_inventory_for_handoff", code: "23514" }));
  const response = await post(valid);
  expect((await response.json()).error).toBe("Kho không còn đủ hàng cho phiếu này. Báo kho hoặc điều phối.");
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ message: "vehicle_actual_cargo_capacity_exceeded", code: "23514" }));
  expect((await (await post(valid)).json()).error).toContain("vượt sức chứa");
});
