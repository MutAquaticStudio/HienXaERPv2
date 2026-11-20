import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxTransfersView } from "./astryx-view";

afterEach(cleanup);
const row = { id: "t1", number: "CK-0042", at: "18/11/2026 09:00", from: "Kho Đại Mỗ", to: "Kho Hà Đông", material: "Thép phi 16", code: "TH-D16", planned: "100 cây", received: "0 cây", statusLabel: "Phiếu tạm", tone: "info" as const, stepForm: <button type="submit">Xuất kho</button> };

describe("danh sách chuyển kho kiểu Astryx", () => {
  it("hiện phiếu, trạng thái, nút một chạm Classic và liên kết tạo phiếu", () => {
    render(<AstryxTransfersView rows={[row]} canManage hasNext={false} page={1} notice="Đã tạo phiếu chuyển kho." />);
    expect(screen.getByRole("heading", { name: "Chuyển kho" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CK-0042" })).toHaveAttribute("href", "/admin/inventory/transfers/t1");
    expect(screen.getByText("Kho Đại Mỗ → Kho Hà Đông")).toBeInTheDocument();
    expect(screen.getByText("Phiếu tạm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xuất kho" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Chuyển hàng/ })).toHaveAttribute("href", "/admin/inventory/transfers/new");
    expect(screen.getByRole("status")).toHaveTextContent("Đã tạo phiếu chuyển kho.");
  });
  it("ẩn nút tạo khi thiếu quyền và báo khi trống", () => {
    render(<AstryxTransfersView rows={[]} canManage={false} hasNext={false} page={1} />);
    expect(screen.queryByRole("link", { name: /Chuyển hàng/ })).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có phiếu chuyển kho.")).toBeInTheDocument();
  });
});
