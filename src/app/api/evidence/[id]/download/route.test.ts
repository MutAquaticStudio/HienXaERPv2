// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), storage: vi.fn(), from: vi.fn(), download: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/portal/evidence-storage", () => ({ createPortalEvidenceStorage: mocks.storage }));
vi.mock("@/modules/portal/server", () => ({
  authenticatedPortalClient: mocks.auth,
  portalRpc: mocks.rpc,
  PortalRpcError: class PortalRpcError extends Error { code = "42501"; },
}));
import { GET } from "./route";
import { GET as legacyGet } from "../signed/route";
import { PortalRpcError } from "@/modules/portal/server";

const id = "2669e303-7230-4158-8c66-4833ddf89c47";
const args = { params: Promise.resolve({ id }) };
const metadata = { id, bucket_id: "portal-evidence", object_path: "authoritative/proof.png", mime_type: "image/png" };
const bytes = new Uint8Array([137, 80, 78, 71]);
const request = new Request("http://127.0.0.1:4057/api/evidence/" + id + "/download?bucket=other&path=untrusted");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ supabase: { actor: "ordinary-user" }, user: { id: "ordinary-user" } });
  mocks.rpc.mockResolvedValue(metadata);
  mocks.storage.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ download: mocks.download });
  mocks.download.mockImplementation(async () => ({ data: new Blob([bytes]), error: null }));
});

it("streams authorized bytes with no shared cache and no path/token exposure", async () => {
  const response = await GET(request, args);
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "get_portal_evidence_for_signing", { target_evidence_id: id });
  expect(mocks.from).toHaveBeenCalledWith("portal-evidence");
  expect(mocks.download).toHaveBeenCalledWith(metadata.object_path);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
});
it("requires a real authenticated session before trusted storage access", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(request, args)).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.storage).not.toHaveBeenCalled();
});
it("rechecks the same session on every request after revoke, without reading storage", async () => {
  expect((await GET(request, args)).status).toBe(200);
  mocks.rpc.mockRejectedValue(new PortalRpcError({ code: "42501", message: "evidence_access_denied" }));
  for (let i = 0; i < 2; i++) {
    const response = await GET(request, args);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(metadata.object_path);
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
  expect(mocks.auth).toHaveBeenCalledTimes(3);
  expect(mocks.rpc).toHaveBeenCalledTimes(3);
  expect(mocks.download).toHaveBeenCalledTimes(1);
});
it("does not allow a client to select another bucket or object path", async () => {
  mocks.rpc.mockResolvedValue({ ...metadata, bucket_id: "other" });
  expect((await GET(request, args)).status).toBe(404);
  expect(mocks.storage).not.toHaveBeenCalled();
});
it("rejects invalid IDs before auth or storage reads", async () => {
  expect((await GET(request, { params: Promise.resolve({ id: "../object" }) })).status).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.storage).not.toHaveBeenCalled();
});
it("fails closed without leaking private storage errors", async () => {
  mocks.download.mockResolvedValue({ data: null, error: { message: "private backend detail" } });
  const response = await GET(request, args);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private backend");
});
it("keeps the old URL as an authorization-gated stream, not a signed redirect", async () => {
  const response = await legacyGet(request, args);
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
});
