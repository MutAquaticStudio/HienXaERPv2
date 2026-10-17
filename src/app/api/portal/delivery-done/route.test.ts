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
  receiverName: "Anh Nhận", note: "", evidenceIds: ["33333333-3333-4333-8333-333333333333"], expectedVersion: 2, expectedDeliveryVersion: 4, expectedAssignmentVersion: 1 };
const post = (body: unknown) => POST(new Request("http://localhost/api/portal/delivery-done", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); m.client.mockResolvedValue({ supabase: {}, user: { id: "u1" } }); m.rpc.mockResolvedValue("r1"); });

it("reports the delivery through the database command with the uploaded photos", async () => {
  const response = await post(valid);
  expect(response.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith({}, "submit_portal_delivery_done", {
    target_work_item_id: valid.workItemId, result_lines: null, receiver_name: "Anh Nhận", note: "", evidence_ids: valid.evidenceIds,
    expected_work_version: 2, expected_delivery_version: 4, expected_assignment_version: 1, operation_id: valid.operationId,
  });
});

it("refuses malformed input and signed-out callers before the database", async () => {
  expect((await post({ ...valid, evidenceIds: Array(6).fill(valid.evidenceIds[0]) })).status).toBe(400);
  m.client.mockResolvedValueOnce(null);
  expect((await post(valid)).status).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains a refusal in Vietnamese", async () => {
  m.rpc.mockRejectedValueOnce(new m.PortalRpcError({ message: "delivery_photo_required", code: "22023" }));
  const response = await post({ ...valid, evidenceIds: [] });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe("Chụp ít nhất 1 ảnh hàng đã giao rồi xác nhận.");
});
