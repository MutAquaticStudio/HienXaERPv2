import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  rpc: async () => ({ data: { rows: [{ label: "Khách A", documents: 3, amount_vnd: "2500000" }, { label: "Khách B", documents: 1, amount_vnd: "500000" }], kpis: [{ label: "Doanh thu", value: "3000000", kind: "money" }] }, error: null }),
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) }),
}) }));
import { presets, ReportCenterView } from "./report-center-view";
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
  expect(screen.getByText("3.000.000 ₫")).toBeInTheDocument();
  expect(screen.getAllByText("2.500.000 ₫")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Tháng này" })).toHaveClass("active");
  expect(screen.getByRole("link", { name: "Xuất CSV" })).toHaveAttribute("href", "/api/reports/center?report=SALES_BY_CUSTOMER&from=2026-10-01&to=2026-10-24");
});
