import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxStockCountsView } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));
const row = { id: "c1", number: "KK-0007", warehouse: "Kho Đại Mỗ", cutoff: "18/11/2026 18:00", lineCount: 12, up: 2, down: 0, stateLabel: "Đang kiểm", tone: "warning" as const };
const base = { rows: [row], total: 1, page: 1, query: "", state: "", warehouse: "", warehouses: [{ id: "w1", name: "Kho Đại Mỗ" }], states: [{ value: "OPEN", label: "Đang kiểm" }, { value: "APPROVED", label: "Đã cân bằng kho" }, { value: "CANCELLED", label: "Đã hủy" }], openButton: <button type="button">+ Tạo phiếu kiểm</button> };

describe("danh sách kiểm kho kiểu Astryx", () => {
  it("hiện phiếu, số lệch tăng/giảm, trạng thái và nút tạo phiếu Classic", () => {
    render(<AstryxStockCountsView {...base} />);
    expect(screen.getByRole("heading", { name: "Kiểm kho" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "KK-0007" })).toHaveAttribute("href", "/admin/stock-counts/c1");
    expect(screen.getAllByText("Đang kiểm").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Đã cân bằng kho" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Tạo phiếu kiểm" })).toBeInTheDocument();
  });
  it("trạng thái trống có hướng dẫn và không có nút tạo khi thiếu quyền", () => {
    render(<AstryxStockCountsView {...base} rows={[]} total={0} openButton={null} />);
    expect(screen.getByText(/Chưa có phiếu kiểm/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Tạo phiếu kiểm" })).not.toBeInTheDocument();
  });
});
