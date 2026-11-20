import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxCashbookView } from "./astryx-view";

afterEach(cleanup);

const base = {
  notice: null, headerActions: <button type="button">Lập phiếu thu</button>,
  totals: { opening: "412.900.000 ₫", openingNote: "Trước 01/11/2026", receipts: "186.400.000 ₫", disbursements: "74.250.000 ₫", closing: "525.050.000 ₫", closingNote: "Đến hết 20/11/2026", net: "525.050.000 ₫", unmatched: 2, accounts: 2, advances: 1 },
  tabs: [{ href: "/admin/cashbook", label: "Tổng quỹ", active: true }, { href: "/admin/cashbook?account=a1", label: "Ngân hàng · VCB", active: false }],
  bank: null, bankDialogs: null, cashWaiting: [], bankLines: [], presets: [{ href: "/admin/cashbook?from=2026-11-20&to=2026-11-20", label: "Hôm nay", active: false }],
  filter: { from: "2026-11-01", to: "2026-11-20", account: "", direction: "", accounts: [{ id: "a1", label: "VCB · Vietcombank" }] },
  payments: [{ id: "p1", payment_number: "PT-0215", direction: "RECEIPT", counterparty_name: "Anh Dũng", account_code: "VCB", amountText: "30.760.000 ₫", dateText: "20/11/2026", reversalOf: false, reversed: false, reconciliationLabel: "Chưa đối soát", differenceText: "0 ₫", actions: <button type="button">Xử lý</button> }],
  paymentCount: 23, pager: { page: 1, total: 1, hasNext: false, params: {} }, exportButton: null, nonCash: [], nonCashTotal: "0 ₫", filtered: false,
};

describe("sổ quỹ kiểu Astryx", () => {
  it("hiện tổng thu / tổng chi, tab quỹ, giao dịch và liên kết in phiếu", () => {
    render(<AstryxCashbookView {...base} />);
    expect(screen.getByRole("heading", { name: "Sổ quỹ" })).toBeInTheDocument();
    expect(screen.getByText("Tổng thu trong kỳ")).toBeInTheDocument();
    expect(screen.getByText("186.400.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Tổng chi trong kỳ")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ngân hàng · VCB" })).toHaveAttribute("href", "/admin/cashbook?account=a1");
    expect(screen.getByRole("link", { name: "In phiếu thu" })).toHaveAttribute("href", "/api/payments/p1/voucher/pdf");
    expect(screen.getByRole("link", { name: "In phiếu thu khổ K80" })).toHaveAttribute("href", "/api/payments/p1/voucher/pdf?kho=k80");
    expect(screen.getByRole("button", { name: "Xử lý" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lập phiếu thu" })).toBeInTheDocument();
  });

  it("hiện thông tin chuyển khoản/SePay, chờ thu tiền mặt và giao dịch ngân hàng chờ xử lý có lý do tiếng Việt", () => {
    render(<AstryxCashbookView {...base} bank={{ name: "VCB", bank_name: "Vietcombank", number: "0011", holder: "Cửa hàng Hiền Xa", shown: true, feed: true }} bankDialogs={<button type="button">Tự ghi tiền về (SePay)</button>}
      cashWaiting={[{ id: "c1", code: "YC-01", customerId: "k1", customerName: "Cô Hoa", customerCode: "KH01", createdText: "19/11/2026", amountText: "8.750.000 ₫", receivedText: "0 ₫", confirm: <button type="button">Xác nhận đã thu</button> }]}
      bankLines={[{ id: "b1", dateText: "20/11/2026", gateway: "VCB", content: "CK tien hang", requestCode: null, amountText: "5.000.000 ₫", reason: "Nội dung không có mã đơn hoặc mã khách", resolve: <button type="button">Xử lý tiền về</button> }]} />);
    expect(screen.getByText("Hiện cho khách")).toBeInTheDocument();
    expect(screen.getByText("Tự ghi tiền về (SePay)", { selector: "span, .astryx-badge *" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cô Hoa" })).toHaveAttribute("href", "/admin/customers/k1?tab=debts");
    expect(screen.getByRole("button", { name: "Xác nhận đã thu" })).toBeInTheDocument();
    expect(screen.getByText("Nội dung không có mã đơn hoặc mã khách")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xử lý tiền về" })).toBeInTheDocument();
  });

  it("trạng thái trống khi lọc", () => {
    render(<AstryxCashbookView {...base} payments={[]} filtered />);
    expect(screen.getByText("Không có giao dịch phù hợp bộ lọc.")).toBeInTheDocument();
  });
});
