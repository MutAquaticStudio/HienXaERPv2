import type { ReactNode } from "react";
import { cellText, centerTotals, type CenterColumn, type CenterReport, type CenterResult } from "@/modules/reports/center";
import { dayText } from "@/modules/reports/export-table";
import { formatVnd, vnd } from "@/lib/core/money";
import { FINANCE_REPORTS, financeColumns, type FinanceKind } from "@/modules/reports/finance-table";
import Link from "next/link";
import { AxReportBars, AxReportColumns, AxReportEmpty, AxReportFigures, AxReportHubShell, AxReportTable, AxPeriodFilters, type AxBarItem, type AxReportRow } from "./astryx-report-hub";
import type { Figure, Period, ReportNavItem } from "./report-hub";
import type { N4Column } from "@/components/astryx/n4-kit";

const numericKinds = new Set(["money", "quantity", "number"]);
const isNumeric = (column: CenterColumn) => numericKinds.has(column.kind ?? "text");
const negative = (column: CenterColumn, row: Record<string, unknown>) => column.kind === "money" && /^-\d+$/.test(String(row[column.key] ?? ""));

/** Biểu đồ của báo cáo trung tâm: cột theo ngày, tuổi nợ theo khách, hoặc 10 dòng cao nhất; một hai dòng thì bảng đã đủ nên bỏ. */
function CenterChart({ report, rows }: { report: CenterReport; rows: Record<string, unknown>[] }) {
  const column = report.chart ? report.columns.find((item) => item.key === report.chart) : undefined;
  if (!column) return null;
  const positive = rows.filter((row) => Number(row[column.key] ?? 0) > 0);
  if (positive.length < 3) return null;
  const daily = report.key === "SALES_BY_DAY";
  const shown = daily ? positive : [...positive].sort((left, right) => Number(right[column.key]) - Number(left[column.key])).slice(0, 10);
  const max = shown.reduce((top, row) => Math.max(top, Number(row[column.key])), 1);
  const percent = (value: unknown) => Number(value) * 100 / max;
  const cut = !daily && positive.length > shown.length;
  if (daily) return <AxReportColumns title="Doanh thu theo ngày" chip={`Cao nhất ${cellText(column, shown.reduce((top, row) => Number(row[column.key]) > Number(top[column.key]) ? row : top))}`}
    items={shown.map((row, index) => ({ key: `${String(row.label)}:${index}`, label: dayText(String(row.label)).slice(0, 5), title: `${dayText(String(row.label))}: ${cellText(column, row)}`, percent: percent(row[column.key]) }))} />;
  const items: AxBarItem[] = shown.map((row, index) => ({ key: `${String(row.label)}:${index}`, label: String(row.label), display: cellText(column, row), percent: percent(row[column.key]),
    variant: report.key === "CUSTOMER_DEBT" && Number(row.d90_vnd ?? 0) > 0 ? "error" : report.key === "CUSTOMER_DEBT" && (Number(row.d30_vnd ?? 0) > 0 || Number(row.d60_vnd ?? 0) > 0) ? "warning" : "accent" }));
  return <AxReportBars title={report.key === "CUSTOMER_DEBT" ? (cut ? "10 khách nợ nhiều nhất" : "Khách còn nợ") : column.label} chip={cut ? "10 dòng cao nhất" : undefined} items={items} />;
}

/** Báo cáo trung tâm (FB10, D57) kiểu Astryx. Số liệu đã được trang tải; ở đây chỉ trình bày. */
export function AstryxReportCenter({ report, result, figures, compareLabel, navItems, period, exportHref, fileName, today, notice, warehouses, warehouse }: {
  report: CenterReport; result: CenterResult; figures: Figure[]; compareLabel?: string; navItems: ReportNavItem[]; period: Period; exportHref: string; fileName: string;
  today: string; notice?: string; warehouses: { id: string; name: string }[]; warehouse?: string;
}) {
  const title = report.group === report.label ? report.label : `${report.group} · ${report.label}`;
  const totals = centerTotals(report, result.rows);
  const totalRow: Record<string, unknown> = { ...(totals ?? {}) };
  const columns: N4Column[] = report.columns.map((column, index) => ({ label: column.label, width: index === 0 ? "minmax(160px,1.6fr)" : "minmax(110px,1fr)", num: isNumeric(column) }));
  const rows: AxReportRow[] = result.rows.map((row, index) => ({ key: String(index), strong: Boolean(row.strong), cells: report.columns.map((column) => {
    const text = cellText(column, row);
    return negative(column, row) ? <span className="hx-neg">{text}</span> : text;
  }) }));
  const emptyText = report.asOfToday ? "Không có khách nào còn nợ." : `Không có số liệu ${period.from === period.to ? "ngày" : "từ"} ${dayText(period.from)}${period.from === period.to ? "" : ` đến ${dayText(period.to)}`}.`;
  return <AxReportHubShell title={title} hint={report.hint} current={report.key} items={navItems} period={period} exportHref={exportHref} fileName={fileName}
    filters={<AxPeriodFilters report={report.key} mode={report.asOfToday ? "none" : "range"} period={period} today={today}
      extra={report.warehouse && <label>Kho<select name="warehouse" defaultValue={warehouse ?? ""}><option value="">Tất cả kho</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      note={report.asOfToday ? <p className="report-filter-note">Tính đến hôm nay, {dayText(today)}. Báo cáo này không theo kỳ.</p> : notice ? <p className="report-filter-note" role="status">{notice}</p> : undefined} />}>
    <AxReportFigures figures={figures} compareLabel={report.asOfToday ? undefined : compareLabel} />
    <CenterChart report={report} rows={result.rows} />
    <AxReportTable columns={columns} rows={rows} countText={`${result.rows.length.toLocaleString("vi-VN")} dòng`}
      total={totals ? report.columns.map((column, index) => index === 0 ? "Tổng cộng" : totalRow[column.key] == null ? "" : cellText(column, totalRow)) : undefined}
      empty={<AxReportEmpty text={emptyText} report={report.key} today={today} period={report.asOfToday ? undefined : period} />} />
  </AxReportHubShell>;
}

export type AxFinanceRow = { id: string; label: string; href?: string | null; context?: string | null; date?: string | null; amountVnd: string };
/** Phải thu / Phải trả / Chi phí vận hành trong khung báo cáo (D57), kiểu Astryx. */
export function AstryxFinanceReport({ kind, navItems, period, exportHref, fileName, today, filters, scopeText, qualityNote, figure, chart, rows, totalVnd, allPages, page, emptyText, emptyPeriod, pager, formatDate }: {
  kind: FinanceKind; navItems: ReportNavItem[]; period: Period; exportHref: string; fileName: string; today: string; filters: ReactNode; scopeText: string; qualityNote?: string;
  figure: Figure; chart: { label: string; amountVnd: string }[]; rows: AxFinanceRow[]; totalVnd: string | null; allPages: boolean; page: number; emptyText: string; emptyPeriod?: Period; pager: ReactNode;
  formatDate: (date: string) => string;
}) {
  const label = FINANCE_REPORTS[kind].label;
  const columns: N4Column[] = financeColumns(kind).map((column, index, all) => ({ label: column.label, width: index === 0 ? "minmax(150px,1.2fr)" : index === all.length - 1 ? "minmax(130px,.9fr)" : "minmax(120px,1fr)", num: column.kind === "money" }));
  const max = chart.reduce((top, item) => { const value = BigInt(item.amountVnd); return value > top ? value : top; }, 1n);
  return <AxReportHubShell title={label} hint={FINANCE_REPORTS[kind].hint} current={kind} items={navItems} period={period} exportHref={exportHref} fileName={fileName} filters={filters}>
    <p className="hx-muted" style={{ margin: 0 }}>{scopeText}</p>
    {qualityNote && <div className="n4-note warn" role="status"><b>{qualityNote}</b></div>}
    <AxReportFigures figures={[figure]} />
    {chart.length > 0 && <AxReportBars title="Khoản lớn nhất" chip={`${chart.length} khoản`} items={chart.map((item) => ({ key: `${item.label}:${item.amountVnd}`, label: item.label, display: formatVnd(vnd(item.amountVnd)), percent: Number(BigInt(item.amountVnd) * 100n / max) }))} />}
    <AxReportTable columns={columns} countText={allPages ? `Trang ${page} · 25 dòng/trang` : `${rows.length.toLocaleString("vi-VN")} dòng`}
      rows={rows.map((row) => ({ key: row.id, cells: [row.href ? <Link key="l" className="hx-code" href={row.href}>{row.label}</Link> : row.label, row.context || "—",
        ...(kind !== "expenses" ? [row.date ? formatDate(row.date) : "—"] : []), <span key="a" className={row.amountVnd.startsWith("-") ? "hx-neg" : undefined}>{formatVnd(vnd(row.amountVnd))}</span>] }))}
      total={rows.length > 1 && totalVnd !== null ? [allPages ? "Tổng cộng (mọi trang)" : "Tổng cộng", ...columns.slice(1, -1).map(() => ""), formatVnd(vnd(totalVnd))] : undefined}
      empty={<AxReportEmpty text={emptyText} report={kind} today={today} period={emptyPeriod} />}
      footer={<>{pager}{allPages && <p className="hx-muted" style={{ padding: "0 16px 12px", margin: 0, fontSize: 13.5 }}>File Excel / CSV gồm mọi trang, không chỉ trang này.</p>}</>} />
  </AxReportHubShell>;
}
