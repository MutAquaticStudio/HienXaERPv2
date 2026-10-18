import { expect, it } from "vitest";
import { defaultPrepaymentAccount, prepaymentReference, prepaymentSummary } from "./prepayment";

const accounts = [{ id: "bank", name: "VCB", kind: "BANK" as const }, { id: "cash", name: "Quỹ", kind: "CASH" as const }];

it("receives cash into a cash account and other methods into a bank account", () => {
  expect(defaultPrepaymentAccount(accounts, "CASH")?.id).toBe("cash");
  expect(defaultPrepaymentAccount(accounts, "BANK_TRANSFER")?.id).toBe("bank");
  expect(defaultPrepaymentAccount([accounts[1]], "CARD")?.id).toBe("cash");
  expect(prepaymentReference("SO-000123")).toBe("Trả trước đơn SO-000123");
});

it("counts posted prepayments only and never shows a negative amount left to pay", () => {
  const receipt = { method: "BANK_TRANSFER", posting_state: "POSTED", reversal_of_payment_id: null };
  const summary = prepaymentSummary([
    { ...receipt, id: "a", payment_number: "REC-1", amount_vnd: "300000" },
    { ...receipt, id: "b", payment_number: "REC-2", amount_vnd: "200000", posting_state: "REVERSED" },
  ], "1000000");
  expect(summary).toEqual({ receipts: [{ id: "a", number: "REC-1", method: "Chuyển khoản" }], paidVnd: 300000n, remainingVnd: 700000n });
  expect(prepaymentSummary([{ ...receipt, id: "a", payment_number: "REC-1", amount_vnd: "1500000" }], "1000000").remainingVnd).toBe(0n);
});
