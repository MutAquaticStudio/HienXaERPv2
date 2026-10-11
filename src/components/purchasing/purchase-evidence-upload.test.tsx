import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserSupabase: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "qa-verified-session-actor" } }, error: null }) },
  storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) },
}) }));
import { PurchaseEvidenceUpload } from "./purchase-evidence-upload";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("restores the upload intent on remount after the finalize response is lost", async () => {
  localStorage.clear(); vi.stubGlobal("crypto", webcrypto);
  const posts: Array<{ createOperationId: string }> = [], patches: Array<{ finalizeOperationId: string }> = [];
  let committed = false;
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const payload = JSON.parse(String(init.body));
    if (init.method === "POST") {
      posts.push(payload);
      return Response.json({ evidenceId: "qa-proof", objectPath: "qa/proof.png", token: "qa-token", alreadyVerified: committed });
    }
    patches.push(payload);
    if (!committed) { committed = true; throw new TypeError("response lost after commit"); }
    return Response.json({ evidenceId: "qa-proof" });
  }));
  mocks.upload.mockResolvedValue({ error: null });
  const file = new NodeFile([new Uint8Array([137,80,78,71,13,10,26,10])], "qa.png", { type: "image/png" });
  const first = render(<PurchaseEvidenceUpload purchaseOrderId="qa-po" />);
  fireEvent.change(screen.getByLabelText(/Minh chứng nhận hàng/), { target: { files: [file] } });
  await screen.findByRole("alert"); first.unmount();
  render(<PurchaseEvidenceUpload purchaseOrderId="qa-po" />);
  fireEvent.change(screen.getByLabelText(/Minh chứng nhận hàng/), { target: { files: [file] } });
  await waitFor(() => expect(document.querySelector<HTMLInputElement>('input[name="evidenceId"]')?.value).toBe("qa-proof"));
  expect(posts).toHaveLength(2); expect(patches).toHaveLength(2);
  expect(posts[1].createOperationId).toBe(posts[0].createOperationId);
  expect(patches[1].finalizeOperationId).toBe(patches[0].finalizeOperationId);
  expect(mocks.upload).toHaveBeenCalledOnce();
});
