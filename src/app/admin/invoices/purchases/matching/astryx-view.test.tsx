import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxMatchingView } from "./astryx-view";

afterEach(cleanup);
const permissions = new Set(["finance.ap.read"]);
const rows = [{ id: "d1", number: "HD-0099", supplier: "Thép Hòa Phát", kind: "Chứng từ mua", value: "50.400.000 ₫", matched: false, business: "Chờ rà soát" }];

describe("đối chiếu hóa đơn NCC kiểu Astryx", () => {
  it("hiện chứng từ có lệch, không báo đã phát hành, và form tạo Classic", () => {
    render(<AstryxMatchingView permissions={permissions} rows={rows} createForm={<button type="submit">Lưu đối chiếu</button>} hasNext={false} page={1} />);
    expect(screen.getByRole("heading", { name: "Đối chiếu hóa đơn nhà cung cấp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HD-0099" })).toHaveAttribute("href", "/admin/invoices/purchases/matching/d1");
    expect(screen.getByText("Có lệch")).toBeInTheDocument();
    expect(screen.getByText(/không báo đã phát hành/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu đối chiếu" })).toBeInTheDocument();
  });
  it("không có form tạo khi thiếu quyền; trống", () => {
    render(<AstryxMatchingView permissions={permissions} rows={[]} createForm={null} hasNext={false} page={1} />);
    expect(screen.queryByText("+ Đối chiếu hóa đơn mới")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có chứng từ đối chiếu.")).toBeInTheDocument();
  });
});
