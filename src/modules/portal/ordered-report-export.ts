import { exportedAtText, periodText, sumValues, type ExportColumn, type ExportTable, type ExportValue } from "@/modules/reports/export-table";
import type { OrderedReport } from "@/modules/portal/ordered-report-schema";

/**
 * D98: the customer's "Báo cáo hàng đã đặt" as an Excel / CSV table: a title block (customer, period), the figures,
 * one row per kind of goods (ordered, delivered, remaining), then the services of the period. The money column exists only
 * when the database said this role may see money; a role without it gets a file with no amounts at all.
 */
export function orderedReportTable(report: OrderedReport, customerName: string, now: Date = new Date()): ExportTable {
  const money = report.show_money;
  const columns: ExportColumn[] = [
    { label: "Hàng hóa", kind: "text" }, { label: "ĐVT", kind: "text" },
    { label: "Đặt", kind: "quantity" }, { label: "Đã giao", kind: "quantity" }, { label: "Còn lại", kind: "quantity" },
    ...(money ? [{ label: "Tiền", kind: "money" } as ExportColumn] : []),
  ];
  const rows: ExportValue[][] = [
    ...report.goods.map((good): ExportValue[] => [good.name, good.uom_symbol, good.ordered_qty, good.delivered_qty, good.remaining_qty, ...(money ? [good.amount_vnd ?? null] : [])]),
    ...report.services.map((service): ExportValue[] => [`Dịch vụ: ${service.name}`, service.unit_label ?? null, service.quantity, null, null, ...(money ? [service.amount_vnd ?? null] : [])]),
  ];
  const sum = money ? sumValues("money", rows.map((row) => row[5] ?? null)) : null;
  return {
    title: "Hàng đã đặt",
    sheet: "Hàng đã đặt",
    meta: [
      ["Khách hàng", customerName],
      ["Kỳ", periodText(report.from, report.to)],
      ["Ghi chú", "Đơn đã hủy không tính"],
      ["Xuất lúc", exportedAtText(now)],
    ],
    kpis: [
      { label: "Số đơn", kind: "number", value: String(report.order_count) },
      { label: "Số loại hàng", kind: "number", value: String(report.material_kinds) },
      ...(money && report.total_vnd !== undefined ? [{ label: "Tổng tiền", kind: "money" as const, value: report.total_vnd }] : []),
    ],
    columns,
    rows,
    // Quantities of different units are never added together; only the money column has a total.
    totals: money && rows.length > 1 && sum !== null ? columns.map((_, index) => index === 0 ? "Tổng cộng" : index === 5 ? sum : null) : null,
    fileBase: `hang-da-dat_${report.from}_${report.to}`,
  };
}
