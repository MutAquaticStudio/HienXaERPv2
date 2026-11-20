import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxMatchingDetail, type AxMatchLine } from "./astryx-view";

afterEach(cleanup);
const line: AxMatchLine = { id: "l1", source: "NH-0211", po: "PO-0087", material: "Thép phi 12", unit: "cây", ordered: "500", received: "500", invoiced: "480", poPrice: "95.400 ₫", priceSource: "Bảng giá mua", invoicePrice: "95.400 ₫", value: "47.700.000 ₫ → 45.792.000 ₫", reservedNote: null,
  qtyOff: true, priceOff: false, valueOff: true, resultLabel: "Lệch lượng", matched: false };
const base = { permissions: new Set(["finance.ap.read"]), number: "HD-0099", supplier: "Thép Hòa Phát", date: "2026-11-19", matchedAll: false, declared: "45.792.000 ₫", source: "47.700.000 ₫", businessText: "Chờ rà soát", reason: null, csvHref: "/api/supplier-documents/d1/review/csv", lines: [line], reviewForms: [{ key: "approve", title: "Duyệt đối chiếu đã khớp", node: <button type="submit">Duyệt</button> }] };

describe("chi tiết đối chiếu kiểu Astryx", () => {
  it("hiện ngoại lệ, kết quả từng dòng, không báo phát hành pháp lý, form Classic", () => {
    render(<AstryxMatchingDetail {...base} />);
    expect(screen.getByRole("heading", { name: "HD-0099" })).toBeInTheDocument();
    expect(screen.getByText("Còn ngoại lệ đối chiếu")).toBeInTheDocument();
    expect(screen.getByText("Lệch lượng")).toBeInTheDocument();
    expect(screen.getAllByText("0/1 dòng khớp").length).toBeGreaterThan(0);
    expect(screen.getByText(/không phát hành hóa đơn điện tử/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xuất bảng đối chiếu theo nguồn" })).toHaveAttribute("href", "/api/supplier-documents/d1/review/csv");
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeInTheDocument();
  });
  it("dòng khớp và không có form khi thiếu quyền", () => {
    render(<AstryxMatchingDetail {...base} matchedAll reviewForms={[]} lines={[{ ...line, qtyOff: false, valueOff: false, matched: true, resultLabel: "Khớp" }]} />);
    expect(screen.getByText("Đã khớp nguồn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
  });
});
