import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({
  rpc: async () => ({ data: { rows: [{ label: "Khách A", documents: 3, amount_vnd: "2500000" }, { label: "Khách B", documents: 1, amount_vnd: "500000" }], kpis: [{ label: "Doanh thu", value: "3000000", kind: "money" }] }, error: null }),
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) }),
})) }));
import { presets, ReportCenterView } from "./report-center-view";
import { readPeriod } from "./report-hub";

afterEach(cleanup);
import { centerReport } from "@/modules/reports/center";

it("offers period presets ending today", () => {
  expect(presets("2026-10-24")).toEqual([["Hôm nay", "2026-10-24", "2026-10-24"], ["Hôm qua", "2026-10-23", "2026-10-23"], ["7 ngày", "2026-10-18", "2026-10-24"],
    ["Tháng này", "2026-10-01", "2026-10-24"], ["Tháng trước", "2026-09-01", "2026-09-30"]]);
});

it("shows the report groups, headline figure, chart and table like KiotViet (FB10)", async () => {
  render(await ReportCenterView({ access: { branchId: "b", permissions: new Set(["orders.read", "finance.ar.read"]) }, report: centerReport("SALES_BY_CUSTOMER")!, today: "2026-10-24", filters: { from: "2026-10-01", to: "2026-10-24" } }));
  const nav = screen.getByRole("navigation", { name: "Danh sách báo cáo" });
  expect(within(nav).getByRole("link", { name: "Theo khách hàng" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).getByRole("link", { name: "Công nợ & tuổi nợ" })).toBeInTheDocument();
  expect(within(nav).queryByRole("link", { name: "Xuất nhập tồn" })).not.toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "Phải thu chi tiết" })).toHaveAttribute("href", "?report=receivables&from=2026-10-01&to=2026-10-24");
  // The headline and the "Tổng cộng" row; the same figure for the period before: "Bằng kỳ trước".
  expect(screen.getAllByText("3.000.000 ₫")).toHaveLength(2);
  expect(screen.getByText("Bằng kỳ trước")).toBeInTheDocument();
  expect(screen.getByText("Số đơn")).toBeInTheDocument();
  const table = screen.getByRole("table");
  expect(within(table).getByText("Tổng cộng")).toBeInTheDocument();
  expect(within(table).getByText("2.500.000 ₫").closest("td")).toHaveClass("numeric");
  // Two customers only: a chart would just repeat the table.
  expect(screen.queryByRole("heading", { name: "Doanh thu" })).not.toBeInTheDocument();
  const thisMonth = screen.getByRole("link", { name: "Tháng này" });
  expect(thisMonth).toHaveClass("active");
  expect(thisMonth).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: /Xuất Excel/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Xuất CSV/ })).toBeInTheDocument();
});

it("shows the debt report as of today, without period inputs", async () => {
  render(await ReportCenterView({ access: { branchId: "b", permissions: new Set(["finance.ar.read"]) }, report: centerReport("CUSTOMER_DEBT")!, today: "2026-10-24", filters: { from: "2026-10-01", to: "2026-10-24" } }));
  expect(screen.queryByLabelText("Từ ngày")).not.toBeInTheDocument();
  expect(screen.getByText(/Tính đến hôm nay, 24\/10\/2026/)).toBeInTheDocument();
  expect(screen.queryByText(/so với kỳ trước/)).not.toBeInTheDocument();
});

it("reads the period: inclusive, never after today, swapped when reversed", () => {
  expect(readPeriod({ from: "2026-10-20", to: "2026-10-05" }, "2026-10-24", () => "x", true)).toEqual({ period: { from: "2026-10-05", to: "2026-10-20" }, notice: "Từ ngày đang sau Đến ngày nên đã được đảo lại." });
  expect(readPeriod({ to: "2026-12-01" }, "2026-10-24", (to) => `${to.slice(0, 7)}-01`, true).period).toEqual({ from: "2026-10-01", to: "2026-10-24" });
  // A balance keeps one date; an old asOf link still works.
  expect(readPeriod({ from: "2026-10-20", asOf: "2026-09-30" }, "2026-10-24", (to) => `${to.slice(0, 7)}-01`, false)).toEqual({ period: { from: "2026-09-01", to: "2026-09-30" }, notice: undefined });
});

it("draws a stacked aging bar per customer and a column per day once there are three rows (D57)", async () => {
  const debtRows = ["A", "B", "C"].map((name, index) => ({ label: `Khách ${name}`, total_vnd: String((index + 1) * 1000000), not_due_vnd: "500000", d30_vnd: String(index * 500000 + 500000), d60_vnd: "0", d90_vnd: "0" }));
  const { createServerSupabase } = await import("@/lib/supabase/server");
  vi.mocked(createServerSupabase).mockImplementationOnce(async () => ({ rpc: async () => ({ data: { rows: debtRows, kpis: [] }, error: null }), from: () => ({}) }) as never);
  render(await ReportCenterView({ access: { branchId: "b", permissions: new Set(["finance.ar.read"]) }, report: centerReport("CUSTOMER_DEBT")!, today: "2026-10-24", filters: { from: "2026-10-24", to: "2026-10-24" } }));
  expect(screen.getByRole("heading", { name: "Khách còn nợ" })).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: /Chưa đến hạn 500.000 ₫, Quá 1–30 ngày/ })).toHaveLength(3);
  expect(within(screen.getByRole("table")).getByText("Tổng cộng").closest("tr")).toHaveTextContent("6.000.000 ₫");
  cleanup();

  const days = ["2026-10-22", "2026-10-23", "2026-10-24"].map((label, index) => ({ label, documents: 1, amount_vnd: String((index + 1) * 100000) }));
  vi.mocked(createServerSupabase).mockImplementationOnce(async () => ({ rpc: async () => ({ data: { rows: days, kpis: [] }, error: null }), from: () => ({}) }) as never);
  const view = render(await ReportCenterView({ access: { branchId: "b", permissions: new Set(["orders.read"]) }, report: centerReport("SALES_BY_DAY")!, today: "2026-10-24", filters: { from: "2026-10-22", to: "2026-10-24" } }));
  expect(screen.getByRole("heading", { name: "Doanh thu theo ngày" })).toBeInTheDocument();
  expect(view.container.querySelectorAll(".day-columns > span")).toHaveLength(3);
  expect(within(screen.getByRole("table")).getByText("24/10/2026")).toBeInTheDocument();
});
