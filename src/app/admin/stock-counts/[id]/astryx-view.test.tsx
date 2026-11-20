import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxStockCountDetail } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));
const base = { number: "KK-0007", warehouse: "Kho Đại Mỗ", cutoff: "18/11/2026 18:00", approvedAt: null, state: "OPEN", stateLabel: "Đang kiểm", tone: "warning" as const, sheet: <button type="button">Cân bằng kho</button> };

describe("phiếu kiểm kho kiểu Astryx", () => {
  it("giữ nguyên bảng nhập Classic và giải thích khi đang kiểm", () => {
    render(<AstryxStockCountDetail {...base} />);
    expect(screen.getByRole("heading", { name: "KK-0007" })).toBeInTheDocument();
    expect(screen.getByText(/Nhập số thực tế theo đơn vị cơ sở/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cân bằng kho" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về danh sách" })).toHaveAttribute("href", "/admin/stock-counts");
  });
  it("phiếu đã cân bằng ghi thời điểm cân bằng; phiếu hủy báo tồn kho không đổi", () => {
    render(<AstryxStockCountDetail {...base} state="APPROVED" stateLabel="Đã cân bằng kho" tone="success" approvedAt="19/11/2026 08:00" />);
    expect(screen.getByText(/cân bằng lúc 19\/11\/2026 08:00/)).toBeInTheDocument();
    cleanup();
    render(<AstryxStockCountDetail {...base} state="CANCELLED" stateLabel="Đã hủy" tone="info" />);
    expect(screen.getByText(/Tồn kho không thay đổi/)).toBeInTheDocument();
  });
});
