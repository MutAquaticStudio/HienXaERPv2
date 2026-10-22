import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: m.maybeSingle };
  return { from: () => query, rpc: m.rpc };
}) }));
import { approveReturnCreditAction } from "./credit-actions";

const ids = { returnCase: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222" };
const form = (reason?: string) => { const data = new FormData(); data.set("returnCaseId", ids.returnCase); data.set("amount", "150000"); data.set("operationId", ids.op); if (reason !== undefined) data.set("reason", reason); return data; };
beforeEach(() => { vi.clearAllMocks(); m.maybeSingle.mockResolvedValue({ data: { branch_id: "branch-a" }, error: null }); m.rpc.mockResolvedValue({ data: "credit-1", error: null }); });

it("approves a return credit without a note and records a plain description (FB7)", async () => {
  expect(await approveReturnCreditAction(form(""))).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("adjust_return_receivable", { target_return_case_id: ids.returnCase, credit_amount_vnd: "150000", adjustment_reason: "Giảm công nợ theo hàng trả", operation_id: ids.op });
  await approveReturnCreditAction(form("Khách trả 3 bao vỡ"));
  expect(m.rpc).toHaveBeenLastCalledWith("adjust_return_receivable", expect.objectContaining({ adjustment_reason: "Khách trả 3 bao vỡ" }));
});
