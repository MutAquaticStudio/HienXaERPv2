// @vitest-environment node
import { expect, it, vi } from "vitest";
import { availableCenterReports, cellText, centerCsv, centerReport, loadCenterReport } from "./center";

it("offers each report only with its area's right (FB10)", () => {
  expect(availableCenterReports(new Set(["orders.read"])).map((report) => report.key)).toEqual(["SALES_BY_DAY", "SALES_BY_CUSTOMER", "SALES_BY_STAFF", "GOODS_SALES"]);
  expect(availableCenterReports(new Set(["inventory.read", "finance.profit.read"])).map((report) => report.key)).toEqual(["STOCK_IO", "PROFIT"]);
});

it("formats money, quantities with units and CSV plainly", () => {
  const goods = centerReport("GOODS_SALES")!;
  const row = { label: "Xi măng", quantity: "12.500", unit: "bao", base_quantity: "625.000", base_unit: "kg", amount_vnd: "1250000" };
  expect(goods.columns.map((column) => cellText(column, row))).toEqual(["Xi măng", "12,5 bao", "625 kg", "1.250.000 ₫"]);
  expect(centerCsv(goods, { rows: [row], kpis: [] })).toBe("﻿Hàng hóa,SL bán,SL gốc,Tiền hàng\nXi măng,12.500,625.000,1250000\n");
});

it("reads the hub report and builds profit and loss from the dashboard figures", async () => {
  const rpc = vi.fn(async (name: string) => name === "report_center"
    ? { data: { rows: [{ label: "2026-10-24", documents: 2, amount_vnd: "500000" }], kpis: [{ label: "Doanh thu", value: "500000", kind: "money" }] }, error: null }
    : { data: { revenue: { value_vnd: "900000" }, direct_cost: { value_vnd: "600000" }, gross_profit: { value_vnd: "300000" }, operating_expense: { value_vnd: "100000" }, operating_profit: { value_vnd: "200000" } }, error: null });
  const sales = await loadCenterReport({ rpc }, "b", centerReport("SALES_BY_DAY")!, "2026-10-01", "2026-10-24");
  expect(rpc).toHaveBeenCalledWith("report_center", { target_branch_id: "b", report_key: "SALES_BY_DAY", from_date: "2026-10-01", to_date: "2026-10-24", target_warehouse_id: null });
  expect(sales.rows).toHaveLength(1);
  const profit = await loadCenterReport({ rpc }, "b", centerReport("PROFIT")!, "2026-10-01", "2026-10-24");
  expect(profit.rows.map((row) => `${row.label}:${row.amount_vnd}`)).toEqual(["Doanh thu:900000", "Giá vốn & chi phí trực tiếp:600000", "Lợi nhuận gộp:300000", "Chi phí vận hành:100000", "Lợi nhuận:200000"]);
});
