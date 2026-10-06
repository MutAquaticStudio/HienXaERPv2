// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), upload: vi.fn(), storage: vi.fn(),
}));
vi.mock("@/modules/portal/evidence-storage", () => ({ createPortalEvidenceStorage: mocks.storage }));
vi.mock("@/modules/portal/server", () => ({
  authenticatedPortalClient: mocks.auth, portalRpc: mocks.rpc,
  detectEvidenceMime: () => "image/png", deterministicUuid: (seed: string) => seed,
}));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ supabase: { actor: "ordinary-user" } });
  mocks.rpc.mockImplementation(async (_client, name) => name === "create_portal_evidence"
    ? { id: "proof", bucket_id: "portal-evidence", object_path: "authoritative/proof.png" } : "proof");
  mocks.storage.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ upload: mocks.upload });
  mocks.upload.mockResolvedValue({ error: null });
});
function request() {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([137, 80, 78, 71])], "proof.png", { type: "image/png" }));
  form.set("operationId", "same-operation"); form.set("context", "WORK_RESULT"); form.set("workItemId", "fixture-work");
  return new Request("http://127.0.0.1:4057/api/portal/evidence/upload", { method: "POST", body: form });
}
it("preserves upload/upsert/finalize after canonical user authorization without user Storage SELECT", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.rpc.mock.calls.map(call => call[1])).toEqual(["create_portal_evidence", "finalize_portal_evidence"]);
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.storage.mock.invocationCallOrder[0]);
  expect(mocks.from).toHaveBeenCalledWith("portal-evidence");
  expect(mocks.upload).toHaveBeenCalledWith("authoritative/proof.png", expect.any(Uint8Array), { contentType: "image/png", upsert: true });
  expect(await response.json()).toEqual({ evidenceId: "proof" });
});
it("does not use trusted storage when the canonical creation RPC denies", async () => {
  mocks.rpc.mockRejectedValue(new Error("evidence_create_forbidden"));
  expect((await POST(request())).status).toBe(400);
  expect(mocks.storage).not.toHaveBeenCalled();
});
