// @vitest-environment node
import { expect, it, vi } from "vitest";
import { availableCenterReports, cellText, centerExportTable, centerReport, centerTotals, loadCenterReport, previousPeriod } from "./center";
import { toReportCsv } from "./export-table";

it("offers each report only with its area's right (FB10)", () => {
  expect(availableCenterReports(new Set(["orders.read"])).map((report) => report.key)).toEqual(["SALES_BY_DAY", "SALES_BY_CUSTOMER", "SALES_BY_STAFF", "GOODS_SALES"]);
  expect(availableCenterReports(new Set(["inventory.read", "finance.profit.read"])).map((report) => report.key)).toEqual(["STOCK_IO", "PROFIT"]);
});

it("formats money, quantities with units and days on screen", () => {
  const goods = centerReport("GOODS_SALES")!;
  const row = { label: "Xi măng", quantity: "12.500", unit: "bao", base_quantity: "625.000", base_unit: "kg", amount_vnd: "1250000" };
  expect(goods.columns.map((column) => cellText(column, row))).toEqual(["Xi măng", "12,5 bao", "625 kg", "1.250.000 ₫"]);
  expect(cellText(centerReport("SALES_BY_DAY")!.columns[0], { label: "2026-10-24" })).toBe("24/10/2026");
});

it("adds money and counts, and quantities only when they share one unit (D57)", () => {
  const stock = centerReport("STOCK_IO")!;
  const mixed = [{ label: "Xi măng", opening: "0", in: "20050.000000", out: "2.000000", closing: "20048.000000", unit: "kg", closing_value_vnd: "32071800" },
    { label: "Cát vàng", opening: "0", in: "100.000000", out: "0", closing: "100.000000", unit: "m³", closing_value_vnd: "30000000" }];
  expect(centerTotals(stock, mixed)).toMatchObject({ opening: null, in: null, closing_value_vnd: "62071800" });
  const sameUnit = mixed.map((row) => ({ ...row, unit: "kg" }));
  expect(centerTotals(stock, sameUnit)).toMatchObject({ in: "20150", out: "2", unit: "kg" });
  // Cuối ngày mixes thu and chi; Lãi lỗ lines are results: neither gets a total row.
  expect(centerTotals(centerReport("END_OF_DAY")!, mixed)).toBeNull();
  expect(centerTotals(centerReport("PROFIT")!, mixed)).toBeNull();
});

it("exports a hub report with its unit columns, title block, figures and total row (D57)", () => {
  const goods = centerReport("GOODS_SALES")!;
  const rows = [{ label: "Xi măng", quantity: "12.500", unit: "bao", base_quantity: "625.000", base_unit: "kg", amount_vnd: "1250000" },
    { label: "=Cát (khuyến mãi)", quantity: "2.000", unit: "m³", base_quantity: "2.000", base_unit: "m³", amount_vnd: "-50000" }];
  const table = centerExportTable(goods, { rows, kpis: [{ label: "Tiền hàng đã giao", value: "1200000", kind: "money" }] },
    { from: "2026-10-01", to: "2026-11-04", branchName: "Chi nhánh chính", now: new Date("2026-11-04T07:05:00Z") });
  expect(table.columns.map((column) => column.label)).toEqual(["Hàng hóa", "ĐVT", "SL bán", "ĐVT gốc", "SL gốc", "Tiền hàng"]);
  expect(table.fileBase).toBe("Hàng hóa - Hàng bán ra 01-10-2026 đến 04-11-2026");
  expect(table.totals).toEqual(["Tổng cộng", null, null, null, null, "1200000"]);
  expect(toReportCsv(table).split("\r\n")).toEqual([
    "\uFEFF\"Báo cáo\",\"Hàng hóa · Hàng bán ra\"",
    "\"Kỳ\",\"01/10/2026 – 04/11/2026\"",
    "\"Chi nhánh\",\"Chi nhánh chính\"",
    "\"Xuất lúc\",\"04/11/2026 14:05\"",
    "\"Tiền hàng đã giao\",1200000",
    "",
    "\"Hàng hóa\",\"ĐVT\",\"SL bán\",\"ĐVT gốc\",\"SL gốc\",\"Tiền hàng\"",
    "\"Xi măng\",\"bao\",12.5,\"kg\",625,1250000",
    "\"'=Cát (khuyến mãi)\",\"m³\",2,\"m³\",2,-50000",
    "\"Tổng cộng\",,,,,1200000",
    "",
  ]);
});

it("compares with the period of the same length just before", () => {
  expect(previousPeriod("2026-11-04", "2026-11-04")).toEqual({ from: "2026-11-03", to: "2026-11-03" });
  expect(previousPeriod("2026-10-29", "2026-11-04")).toEqual({ from: "2026-10-22", to: "2026-10-28" });
  expect(previousPeriod("2026-10-01", "2026-10-31")).toEqual({ from: "2026-08-31", to: "2026-09-30" });
});

it("reads the hub report and builds profit and loss from the dashboard figures", async () => {
  const rpc = vi.fn(async (name: string) => name === "report_center"
    ? { data: { rows: [{ label: "2026-10-24", documents: 2, amount_vnd: "500000" }], kpis: [{ label: "Doanh thu", value: "500000", kind: "money" }] }, error: null }
    : { data: { revenue: { value_vnd: "900000" }, direct_cost: { value_vnd: "600000" }, gross_profit: { value_vnd: "300000" }, operating_expense: { value_vnd: "100000" }, operating_profit: { value_vnd: "200000" } }, error: null });
  const sales = await loadCenterReport({ rpc }, "b", centerReport("SALES_BY_DAY")!, "2026-10-01", "2026-10-24");
  expect(rpc).toHaveBeenCalledWith("report_center", { target_branch_id: "b", report_key: "SALES_BY_DAY", from_date: "2026-10-01", to_date: "2026-10-24", target_warehouse_id: null });
  expect(sales.rows).toHaveLength(1);
  const profit = await loadCenterReport({ rpc }, "b", centerReport("PROFIT")!, "2026-10-01", "2026-10-24");
  expect(profit.rows.filter((row) => row.strong).map((row) => row.label)).toEqual(["Lợi nhuận gộp", "Lợi nhuận"]);
  expect(profit.rows.map((row) => `${row.label}:${row.amount_vnd}`)).toEqual(["Doanh thu:900000", "Giá vốn & chi phí trực tiếp:600000", "Lợi nhuận gộp:300000", "Chi phí vận hành:100000", "Lợi nhuận:200000"]);
});
