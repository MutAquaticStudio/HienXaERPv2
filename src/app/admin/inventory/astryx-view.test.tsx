import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxInventoryView, type AxStockRow } from "./astryx-view";

afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/inventory" }));

const row: AxStockRow = { id: "m1", name: "Xi măng PCB40", code: "XM01", group: "Xi măng", href: "/admin/inventory?card=m1", opened: false,
  onHand: { main: "120 bao" }, reserved: { main: "10 bao" }, promised: { main: "20 bao" }, available: { main: "90 bao" }, value: "9.360.000 ₫", lowCount: 1, thresholdText: null,
  thresholdNode: <button type="button">Đặt ngưỡng</button>, purchaseHref: "/admin/purchase-orders/new?warehouse=w1&material=m1", perWarehouse: [{ key: "w1", name: "Kho Đại Mỗ", text: "Tồn 120 bao" }], hasReserved: true,
  card: [{ id: "e1", at: "18/11/2026 10:00", type: "Nhập kho", where: "Kho Đại Mỗ", delta: "+120", positive: true, balance: "120", deliveryId: null }], cardFull: false };
const base = { rows: [row], kpis: { inStock: 1, out: 0, low: 1, value: "9.360.000 ₫", hrefIn: "/admin/inventory?stock=in", hrefOut: "/admin/inventory?stock=out", hrefLow: "/admin/inventory?stock=low" },
  filters: { q: "", warehouse: "", group: "", stock: "", large: false, only: "" }, canCost: true, canCount: true, canManageWarehouses: true, total: 1, page: 1, params: {}, scopeLabel: "Tất cả kho", capped: false, limit: 3000, filtered: false,
  warehouses: [{ id: "w1", name: "Kho Đại Mỗ" }], groups: [{ id: "g1", name: "Xi măng" }] };

describe("tồn kho kiểu Astryx", () => {
  it("hiện bốn số tồn kèm đơn vị, giá trị tồn, cảnh báo dưới ngưỡng và liên kết Đặt mua", () => {
    render(<AstryxInventoryView {...base} />);
    expect(screen.getByRole("heading", { name: "Tồn kho" })).toBeInTheDocument();
    for (const head of ["Tồn kho", "Chờ xuất giao", "Đã hứa cho đơn", "Có thể bán", "Giá trị tồn"]) expect(screen.getAllByText(head).length).toBeGreaterThan(0);
    expect(screen.getByText("90 bao")).toBeInTheDocument();
    expect(screen.getByText("9.360.000 ₫", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(/Dưới ngưỡng · 1 kho/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đặt mua" })).toHaveAttribute("href", "/admin/purchase-orders/new?warehouse=w1&material=m1");
    expect(screen.getByRole("button", { name: "Đặt ngưỡng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kiểm kho/ })).toHaveAttribute("href", "/admin/stock-counts");
  });

  it("ẩn cột giá trị tồn khi thiếu quyền xem giá vốn và mở thẻ kho khi chọn dòng", () => {
    render(<AstryxInventoryView {...base} canCost={false} canManageWarehouses={false} rows={[{ ...row, opened: true, value: null }]} />);
    expect(screen.queryByRole("columnheader", { name: "Giá trị tồn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Quản lý kho" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Thẻ kho Xi măng PCB40" })).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem phiếu giao đang chờ xuất" })).toHaveAttribute("href", "/admin/dispatch");
  });

  it("trạng thái trống khi lọc", () => {
    render(<AstryxInventoryView {...base} rows={[]} total={0} filtered />);
    expect(screen.getByText("Không có vật tư phù hợp bộ lọc.")).toBeInTheDocument();
  });
});
