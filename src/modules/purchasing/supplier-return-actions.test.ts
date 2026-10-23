import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "row" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
import { approveSupplierCreditAction, completeSupplierReturnAction, createSupplierReturnAction, recordSupplierReturnAction } from "./supplier-return-actions";

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

it("completes a return in one step with only the lines that have a quantity (FB10)", async () => {
  const data = form({ receiptId: ids.receipt, accountId: "", note: "" });
  data.append("lineId", ids.case); data.append("quantity", "2,5".replace(",", "."));
  data.append("lineId", ids.acceptance); data.append("quantity", "");
  expect(await completeSupplierReturnAction(data)).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("complete_supplier_return", { target_receipt_id: ids.receipt, return_lines: [{ receipt_line_id: ids.case, quantity: "2.5" }],
    refund_account_id: null, return_note: "", operation_id: ids.op });
});

it("asks for at least one quantity and explains an over-return", async () => {
  const empty = form({ receiptId: ids.receipt, accountId: "", note: "" }); empty.append("lineId", ids.case); empty.append("quantity", "");
  expect(await completeSupplierReturnAction(empty)).toMatchObject({ status: "FAILED", message: "Nhập số lượng trả cho ít nhất một hàng." });
  m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "supplier_return_exceeds_source_quantity" } });
  const over = form({ receiptId: ids.receipt, accountId: "", note: "" }); over.append("lineId", ids.case); over.append("quantity", "9");
  expect(await completeSupplierReturnAction(over)).toMatchObject({ status: "FAILED", message: "Số lượng trả vượt phần còn lại của phiếu nhập." });
});
