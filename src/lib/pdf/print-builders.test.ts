import { describe, expect, it } from "vitest";

import { bankTransferNote } from "@/modules/finance/transfer-note";
import { debtStatementPrint, deliveryPrint, paymentPrint, salesDebt, salesPrint } from "./print-builders";

const company = { name: "Hiền Xa", lines: [] };
const printedAt = "2026-11-03T02:05:00Z";
const bank = { bankName: "Vietcombank", accountNumber: "0123456789", holder: "HIEN XA", prefix: "SEVQR" };
const order = { id: "o1", order_number: "SO-2026-000080", commercial_state: "CONFIRMED", customer_name_snapshot: "An Phát", site_name_snapshot: "Mỹ Đình",
  delivery_address_snapshot: "Số 25", created_at: "2026-11-03T02:00:00Z", requested_delivery_at: null, total_vnd: "10000000", receiver_name_snapshot: null,
  receiver_phone_snapshot: null, commercial_terms: null };
const line = { line_number: 1, material_name_snapshot: "Xi măng", quantity: "100", unit: "bao", unit_price_vnd: "100000", line_total_vnd: "10000000" };
const debt = (id: string, salesOrderId: string | null, outstanding: string, original = outstanding) => ({ id, sales_order_id: salesOrderId, outstanding_amount_vnd: outstanding,
  original_amount_vnd: original, due_date: "2026-10-20", state: "OPEN", site_name: null, recorded_at: "2026-10-05T00:00:00Z" });

describe("D52 printed documents", () => {
  it("writes the transfer note SePay matches (prefix, order code or TT, customer code)", () => {
    expect(bankTransferNote("sevqr", "SO-2026-000080", "kh01")).toBe("SEVQR SO2026000080 KH01");
    expect(bankTransferNote(null, null, "KH-01")).toBe("TT KH01");
  });

  it("owes the order less what was paid ahead before delivery, and the open debt plus the undelivered part after", () => {
    expect(salesDebt(order, 2_000_000n, [debt("r0", "other", "3500000")])).toEqual({ total: 10_000_000n, paid: 2_000_000n, owed: 8_000_000n, previous: 3_500_000n, all: 11_500_000n });
    // 6 000 000 delivered, 1 000 000 of it still open, 4 000 000 not delivered yet.
    expect(salesDebt(order, 0n, [debt("r1", "o1", "1000000", "6000000")])).toMatchObject({ owed: 5_000_000n, paid: 5_000_000n, previous: 0n });
  });

  it("prints the order with old debt, total debt and a QR for what is owed; a draft has no QR", () => {
    const input = salesPrint({ paper: "A4", company, printedAt, order, lines: [line], customer: { code: "KH01", phone: null }, seller: null, prepaidVnd: 0n,
      debts: [debt("r0", null, "500000")], bank, qrImage: new Uint8Array([1]) });
    expect(input.totals?.map((row) => [row.label, row.value])).toEqual([["Tổng tiền hàng", expect.stringMatching(/10\.000\.000/)], ["Tổng thanh toán", expect.stringMatching(/10\.000\.000/)],
      ["Còn phải trả", expect.stringMatching(/10\.000\.000/)], ["Nợ cũ", expect.stringMatching(/500\.000/)], ["Tổng nợ", expect.stringMatching(/10\.500\.000/)]]);
    expect(input.qr?.caption).toContain("Nội dung: SEVQR SO2026000080 KH01");
    expect(input.info).toContainEqual({ label: "Mã KH", value: "KH01" });
    const draft = salesPrint({ paper: "K80", company, printedAt, order: { ...order, commercial_state: "DRAFT" }, lines: [line], customer: null, seller: null, prepaidVnd: 0n, debts: null, bank, qrImage: null });
    expect(draft.title).toBe("ĐƠN BÁN HÀNG (NHÁP)");
    expect(draft.qr).toBeNull();
    expect(draft.totals?.map((row) => row.label)).toEqual(["Tổng tiền hàng", "Tổng thanh toán"]);
    expect(draft.items).toEqual([expect.objectContaining({ name: "Xi măng", quantity: "100", unit: "bao", amount: "10.000.000" })]);
  });

  it("leaves the received quantity blank on a delivery note until it is verified", () => {
    const note = { delivery_number: "DL-041", execution_state: "ASSIGNED", result_kind: null, customer_name_snapshot: "An Phát", site_name_snapshot: "Mỹ Đình",
      delivery_address_snapshot: "Số 25", receiver_name_snapshot: "Anh Nam", receiver_phone_snapshot: null, created_at: printedAt, scheduled_at: null, verified_at: null };
    const lines = [{ material_name_snapshot: "Xi măng", unit: "bao", planned_base_quantity: "50", accepted_base_quantity: "48" }];
    expect(deliveryPrint({ paper: "A4", company, printedAt, delivery: note, lines, orderNumber: "SO-1", driver: null, customerPhone: null }).rows[0]).toMatchObject({ planned: "50", accepted: "" });
    expect(deliveryPrint({ paper: "A4", company, printedAt, delivery: { ...note, verified_at: printedAt }, lines, orderNumber: null, driver: null, customerPhone: null }).rows[0].accepted).toBe("48");
  });

  it("names each debt a receipt paid by its document, never by an internal id", () => {
    const input = paymentPrint({ paper: "A5", company, printedAt, customerCode: "KH01", outstandingVnd: "100000",
      payment: { payment_number: "REC-075", direction: "RECEIPT", counterparty_name: "An Phát", account_name: "Vietcombank", account_code: "VCB", account_kind: "BANK",
        amount_vnd: "5000000", advance_amount_vnd: "0", method: "BANK_TRANSFER", effective_at: printedAt, posting_state: "POSTED", reversal_of_payment_id: null, external_reference: null },
      allocations: [{ label: "Giao hàng DL-041 · Đơn SO-2026-000080", due_date: "2026-11-18", amount_vnd: "5000000" }] });
    expect(input.title).toBe("PHIẾU THU");
    expect(input.info).toContainEqual({ label: "Người nộp tiền", value: "An Phát (KH01)" });
    expect(input.info).toContainEqual({ label: "Hình thức", value: "Chuyển khoản · Vietcombank" });
    expect(JSON.stringify(input.rows)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(input.totals?.map((row) => row.label)).toEqual(["Số tiền thu", "Công nợ hiện tại"]);
    expect(input.signatures).toEqual(["Người nộp tiền", "Người thu tiền", "Kế toán"]);
  });

  it("totals the debt statement with its overdue part and a QR for the whole balance", () => {
    const input = debtStatementPrint({ paper: "A4", company, printedAt, asOf: "2026-11-03", bank, qrImage: null,
      customer: { code: "KH01", display_name: "An Phát", phone: null, address_text: null },
      rows: [{ label: "Nợ đầu kỳ", site_name: null, recorded_at: null, due_date: "2026-10-01", outstanding_amount_vnd: "300000", overdue: true },
        { label: "Giao hàng DL-041", site_name: "Mỹ Đình", recorded_at: printedAt, due_date: "2026-11-18", outstanding_amount_vnd: "700000", overdue: false }] });
    expect(input.totals?.map((row) => [row.label, row.value])).toEqual([["Tổng công nợ", expect.stringMatching(/1\.000\.000/)], ["Trong đó quá hạn", expect.stringMatching(/300\.000/)]]);
    expect(input.qr?.caption).toContain("Nội dung: SEVQR TT KH01");
    expect(input.rows[0].label).toBe("Nợ đầu kỳ (quá hạn)");
  });
});
