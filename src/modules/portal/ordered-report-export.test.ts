import { expect, it } from "vitest";

import { orderedReport } from "@/test/ordered-report-fixture";
import { orderedReportTable } from "./ordered-report-export";

const now = new Date("2026-11-17T01:46:00Z");

it("builds the file table: period and customer in the title block, one row per kind of goods, services after, a money total", () => {
  const table = orderedReportTable(orderedReport({ from: "2026-11-11", to: "2026-11-17" }), "Anh Minh", now);
  expect(table.fileBase).toBe("hang-da-dat_2026-11-11_2026-11-17");
  expect(table.meta).toEqual([["Khách hàng", "Anh Minh"], ["Kỳ", "11/11/2026 – 17/11/2026"], ["Ghi chú", "Đơn đã hủy không tính"], ["Xuất lúc", "17/11/2026 08:46"]]);
  expect(table.columns.map((column) => column.label)).toEqual(["Hàng hóa", "ĐVT", "Đặt", "Đã giao", "Còn lại", "Tiền"]);
  expect(table.rows).toEqual([
    ["Cát đen", "xe", "2.000000", "2.000000", "0.000000", "1300000"],
    ["Gạch đặc", "viên", "1000", "600", "400", "1300000"],
    ["Xi măng Bút Sơn PC30", "bao", "10", "0", "10", "860000"],
    ["Dịch vụ: Máy xúc", "ca", "1", null, null, "1800000"],
  ]);
  expect(table.kpis).toEqual([
    { label: "Số đơn", kind: "number", value: "6" }, { label: "Số loại hàng", kind: "number", value: "3" }, { label: "Tổng tiền", kind: "money", value: "5260000" },
  ]);
  expect(table.totals).toEqual(["Tổng cộng", null, null, null, null, "5260000"]);
});

it("has no money column, figure or total for a role that does not see money, and never adds quantities of different units", () => {
  const table = orderedReportTable(orderedReport({ money: false }), "Anh Minh", now);
  expect(table.columns.map((column) => column.label)).toEqual(["Hàng hóa", "ĐVT", "Đặt", "Đã giao", "Còn lại"]);
  expect(table.rows.every((row) => row.length === 5)).toBe(true);
  expect(table.kpis.map((kpi) => kpi.label)).toEqual(["Số đơn", "Số loại hàng"]);
  expect(table.totals).toBeNull();
});
