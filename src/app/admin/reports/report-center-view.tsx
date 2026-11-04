import type { CSSProperties, ReactNode } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { cellText, centerTotals, loadCenterReport, previousPeriod, type CenterColumn, type CenterReport, type CenterResult } from "@/modules/reports/center";
import { reportFileBase } from "@/modules/reports/export-table";
import { dayText, PeriodFilters, periodLabel, ReportEmpty, ReportFigures, ReportHubShell, reportNavItems, type Period } from "./report-hub";

export { presets } from "./report-hub";

type Access = { branchId: string; permissions: ReadonlySet<string> };
type Filters = { from: string; to: string; warehouse?: string };

/** Figures where more is worse: shown as a warning when they rise. */
const RISING_IS_BAD = new Set(["Tiền chi", "Còn phải trả NCC", "Giao thiếu", "Không giao được"]);
const numericKinds = new Set(["money", "quantity", "number"]);
const isNumeric = (column: CenterColumn) => numericKinds.has(column.kind ?? "text");

function negative(column: CenterColumn, row: Record<string, unknown>) {
  return column.kind === "money" && /^-\d+$/.test(String(row[column.key] ?? ""));
}

function Chart({ report, rows }: { report: CenterReport; rows: Record<string, unknown>[] }) {
  const column = report.chart ? report.columns.find((item) => item.key === report.chart) : undefined;
  if (!column) return null;
  const positive = rows.filter((row) => Number(row[column.key] ?? 0) > 0);
  // A chart of one or two rows only repeats the table.
  if (positive.length < 3) return null;
  const daily = report.key === "SALES_BY_DAY";
  const shown = daily ? positive : [...positive].sort((left, right) => Number(right[column.key]) - Number(left[column.key])).slice(0, 10);
  const max = shown.reduce((top, row) => Math.max(top, Number(row[column.key])), 1);
  const width = (value: unknown) => `${Math.max(Number(value) * 100 / max, 2)}%`;
  const cut = !daily && positive.length > shown.length;

  if (daily) return <section className="card card-pad report-chart" aria-labelledby="report-chart-title">
    <div className="section-head flush"><h2 id="report-chart-title">Doanh thu theo ngày</h2><span className="scope-chip">Cao nhất {cellText(column, shown.reduce((top, row) => Number(row[column.key]) > Number(top[column.key]) ? row : top))}</span></div>
    <div className="day-columns" aria-hidden="true">{shown.map((row) => <span key={String(row.label)} title={`${dayText(String(row.label))}: ${cellText(column, row)}`}>
      <i style={{ "--bar-height": width(row[column.key]) } as CSSProperties} /><small>{dayText(String(row.label)).slice(0, 5)}</small></span>)}</div>
    <p className="sr-only">Số liệu từng ngày có trong bảng chi tiết bên dưới.</p>
  </section>;

  if (report.key === "CUSTOMER_DEBT") {
    const parts = [["not_due_vnd", "Chưa đến hạn", "age-0"], ["d30_vnd", "Quá 1–30 ngày", "age-1"], ["d60_vnd", "Quá 31–60 ngày", "age-2"], ["d90_vnd", "Quá trên 60 ngày", "age-3"]] as const;
    return <section className="card card-pad report-chart" aria-labelledby="report-chart-title">
      <div className="section-head flush"><h2 id="report-chart-title">{cut ? "10 khách nợ nhiều nhất" : "Khách còn nợ"}</h2></div>
      <ul className="seg-legend report-legend">{parts.map(([, label, className]) => <li key={label}><i className={className} aria-hidden="true" />{label}</li>)}</ul>
      {shown.map((row, index) => <div className="bar-row" key={`${String(row.label)}:${index}`}><span>{String(row.label)}</span>
        <div className="seg-bar report-aging" style={{ width: width(row.total_vnd) }} role="img"
          aria-label={parts.map(([key, label]) => `${label} ${cellText({ key, label, kind: "money" }, row)}`).join(", ")}>
          {parts.map(([key, , className]) => Number(row[key] ?? 0) > 0 && <span key={key} className={className} style={{ flexGrow: Number(row[key]) }} />)}</div>
        <strong>{cellText(column, row)}</strong></div>)}
    </section>;
  }

  return <section className="card card-pad result-chart report-chart" aria-labelledby="report-chart-title">
    <div className="section-head flush"><h2 id="report-chart-title">{column.label}</h2>{cut && <span className="scope-chip">10 dòng cao nhất</span>}</div>
    {shown.map((row, index) => <div className="bar-row" key={`${String(row.label)}:${index}`}><span>{String(row.label)}</span>
      <div className="bar-track"><i style={{ "--bar-width": width(row[column.key]) } as CSSProperties} /></div><strong>{cellText(column, row)}</strong></div>)}
  </section>;
}

export function CenterTable({ report, result, empty }: { report: CenterReport; result: CenterResult; empty: ReactNode }) {
  const totals = centerTotals(report, result.rows);
  const totalRow: Record<string, unknown> = { ...(totals ?? {}) };
  const wide = report.columns.length > 3;
  return <section className="card report-table-card" aria-labelledby="report-table-title">
    <div className="section-head"><h2 id="report-table-title">Chi tiết</h2>{result.rows.length > 0 && <span className="scope-chip">{result.rows.length.toLocaleString("vi-VN")} dòng</span>}</div>
    {!result.rows.length ? <div className="report-empty-wrap">{empty}</div> : <>
    {wide && <p className="table-scroll-hint">Kéo ngang bảng để xem thêm cột.</p>}
    <div className="table-wrap" role="region" aria-labelledby="report-table-title" tabIndex={0}><table className="report-table">
      <thead><tr>{report.columns.map((column) => <th key={column.key} scope="col" className={isNumeric(column) ? "numeric" : undefined}>{column.label}</th>)}</tr></thead>
      <tbody>{result.rows.map((row, index) => <tr key={index} className={row.strong ? "report-row-strong" : undefined}>{report.columns.map((column) =>
        <td key={column.key} className={[isNumeric(column) && "numeric", negative(column, row) && "is-negative"].filter(Boolean).join(" ") || undefined}>{cellText(column, row)}</td>)}</tr>)}
      </tbody>
      {totals && <tfoot><tr>{report.columns.map((column, index) => <td key={column.key} className={index > 0 && isNumeric(column) ? "numeric" : undefined}>
        {index === 0 ? "Tổng cộng" : totalRow[column.key] == null ? "" : cellText(column, totalRow)}</td>)}</tr></tfoot>}
    </table></div></>}
  </section>;
}

/** FB10 (12) + D57: a hub report — period, headline figures against the period before, a chart that adds something, the table with its total. */
export async function ReportCenterView({ access, report, filters, today, notice }: { access: Access; report: CenterReport; filters: Filters; today: string; notice?: string }) {
  const db = await createServerSupabase();
  const before = previousPeriod(filters.from, filters.to);
  const [result, previous, warehouses] = await Promise.all([
    loadCenterReport(db, access.branchId, report, filters.from, filters.to, filters.warehouse),
    report.asOfToday ? Promise.resolve(null) : loadCenterReport(db, access.branchId, report, before.from, before.to, filters.warehouse).catch(() => null),
    report.warehouse ? db.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const period: Period = { from: filters.from, to: filters.to };
  const title = report.group === report.label ? report.label : `${report.group} · ${report.label}`;
  const exportParams = new URLSearchParams({ report: report.key, from: filters.from, to: filters.to });
  if (filters.warehouse) exportParams.set("warehouse", filters.warehouse);
  const figures = result.kpis.map((kpi) => ({ label: kpi.label, kind: kpi.kind, value: kpi.value, risingIsBad: RISING_IS_BAD.has(kpi.label),
    previous: previous ? previous.kpis.find((item) => item.label === kpi.label)?.value ?? null : undefined }));
  return <ReportHubShell title={title} hint={report.hint} current={report.key} items={reportNavItems(access.permissions)} period={period}
    exportHref={`/api/reports/center?${exportParams.toString()}`} fileName={reportFileBase(title, report.asOfToday ? undefined : filters.from, filters.to)}
    filters={<PeriodFilters report={report.key} mode={report.asOfToday ? "none" : "range"} period={period} today={today}
      extra={report.warehouse && <label>Kho<select name="warehouse" defaultValue={filters.warehouse ?? ""}><option value="">Tất cả kho</option>{(warehouses.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      note={report.asOfToday ? <p className="report-filter-note">Tính đến hôm nay, {dayText(today)}. Báo cáo này không theo kỳ.</p> : notice ? <p className="report-filter-note" role="status">{notice}</p> : undefined} />}>
    <ReportFigures figures={figures} compareLabel={report.asOfToday ? undefined : periodLabel(before)} />
    <Chart report={report} rows={result.rows} />
    <CenterTable report={report} result={result} empty={<ReportEmpty text={report.asOfToday ? "Không có khách nào còn nợ." : `Không có số liệu ${period.from === period.to ? "ngày" : "từ"} ${periodLabel(period).replace(" – ", " đến ")}.`}
      report={report.key} today={today} period={report.asOfToday ? undefined : period} />} />
  </ReportHubShell>;
}

