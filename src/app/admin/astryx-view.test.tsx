import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AxAgingCard, AxDashboardHead, AxDebtorsCard, AxFigures, AxTodayCard } from "./astryx-view";

afterEach(cleanup);
vi.mock("@/modules/dashboard/today", () => ({}));

const item = { key: "portal", count: 2, title: "Đơn khách tự đặt chờ duyệt", detail: "SO-0230 · Anh Tuấn", href: "/admin/orders?state=PORTAL_WAITING", action: "Duyệt đơn", tone: "info" as const };

describe("tổng quan kiểu Astryx", () => {
  it("đặt Cần xử lý hôm nay có nút dẫn tới màn xử lý và tổng số việc", () => {
    render(<AxTodayCard items={[item]} />);
    expect(screen.getByRole("heading", { name: "Cần xử lý hôm nay" })).toBeInTheDocument();
    expect(screen.getByText("2 việc")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Duyệt đơn" })).toHaveAttribute("href", "/admin/orders?state=PORTAL_WAITING");
  });

  it("báo trống rõ ràng khi không còn việc", () => {
    render(<AxTodayCard items={[]} />);
    expect(screen.getByText(/Không còn việc nào cần xử lý/)).toBeInTheDocument();
  });

  it("số chính hiện số rút gọn có số đầy đủ trong tiêu đề, '—' khi chưa có số và ghi chú chất lượng", () => {
    render(<AxFigures ready scope="Số liệu ghi nhận" figures={[
      { key: "r", label: "Doanh thu", value: 68_400_000n, tone: "pos" }, { key: "c", label: "Lợi nhuận gộp", value: null, qualityText: "Chưa đủ hoặc chưa khớp giá vốn theo dòng và nguồn" }]} />);
    expect(screen.getByText("68,4 triệu")).toHaveAttribute("title", expect.stringContaining("68.400.000"));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/Chưa đủ hoặc chưa khớp giá vốn/)).toBeInTheDocument();
  });

  it("kỳ nhanh là liên kết và có kỳ đang chọn; bộ lọc mở khi đang lọc", () => {
    render(<AxDashboardHead subtitle="Kỳ 01/11 đến 01/12" filterCount={1} filters={<p>Bộ lọc nhúng</p>}
      quick={[{ href: "/admin?from=a", label: "Hôm nay", active: false }, { href: "/admin?from=b", label: "Tháng này", active: true }]} />);
    expect(screen.getByRole("link", { name: "Tháng này" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("href", "/admin?from=a");
    expect(screen.getByText(/Lọc · khách, công trình, nhân viên \(1\)/)).toBeInTheDocument();
  });

  it("công nợ: liệt kê khách nợ, đánh dấu quá hạn bằng chữ; ẩn liên kết Tất cả khi không có quyền", () => {
    render(<><AxDebtorsCard canAll={false} allHref="/x" items={[{ id: "1", name: "Anh Nam", sub: "CT A · hạn 02/11/2026", amount: "30.400.000 ₫", late: true, href: "/admin/receivables/1" }]} />
      <AxAgingCard aging={{ totalVnd: 0n, notDueVnd: 0n, late30Vnd: 0n, late60Vnd: 0n, late90Vnd: 0n, customers: 0 }} /></>);
    expect(screen.getByText(/quá hạn/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tất cả" })).not.toBeInTheDocument();
    expect(screen.getByText("Không có khách còn nợ.")).toBeInTheDocument();
  });
});
