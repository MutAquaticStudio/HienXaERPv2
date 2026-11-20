import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxReturnForm, AstryxReturnPicker, AstryxReturnsView } from "./astryx-view";

afterEach(cleanup);
const row = { id: "r1", number: "TH-0012", date: "19/11/2026", supplier: "Thép Hòa Phát", material: "Thép phi 12", direct: true, quantity: "20", value: "1.908.000 ₫", done: false };

describe("trả hàng nhập kiểu Astryx", () => {
  it("danh sách: phiếu trả, trạng thái, nhãn NCC giao thẳng, form nhiều bước Classic", () => {
    render(<AstryxReturnsView rows={[row, { ...row, id: "r2", number: "TH-0013", done: true, direct: false, value: null }]} canCreate returned directForm={<button type="submit">Tạo hồ sơ trả</button>} hasNext={false} page={1} />);
    expect(screen.getByRole("heading", { name: "Trả hàng nhập" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TH-0012" })).toHaveAttribute("href", "/admin/purchases/returns/r1");
    expect(screen.getByText("Đang xử lý")).toBeInTheDocument();
    expect(screen.getByText("Hoàn thành")).toBeInTheDocument();
    expect(screen.getByText("NCC giao thẳng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Trả hàng nhập$/ })).toHaveAttribute("href", "/admin/purchases/returns/new");
    expect(screen.getByRole("status")).toHaveTextContent("Đã trả hàng nhập");
    expect(screen.getByRole("button", { name: "Tạo hồ sơ trả" })).toBeInTheDocument();
  });
  it("danh sách trống và thiếu quyền tạo", () => {
    render(<AstryxReturnsView rows={[]} canCreate={false} returned={false} directForm={null} hasNext={false} page={1} />);
    expect(screen.getByText("Chưa có phiếu trả hàng nhập.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ Trả hàng nhập" })).not.toBeInTheDocument();
  });
  it("chọn phiếu nhập và form hoàn thành giữ form Classic", () => {
    render(<AstryxReturnPicker q="" receipts={[{ id: "g1", number: "NH-0211", po: "PO-0087", date: "18/11/2026", supplier: "Thép Hòa Phát", items: "Thép phi 12, Thép phi 16" }]} />);
    expect(screen.getByRole("link", { name: "NH-0211" })).toHaveAttribute("href", "/admin/purchases/returns/new?receipt=g1");
    expect(screen.getByRole("textbox", { name: "Tìm phiếu nhập" })).toBeInTheDocument();
    cleanup();
    render(<AstryxReturnForm supplier="Thép Hòa Phát" receipt="NH-0211" date="18/11/2026" po="PO-0087" form={<button type="submit">Hoàn thành</button>} />);
    expect(screen.getByRole("button", { name: "Hoàn thành" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chọn phiếu nhập khác" })).toHaveAttribute("href", "/admin/purchases/returns/new");
  });
});
