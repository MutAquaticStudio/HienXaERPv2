import { describe, expect, it } from "vitest";

import { debtReminderMessage, deliveryDoneMessage, orderConfirmedMessage, paymentReceivedMessage, zaloChatLink } from "./customer-messages";

describe("D51: the texts staff send the customer by Zalo", () => {
  it("opens the customer's Zalo chat only for a Vietnamese mobile number", () => {
    expect(zaloChatLink("0912 345 678")).toBe("https://zalo.me/0912345678");
    expect(zaloChatLink("+84 912-345-678")).toBe("https://zalo.me/0912345678");
    expect(zaloChatLink("84912345678")).toBe("https://zalo.me/0912345678");
    expect(zaloChatLink("024 3555 1234")).toBeNull();
    expect(zaloChatLink(null)).toBeNull();
  });

  it("confirms an order with its lines, total, prepayment, place and time", () => {
    const text = orderConfirmedMessage({ company: "VLXD Hiền Xa", orderNumber: "SO-2026-000080", customerName: "Công ty An Phát", siteName: "Đại Mỗ",
      address: "Số 1 Đại Mỗ", lines: [{ name: "Xi măng PCB40", quantity: "20", unit: "bao" }], totalVnd: "1900000", prepaidVnd: "500000",
      deliveryAt: "2026-11-04T01:00:00Z" });
    expect(text.split("\n")[0]).toBe("Xác nhận đơn hàng SO-2026-000080 — VLXD Hiền Xa");
    expect(text).toContain("• Xi măng PCB40: 20 bao");
    expect(text).toMatch(/Tổng tiền: 1\.900\.000/);
    expect(text).toMatch(/Đã trả trước: 500\.000.*Còn lại: 1\.400\.000/);
    expect(text).toContain("Giao tới: Đại Mỗ — Số 1 Đại Mỗ");
    expect(text).toMatch(/Dự kiến giao: .*04\/11\/2026/);
    expect(orderConfirmedMessage({ company: null, orderNumber: "SO-1", customerName: "A", siteName: "B", address: "C", lines: [], totalVnd: "0", deliveryAt: null }))
      .toContain("Ngày giao: cửa hàng sẽ báo sau");
  });

  it("reports a delivery with what was received, and says when the rest comes later", () => {
    const text = deliveryDoneMessage({ company: null, deliveryNumber: "DL-041", customerName: "An Phát", siteName: "Đại Mỗ", deliveredAt: "2026-11-03T03:00:00Z",
      receiver: "Anh Nam", lines: [{ name: "Cát vàng", quantity: "5", unit: "m³" }], partial: true });
    expect(text.split("\n")[0]).toBe("Đã giao hàng DL-041");
    expect(text).toMatch(/Cửa hàng đã giao tới Đại Mỗ lúc .*, người nhận: Anh Nam\./);
    expect(text).toContain("• Cát vàng: 5 m³");
    expect(text).toContain("Phần còn lại cửa hàng sẽ liên hệ giao sau.");
  });

  it("confirms a payment and the debt still open", () => {
    const text = paymentReceivedMessage({ company: "Hiền Xa", paymentNumber: "REC-075", customerName: "An Phát", amountVnd: "2000000", paidAt: "2026-11-03T03:00:00Z", outstandingVnd: "300000" });
    expect(text).toMatch(/Cửa hàng đã nhận 2\.000\.000.*ngày 03\/11\/2026 \(phiếu thu REC-075\)\./);
    expect(text).toMatch(/Công nợ hiện tại của quý khách: 300\.000/);
    expect(paymentReceivedMessage({ company: null, paymentNumber: "R", customerName: "A", amountVnd: "1", paidAt: "2026-11-03T03:00:00Z", outstandingVnd: "0" }))
      .toContain("Hiện quý khách không còn công nợ.");
  });

  it("reminds of the debt oldest due first, with the overdue part and the transfer details SePay matches", () => {
    const text = debtReminderMessage({ company: null, customerName: "An Phát", transferNote: "TT KH01",
      bank: { bankName: "Vietcombank", accountNumber: "0123456789", holder: "CONG TY HIEN XA" },
      items: [
        { label: "Giao hàng · Đại Mỗ", dueDate: "2026-11-10", outstandingVnd: "1000000", overdue: false },
        { label: "Giao hàng · Mỹ Đình", dueDate: "2026-10-20", outstandingVnd: "500000", overdue: true },
        { label: "Đã trả", dueDate: "2026-10-01", outstandingVnd: "0", overdue: false },
      ] });
    expect(text).toMatch(/Công nợ hiện tại: 1\.500\.000.*, trong đó đã quá hạn: 500\.000/);
    const rows = text.split("\n").filter((line) => line.startsWith("• "));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/Mỹ Đình — hạn 20\/10\/2026: 500\.000.*\(quá hạn\)/);
    expect(text).toContain("Chuyển khoản: Vietcombank · 0123456789 · CONG TY HIEN XA · Nội dung: TT KH01");
  });
});
