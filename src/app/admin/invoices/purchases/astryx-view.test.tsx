import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxPurchaseInvoicesView } from "./astryx-view";

afterEach(cleanup);
const permissions = new Set(["finance.ar.read", "finance.ap.read"]);

describe("sổ chứng từ nhà cung cấp kiểu Astryx", () => {
  it("hiện nguồn đã ghi, nguồn chưa ghi sổ với nút Classic và liên kết đối chiếu", () => {
    render(<AstryxPurchaseInvoicesView permissions={permissions} total={80} page={2}
      rows={[{ id: "a", supplier: "Thép Hòa Phát", source: "Nhập kho · 1a2b3c4d", value: "50.400.000 ₫", reference: "HD-0099", recovery: null, state: "Chờ chứng từ" }]}
      eligible={[{ id: "b", supplier: "Xi măng Hoàng Thạch", source: "Nhập kho · 9f8e7d6c", value: "78.000.000 ₫", action: <button type="button">Ghi nguồn</button> }]} />);
    expect(screen.getByRole("heading", { name: "Sổ chứng từ nhà cung cấp" })).toBeInTheDocument();
    expect(screen.getByText("HD-0099")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi nguồn" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đối chiếu lượng, giá và giá trị" })).toHaveAttribute("href", "/admin/invoices/purchases/matching");
    expect(screen.getByRole("link", { name: "Trang trước" })).toHaveAttribute("href", "?page=1");
    expect(screen.getByRole("link", { name: "Trang sau" })).toHaveAttribute("href", "?page=3");
    expect(screen.getByRole("tab", { name: "Chứng từ mua vào" })).toHaveAttribute("href", "/admin/invoices/purchases");
  });
  it("trạng thái trống", () => {
    render(<AstryxPurchaseInvoicesView permissions={new Set(["finance.ap.read"])} total={0} page={1} rows={[]} eligible={[]} />);
    expect(screen.getByText("Chưa ghi chứng từ nguồn.")).toBeInTheDocument();
    expect(screen.getByText(/Không có nguồn mua đủ điều kiện/)).toBeInTheDocument();
  });
});
