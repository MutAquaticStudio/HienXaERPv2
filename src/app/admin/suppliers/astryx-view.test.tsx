import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxSuppliersView } from "./astryx-view";

afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/suppliers" }));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/catalog/bulk-actions", () => ({ bulkCatalogAction: vi.fn(), exportCatalogCsvAction: vi.fn() }));
vi.mock("@/modules/pricing/purchase-book-actions", () => ({ assignSupplierToMaterialsAction: vi.fn() }));

const row = { id: "s1", code: "NCC-012", name: "Thép Hòa Phát", phone: "0968 321 456", tax_code: "0105432109", payment_terms_days: 15, active: true };
const base = { rows: [row], ids: ["s1"], debts: { s1: "98100000" }, debtComplete: true, canManage: true, canReadPayables: true, canSeePricing: true, query: "", state: "", total: 1, page: 1, createButton: <button type="button">+ Nhà cung cấp</button>, bulkBar: null };

describe("danh sách nhà cung cấp kiểu Astryx", () => {
  it("hiện nhà cung cấp, công nợ phải trả, hạn thanh toán và nút Classic hiện có", () => {
    render(<AstryxSuppliersView {...base} />);
    expect(screen.getByRole("heading", { name: "Nhà cung cấp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Thép Hòa Phát/ })).toHaveAttribute("href", "/admin/suppliers/s1");
    expect(screen.getByText(/98\.100\.000/)).toBeInTheDocument();
    expect(screen.getByText("15 ngày")).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động", { selector: "span, div" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bảng giá mua" })).toHaveAttribute("href", "/admin/suppliers/pricing");
    expect(screen.getByRole("button", { name: "+ Nhà cung cấp" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Chọn NCC-012/ })).toBeInTheDocument();
  });

  it("ẩn cột công nợ, ô chọn và bảng giá khi thiếu quyền; báo khi chưa tải đủ công nợ", () => {
    render(<AstryxSuppliersView {...base} canManage={false} canReadPayables={false} canSeePricing={false} createButton={null} />);
    expect(screen.queryByText("Còn phải trả")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bảng giá mua" })).not.toBeInTheDocument();
    cleanup();
    render(<AstryxSuppliersView {...base} debtComplete={false} />);
    expect(screen.getByText(/Chưa tải đủ công nợ/)).toBeInTheDocument();
  });

  it("danh sách trống khi lọc", () => {
    render(<AstryxSuppliersView {...base} rows={[]} ids={[]} total={0} query="zzz" />);
    expect(screen.getByText("Không có nhà cung cấp phù hợp.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xóa lọc" })).toHaveAttribute("href", "/admin/suppliers");
  });
});
