import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxPurchaseOrdersView, type AxPurchaseRow } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));

const STATES = [{ value: "", label: "Đang làm việc" }, { value: "DRAFT", label: "Chờ nhận hàng" }, { value: "CLOSED", label: "Đã hoàn tất" }, { value: "ALL", label: "Tất cả" }] as const;
const order: AxPurchaseRow = { id: "p1", purchase_order_number: "PO-0087", supplier_name_snapshot: "Thép Hòa Phát", destination_type: "WAREHOUSE", destination_name_snapshot: "Kho Đại Mỗ", source_sales_order_id: null, state: "CONFIRMED", expected_at: null, total_cost_vnd: "148500000" };
const base = { states: STATES, current: "", counts: ["1", "0", "0", "1"], query: "", suppliers: [{ id: "s1", name: "Thép Hòa Phát", active: true }, { id: "s2", name: "NCC cũ", active: false }], supplierValue: "",
  dates: { createdFrom: "", createdTo: "", deliveryFrom: "", deliveryTo: "" }, canCreate: true, canReadPrice: true, isFiltered: false, page: 1, total: 1,
  sent: { p1: { applicable: true, text: "" } }, lines: [{ purchase_order_id: "p1", id: "l1", material_name_snapshot: "Thép cuộn phi 16", quantity: "540", symbol: "cây", line_total_cost_vnd: "90720000" }] };

describe("danh sách đơn mua kiểu Astryx", () => {
  it("dùng nhãn purchaseStateLabel thật, liên kết lọc có số đếm và nút tạo đơn", () => {
    render(<AstryxPurchaseOrdersView {...base} rows={[order]} />);
    expect(screen.getByRole("heading", { name: "Đơn mua" })).toBeInTheDocument();
    expect(screen.getAllByText("Đang nhận hàng").length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /Đã ghi đủ nguồn nhận/ })).toHaveAttribute("href", "/admin/purchase-orders?state=CLOSED");
    expect(screen.getByRole("radio", { name: /Chờ nhận hàng/ })).toBeInTheDocument();
    expect(screen.getByText("Chưa gửi")).toBeInTheDocument();
    expect(screen.getByText(/148\.500\.000/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tạo đơn mua/ })).toHaveAttribute("href", "/admin/purchase-orders/new");
    expect(screen.getByRole("option", { name: "NCC cũ (ngừng)" })).toBeInTheDocument();
  });

  it("Xem nhanh mở hàng hóa; ẩn giá và nút tạo khi thiếu quyền", () => {
    render(<AstryxPurchaseOrdersView {...base} rows={[order]} canCreate={false} canReadPrice={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem nhanh PO-0087" }));
    expect(screen.getByText(/Thép cuộn phi 16 · 540 cây/)).toBeInTheDocument();
    expect(screen.queryByText(/148\.500\.000/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tạo đơn mua/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở đơn mua" })).toHaveAttribute("href", "/admin/purchase-orders/p1");
  });

  it("trạng thái trống khi đang lọc có nút xóa bộ lọc", () => {
    render(<AstryxPurchaseOrdersView {...base} rows={[]} lines={[]} sent={{}} total={0} isFiltered query="zzz" />);
    expect(screen.getByText("Không có đơn mua phù hợp.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Xóa/ }).length).toBeGreaterThan(0);
  });
});
