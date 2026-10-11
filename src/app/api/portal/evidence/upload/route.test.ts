// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), upload: vi.fn(), download: vi.fn(), finalize: vi.fn(), storage: vi.fn(),
}));
vi.mock("@/modules/portal/evidence-storage", () => ({ createPortalEvidenceStorage: mocks.storage, finalizeVerifiedEvidence: mocks.finalize }));
vi.mock("@/modules/portal/server", () => ({
  authenticatedPortalClient: mocks.auth, portalRpc: mocks.rpc,
  detectEvidenceMime: () => "image/png", deterministicUuid: (seed: string) => seed,
}));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ supabase: { actor: "ordinary-user" }, user: { id: "verified-request-actor" } });
  mocks.rpc.mockImplementation(async (_client, name) => name === "create_portal_evidence"
    ? { id: "proof", bucket_id: "portal-evidence", object_path: "authoritative/proof.png", state: "PENDING" } : "proof");
  mocks.storage.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ upload: mocks.upload, download: mocks.download });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  mocks.finalize.mockResolvedValue("proof");
});
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function request() {
  const form = new FormData();
  form.set("file", new File([bytes], "proof.png", { type: "image/png" }));
  form.set("actorUuid", "untrusted-body-actor");
  form.set("operationId", "same-operation"); form.set("context", "WORK_RESULT"); form.set("workItemId", "fixture-work");
  return new Request("http://127.0.0.1:4057/api/portal/evidence/upload", { method: "POST", body: form });
}
it("preserves upload/upsert/finalize after canonical user authorization without user Storage SELECT", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.rpc.mock.calls.map(call => call[1])).toEqual(["create_portal_evidence"]);
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.storage.mock.invocationCallOrder[0]);
  expect(mocks.from).toHaveBeenCalledWith("portal-evidence");
  expect(mocks.upload).toHaveBeenCalledWith("authoritative/proof.png", expect.any(Uint8Array), { contentType: "image/png", upsert: true });
  expect(mocks.download).toHaveBeenCalledWith("authoritative/proof.png");
  expect(mocks.finalize).toHaveBeenCalledWith("PORTAL", expect.objectContaining({ actorUuid: "verified-request-actor", byteSize: 8 }));
  expect(mocks.download.mock.invocationCallOrder[0]).toBeLessThan(mocks.finalize.mock.invocationCallOrder[0]);
  expect(await response.json()).toEqual({ evidenceId: "proof" });
});
it("does not use trusted storage when the canonical creation RPC denies", async () => {
  mocks.rpc.mockRejectedValue(new Error("evidence_create_forbidden"));
  expect((await POST(request())).status).toBe(400);
  expect(mocks.storage).not.toHaveBeenCalled();
});

it("does not finalize when upload fails", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "storage unavailable" } });
  expect((await POST(request())).status).toBe(400);
  expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.finalize).not.toHaveBeenCalled();
});
it("does not finalize when the uploaded object cannot be read back", async () => {
  mocks.download.mockResolvedValue({ data: null, error: { message: "object absent" } });
  expect((await POST(request())).status).toBe(400); expect(mocks.finalize).not.toHaveBeenCalled();
});
it("rejects different stored bytes even when the length is unchanged", async () => {
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])]), error: null });
  expect((await POST(request())).status).toBe(400); expect(mocks.finalize).not.toHaveBeenCalled();
});
it("retries an already READY source without overwriting its stored file", async () => {
  mocks.rpc.mockResolvedValue({ id: "proof", bucket_id: "portal-evidence", object_path: "authoritative/proof.png", state: "READY" });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.download).toHaveBeenCalledOnce();
  expect(mocks.finalize).toHaveBeenCalledOnce();
});
it("does not report success when trusted finalization fails after upload", async () => {
  mocks.finalize.mockRejectedValue(new Error("verified finalization unavailable"));
  expect((await POST(request())).status).toBe(400);
});
