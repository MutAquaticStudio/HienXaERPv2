import { describe, expect, it } from "vitest";
import { ALL_DEBTS, debtPaymentOptionsSchema, paymentRequestSchema, paymentTarget, selectedTotal, vietQrImageUrl } from "./sepay";

const options = debtPaymentOptionsSchema.parse({
  bank_name: "Vietcombank", account_number: "0071000315", account_holder: "CÔNG TY HIỀN XA", customer_code: "KH-315",
  outstanding_amount_vnd: "4000000", all_note: "TT KH315",
  orders: [
    { key: "OPENING", label: "Số dư đầu kỳ", outstanding_amount_vnd: "1000000", due_date: "2026-10-01", note: "TT KH315" },
    { key: "o1", label: "SO-2026-031501", outstanding_amount_vnd: "3000000", due_date: null, note: "SO2026031501 KH315" },
  ],
});

describe("D42 debt payment", () => {
  it("each order pays its own outstanding amount with order code + customer code; 'all' pays the total", () => {
    expect(paymentTarget(options, "o1")).toEqual({ label: "SO-2026-031501", amountVnd: "3000000", note: "SO2026031501 KH315" });
    expect(paymentTarget(options, ALL_DEBTS)).toEqual({ label: "Tất cả công nợ", amountVnd: "4000000", note: "TT KH315" });
    expect(paymentTarget(options, "paid-meanwhile")).toBeNull();
    expect(paymentTarget({ ...options, outstanding_amount_vnd: "0", orders: [] }, ALL_DEBTS)).toBeNull();
  });

  it("builds the VietQR link with the exact amount and note, holder without accents", () => {
    const url = new URL(vietQrImageUrl({ bank: "Vietcombank", accountNumber: "0071000315", amountVnd: "3000000", note: "SO2026031501 KH315", holder: "CÔNG TY HIỀN XA ĐỨC" }));
    expect(url.origin + url.pathname).toBe("https://vietqr.app/img");
    expect(Object.fromEntries(url.searchParams)).toEqual({ acc: "0071000315", bank: "Vietcombank", amount: "3000000", des: "SO2026031501 KH315",
      template: "compact", showinfo: "true", holder: "CONG TY HIEN XA DUC" });
  });

  it("refuses amounts that are not whole đồng", () => {
    expect(debtPaymentOptionsSchema.safeParse({ ...options, outstanding_amount_vnd: "12.5" }).success).toBe(false);
  });
});

describe("D44 payment request", () => {
  it("adds the chosen debts exactly (no floating point) and ignores keys that are no longer owed", () => {
    expect(selectedTotal(options, ["OPENING", "o1"])).toBe("4000000");
    expect(selectedTotal(options, ["o1", "gone"])).toBe("3000000");
    expect(selectedTotal({ orders: [{ ...options.orders[0], outstanding_amount_vnd: "900719925474099300" }, { ...options.orders[1], outstanding_amount_vnd: "7" }] }, ["OPENING", "o1"]))
      .toBe("900719925474099307");
  });

  it("only accepts a request with a YC code and whole-VND amounts", () => {
    const base = { id: "11111111-1111-4111-8111-111111111111", code: "YC7K2MQ", state: "OPEN", amount_vnd: "10", received_amount_vnd: "0", remaining_amount_vnd: "10",
      note: "TT KH1 YC7K2MQ", created_via: "PORTAL", created_at: "x", expires_at: "y", bank_name: null, account_number: null, account_holder: null, lines: [] };
    expect(paymentRequestSchema.safeParse(base).success).toBe(true);
    expect(paymentRequestSchema.safeParse({ ...base, code: "SO2026000101" }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ ...base, amount_vnd: "10.5" }).success).toBe(false);
  });
});
