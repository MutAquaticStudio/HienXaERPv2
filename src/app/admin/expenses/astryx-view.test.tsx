import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxExpensesView, type AxExpenseRow } from "./astryx-view";

afterEach(cleanup);

const row: AxExpenseRow = { id: "e1", number: "CP-0091", dateText: "19/11/2026", category: "Phí vận chuyển", description: "Xăng ô tô", payee: "Cây xăng 12", settlementText: "Trả ngay từ quỹ", activity: "Giao hàng", sourceText: null, amountText: "1.500.000 ₫", approved: false, approve: <button type="button">Duyệt</button> };
const base = { notice: null, actions: <button type="button">Ghi chi phí</button>, tabs: [{ href: "/admin/expenses", label: "Tất cả", active: true }, { href: "/admin/expenses?state=DRAFT", label: "Chờ duyệt", count: 1, active: false }],
  q: "", state: "", pinned: false, visibleCount: 1, page: 1, total: 1, hasNext: false, rows: [row] };

describe("chi phí kiểu Astryx", () => {
  it("hiện tab trạng thái, nhãn Chờ duyệt, số tiền và nút Duyệt / Ghi chi phí của Classic", () => {
    render(<AstryxExpensesView {...base} />);
    expect(screen.getByRole("heading", { name: "Chi phí vận hành" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Chờ duyệt/ })).toHaveAttribute("href", "/admin/expenses?state=DRAFT");
    expect(screen.getAllByText("Chờ duyệt").length).toBeGreaterThan(0);
    expect(screen.getByText("1.500.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi chi phí" })).toBeInTheDocument();
  });

  it("trạng thái trống và khoản được ghim", () => {
    const { unmount } = render(<AstryxExpensesView {...base} rows={[]} visibleCount={0} />);
    expect(screen.getByText("Chưa có chi phí.")).toBeInTheDocument();
    unmount();
    render(<AstryxExpensesView {...base} focusId="e1" pinned />);
    expect(screen.getByText("Được ghim")).toBeInTheDocument();
  });
});
