import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxDeliveriesView, AstryxDeliveryFlowView, type AxDeliveryRow } from "./astryx-view";
import { AstryxDeliveryDetailView } from "./[id]/astryx-view";

afterEach(cleanup);

const row: AxDeliveryRow = { id: "d1", sales_order_id: "o1", delivery_number: "PG-0120", customer_name_snapshot: "Anh Tuấn", site_name_snapshot: "Cầu Giấy", execution_state: "PLANNED", result_kind: null, scheduled_at: null, who: "Chưa phân" };
const STATES = ["", "PLANNED", "VERIFIED"] as const;
const base = { rows: [row], lines: [{ id: "l1", delivery_id: "d1", material_name_snapshot: "Xi măng PCB40", planned_base_quantity: "750", actual_base_quantity: null, base_uom_symbol: "kg" }], states: STATES, current: "", counts: ["1", "1", "0"], q: "", page: 1, hasNext: false, canSplit: true, canCancel: true, isFiltered: false };

describe("danh sách phiếu giao kiểu Astryx", () => {
  it("hiện nhãn trạng thái tiếng Việt, bộ lọc là liên kết và liên kết mở phiếu", () => {
    render(<AstryxDeliveriesView {...base} />);
    expect(screen.getByRole("heading", { name: "Phiếu giao" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PG-0120" })).toHaveAttribute("href", "/admin/deliveries/d1");
    expect(screen.getByRole("radio", { name: /Chờ phân giao/ })).toHaveAttribute("href", "/admin/deliveries?state=PLANNED");
    expect(screen.getByText("Chưa phân")).toBeInTheDocument();
  });

  it("xem nhanh mở hàng trên phiếu, có Tách phiếu / Hủy kế hoạch khi đủ quyền", () => {
    render(<AstryxDeliveriesView {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem nhanh PG-0120" }));
    expect(screen.getByText(/Xi măng PCB40/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tách phiếu" })).toHaveAttribute("href", "/admin/deliveries/d1/split");
    expect(screen.getByRole("link", { name: "Hủy kế hoạch" })).toHaveAttribute("href", "/admin/deliveries/d1/cancel");
  });

  it("ẩn Tách / Hủy khi thiếu quyền và hiện trạng thái trống", () => {
    const { unmount } = render(<AstryxDeliveriesView {...base} canSplit={false} canCancel={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem nhanh PG-0120" }));
    expect(screen.queryByRole("link", { name: "Tách phiếu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Hủy kế hoạch" })).not.toBeInTheDocument();
    unmount();
    render(<AstryxDeliveriesView {...base} rows={[]} isFiltered q="zzz" />);
    expect(screen.getByText("Không có phiếu giao phù hợp.")).toBeInTheDocument();
  });
});

describe("chi tiết phiếu giao kiểu Astryx", () => {
  it("giữ phần thao tác của Classic bên trong và hiện tóm tắt trạng thái", () => {
    render(<AstryxDeliveryDetailView number="PG-0120" customer="Anh Tuấn" site="Cầu Giấy" orderId="o1" deliveryId="d1" stateLabel="Chờ phân giao" stateTone="warning" resultLabel={null}
      sourceLabels={["Từ kho"]} canSplit cancellable><button type="submit">Lưu người nhận</button></AstryxDeliveryDetailView>);
    expect(screen.getByRole("heading", { name: "PG-0120" })).toBeInTheDocument();
    expect(screen.getByText("Chờ phân giao")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu người nhận" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tách phiếu" })).toHaveAttribute("href", "/admin/deliveries/d1/split");
    expect(screen.getByRole("link", { name: "Mở đơn bán" })).toHaveAttribute("href", "/admin/orders/o1");
    expect(screen.getByRole("link", { name: "Tải phiếu giao" })).toHaveAttribute("href", "/api/deliveries/d1/note/pdf");
  });

  it("khung một bước (tách / hủy) có liên kết về phiếu và đơn", () => {
    render(<AstryxDeliveryFlowView number="PG-0120" title="Hủy kế hoạch giao hàng" subtitle="PG-0120 · Anh Tuấn" orderId="o1" deliveryId="d1"><p>Nội dung</p></AstryxDeliveryFlowView>);
    expect(screen.getByRole("link", { name: "Về phiếu giao" })).toHaveAttribute("href", "/admin/deliveries/d1");
    expect(screen.getByRole("link", { name: "Về đơn bán" })).toHaveAttribute("href", "/admin/orders/o1");
  });
});
