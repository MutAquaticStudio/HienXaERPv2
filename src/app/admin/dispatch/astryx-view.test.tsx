import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxDispatchView, type AxDispatchColumn } from "./astryx-view";

afterEach(cleanup);

const columns: AxDispatchColumn[] = [
  { title: "Chờ phân giao", bucket: "planned", rows: [{ id: "d1", delivery_number: "PG-0120", customer_name_snapshot: "Anh Tuấn", site_name_snapshot: "Cầu Giấy", execution_state: "PLANNED" }], hasNext: true, page: 1, prevHref: null, nextHref: "/admin/dispatch?plannedPage=2", shownAbove: 2 },
  { title: "Đã phân giao", bucket: "assigned", rows: [], hasNext: false, page: 1, prevHref: null, nextHref: null, shownAbove: 0 },
  { title: "Đang thực hiện", bucket: "active", rows: [], hasNext: false, page: 2, prevHref: "/admin/dispatch", nextHref: null, shownAbove: 0 },
  { title: "Ngoại lệ", bucket: "exception", rows: [], hasNext: false, page: 1, prevHref: null, nextHref: null, shownAbove: 0 },
];
const base = { columns, q: "", dayBoard: <section aria-label="Lịch giao theo tài xế">Lịch</section>, fleetMap: <div>Bản đồ</div>, canManage: true, canAssign: true, waitingCount: 3 };

describe("điều phối giao hàng kiểu Astryx", () => {
  it("hiện bốn cột đúng tên của app, phiếu là liên kết tới chi tiết và nhãn trạng thái tiếng Việt", () => {
    render(<AstryxDispatchView {...base} />);
    expect(screen.getByRole("heading", { name: "Điều phối giao hàng" })).toBeInTheDocument();
    for (const name of ["Chờ phân giao", "Đã phân giao", "Đang thực hiện", "Ngoại lệ"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PG-0120/ })).toHaveAttribute("href", "/admin/deliveries/d1");
    expect(screen.getByText(/2 phiếu cần giao đến hôm nay/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp" })).toHaveAttribute("href", "/admin/dispatch?plannedPage=2");
  });

  it("nút Gán nhanh nhảy tới khung chờ điều phối; Xe / Máy chỉ có với quyền quản lý vai trò", () => {
    const { rerender } = render(<AstryxDispatchView {...base} />);
    expect(screen.getByRole("link", { name: "Gán nhanh" })).toHaveAttribute("href", "#dispatch-waiting");
    expect(screen.getByRole("link", { name: "Xe" })).toHaveAttribute("href", "/admin/dispatch/resources?kind=vehicles");
    rerender(<AstryxDispatchView {...base} canManage={false} canAssign={false} />);
    expect(screen.queryByRole("link", { name: "Gán nhanh" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xe" })).not.toBeInTheDocument();
  });
});
