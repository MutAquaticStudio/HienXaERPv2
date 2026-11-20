import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxOrdersView, type AxOrderRow } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));

const STATES = [{ value: "", label: "Đang làm việc" }, { value: "DRAFT", label: "Nháp" }, { value: "ALL", label: "Tất cả" }] as const;
const order: AxOrderRow = { id: "o1", order_number: "SO-0231", sales_owner_employee_id: null, customer_name_snapshot: "Công ty XD Bảo Long", site_name_snapshot: "CT Hà Đông",
  commercial_state: "CONFIRMED", fulfillment_state: "NOT_STARTED", payment_state: "UNPAID", total_vnd: "45600000", requested_delivery_at: null, created_at: "2026-11-18T03:00:00Z" };
const base = { states: STATES, current: "", counts: ["1", "0", "1"], query: "", sellers: [], sellerValue: "", dates: { createdFrom: "", createdTo: "", deliveryFrom: "", deliveryTo: "" }, canCreate: true, sellerName: () => undefined, isFiltered: false };

describe("danh sách đơn bán kiểu Astryx", () => {
  it("hiện khách, giá trị VND, nhãn trạng thái tiếng Việt và bộ lọc dạng liên kết có số đếm", () => {
    render(<AstryxOrdersView {...base} rows={[order]} lines={[{ sales_order_id: "o1", line_number: 1, material_name_snapshot: "Xi măng PC40", quantity: "100", line_total_vnd: "9200000", symbol: "bao" }]} />);
    expect(screen.getByRole("heading", { name: "Đơn bán" })).toBeInTheDocument();
    expect(screen.getAllByText("Công ty XD Bảo Long").length).toBeGreaterThan(0);
    expect(screen.getByText(/45\.600\.000/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Nháp/ })).toHaveAttribute("href", "/admin/orders?state=DRAFT");
    expect(screen.getByRole("link", { name: /Tạo đơn bán/ })).toHaveAttribute("href", "/admin/orders/new");
  });

  it("mũi tên Xem nhanh mở danh sách hàng ngay dưới dòng (aria-expanded)", () => {
    render(<AstryxOrdersView {...base} rows={[order]} lines={[{ sales_order_id: "o1", line_number: 1, material_name_snapshot: "Xi măng PC40", quantity: "100", line_total_vnd: "9200000", symbol: "bao" }]} />);
    const toggle = screen.getByRole("button", { name: "Xem nhanh SO-0231" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Xi măng PC40/)).toBeInTheDocument();
  });

  it("ẩn nút tạo đơn với người chỉ đọc và hiện trạng thái trống có nút xóa lọc", () => {
    render(<AstryxOrdersView {...base} rows={[]} lines={[]} canCreate={false} isFiltered query="zzz" />);
    expect(screen.queryByRole("link", { name: /Tạo đơn bán/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Không có đơn bán phù hợp/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Xóa/ }).length).toBeGreaterThan(0);
  });
});
