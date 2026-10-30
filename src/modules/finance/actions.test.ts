import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { dismissBankTransactionAction, recordPayableAdjustmentAction, recordReceivableAdjustmentAction, resolveBankTransactionAction, reversePaymentAction, setBankFeedAction } from "./actions";

const ids = { payment: "11111111-1111-4111-8111-111111111111", obligation: "22222222-2222-4222-8222-222222222222", op: "33333333-3333-4333-8333-333333333333" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.permission.mockResolvedValue({}); m.rpc.mockResolvedValue({ data: null, error: null }); });

it("reverses a payment without a note and records a plain description (FB7)", async () => {
  await expect(reversePaymentAction(form({ paymentId: ids.payment, operationId: ids.op, reason: "" }))).rejects.toThrow("notice=payment-reversed");
  expect(m.rpc).toHaveBeenCalledWith("reverse_payment", { target_payment_id: ids.payment, reversal_reason: "Đảo phiếu", operation_id: ids.op });
  await expect(reversePaymentAction(form({ paymentId: ids.payment, operationId: ids.op, reason: "Ghi nhầm số tiền" }))).rejects.toThrow("notice=payment-reversed");
  expect(m.rpc).toHaveBeenLastCalledWith("reverse_payment", expect.objectContaining({ reversal_reason: "Ghi nhầm số tiền" }));
});

it("adjusts a receivable or payable without a note and records a plain description (FB7)", async () => {
  await expect(recordReceivableAdjustmentAction(form({ obligationId: ids.obligation, amount: "-100000", reason: "", evidenceId: "", operationId: ids.op, adjustmentKind: "PRICE" })))
    .rejects.toThrow("notice=adjusted");
  expect(m.rpc).toHaveBeenCalledWith("record_receivable_adjustment_typed", expect.objectContaining({ amount_delta_vnd: "-100000", reason: "Điều chỉnh công nợ", adjustment_kind: "PRICE" }));
  await expect(recordPayableAdjustmentAction(form({ obligationId: ids.obligation, amount: "50000", operationId: ids.op }))).rejects.toThrow("notice=adjusted");
  expect(m.rpc).toHaveBeenLastCalledWith("record_payable_adjustment", expect.objectContaining({ amount_delta_vnd: "50000", reason: "Điều chỉnh công nợ" }));
});

it("D42: switches SePay auto-posting on a bank fund and explains a missing account number", async () => {
  await expect(setBankFeedAction(form({ accountId: ids.payment, enabled: "on", prefix: "sevqr", operationId: ids.op }))).rejects.toThrow("notice=bank-feed-saved");
  expect(m.rpc).toHaveBeenCalledWith("set_finance_account_bank_feed", { target_account_id: ids.payment, enabled: true, note_prefix: "sevqr", operation_id: ids.op });
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "bank_feed_needs_account_number" } });
  await expect(setBankFeedAction(form({ accountId: ids.payment, prefix: "", operationId: ids.op })))
    .rejects.toThrow(encodeURIComponent("Nhập số tài khoản ngân hàng trước khi bật tự ghi tiền về."));
  expect(m.rpc).toHaveBeenLastCalledWith("set_finance_account_bank_feed", expect.objectContaining({ enabled: false, note_prefix: null }));
});

it("D42: posts or dismisses a waiting bank movement", async () => {
  await expect(resolveBankTransactionAction(form({ transactionId: ids.payment, customerId: ids.obligation, operationId: ids.op }))).rejects.toThrow("notice=bank-transaction-posted");
  expect(m.rpc).toHaveBeenCalledWith("resolve_bank_transaction", { target_transaction_id: ids.payment, target_customer_id: ids.obligation, target_sales_order_id: null, operation_id: ids.op });
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "bank_transaction_not_waiting" } });
  await expect(dismissBankTransactionAction(form({ transactionId: ids.payment, operationId: ids.op }))).rejects.toThrow(encodeURIComponent("Khoản tiền này đã được xử lý."));
});
