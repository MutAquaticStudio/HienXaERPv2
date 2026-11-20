import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxReceivablesView, type AxReceivableRow } from "./astryx-view";
import { AstryxReceivableDetailView } from "./[id]/astryx-view";

afterEach(cleanup);

const row: AxReceivableRow = { id: "r1", customer_id: "c1", customer_name: "Anh Nam", site_name: "CT Từ Liêm", source_label: "SO-0185", original_amount_vnd: "30000000", outstanding_amount_vnd: "20000000", due_date: "2026-11-02", recorded_at: "2026-10-20T03:00:00Z", state: "OVERDUE" };
const perms = { has: () => true };
const base = { rows: [row], q: "", state: "", page: 1, hasNext: false, permissions: perms, notice: null };

describe("phải thu kiểu Astryx", () => {
  it("hiện tab Phải thu | Phải trả, khoản quá hạn và liên kết chi tiết / ghi thu", () => {
    render(<AstryxReceivablesView {...base}><p>khối ghi thu</p></AstryxReceivablesView>);
    expect(screen.getByRole("heading", { name: "Công nợ phải thu" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Phải trả nhà cung cấp/ })).toHaveAttribute("href", "/admin/payables");
    expect(screen.getByRole("tab", { name: /Phải thu khách hàng/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Quá hạn").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Chi tiết" })).toHaveAttribute("href", "/admin/receivables/r1");
    expect(screen.getByRole("link", { name: "Ghi thu" })).toHaveAttribute("href", "/admin/receivables?customer=c1");
    expect(screen.queryByText("khối ghi thu")).not.toBeInTheDocument();
  });

  it("khi chọn khách thì giữ biểu mẫu ghi thu của Classic bên trong", () => {
    render(<AstryxReceivablesView {...base} customerId="c1" selectedName="Anh Nam"><button type="submit">Ghi thu</button></AstryxReceivablesView>);
    expect(screen.getByText(/Đang xem công nợ của/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi thu" })).toBeInTheDocument();
  });

  it("chỉ hiện tab nào được quyền và trạng thái trống", () => {
    render(<AstryxReceivablesView {...base} rows={[]} permissions={{ has: (p: string) => p === "finance.ar.read" }}><span /></AstryxReceivablesView>);
    expect(screen.queryByRole("tab", { name: /Phải trả/ })).not.toBeInTheDocument();
    expect(screen.getByText("Không có khoản phải thu phù hợp.")).toBeInTheDocument();
  });

  it("chi tiết có số liệu, nguồn giao hàng và biểu mẫu điều chỉnh chỉ khi có quyền", () => {
    const detail = { id: "r1", customer_id: "c1", customer_name: "Anh Nam", site_name: null, source_label: "SO-0185", source_id: "s1", delivery_id: "d1", original_amount_vnd: "30000000", adjustment_amount_vnd: "0", allocated_amount_vnd: "10000000", outstanding_amount_vnd: "20000000", due_date: "2026-11-02", state: "OVERDUE" };
    const props = { row: detail, allocations: [], adjustments: [], adjustAction: () => undefined, operationId: "op1", notice: null };
    const { unmount } = render(<AstryxReceivableDetailView {...props} canAdjust />);
    expect(screen.getByRole("link", { name: "Mở kết quả giao hàng đã xác minh" })).toHaveAttribute("href", "/admin/deliveries/d1");
    expect(screen.getByRole("button", { name: "Ghi điều chỉnh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đối chiếu công nợ" })).toHaveAttribute("href", "/api/customers/c1/debt-statement/pdf");
    unmount();
    render(<AstryxReceivableDetailView {...props} canAdjust={false} />);
    expect(screen.queryByRole("button", { name: "Ghi điều chỉnh" })).not.toBeInTheDocument();
    expect(screen.getByText("Bạn không có quyền điều chỉnh.")).toBeInTheDocument();
  });
});
