import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { branch_id: "branch-a" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
import { resolveCommissionReviewAction } from "./commission-review-action";

const ids = { case: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ caseId: ids.case, operationId: ids.op, target: "", ruleId: "", ...values })) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "resolution", error: null }); });

it("records a commission decision without a note, keeping a plain description (FB7)", async () => {
  expect(await resolveCommissionReviewAction(form({ method: "WAIVE", reason: "" }))).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("resolve_commission_reconciliation", expect.objectContaining({ resolution_kind: "WAIVE", resolution_reason: "Không thu hồi hoa hồng" }));
  await resolveCommissionReviewAction(form({ method: "WAIVE", reason: "Khách đã trả bù" }));
  expect(m.rpc).toHaveBeenLastCalledWith("resolve_commission_reconciliation", expect.objectContaining({ resolution_reason: "Khách đã trả bù" }));
});
