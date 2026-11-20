import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AxDetailFrame } from "@/components/astryx/buystock-kit";

afterEach(cleanup);

describe("khung chi tiết nhà cung cấp/vật tư kiểu Astryx", () => {
  it("hiện tiêu đề, chỉ số, tab dạng liên kết với tab đang mở và nội dung hiện có", () => {
    render(<AxDetailFrame crumbs={["Mua hàng", "Nhà cung cấp", "NCC-012"]} title="Thép Hòa Phát" sub="0968 321 456" actions={<a href="/x">Tạo đơn mua</a>}
      kpis={[{ label: "Còn phải trả", value: "98.100.000 ₫" }, { label: "Quá hạn", value: "0 ₫" }]}
      tabs={[{ id: "info", label: "Thông tin & liên hệ", href: "/admin/suppliers/s1?tab=info", active: true }, { id: "purchases", label: "Đơn mua", count: 3, href: "/admin/suppliers/s1?tab=purchases", active: false }]}><p>Nội dung tab</p></AxDetailFrame>);
    expect(screen.getByRole("heading", { name: "Thép Hòa Phát" })).toBeInTheDocument();
    expect(screen.getByText("98.100.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Thông tin & liên hệ/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Đơn mua/ })).toHaveAttribute("href", "/admin/suppliers/s1?tab=purchases");
    expect(screen.getByText("Nội dung tab")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tạo đơn mua" })).toBeInTheDocument();
  });
  it("không hiện thanh tab khi chỉ có một tab", () => {
    render(<AxDetailFrame crumbs={["A", "B"]} title="T" tabs={[{ id: "info", label: "Thông tin", href: "/x", active: true }]}><p>nd</p></AxDetailFrame>);
    expect(screen.queryByRole("navigation", { name: "Nội dung" })).not.toBeInTheDocument();
  });
});
