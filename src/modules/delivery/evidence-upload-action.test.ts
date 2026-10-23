import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), download: vi.fn(), finalize: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/modules/portal/evidence-storage", () => ({ finalizeVerifiedEvidence: m.finalize }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({
  rpc: m.rpc,
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ids.delivery } }) }) }) }) }),
  storage: { from: () => ({ upload: m.upload, download: m.download }) },
  auth: { getUser: async () => ({ data: { user: { id: "actor-1" } } }) },
})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, unstable_rethrow: vi.fn() }));
import { uploadDeliveryEvidenceAction } from "./actions";

const ids = { delivery: "11111111-1111-4111-8111-111111111111", evidence: "33333333-3333-4333-8333-333333333333" };
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const form = () => { const data = new FormData(); data.set("deliveryId", ids.delivery); data.set("file", new File([bytes], "anh giao.jpg", { type: "image/jpeg" })); return data; };
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ data: ids.evidence, error: null });
  m.upload.mockResolvedValue({ error: null });
  m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  m.finalize.mockResolvedValue(ids.evidence);
});

it("finalizes the stored photo on the server after checking its bytes (FB10)", async () => {
  await expect(uploadDeliveryEvidenceAction(form())).rejects.toThrow(`notice=evidence-uploaded&evidence=${ids.evidence}`);
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.rpc).not.toHaveBeenCalledWith("finalize_evidence_upload", expect.anything());
  expect(m.finalize).toHaveBeenCalledWith("INTERNAL", expect.objectContaining({ actorUuid: "actor-1", evidenceId: ids.evidence, byteSize: bytes.length,
    checksum: expect.stringMatching(/^[0-9a-f]{64}$/) }));
});

it("does not finalize when the stored file differs", async () => {
  m.download.mockResolvedValue({ data: new Blob([new Uint8Array([9, 9])]), error: null });
  await expect(uploadDeliveryEvidenceAction(form())).rejects.toThrow("error=");
  expect(m.finalize).not.toHaveBeenCalled();
});

it("shows a Vietnamese message when server finalization fails", async () => {
  m.finalize.mockRejectedValue(new Error("x"));
  await expect(uploadDeliveryEvidenceAction(form())).rejects.toThrow(encodeURIComponent("Không thể xác minh ảnh đã lưu. Hãy thử lại."));
});
