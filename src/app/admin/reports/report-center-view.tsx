import Link from "next/link";
import type { CSSProperties } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatVnd, vnd } from "@/lib/core/money";
import { availableCenterReports, cellText, loadCenterReport, type CenterReport } from "@/modules/reports/center";

type Access = { branchId: string; permissions: ReadonlySet<string> };
type Filters = { from: string; to: string; warehouse?: string };
const OLD_REPORTS: [string, string, string][] = [["receivables", "Phải thu chi tiết", "finance.ar.read"], ["payables", "Phải trả chi tiết", "finance.ap.read"], ["expenses", "Chi phí vận hành", "finance.expense.read"]];

function shift(day: string, days: number) { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function presets(today: string): [string, string, string][] {
  const monthStart = `${today.slice(0, 7)}-01`, lastMonthEnd = shift(monthStart, -1);
  return [["Hôm nay", today, today], ["Hôm qua", shift(today, -1), shift(today, -1)], ["7 ngày", shift(today, -6), today], ["Tháng này", monthStart, today], ["Tháng trước", `${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd]];
}

/** FB10 (12): KiotViet-style report hub — report groups on the left, period presets, headline figures, bar chart, table, CSV. */
export async function ReportCenterView({ access, report, filters, today }: { access: Access; report: CenterReport; filters: Filters; today: string }) {
  const db = await createServerSupabase();
  const [result, warehouses] = await Promise.all([
    loadCenterReport(db, access.branchId, report, filters.from, filters.to, filters.warehouse),
    report.warehouse ? db.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const reports = availableCenterReports(access.permissions);
  const groups = [...new Set(reports.map((item) => item.group))];
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ report: report.key, from: filters.from, to: filters.to, warehouse: filters.warehouse, ...patch })) if (value) params.set(key, value);
    return `?${params.toString()}`;
  };
  const chartColumn = report.chart ? report.columns.find((column) => column.key === report.chart) : undefined;
  const chartRows = chartColumn ? result.rows.filter((row) => Number(row[chartColumn.key] ?? 0) > 0).slice(0, report.key === "SALES_BY_DAY" ? 31 : 10) : [];
  const max = chartRows.reduce((top, row) => Math.max(top, Number(row[chartColumn!.key])), 1);
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Báo cáo</p><h1>{report.group} · {report.label}</h1><p className="lede">{report.hint}</p></div>
      <a className="button button-secondary" href={`/api/reports/center${href({})}`} download>Xuất CSV</a></header>
    <div className="report-hub">
      <nav className="card card-pad report-nav" aria-label="Danh sách báo cáo">
        {groups.map((group) => <section key={group}><h2>{group}</h2><ul>{reports.filter((item) => item.group === group).map((item) =>
          <li key={item.key}><Link className={item.key === report.key ? "active" : undefined} aria-current={item.key === report.key ? "page" : undefined} href={href({ report: item.key, warehouse: undefined })}>{item.label}</Link></li>)}</ul></section>)}
        {OLD_REPORTS.some(([, , permission]) => access.permissions.has(permission)) && <section><h2>Tài chính chi tiết</h2><ul>{OLD_REPORTS.filter(([, , permission]) => access.permissions.has(permission)).map(([key, label]) =>
          <li key={key}><Link href={`?report=${key}`}>{label}</Link></li>)}</ul></section>}
      </nav>
      <div className="page-stack">
        <form className="card filter-bar report-filters" method="get">
          <input type="hidden" name="report" value={report.key} />
          <div className="report-presets">{presets(today).map(([label, from, to]) => <Link key={label} className={`chip-link${filters.from === from && filters.to === to ? " active" : ""}`} href={href({ from, to })}>{label}</Link>)}</div>
          <label>Từ ngày<input type="date" name="from" defaultValue={filters.from} max={today} /></label>
          <label>Đến ngày<input type="date" name="to" defaultValue={filters.to} max={today} /></label>
          {report.warehouse && <label>Kho<select name="warehouse" defaultValue={filters.warehouse ?? ""}><option value="">Tất cả kho</option>{(warehouses.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
          <button className="button button-primary" type="submit">Xem báo cáo</button>
        </form>
        {result.kpis.length > 0 && <section className="metric-grid" aria-label="Số liệu chính">{result.kpis.map((kpi) => <article className="card metric-card" key={kpi.label}><span className="metric-label">{kpi.label}</span>
          <strong className="metric-value">{kpi.value === null ? "—" : kpi.kind === "money" ? formatVnd(vnd(kpi.value)) : Number(kpi.value).toLocaleString("vi-VN")}</strong></article>)}</section>}
        {chartColumn && chartRows.length > 0 && <section className="card card-pad result-chart"><div className="section-head flush"><h2>Biểu đồ {chartColumn.label.toLowerCase()}</h2></div>
          {chartRows.map((row, index) => <div className="bar-row" key={`${String(row.label)}:${index}`}><span>{String(row.label)}</span><div className="bar-track"><i style={{ "--bar-width": `${Math.max(Number(row[chartColumn.key]) * 100 / max, 2)}%` } as CSSProperties} /></div><strong>{cellText(chartColumn, row)}</strong></div>)}</section>}
        <section className="card"><div className="table-wrap"><table><thead><tr>{report.columns.map((column) => <th key={column.key} className={column.kind && column.kind !== "text" && column.kind !== "datetime" && column.kind !== "direction" ? "numeric" : undefined}>{column.label}</th>)}</tr></thead>
          <tbody>{result.rows.map((row, index) => <tr key={index}>{report.columns.map((column) => <td key={column.key} className={column.kind && column.kind !== "text" && column.kind !== "datetime" && column.kind !== "direction" ? "numeric" : undefined}>{cellText(column, row)}</td>)}</tr>)}
          {!result.rows.length && <tr><td colSpan={report.columns.length} className="muted">Không có số liệu trong khoảng thời gian này.</td></tr>}</tbody></table></div></section>
      </div>
    </div>
  </div>;
}
