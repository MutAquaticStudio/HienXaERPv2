import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxTransferDetail } from "./astryx-view";

afterEach(cleanup);
const base = { number: "CK-0042", from: "Kho Đại Mỗ", to: "Kho Hà Đông", createdAt: "18/11/2026 09:00", createdBy: "Đỗ Thu Hà", reason: "Bổ sung hàng", status: "Đang chuyển", tone: "warning" as const, material: "Thép phi 16", code: "TH-D16",
  quantities: { planned: "100 cây", shipped: "100 cây", received: "40 cây", inTransit: "60 cây", lost: "—" }, inTransitValue: "10.080.000 ₫", oneTap: <button type="submit">Nhận đủ</button>,
  eventForms: [{ kind: "RECEIVE", title: "Nhận hàng", node: <button type="submit">Ghi nhận hàng về</button> }], history: [{ id: "e1", at: "18/11/2026 09:05", who: "Đỗ Thu Hà", action: "Xuất kho", qty: "100 cây", value: "16.800.000 ₫", reason: "Chuyển kho" }], showValue: true };

describe("chi tiết chuyển kho kiểu Astryx", () => {
  it("hiện tiến độ số lượng, giá trị đang chuyển, nút một chạm và form sự kiện Classic", () => {
    render(<AstryxTransferDetail {...base} />);
    expect(screen.getByRole("heading", { name: "CK-0042" })).toBeInTheDocument();
    expect(screen.getByText("Đang chuyển", { selector: "span, div" })).toBeInTheDocument();
    expect(screen.getByText("10.080.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhận đủ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi nhận hàng về" })).toBeInTheDocument();
    expect(screen.getByText("Xuất kho", { selector: "td" })).toBeInTheDocument();
  });
  it("ẩn giá trị và form khi thiếu quyền; báo khi chưa có lịch sử", () => {
    render(<AstryxTransferDetail {...base} inTransitValue={null} showValue={false} oneTap={null} eventForms={[]} history={[]} />);
    expect(screen.queryByText("Giá trị đang chuyển")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nhận đủ" })).not.toBeInTheDocument();
    expect(screen.getByText("Chưa xuất kho.")).toBeInTheDocument();
  });
});
