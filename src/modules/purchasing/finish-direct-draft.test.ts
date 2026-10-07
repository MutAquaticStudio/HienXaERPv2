import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { directDraftTermsOperationId, finishDirectPurchaseDraft } from "./finish-direct-draft";

const order = "10000000-0000-4000-8000-000000000001";
const operation = "10000000-0000-4000-8000-000000000002";
const input = { purchaseOrderId: order, branchId: "10000000-0000-4000-8000-000000000003",
  expectedAt: "2026-10-07T14:00:00.000Z", terms: "  Synthetic PO terms  ", operationId: operation,
  lines: [{ linked_sales_order_line_id: "sale-a", quantity: "20", unit_cost_vnd: "40000" },
    { linked_sales_order_line_id: "sale-b", quantity: "4", unit_cost_vnd: "50000" }] };

function fixture(options: { rows?: { id: string; linked_sales_order_line_id: string }[];
  error?: string; terms?: string | null; version?: number; time?: string | null } = {}) {
  const rpc = vi.fn(async (_name: string, _args: unknown) => ({
    data: options.error ? null : order, error: options.error ? { message: options.error } : null,
  }));
  const from = vi.fn((table: string) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: { draft_version: options.version ?? 2,
        commercial_terms: options.terms === undefined ? "Synthetic PO terms" : options.terms,
        expected_at: options.time === undefined ? "2026-10-07T14:00:00+00:00" : options.time }, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === "purchase_order_line_read" ? options.rows ?? [
          { id: "line-b", linked_sales_order_line_id: "sale-b" },
          { id: "line-a", linked_sales_order_line_id: "sale-a" },
        ] : null, error: null,
      }).then(resolve),
    };
    return chain;
  });
  return { rpc, from, client: { rpc, from } as unknown as Pick<SupabaseClient, "from" | "rpc"> };
}

describe("linked direct PO completion", () => {
  it("preserves every existing line ID by Sales identity, not array position", async () => {
    const f = fixture();
    await finishDirectPurchaseDraft(f.client, input);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("update_purchase_order_draft", {
      target_purchase_order_id: order, expected_version: 1, expected_at: input.expectedAt,
      commercial_terms: "Synthetic PO terms", operation_id: directDraftTermsOperationId(operation),
      purchase_lines: [ { ...input.lines[0], source_line_id: "line-a" }, { ...input.lines[1], source_line_id: "line-b" } ],
    });
  });
  it("uses the same distinct UUID command key and payload for a deliberate same-intent retry", async () => {
    const f = fixture();
    await finishDirectPurchaseDraft(f.client, input);
    await finishDirectPurchaseDraft(f.client, input);
    expect(f.rpc.mock.calls[0]).toEqual(f.rpc.mock.calls[1]);
    expect(directDraftTermsOperationId(operation)).not.toBe(operation);
    expect(directDraftTermsOperationId(operation)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("records empty terms as NULL through the separate command too", async () => {
    const f = fixture({ terms: null });
    await finishDirectPurchaseDraft(f.client, { ...input, terms: " " });
    expect(f.rpc.mock.calls[0][1]).toMatchObject({ commercial_terms: null });
  });
  it.each([
    [{ id: "line-a", linked_sales_order_line_id: "sale-a" }],
    [{ id: "line-a", linked_sales_order_line_id: "sale-a" }, { id: "another-a", linked_sales_order_line_id: "sale-a" }],
  ])("fails closed before update when created line identities are incomplete or ambiguous", async (...rows) => {
    const f = fixture({ rows });
    await expect(finishDirectPurchaseDraft(f.client, input)).rejects.toThrow(/identity/);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rejects duplicate requested sources before update", async () => {
    const f = fixture();
    await expect(finishDirectPurchaseDraft(f.client, { ...input, lines: [input.lines[0], input.lines[0]] })).rejects.toThrow(/identity/);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("propagates permission failure without a retry or false success", async () => {
    const f = fixture({ error: "forbidden" });
    await expect(finishDirectPurchaseDraft(f.client, input)).rejects.toThrow("forbidden");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not retry a real client-side transport rejection", async () => {
    const f = fixture();
    f.rpc.mockRejectedValueOnce(new Error("transport unavailable"));
    await expect(finishDirectPurchaseDraft(f.client, input)).rejects.toThrow("transport unavailable");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{ terms: "Different terms" }, { version: 1 }, { time: null }])("requires semantic readback after acknowledged update: %j", async (options) => {
    const f = fixture(options);
    await expect(finishDirectPurchaseDraft(f.client, input)).rejects.toThrow("direct_draft_completion_readback_mismatch");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
});
