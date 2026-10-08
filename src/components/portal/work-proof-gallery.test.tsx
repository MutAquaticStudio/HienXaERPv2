import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: mocks.auth }));
import { WorkProofGallery } from "./work-proof-gallery";

const workItemId = "fb9182ca-7c82-4114-8e7d-6fdfea2f44e9";
const proof = { id: "4e582c6f-42ea-48d2-afbe-2ac90b62358f", work_item_id: workItemId,
  context_type: "WORK_RESULT", object_state: "READY", mime_type: "image/png", final_byte_size: "68" };
const chain = { select: mocks.select, eq: mocks.eq, order: mocks.order };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ supabase: { from: mocks.from } });
  mocks.from.mockReturnValue(chain); mocks.select.mockReturnValue(chain); mocks.eq.mockReturnValue(chain);
  mocks.order.mockResolvedValue({ data: [proof], error: null });
});

describe("Work task private proof gallery", () => {
  it("uses an ordinary session, exact task/READY scope and safe metadata only", async () => {
    const html = renderToStaticMarkup(await WorkProofGallery({ workItemId }));
    expect(mocks.from).toHaveBeenCalledWith("portal_evidence_objects");
    expect(mocks.select).toHaveBeenCalledWith("id,work_item_id,context_type,object_state,mime_type,final_byte_size");
    expect(mocks.eq.mock.calls).toEqual([["work_item_id", workItemId], ["context_type", "WORK_RESULT"], ["object_state", "READY"]]);
    expect(html).toContain(`/api/evidence/${proof.id}/signed`); expect(html).toContain("68");
    expect(html).not.toContain("supabase.co"); expect(html).not.toContain("object_path");
  });
  it("does not query metadata when logged out", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await WorkProofGallery({ workItemId })).toBeNull(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("renders no foreign metadata when existing RLS returns no rows", async () => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    expect(await WorkProofGallery({ workItemId })).toBeNull();
  });
  it.each([{ object_state: "REVOKED" }, { work_item_id: "other-task" }, { context_type: "PAYMENT_NOTICE" }])(
    "fails closed for an unexpected returned proof %j", async (delta) => {
      mocks.order.mockResolvedValue({ data: [{ ...proof, ...delta }], error: null });
      expect(await WorkProofGallery({ workItemId })).toBeNull();
    },
  );
  it("does not hide a failed metadata query as a successful empty gallery", async () => {
    mocks.order.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(WorkProofGallery({ workItemId })).rejects.toThrow("work_proof_metadata_read_failed");
  });
});
