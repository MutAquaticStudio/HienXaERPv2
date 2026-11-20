import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxPayablesView, type AxPayableRow } from "./astryx-view";
import { AstryxPayableDetailView } from "./[id]/astryx-view";

afterEach(cleanup);

const row: AxPayableRow = { id: "p1", supplier_id: "s1", supplier_name: "Thép Hòa Phát", source_label: "PN-0199", original_amount_vnd: "60000000", outstanding_amount_vnd: "60000000", due_date: "2026-12-05", recorded_at: "2026-11-05T03:00:00Z", state: "OPEN" };
const base = { rows: [row], q: "", state: "", page: 1, hasNext: false, permissions: { has: () => true }, notice: null };

describe("phải trả kiểu Astryx", () => {
  it("hiện tab, khoản còn hạn và liên kết chi tiết / ghi chi", () => {
    render(<AstryxPayablesView {...base}><p>khối</p></AstryxPayablesView>);
    expect(screen.getByRole("heading", { name: "Công nợ phải trả" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Phải trả nhà cung cấp/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Còn hạn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chi tiết" })).toHaveAttribute("href", "/admin/payables/p1");
    expect(screen.getByRole("link", { name: "Ghi chi" })).toHaveAttribute("href", "/admin/payables?supplier=s1");
  });

  it("giữ biểu mẫu ghi chi của Classic khi chọn nhà cung cấp", () => {
    render(<AstryxPayablesView {...base} supplierId="s1" selectedName="Thép Hòa Phát"><button type="submit">Ghi chi</button></AstryxPayablesView>);
    expect(screen.getByRole("button", { name: "Ghi chi" })).toBeInTheDocument();
  });

  it("chi tiết: nguồn đơn mua và biểu mẫu điều chỉnh theo quyền", () => {
    const detail = { id: "p1", supplier_name: "Thép Hòa Phát", source_label: "PN-0199", source_id: "x", purchase_order_id: "po1", expense_id: null, original_amount_vnd: "60000000", adjustment_amount_vnd: "0", allocated_amount_vnd: "0", outstanding_amount_vnd: "60000000", due_date: "2026-12-05", state: "OPEN" };
    const props = { row: detail, allocations: [], adjustments: [], adjustAction: () => undefined, operationId: "op", notice: null };
    const { unmount } = render(<AstryxPayableDetailView {...props} canAdjust />);
    expect(screen.getByRole("link", { name: "Mở đơn mua và tình trạng nhận hàng" })).toHaveAttribute("href", "/admin/purchase-orders/po1");
    expect(screen.getByRole("button", { name: "Ghi điều chỉnh" })).toBeInTheDocument();
    unmount();
    render(<AstryxPayableDetailView {...props} canAdjust={false} />);
    expect(screen.queryByRole("button", { name: "Ghi điều chỉnh" })).not.toBeInTheDocument();
  });
});
