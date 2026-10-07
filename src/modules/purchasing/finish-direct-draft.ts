import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type PurchaseLine = Record<string, unknown> & { linked_sales_order_line_id: string | null };

export function directDraftTermsOperationId(operationId: string) {
  const hex = createHash("sha256").update(`purchase-direct-draft-terms:${operationId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join("");
  const derived = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  return derived === operationId ? `${operationId[0] === "0" ? "1" : "0"}${operationId.slice(1)}` : derived;
}

// Creation and completion are two existing commands, not one atomic RPC.
// Completion reuses a deterministic, distinct command key; failures never retry.
export async function finishDirectPurchaseDraft(client: Pick<SupabaseClient, "from" | "rpc">, input: {
  purchaseOrderId: string; branchId: string; expectedAt: string | null;
  terms: string | null; operationId: string; lines: PurchaseLine[];
}) {
  const { data, error } = await client.from("purchase_order_line_read")
    .select("id, linked_sales_order_line_id").eq("purchase_order_id", input.purchaseOrderId);
  if (error || !data || data.length !== input.lines.length) throw new Error("direct_draft_line_identity_unavailable");
  const seen = new Set<string>();
  const lines = input.lines.map((line) => {
    const source = line.linked_sales_order_line_id;
    if (!source || seen.has(source)) throw new Error("direct_draft_source_identity_invalid");
    seen.add(source);
    const matches = data.filter((row) => row.linked_sales_order_line_id === source);
    if (matches.length !== 1 || typeof matches[0].id !== "string") throw new Error("direct_draft_line_identity_invalid");
    return { ...line, source_line_id: matches[0].id };
  });
  const terms = input.terms?.trim() || null;
  const updated = await client.rpc("update_purchase_order_draft", {
    target_purchase_order_id: input.purchaseOrderId, expected_version: 1,
    expected_at: input.expectedAt, commercial_terms: terms, purchase_lines: lines,
    operation_id: directDraftTermsOperationId(input.operationId),
  });
  if (updated.error || updated.data !== input.purchaseOrderId) throw new Error(updated.error?.message ?? "direct_draft_completion_unconfirmed");
  const current = await client.from("purchase_orders").select("draft_version, commercial_terms, expected_at")
    .eq("id", input.purchaseOrderId).eq("branch_id", input.branchId).maybeSingle();
  const actualTime = current.data?.expected_at;
  const sameTime = input.expectedAt === null ? actualTime === null
    : typeof actualTime === "string" && Number.isFinite(Date.parse(actualTime)) && Date.parse(actualTime) === Date.parse(input.expectedAt);
  if (current.error || !current.data || current.data.draft_version < 2 || current.data.commercial_terms !== terms || !sameTime)
    throw new Error("direct_draft_completion_readback_mismatch");
}
