import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "row" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
import { approveSupplierCreditAction, createSupplierReturnAction, recordSupplierReturnAction } from "./supplier-return-actions";

const ids = { receipt: "11111111-1111-4111-8111-111111111111", op: "22222222-2222-4222-8222-222222222222", case: "33333333-3333-4333-8333-333333333333", acceptance: "44444444-4444-4444-8444-444444444444" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ operationId: ids.op, ...values })) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "done", error: null }); });

it("opens a supplier return without a note and records a plain description (FB7)", async () => {
  expect(await createSupplierReturnAction(form({ source: `${ids.receipt}||`, quantity: "2", reason: "" }))).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("create_supplier_return", expect.objectContaining({ target_receipt_line_id: ids.receipt, return_reason: "Trả hàng nhà cung cấp" }));
});

it("records return steps and the credit decision without a note (FB7)", async () => {
  await recordSupplierReturnAction(form({ caseId: ids.case, kind: "PHYSICAL_RETURN", quantity: "2", supplierReference: "", version: "1" }));
  expect(m.rpc).toHaveBeenCalledWith("record_supplier_return_event", expect.objectContaining({ target_event_kind: "PHYSICAL_RETURN", event_reason: "Thực trả nhà cung cấp" }));
  await approveSupplierCreditAction(form({ caseId: ids.case, acceptanceId: ids.acceptance, amount: "150000", version: "2", reason: "" }));
  expect(m.rpc).toHaveBeenLastCalledWith("approve_supplier_return_credit", expect.objectContaining({ credit_amount_vnd: "150000", approval_reason: "Giảm phải trả theo chấp nhận của nhà cung cấp" }));
});
