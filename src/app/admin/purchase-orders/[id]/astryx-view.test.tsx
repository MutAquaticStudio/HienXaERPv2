import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxPurchaseOrderDetail, type AxPoOrder } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));

const order: AxPoOrder = { id: "p1", purchase_order_number: "PO-0087", supplier_name_snapshot: "Thép Hòa Phát", destination_type: "WAREHOUSE", destination_name_snapshot: "Kho Đại Mỗ", destination_address_snapshot: "Đại Mỗ, Hà Nội", source_sales_order_id: "so1", state: "CONFIRMED", expected_at: null, total_cost_vnd: "148500000" };
const base = { order, lines: [{ id: "l1", material_name_snapshot: "Thép cuộn phi 16", quantity: "540", symbol: "cây", unit_cost_vnd: "168000", line_total_cost_vnd: "90720000", allocationText: "Chưa gắn dòng bán", progress: { received: "300", supplier: "0" } }],
  receipts: [{ id: "r1", receipt_number: "NH-0211", received_at: "2026-11-18T01:00:00Z", received_base_quantity: "300", payable_amount_vnd: "50400000" }], fulfillments: [], payable: "50.400.000 ₫", terms: null,
  canReadSales: true, canReturn: true, canEvidence: false, evidence: null, actions: <button type="submit">Xác nhận nhận hàng</button>, nextSteps: null, recovery: null };

describe("chi tiết đơn mua kiểu Astryx", () => {
  it("hiện nhãn trạng thái thật, tiến độ nhận và khối hành động Classic nguyên vẹn", () => {
    render(<AstryxPurchaseOrderDetail {...base} />);
    expect(screen.getByRole("heading", { name: "PO-0087" })).toBeInTheDocument();
    expect(screen.getAllByText("Đang nhận hàng").length).toBeGreaterThan(0);
    expect(screen.getByText("Đã ghi đủ nguồn nhận")).toBeInTheDocument();
    expect(screen.getByText("300/540 cây")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xác nhận nhận hàng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở đơn bán" })).toHaveAttribute("href", "/admin/orders/so1");
    expect(screen.getByRole("link", { name: "Trả hàng" })).toHaveAttribute("href", "/admin/purchases/returns/new?receipt=r1");
    expect(screen.getByRole("link", { name: "Tải PDF đơn mua" })).toHaveAttribute("href", "/api/purchase-orders/p1/pdf");
  });

  it("ẩn liên kết đơn bán / trả hàng khi thiếu quyền và ghi rõ giá ẩn", () => {
    render(<AstryxPurchaseOrderDetail {...base} canReadSales={false} canReturn={false} order={{ ...order, total_cost_vnd: null }} lines={[{ ...base.lines[0], unit_cost_vnd: null, line_total_cost_vnd: null }]} />);
    expect(screen.queryByRole("link", { name: "Mở đơn bán" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trả hàng" })).not.toBeInTheDocument();
    expect(screen.getByText("Không có quyền xem đơn bán")).toBeInTheDocument();
    expect(screen.getByText("Không có quyền xem")).toBeInTheDocument();
    expect(screen.getAllByText("Ẩn theo quyền").length).toBe(2);
  });
});
