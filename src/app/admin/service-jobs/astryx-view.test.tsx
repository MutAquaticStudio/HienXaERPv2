import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxServiceJobsView, type AxServiceJobRow } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/service-jobs", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

const job: AxServiceJobRow = { id: "j1", number: "DV-0045", customer: "Công ty XD Bảo Long", site: "CT Hà Đông", serviceType: "Cẩu hàng lên tầng 5", schedule: "20/11/2026 08:30", scheduleEnd: null, planned: "Theo thực tế", operator: "Trần Văn Minh", description: "Cẩu pallet gạch", state: "RESULT_SUBMITTED", stateLabel: "Chờ xác minh", stateTone: "warning" };
const base = { rows: [job], filters: [{ value: "", label: "Tất cả" }, { value: "SCHEDULED", label: "Đã lên lịch", count: 2 }], stateFilter: "", q: "", isFiltered: false, openRequests: 3, canManage: true, page: 1, total: 1, hasNext: false, create: <button type="button">+ Tạo đơn dịch vụ</button> };

describe("danh sách đơn dịch vụ kiểu Astryx", () => {
  it("hiện mã, khách, nhãn trạng thái tiếng Việt, số yêu cầu chờ và liên kết theo quyền", () => {
    render(<AstryxServiceJobsView {...base} />);
    expect(screen.getByRole("heading", { name: "Đơn dịch vụ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DV-0045" })).toHaveAttribute("href", "/admin/service-jobs/j1");
    expect(screen.getByText("Chờ xác minh", { selector: ".astryx-badge, .astryx-badge *" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yêu cầu từ khách (3)" })).toHaveAttribute("href", "/admin/service-jobs/requests");
    expect(screen.getByRole("link", { name: "Loại dịch vụ" })).toHaveAttribute("href", "/admin/service-jobs/types");
    expect(screen.getByRole("button", { name: "+ Tạo đơn dịch vụ" })).toBeInTheDocument();
  });

  it("xem nhanh mở chi tiết công việc; người không có quyền quản lý không thấy Loại dịch vụ", () => {
    render(<AstryxServiceJobsView {...base} canManage={false} create={null} />);
    expect(screen.queryByRole("link", { name: "Loại dịch vụ" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem nhanh DV-0045" }));
    expect(screen.getByText("Cẩu pallet gạch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở đơn dịch vụ" })).toHaveAttribute("href", "/admin/service-jobs/j1");
  });

  it("trạng thái trống có lời nhắc theo việc đang lọc", () => {
    render(<AstryxServiceJobsView {...base} rows={[]} isFiltered q="zzz" />);
    expect(screen.getByText("Không có đơn dịch vụ phù hợp bộ lọc.")).toBeInTheDocument();
  });
});
