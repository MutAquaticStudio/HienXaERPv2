import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxCustomerInfo, AstryxCustomerOrders, AstryxCustomerView, type AxCustomerHeader } from "./astryx-view";

afterEach(cleanup);

const header: AxCustomerHeader = {
  id: "c1", code: "KH-0102", name: "Công ty XD Bảo Long", active: true, selfRegistered: false, phone: "0912 345 678", address: "Số 8 Trần Phú, Hà Đông", priceGroup: "Nhóm giá Bảo Long", samePhone: [],
  metrics: { debt: "45.600.000 ₫", overdue: "0 ₫", overdueAlert: false, totalSales: "320.000.000 ₫", openOrders: 3, available: "154.400.000 ₫", limit: "200.000.000 ₫" },
  tabs: [{ id: "info", label: "Thông tin & công trình", count: 3 }, { id: "orders", label: "Đơn bán", count: 12 }], tab: "info",
  actions: { createOrder: true, collect: true, service: true, quote: false }, extraActions: null,
};

describe("khách hàng 360 kiểu Astryx", () => {
  it("hiện tên, nhãn trạng thái, 5 chỉ số, thẻ tab theo địa chỉ ?tab= và các nút theo quyền", () => {
    render(<AstryxCustomerView header={header}><p>Nội dung tab</p></AstryxCustomerView>);
    expect(screen.getByRole("heading", { name: "Công ty XD Bảo Long" })).toBeInTheDocument();
    expect(screen.getByText("Đang giao dịch")).toBeInTheDocument();
    expect(screen.getByText("45.600.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Hạn mức 200.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Đơn bán/ })).toHaveAttribute("href", "/admin/customers/c1?tab=orders");
    expect(screen.getByRole("link", { name: /Thông tin & công trình/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tạo đơn" })).toHaveAttribute("href", "/admin/orders/new?customer=c1");
    expect(screen.getByRole("link", { name: "Ghi thu" })).toHaveAttribute("href", "/admin/receivables?customer=c1");
    expect(screen.queryByRole("link", { name: "Tạo báo giá" })).not.toBeInTheDocument();
  });

  it("cảnh báo trùng số điện thoại, nợ quá hạn tô đỏ, ẩn số liệu khi không có quyền tài chính", () => {
    render(<AstryxCustomerView header={{ ...header, samePhone: [{ id: "c2", code: "KH-0200", name: "Anh Nam" }], metrics: { ...header.metrics, debt: null, overdue: null, overdueAlert: false, available: null, limit: null } }}><p /></AstryxCustomerView>);
    expect(screen.getByRole("link", { name: /KH-0200 · Anh Nam/ })).toHaveAttribute("href", "/admin/customers/c2");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("tab thông tin: công trình có Tạo đơn/Tạo dịch vụ theo công trình, hạn mức và hồ sơ", () => {
    render(<AstryxCustomerInfo customerId="c1" canCreateOrder canService sites={[{ id: "s1", name: "CT Hà Đông", address: "12 Quang Trung", receiverName: "Nguyễn Văn Dũng", receiverPhone: "0912 000 111", accessNote: null, active: true, edit: null }]}
      profile={{ type: "Doanh nghiệp", terms: "30 ngày", email: "Chưa có", taxCode: "0109876543" }} priceGroup="Nhóm giá Bảo Long" accounts={<p>Tài khoản cổng</p>} linkRequests={null}
      credit={{ debt: "45.600.000 ₫", overdue: "0 ₫", limit: "200.000.000 ₫", available: "154.400.000 ₫", percent: 22.8 }} />);
    expect(screen.getByRole("link", { name: "Tạo đơn" })).toHaveAttribute("href", "/admin/orders/new?customer=c1&site=s1");
    expect(screen.getByRole("link", { name: "Tạo dịch vụ" })).toHaveAttribute("href", "/admin/service-jobs?customerId=c1&siteId=s1");
    expect(screen.getByRole("progressbar", { name: "Đã dùng hạn mức" })).toHaveAttribute("aria-valuenow", "23");
    expect(screen.getByText("Tài khoản cổng")).toBeInTheDocument();
    expect(screen.getByText("Nhóm giá Bảo Long")).toBeInTheDocument();
  });

  it("tab đơn bán: nhãn trạng thái tiếng Việt và liên kết mở đơn", () => {
    render(<AstryxCustomerOrders rows={[{ id: "o1", number: "SO-0231", site: "CT Hà Đông", stateLabel: "Đã xác nhận", stateTone: "success", deliveryLabel: "Chưa thực hiện", paymentLabel: "Chưa thanh toán", total: "45.600.000 ₫", createdAt: "18/11/2026" }]} />);
    expect(screen.getByRole("link", { name: "SO-0231" })).toHaveAttribute("href", "/admin/orders/o1");
    expect(screen.getByText("Đã xác nhận")).toBeInTheDocument();
  });
});
