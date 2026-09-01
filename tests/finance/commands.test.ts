import { describe, expect, it } from "vitest";

import { parseFinanceForm } from "@/modules/finance/commands";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("P8 finance command validation", () => {
  it("requires the right counterparty for receipts and disbursements", () => {
    expect(() => parseFinanceForm(form({
      kind: "finance.payment.create", direction: "RECEIPT", accountId: "account-001",
      currency: "VND", amount: "1000000", paymentDate: "2026-09-01",
    }))).toThrow(/Khách hàng/);
    expect(parseFinanceForm(form({
      kind: "finance.payment.create", direction: "DISBURSEMENT", accountId: "account-001",
      supplierId: "supplier-001", currency: "VND", amount: "1000000", paymentDate: "2026-09-01",
    }))).toMatchObject({ direction: "DISBURSEMENT", supplierId: "supplier-001" });
  });

  it("accepts an explicit signed adjustment with a meaningful reason", () => {
    expect(parseFinanceForm(form({
      kind: "finance.adjustment.post", targetKind: "RECEIVABLE", targetId: "receivable-001",
      signedAmount: "-500000", reason: "Giảm do biên bản nghiệm thu điều chỉnh",
    }))).toMatchObject({ signedAmount: "-500000" });
  });

  it("rejects silent reversal without a reason", () => {
    expect(() => parseFinanceForm(form({
      kind: "finance.payment.reverse", paymentId: "payment-001", reason: "Sai",
    }))).toThrow(/ít nhất 10/);
  });
});
