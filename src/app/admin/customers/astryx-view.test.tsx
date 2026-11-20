import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxCustomersView, type AxCustomerListRow } from "./astryx-view";

afterEach(cleanup);
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/customers", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/modules/catalog/bulk-actions", () => ({ bulkCatalogAction: vi.fn(), exportCatalogCsvAction: vi.fn() }));

const row: AxCustomerListRow = { id: "c1", code: "KH-0102", name: "Công ty XD Bảo Long", typeLabel: "Doanh nghiệp", phone: "0912 345 678", tierName: "Nhóm giá Bảo Long", debt: "45.600.000 ₫", debtPositive: true, limit: "200.000.000 ₫", active: true };
const base = {
  rows: [row], total: 1, branchName: "Chi nhánh Hà Đông", query: { q: "", state: "", type: "", tier: "" }, page: 1, ids: ["c1"],
  filters: { stateOptions: [{ value: "", label: "Tất cả" }, { value: "ACTIVE", label: "Đang hoạt động" }], typeOptions: [{ value: "", label: "Tất cả" }] },
  tiers: [{ code: "BL", name: "Nhóm giá Bảo Long" }], canManage: false, canReadFinance: true, debtComplete: true, create: null, bulkPortal: null, bulkBar: null,
};

describe("danh sách khách hàng kiểu Astryx", () => {
  it("hiện khách, nợ, hạn mức và liên kết mở khách 360", () => {
    render(<AstryxCustomersView {...base} />);
    expect(screen.getByRole("heading", { name: "Khách hàng" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Công ty XD Bảo Long/ })[0]).toHaveAttribute("href", "/admin/customers/c1");
    expect(screen.getByText("45.600.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("200.000.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động", { selector: ".astryx-badge, .astryx-badge *" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Công trình" })).not.toBeInTheDocument();
  });

  it("người có quyền quản lý thấy nút Công trình, ô chọn dòng; không có quyền tài chính thì ẩn cột nợ", () => {
    render(<AstryxCustomersView {...base} canManage canReadFinance={false} />);
    expect(screen.getByRole("link", { name: "Công trình" })).toHaveAttribute("href", "/admin/customers/manage?kind=sites");
    expect(screen.getByRole("checkbox", { name: /KH-0102/ })).toBeInTheDocument();
    expect(screen.queryByText("Nợ hiện tại")).not.toBeInTheDocument();
  });

  it("trạng thái trống và nút Xóa lọc khi đang lọc", () => {
    render(<AstryxCustomersView {...base} rows={[]} total={0} query={{ q: "zzz", state: "", type: "", tier: "" }} />);
    expect(screen.getByText("Không có khách hàng phù hợp.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xóa lọc" })).toHaveAttribute("href", "/admin/customers");
  });
});
