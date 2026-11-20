import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AstryxServiceJobDetailView } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));

const props = {
  number: "DV-0043", title: "Vận chuyển cát", customer: "Cô Hoa · Hà Đông", site: "Ngõ 25, Hà Đông", origin: { id: "r1", number: "YC-0018" }, state: "RESULT_SUBMITTED", stateLabel: "Chờ xác minh",
  progress: <p>Tiến độ</p>, metrics: { planned: "6 chuyến", actual: "6", billable: "Chưa xác minh", amountLabel: "Thành tiền tạm tính", amount: "1.200.000 ₫" },
  info: { schedule: "19/11/2026 08:30", operator: "Trần Văn Minh", workNumber: "CV-0043", resourceLabel: "Xe", resource: "29C-123.45", unitPrice: "200.000 ₫/chuyến", description: "Chở cát", compensable: null, receivableId: null },
  actions: <button type="button">Xác minh & ghi công nợ</button>,
};

describe("chi tiết đơn dịch vụ kiểu Astryx", () => {
  it("hiện trạng thái, số liệu, thông tin việc, liên kết yêu cầu gốc và form việc cần làm", () => {
    render(<AstryxServiceJobDetailView {...props} />);
    expect(screen.getByRole("heading", { name: "Vận chuyển cát" })).toBeInTheDocument();
    expect(screen.getByText("Chờ xác minh")).toBeInTheDocument();
    expect(screen.getByText("1.200.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Phiếu việc CV-0043")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Từ yêu cầu của khách YC-0018" })).toHaveAttribute("href", "/admin/service-jobs/requests/r1");
    expect(screen.getByRole("button", { name: "Xác minh & ghi công nợ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về danh sách" })).toHaveAttribute("href", "/admin/service-jobs");
  });

  it("đã xác minh có liên kết khoản phải thu và tính công cho thợ", () => {
    render(<AstryxServiceJobDetailView {...props} origin={null} state="VERIFIED" stateLabel="Đã xác minh" info={{ ...props.info, compensable: "6 chuyến", receivableId: "ar1" }} />);
    expect(screen.getByRole("link", { name: "Mở khoản phải thu" })).toHaveAttribute("href", "/admin/receivables/ar1");
    expect(screen.getByText("6 chuyến", { selector: "dd" })).toBeInTheDocument();
  });
});
