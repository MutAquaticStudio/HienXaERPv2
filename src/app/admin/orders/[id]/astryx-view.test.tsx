import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxOrderDetailView, orderFlow, type AxOrderDetailProps } from "./astryx-view";

afterEach(cleanup);

const base: AxOrderDetailProps = {
  id: "o1", number: "SO-0231", customer: "Công ty XD Bảo Long", site: "CT Hà Đông", address: "12 Quang Trung, Hà Đông", requestedAt: "20/11/2026 08:00", quotationRevisionId: null,
  commercial: { label: "Đã xác nhận", tone: "success" }, fulfillmentLabel: "Chưa thực hiện", paymentLabel: "Chưa thanh toán", flow: { steps: ["Bản nháp", "Đã xác nhận", "Đang giao", "Hoàn tất"], at: 1 },
  fromPortal: false, isDraft: false, portalNote: null, seller: "Phạm Quang Huy", discount: null, totalLabel: "Tổng đơn", total: "45.600.000 ₫", prepaid: null,
  lines: [{ id: "l1", name: "Xi măng PC40", quantity: "200 bao", unitPrice: "92.000 ₫", listNote: null, total: "18.400.000 ₫", priceSource: "Giá chung", source: <span>Đủ nguồn</span> }],
  deliveries: [{ id: "d1", number: "PG-0118", stateLabel: "Đã phân giao" }], 
  slots: { print: null, notices: null, photos: null, approve: null, cancelBanner: null, primary: [<a key="e" href="/x">Sửa bản nháp</a>], secondary: [], danger: [<button key="c" type="button">Hủy đơn</button>], notes: [] },
};

describe("chi tiết đơn bán kiểu Astryx", () => {
  it("hiện mã đơn, khách, dòng hàng, tổng tiền VND, phiếu giao và hành động", () => {
    render(<AstryxOrderDetailView {...base} />);
    expect(screen.getByRole("heading", { name: "SO-0231" })).toBeInTheDocument();
    expect(screen.getAllByText("Công ty XD Bảo Long").length).toBeGreaterThan(0);
    expect(screen.getByText("Xi măng PC40")).toBeInTheDocument();
    expect(screen.getByText("45.600.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PG-0118" })).toHaveAttribute("href", "/admin/deliveries/d1");
    expect(screen.getByRole("link", { name: "Về danh sách" })).toHaveAttribute("href", "/admin/orders");
    expect(screen.getByRole("button", { name: "Hủy đơn" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Tiến trình đơn bán" })).toBeInTheDocument();
  });

  it("đơn khách tự đặt chờ duyệt có băng Chờ duyệt với nút Duyệt và Hủy, kèm ghi chú của khách", () => {
    render(<AstryxOrderDetailView {...base} fromPortal isDraft commercial={{ label: "Bản nháp", tone: "warning" }} flow={orderFlow("DRAFT", "NOT_STARTED", true)}
      portalNote="Giao trước 10:00" slots={{ ...base.slots, approve: <button type="button">Duyệt đơn</button>, cancelBanner: <button type="button">Hủy đơn</button>, danger: [] }} />);
    expect(screen.getByText(/đang chờ văn phòng duyệt/)).toBeInTheDocument();
    expect(screen.getByText(/Giao trước 10:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt đơn" })).toBeInTheDocument();
    expect(screen.getByText("Khách đặt · Chờ duyệt")).toBeInTheDocument();
  });

  it("hiện giảm giá và khoản khách trả trước khi có", () => {
    render(<AstryxOrderDetailView {...base} discount="600.000 ₫" totalLabel="Khách cần trả" prepaid={{ paid: "10.000.000 ₫", receipts: "PT-001 · Chuyển khoản", remaining: "35.000.000 ₫" }} />);
    expect(screen.getByText("−600.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Khách cần trả")).toBeInTheDocument();
    expect(screen.getByText("Còn phải trả")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sổ quỹ" })).toHaveAttribute("href", "/admin/cashbook");
  });
});

describe("orderFlow", () => {
  it("lấy bước theo trạng thái thật của đơn", () => {
    expect(orderFlow("CANCELLED", "NOT_STARTED", false)).toBeNull();
    expect(orderFlow("DRAFT", "NOT_STARTED", false)?.at).toBe(0);
    expect(orderFlow("DRAFT", "NOT_STARTED", true)?.steps[1]).toBe("Chờ duyệt");
    expect(orderFlow("CONFIRMED", "NOT_STARTED", false)?.at).toBe(1);
    expect(orderFlow("CONFIRMED", "PARTIAL", false)?.at).toBe(2);
    expect(orderFlow("CONFIRMED", "FULFILLED", false)?.at).toBe(4);
  });
});
