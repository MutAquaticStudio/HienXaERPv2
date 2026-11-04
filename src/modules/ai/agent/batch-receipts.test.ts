// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkReceiptRows, receiptInstant, receiptsFromTransfers, type ReceiptInputs } from "./batch-receipts";

const now = Date.parse("2026-11-05T05:00:00Z");
const data: ReceiptInputs = {
  now, customers: [{ id: "c1", code: "KH01", display_name: "Công ty An Phát", phone: "0901234567" }, { id: "c2", code: "KH02", display_name: "Chị Lan", phone: null }],
  debts: [{ id: "d1", customer_id: "c1", outstanding: "1000000" }, { id: "d2", customer_id: "c1", outstanding: "500000" }],
  paid: [{ payment_number: "REC-202611-0007", customer_id: "c2", amount_vnd: "700000", effective_at: "2026-11-04T09:00:00Z", external_reference: "FT26308ABC" }],
  bank: [{ amount_vnd: "2500000", transaction_at: "2026-11-04T08:00:00Z", reference_code: "FT26308XYZ", content: "KH03 thanh toan", state: "NEEDS_REVIEW" }],
};

describe("D64 Phiếu thu từ biên lai", () => {
  it("matches the customer by name or phone, clears the oldest debts first and puts the rest as an advance", () => {
    const rows = checkReceiptRows([{ khach: "an phat", so_tien: "1.200.000", ngay: "2026-11-05" }, { khach: "0901 234 567", so_tien: "800000", ngay: "2026-11-05", tham_chieu: "FT1" }], data);
    expect(rows[0]).toMatchObject({ status: "CREATE", customerId: "c1", amount: "1200000", allocations: [{ obligation_id: "d1", amount_vnd: "1000000" }, { obligation_id: "d2", amount_vnd: "200000" }], advance: "0" });
    expect(rows[1]).toMatchObject({ status: "CREATE", allocations: [{ obligation_id: "d2", amount_vnd: "300000" }], advance: "500000" });
  });

  it("skips what looks already booked (same customer, amount, day), what the bank already posted or holds for review, and repeats", () => {
    const rows = checkReceiptRows([
      { khach: "Chị Lan", so_tien: "700000", ngay: "2026-11-04", tham_chieu: "FT26308ABC" }, { khach: "KH02", so_tien: "700000", ngay: "2026-11-04" },
      { khach: "Công ty An Phát", so_tien: "2500000", ngay: "2026-11-04" }, { khach: "An Phát", so_tien: "300000", ngay: "2026-11-05", tham_chieu: "X9" }, { khach: "An Phát", so_tien: "300000", ngay: "2026-11-05", tham_chieu: "X9" },
      { khach: "Khách lạ", so_tien: "1000" }, { khach: "Chị Lan", so_tien: "abc" }, { khach: "Chị Lan", so_tien: "1000", ngay: "2027-01-01" }, { khach: "", so_tien: "1000" },
    ], data);
    expect(rows.map((row) => [row.status, row.reason ?? ""])).toEqual([
      ["SKIP", "Có thể đã ghi: phiếu REC-202611-0007 (cùng khách, số tiền, ngày)"], ["SKIP", "Có thể đã ghi: phiếu REC-202611-0007 (cùng khách, số tiền, ngày)"],
      ["SKIP", "Tiền đã về ngân hàng, đang chờ xử lý ở Giao dịch chờ xử lý; ghép khách ở đó"], ["CREATE", ""], ["SKIP", "Trùng một dòng khác trong danh sách"],
      ["SKIP", "Không tìm thấy khách này"], ["SKIP", "Số tiền chưa đúng"], ["SKIP", "Ngày trong tương lai"], ["SKIP", "Thiếu tên khách"],
    ]);
  });

  it("reads a receipt's date as Vietnam time and refuses a future one", () => {
    expect(receiptInstant("2026-11-04", "09:30", now)).toEqual({ at: "2026-11-04T02:30:00.000Z" });
    expect(receiptInstant("", "", now)).toEqual({ at: null });
    expect(receiptInstant("04/11/2026", "", now).problem).toBeTruthy();
  });

  it("posts each receipt with its own operation id and the receipt's date, and keeps the card waiting on a failed row", async () => {
    const rpc = vi.fn(async (_name: string, args: { target_customer_id: string }) => args.target_customer_id === "c2" ? { error: { message: "payment_effects_exceed_amount" } } : { error: null });
    const context = { supabase: { rpc } as never, branchId: "b1", permissions: new Set(["finance.payment.post", "finance.ar.read"]) };
    const rows = [
      { n: 1, label: "An Phát", customerId: "c1", amount: "1200000", at: "2026-11-04T02:30:00.000Z", method: "BANK_TRANSFER", reference: "FT1", allocations: [{ obligation_id: "d1", amount_vnd: "1000000" }], advance: "200000", status: "CREATE" },
      { n: 2, label: "Chị Lan", customerId: "c2", amount: "5000", at: null, method: "CASH", reference: "", allocations: [], advance: "5000", status: "CREATE" },
      { n: 3, label: "Trùng", customerId: "c1", amount: "1", at: null, method: "CASH", reference: "", allocations: [], advance: "1", status: "SKIP", reason: "Có thể đã ghi" },
    ];
    await expect(receiptsFromTransfers.execute(context, { accountId: "acc", rows }, "11111111-1111-4111-8111-111111111111")).rejects.toThrow("Đã xong 1/2 phiếu thu. Chưa làm được: dòng 2 Chị Lan (công nợ vừa thay đổi, soạn lại)");
    expect(rpc.mock.calls[0][1]).toMatchObject({ direction: "RECEIPT", target_account_id: "acc", amount_vnd: "1200000", effective_at: "2026-11-04T02:30:00.000Z", external_reference: "FT1", advance_amount_vnd: "200000" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
