// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), row: { data: null as unknown, error: null as unknown }, download: vi.fn(), bucket: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ resolveInternalAccess: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from: () => { const query = { select: () => query, eq: () => query, maybeSingle: async () => m.row }; return query; },
  storage: { from: (bucket: string) => { m.bucket(bucket); return { download: m.download }; } },
}) }));
import { GET } from "./route";
import { evidenceContentType } from "@/modules/delivery/evidence-type";

const id = "2669e303-7230-4158-8c66-4833ddf89c47";
const args = { params: Promise.resolve({ id }) };
const bytes = new Uint8Array([255, 216, 255, 224]);
const request = new Request("http://127.0.0.1/api/evidence/internal/" + id);

beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ branchId: "b1", permissions: new Set(["evidence.manage"]) });
  m.row = { data: { bucket_name: "delivery-proofs", object_path: "b1/d1/x-ncc.jpg", checksum_sha256: createHash("sha256").update(bytes).digest("hex"), byte_size: bytes.length }, error: null };
  m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
});

it("streams a verified delivery photo with private headers", async () => {
  const response = await GET(request, args);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(m.bucket).toHaveBeenCalledWith("delivery-proofs");
});

it("hides the file from someone without evidence.manage", async () => {
  m.access.mockResolvedValue({ branchId: "b1", permissions: new Set(["delivery.read"]) });
  expect((await GET(request, args)).status).toBe(404);
  expect(m.download).not.toHaveBeenCalled();
});

it("refuses bytes that do not match the verified checksum", async () => {
  m.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3, 4])]), error: null });
  expect((await GET(request, args)).status).toBe(503);
});

it("refuses an id that is not a uuid and a file of another bucket", async () => {
  expect((await GET(request, { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
  m.row = { data: { bucket_name: "portal-evidence", object_path: "a.jpg", checksum_sha256: "0".repeat(64), byte_size: 4 }, error: null };
  expect((await GET(request, args)).status).toBe(404);
});

it("offers unknown file types as a download only", () => {
  expect(evidenceContentType("a/b/photo.PNG")).toBe("image/png");
  expect(evidenceContentType("a/b/doc.pdf")).toBe("application/pdf");
  expect(evidenceContentType("a/b/page.html")).toBe("application/octet-stream");
});
