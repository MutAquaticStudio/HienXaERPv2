import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxProductsView } from "./astryx-view";

afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/products" }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/catalog/bulk-actions", () => ({ bulkCatalogAction: vi.fn(), exportCatalogCsvAction: vi.fn() }));
vi.mock("@/modules/pricing/purchase-book-actions", () => ({ assignSupplierToMaterialsAction: vi.fn() }));

const row = { id: "m1", code: "XM01", name: "Xi măng PCB40", specification: "Bao 50kg", group: "Xi măng", uom: "bao", saleEnabled: true, purchaseEnabled: true, active: true,
  price: { unitPriceVnd: "95000", uom: "bao" }, averageCostVnd: "78000", stock: { onHand: "120", available: "100", warehouses: [{ name: "Kho Đại Mỗ", onHand: "120", available: "100" }] }, variant: null, conversions: ["1 bao = 50 kg"] };
const base = { rows: [row], ids: ["m1"], can: { manage: true, price: true, stock: true, cost: true }, groups: [{ id: "g1", name: "Xi măng" }], variantOptions: [], group: "", variant: "", state: "", use: "", query: "", total: 1, page: 1,
  createButton: <button type="button">+ Vật tư</button>, variantButton: null, editVariantButton: null, bulkBar: null, currentVariant: null };

describe("danh sách vật tư kiểu Astryx", () => {
  it("hiện vật tư với giá bán, giá vốn, tồn kho kèm đơn vị và nút Classic hiện có", () => {
    render(<AstryxProductsView {...base} />);
    expect(screen.getByRole("heading", { name: "Vật tư" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xi măng PCB40/ })).toHaveAttribute("href", "/admin/products/m1");
    expect(screen.getByText(/95\.000/)).toBeInTheDocument();
    expect(screen.getByText("Khả dụng 100")).toBeInTheDocument();
    expect(screen.getAllByText("Đang dùng").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "+ Vật tư" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết lập giá" })).toHaveAttribute("href", "/admin/products/pricing");
  });

  it("mũi tên mở tồn theo kho và quy đổi đơn vị", () => {
    render(<AstryxProductsView {...base} />);
    const toggle = screen.getByRole("button", { name: "Mở rộng Xi măng PCB40" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Kho Đại Mỗ/)).toBeInTheDocument();
    expect(screen.getByText("1 bao = 50 kg")).toBeInTheDocument();
  });

  it("ẩn giá, giá vốn, tồn kho, ô chọn và liên kết quản lý theo quyền", () => {
    render(<AstryxProductsView {...base} can={{ manage: false, price: false, stock: false, cost: false }} createButton={null}
      rows={[{ ...row, price: null, stock: null, averageCostVnd: null }]} />);
    expect(screen.queryByText("Giá bán")).not.toBeInTheDocument();
    expect(screen.queryByText("Giá vốn")).not.toBeInTheDocument();
    expect(screen.queryByText("Tồn kho")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nhóm vật tư" })).not.toBeInTheDocument();
  });

  it("trạng thái trống khi lọc có nút xóa bộ lọc", () => {
    render(<AstryxProductsView {...base} rows={[]} ids={[]} total={0} query="zzz" />);
    expect(screen.getByText("Không có vật tư phù hợp.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Xóa/ }).length).toBeGreaterThan(0);
  });
});
