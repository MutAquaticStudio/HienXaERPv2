import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AxBar, AxCheckField, AxFilterBar, AxField, AxFormFrame, AxKv, AxPanel, AxSteps, AxTable, axHref } from "./buystock-kit";

afterEach(cleanup);

describe("bộ thành phần Mua hàng/Kho/Vật tư của Astryx", () => {
  it("axHref bỏ khóa trống và giữ bộ lọc trên địa chỉ", () => {
    expect(axHref("/admin/x", { q: "xi", state: "", page: undefined })).toBe("/admin/x?q=xi");
    expect(axHref("/admin/x", {})).toBe("/admin/x");
  });
  it("AxTable là bảng thật có tiêu đề cột, cột số căn phải và trạng thái trống", () => {
    render(<AxTable label="Bảng thử" heads={["Tên", { label: "Số", num: true }]} empty={<p>Không có dòng.</p>}><tr><td>A</td><td className="hx-num">1</td></tr></AxTable>);
    expect(screen.getByRole("table", { name: "Bảng thử" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Số" })).toHaveClass("hx-num");
    expect(screen.getByText("Không có dòng.")).toBeInTheDocument();
  });
  it("AxFormFrame, AxFilterBar, AxPanel, AxSteps, AxBar, AxKv", () => {
    render(<AxFormFrame crumbs={["Mua hàng", "Tạo"]} title="Tạo đơn" lede="Mô tả"><AxFilterBar action="/x" label="Lọc thử" showClear clearHref="/x"><AxField label="Tìm" name="q" /><AxCheckField label="Chỉ dòng chưa có giá" name="missing" value="1" /></AxFilterBar>
      <AxPanel title="Khối"><AxKv label="Tổng" value="1.000 ₫" big /></AxPanel><AxSteps label="Tiến trình" steps={["Chờ nhận hàng", "Đang nhận hàng"]} at={1} /><AxBar label="Tiến độ" value={3} max={5} text="3/5" /></AxFormFrame>);
    expect(screen.getByRole("heading", { name: "Tạo đơn" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Lọc thử" })).toHaveAttribute("method", "get");
    expect(screen.getByRole("checkbox", { name: "Chỉ dòng chưa có giá" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xóa lọc" })).toHaveAttribute("href", "/x");
    expect(screen.getByText("Đang nhận hàng").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("1.000 ₫")).toBeInTheDocument();
  });
});
