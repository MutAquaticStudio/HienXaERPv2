import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
// These cover the commands themselves, as they behave once the module is switched back on (D41 pauses it).
vi.mock("@/lib/features", async (original) => ({ ...(await original<typeof import("@/lib/features")>()), E_INVOICES_ENABLED: true }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "row" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
import { invoiceCommandWithOutcomeAction, reviewSupplierDocumentAction } from "./document-actions";

const ids = { invoice: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ operationId: ids.op, ...values })) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "done", error: null }); });

it("approves or cancels an invoice draft without a note, keeping a plain description (FB7)", async () => {
  expect(await invoiceCommandWithOutcomeAction(form({ kind: "approve", invoice_id: ids.invoice, version: "2", reason: "" }))).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("approve_invoice_business", { target_invoice_id: ids.invoice, expected_version: 2, review_reason: "Duyệt nguồn nghiệp vụ", operation_id: ids.op });
  await invoiceCommandWithOutcomeAction(form({ kind: "cancel", invoice_id: ids.invoice, version: "2" }));
  expect(m.rpc).toHaveBeenLastCalledWith("cancel_invoice_draft", expect.objectContaining({ cancel_reason: "Hủy nháp hóa đơn" }));
});

it("reviews a supplier document without a note (FB7)", async () => {
  expect(await reviewSupplierDocumentAction(form({ documentId: ids.invoice, decision: "CANCEL", version: "1", reason: "" }))).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("review_supplier_document", expect.objectContaining({ review_decision: "CANCEL", review_reason: "Hủy bản đối chiếu" }));
});
