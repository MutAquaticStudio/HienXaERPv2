import { reportQualityLabel } from "@/modules/finance/presentation";
import { exportedAtText, periodText, reportFileBase, dayText, type ExportColumn, type ExportTable } from "./export-table";

/** The finance reports' own fields; the server module re-exports the same shapes. */
export type FinanceKind = "receivables" | "payables" | "expenses";
export type FinanceRow = { id: string; label: string; context: string; date: string; amountVnd: string; href?: string };
export type FinanceReport = { title: string; totalLabel: string; totalVnd: string | null; quality: string; scopeText: string };

/** D57: Phải thu / Phải trả / Chi phí vận hành — names as the hub shows them, and the table columns of screen and file. */
export const FINANCE_REPORTS: Record<FinanceKind, { label: string; hint: string; permission: string }> = {
  receivables: { label: "Phải thu chi tiết", hint: "Từng khoản khách còn nợ đến hết ngày chọn, khoản lớn trước.", permission: "finance.ar.read" },
  payables: { label: "Phải trả chi tiết", hint: "Từng khoản còn phải trả nhà cung cấp đến hết ngày chọn, khoản lớn trước.", permission: "finance.ap.read" },
  expenses: { label: "Chi phí vận hành", hint: "Chi phí đã duyệt và thu nhập nhân sự đã duyệt trong kỳ.", permission: "finance.expense.read" },
};
export const FINANCE_GROUP = "Tài chính chi tiết";

export function financeColumns(kind: FinanceKind): ExportColumn[] {
  if (kind === "expenses") return [{ label: "Khoản chi", kind: "text" }, { label: "Loại", kind: "text" }, { label: "Số tiền", kind: "money" }];
  return [{ label: kind === "receivables" ? "Khách hàng" : "Nhà cung cấp", kind: "text" }, { label: "Công trình / chứng từ", kind: "text" },
    { label: "Hạn thanh toán", kind: "date" }, { label: kind === "receivables" ? "Còn phải thu" : "Còn phải trả", kind: "money" }];
}

export function financeCells(kind: FinanceKind, row: FinanceRow): (string | null)[] {
  return kind === "expenses" ? [row.label, row.context, row.amountVnd] : [row.label, row.context || null, row.date || null, row.amountVnd];
}

type Context = { from: string; to: string; branchName: string; now?: Date };

/** The finance report file: every open item (not just one page), the snapshot total as headline and as "Tổng cộng". */
export function financeExportTable(kind: FinanceKind, report: FinanceReport, rows: FinanceRow[], context: Context): ExportTable {
  const columns = financeColumns(kind);
  const meta: Array<[string, string]> = [[kind === "expenses" ? "Kỳ" : "Số dư đến hết", kind === "expenses" ? periodText(context.from, context.to) : dayText(context.to)],
    ["Phạm vi", report.scopeText], ["Chi nhánh", context.branchName], ["Xuất lúc", exportedAtText(context.now ?? new Date())]];
  if (report.quality !== "READY") meta.splice(2, 0, ["Số liệu", reportQualityLabel(report.quality)]);
  return {
    title: FINANCE_REPORTS[kind].label,
    sheet: FINANCE_REPORTS[kind].label,
    meta,
    kpis: [{ label: report.totalLabel, kind: "money", value: report.totalVnd }],
    columns,
    rows: rows.map((row) => financeCells(kind, row)),
    totals: rows.length > 1 && report.totalVnd !== null ? columns.map((_, index) => index === 0 ? "Tổng cộng" : index === columns.length - 1 ? report.totalVnd : null) : null,
    fileBase: reportFileBase(FINANCE_REPORTS[kind].label, kind === "expenses" ? context.from : undefined, context.to),
  };
}
