import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/features", () => ({ PAYMENT_NOTICES_ENABLED: true, PAYMENT_NOTICES_DISABLED_MESSAGE: "" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "row" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
import { paymentNoticeCommandAction } from "./notice-actions";

const ids = { notice: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ noticeId: ids.notice, version: "2", operationId: ids.op, ...values })) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "done", error: null }); });

it("reviews a payment notice without a note and records a plain description (FB7)", async () => {
  expect(await paymentNoticeCommandAction(form({ kind: "REVIEW", state: "ACCEPTED", reason: "" }))).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("review_payment_notice", expect.objectContaining({ target_review_note: "Rà soát thông báo chuyển tiền", target_state: "ACCEPTED" }));
  await paymentNoticeCommandAction(form({ kind: "REVIEW", state: "ACCEPTED", reason: "Đúng ủy nhiệm chi" }));
  expect(m.rpc).toHaveBeenLastCalledWith("review_payment_notice", expect.objectContaining({ target_review_note: "Đúng ủy nhiệm chi" }));
});
