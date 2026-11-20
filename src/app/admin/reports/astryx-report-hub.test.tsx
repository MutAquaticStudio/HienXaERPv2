import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/report-export-button", () => ({ ReportExportButton: () => <div><button type="button">Xuất Excel</button><button type="button">Xuất CSV</button></div> }));
import { AstryxFinanceReport, AstryxReportCenter } from "./astryx-report-center";
import { centerReport } from "@/modules/reports/center";

afterEach(cleanup);
const nav = [{ key: "SALES_BY_CUSTOMER", group: "Bán hàng", label: "Theo khách hàng" }, { key: "receivables", group: "Tài chính chi tiết", label: "Phải thu chi tiết" }];
const period = { from: "2026-10-01", to: "2026-10-24" };

describe("khung báo cáo kiểu Astryx (D57)", () => {
  it("có danh sách báo cáo theo nhóm, kỳ nhanh, số chính so kỳ trước, dòng Tổng cộng và nút xuất Excel/CSV", () => {
    render(<AstryxReportCenter report={centerReport("SALES_BY_CUSTOMER")!} navItems={nav} period={period} today="2026-10-24" exportHref="/api/reports/center?x=1" fileName="bc" warehouses={[]}
      result={{ rows: [{ label: "Khách A", documents: 3, amount_vnd: "2500000" }, { label: "Khách B", documents: 1, amount_vnd: "500000" }], kpis: [] }}
      figures={[{ label: "Doanh thu", kind: "money", value: "3000000", previous: "2000000" }]} compareLabel="01/09 – 30/09" />);
    const side = screen.getByRole("navigation", { name: "Danh sách báo cáo" });
    expect(within(side).getByRole("link", { name: "Theo khách hàng" })).toHaveAttribute("aria-current", "page");
    expect(within(side).getByRole("link", { name: "Phải thu chi tiết" })).toHaveAttribute("href", "?report=receivables&from=2026-10-01&to=2026-10-24");
    expect(screen.getByRole("link", { name: "Tháng này" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(/Tăng 50% so với kỳ trước/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Tổng cộng")).toBeInTheDocument();
    expect(within(table).getByText("2.500.000 ₫").closest("[role=cell]")).toHaveClass("hx-num");
    expect(screen.getByRole("button", { name: "Xuất Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem báo cáo" })).toBeInTheDocument();
  });

  it("báo cáo tài chính chi tiết: tổng cộng mọi trang, khoản âm và liên kết dòng", () => {
    render(<AstryxFinanceReport kind="receivables" navItems={nav} period={period} today="2026-10-24" exportHref="/api/reports/export?x=1" fileName="pt" filters={null} scopeText="Đến hết 24/10/2026"
      figure={{ label: "Tổng phải thu", kind: "money", value: "9000000" }} chart={[]} totalVnd="9000000" allPages page={2} emptyText="Không có" pager={null} formatDate={(d) => d}
      rows={[{ id: "1", label: "PT-001", href: "/admin/receivables/1", context: "Khách A", date: "2026-10-20", amountVnd: "5000000" }, { id: "2", label: "PT-002", context: null, date: null, amountVnd: "-1000000" }]} />);
    expect(screen.getByRole("link", { name: "PT-001" })).toHaveAttribute("href", "/admin/receivables/1");
    expect(screen.getByText("Tổng cộng (mọi trang)")).toBeInTheDocument();
    expect(screen.getByText(/Trang 2/)).toBeInTheDocument();
    expect(screen.getByText(/File Excel \/ CSV gồm mọi trang/)).toBeInTheDocument();
  });

  it("báo trống bằng chữ và gợi ý xem tháng trước", () => {
    render(<AstryxReportCenter report={centerReport("SALES_BY_CUSTOMER")!} navItems={nav} period={period} today="2026-10-24" exportHref="/x" fileName="bc" warehouses={[]} result={{ rows: [], kpis: [] }} figures={[]} />);
    expect(screen.getByText(/Không có số liệu từ/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem tháng trước" })).toBeInTheDocument();
  });
});
