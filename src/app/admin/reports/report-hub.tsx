import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ReportExportButton } from "@/components/report-export-button";
import { formatVnd, vnd } from "@/lib/core/money";
import { availableCenterReports } from "@/modules/reports/center";
import { dayText, periodText } from "@/modules/reports/export-table";
import { FINANCE_GROUP, FINANCE_REPORTS, type FinanceKind } from "@/modules/reports/finance-table";

export type ReportNavItem = { key: string; group: string; label: string };
export type Period = { from: string; to: string };

const FINANCE_KINDS = Object.keys(FINANCE_REPORTS) as FinanceKind[];

/** Every report this person may open: the hub reports, then "Tài chính chi tiết" (D57: one list, one frame). */
export function reportNavItems(permissions: ReadonlySet<string>): ReportNavItem[] {
  return [...availableCenterReports(permissions).map(({ key, group, label }) => ({ key, group, label })),
    ...FINANCE_KINDS.filter((kind) => permissions.has(FINANCE_REPORTS[kind].permission)).map((kind) => ({ key: kind, group: FINANCE_GROUP, label: FINANCE_REPORTS[kind].label }))];
}

export function reportHref(report: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams({ report });
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `?${search.toString()}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period of a request. "Đến ngày" includes that day and is never after today; `asOf` is its old name in links.
 * For a range, a "Từ ngày" after it is swapped (and said so) instead of being dropped; a balance "đến hết ngày" only
 * keeps "Từ ngày" to carry the period back to the other reports.
 */
export function readPeriod(query: { from?: string; to?: string; asOf?: string }, today: string, defaultFrom: (to: string) => string, range: boolean) {
  const rawTo = DATE.test(query.to ?? "") ? query.to! : DATE.test(query.asOf ?? "") ? query.asOf! : today;
  let to = rawTo > today ? today : rawTo;
  let from = DATE.test(query.from ?? "") ? query.from! : defaultFrom(to);
  let notice: string | undefined;
  if (from > to) {
    if (range) { [from, to] = [to, from]; notice = "Từ ngày đang sau Đến ngày nên đã được đảo lại."; }
    else from = defaultFrom(to);
  }
  return { period: { from, to }, notice };
}

function shift(day: string, days: number) { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function presets(today: string): [string, string, string][] {
  const monthStart = `${today.slice(0, 7)}-01`, lastMonthEnd = shift(monthStart, -1);
  return [["Hôm nay", today, today], ["Hôm qua", shift(today, -1), shift(today, -1)], ["7 ngày", shift(today, -6), today], ["Tháng này", monthStart, today], ["Tháng trước", `${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd]];
}
/** Balances are read "đến hết ngày": today, or the end of last month for closing the books. */
export function asOfPresets(today: string): [string, string][] {
  return [["Hôm nay", today], ["Cuối tháng trước", shift(`${today.slice(0, 7)}-01`, -1)]];
}

function NavList({ items, current, period, idPrefix }: { items: ReportNavItem[]; current: string; period: Period; idPrefix: string }) {
  const groups = [...new Set(items.map((item) => item.group))];
  return <>{groups.map((group, index) => <section key={group}>
    <p className="report-nav-group" id={`${idPrefix}-${index}`}>{group}</p>
    <ul aria-labelledby={`${idPrefix}-${index}`}>{items.filter((item) => item.group === group).map((item) =>
      <li key={item.key}><Link className={item.key === current ? "active" : undefined} aria-current={item.key === current ? "page" : undefined}
        href={reportHref(item.key, period)}>{item.label}</Link></li>)}</ul>
  </section>)}</>;
}

/**
 * D57: the one frame of every report — title, Excel / CSV, the report list (a "Đổi báo cáo" picker on a phone so the
 * figures come first), the filters, then the report itself.
 */
export function ReportHubShell({ title, hint, current, items, period, exportHref, fileName, filters, children }: {
  title: string; hint: string; current: string; items: ReportNavItem[]; period: Period; exportHref: string; fileName: string; filters: ReactNode; children: ReactNode;
}) {
  const currentItem = items.find((item) => item.key === current);
  return <div className="page-stack report-page">
    <header className="page-heading report-heading"><div><h1>{title}</h1><p className="lede">{hint}</p></div>
      <ReportExportButton href={exportHref} fallbackName={fileName} /></header>
    <details className="card report-switch">
      <summary><span>Đổi báo cáo</span><strong>{currentItem?.label ?? title}</strong><ChevronDown aria-hidden size={18} /></summary>
      <nav aria-label="Chọn báo cáo"><NavList items={items} current={current} period={period} idPrefix="report-switch" /></nav>
    </details>
    <div className="report-hub">
      <nav className="card card-pad report-nav" aria-label="Danh sách báo cáo"><NavList items={items} current={current} period={period} idPrefix="report-nav" /></nav>
      <div className="page-stack report-main">{filters}{children}</div>
    </div>
  </div>;
}

/** The period line of the filter bar: quick choices (links, so Back works) then the exact days. */
export function PeriodFilters({ report, mode, period, today, extra, note }: {
  report: string; mode: "range" | "asOf" | "none"; period: Period; today: string; extra?: ReactNode; note?: ReactNode;
}) {
  const quick: [string, string, string][] = mode === "range" ? presets(today) : mode === "asOf" ? asOfPresets(today).map(([label, day]) => [label, period.from, day]) : [];
  return <form className="card filter-bar report-filters" method="get">
    <input type="hidden" name="report" value={report} />
    {quick.length > 0 && <div className="report-presets" role="group" aria-label="Chọn nhanh kỳ">{quick.map(([label, from, to]) => {
      const active = mode === "range" ? period.from === from && period.to === to : period.to === to;
      return <Link key={label} className={`chip-link${active ? " active" : ""}`} aria-current={active ? "true" : undefined} href={reportHref(report, { from, to })}>{label}</Link>;
    })}</div>}
    {mode === "range" && <><label>Từ ngày<input type="date" name="from" defaultValue={period.from} max={today} required /></label>
      <label>Đến ngày<input type="date" name="to" defaultValue={period.to} max={today} required /></label></>}
    {mode === "asOf" && <><input type="hidden" name="from" value={period.from} /><label>Số dư đến hết ngày<input type="date" name="to" defaultValue={period.to} max={today} required /></label></>}
    {extra}
    {mode === "none" ? note : <button className="button button-primary" type="submit">Xem báo cáo</button>}
    {mode !== "none" && note}
  </form>;
}

function changeAgainst(current: bigint | null, previous: bigint | null) {
  if (current === null || previous === null || previous <= 0n) return null;
  const percent = Math.round(Number(((current - previous) * 1000n) / previous) / 10);
  return { percent: Math.abs(percent), up: current >= previous };
}

export type Figure = { label: string; kind: "money" | "number"; value: string | null; previous?: string | null; risingIsBad?: boolean };

/**
 * Headline figures; with the period before (`compareLabel`), "Tăng / Giảm x% so với kỳ trước" under each figure that
 * can be compared (rising spend reads as a warning) and one line naming that period. Nothing when nothing compares.
 */
export function ReportFigures({ figures, compareLabel }: { figures: Figure[]; compareLabel?: string }) {
  if (!figures.length) return null;
  const changes = figures.map((figure) => compareLabel && figure.previous !== undefined && figure.value !== null
    ? changeAgainst(BigInt(figure.value), figure.previous === null ? null : BigInt(figure.previous)) : null);
  return <>
    <section className="report-kpis" aria-label="Số liệu chính">{figures.map((figure, index) => {
      const value = figure.value === null ? null : BigInt(figure.value);
      const change = changes[index];
      const bad = change ? change.up === Boolean(figure.risingIsBad) && change.percent > 0 : false;
      return <article className={`card metric-card${figure.kind === "number" ? " is-count" : ""}`} key={figure.label}>
        <span className="metric-label">{figure.label}</span>
        <strong className={`metric-value${value !== null && value < 0n ? " is-negative" : ""}`}>{value === null ? "—" : figure.kind === "money" ? formatVnd(vnd(figure.value!)) : Number(figure.value).toLocaleString("vi-VN")}</strong>
        {change && <span className={`report-change${bad ? " bad" : change.percent ? " good" : ""}`}>
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: change.up ? undefined : "rotate(180deg)" }}><path d="M6 2 10 8H2z" fill="currentColor" /></svg>
          {change.percent === 0 ? "Bằng kỳ trước" : `${change.up ? "Tăng" : "Giảm"} ${change.percent.toLocaleString("vi-VN")}% so với kỳ trước`}</span>}
      </article>;
    })}</section>
    {changes.some(Boolean) && <p className="report-compare-note">Kỳ trước: {compareLabel}.</p>}
  </>;
}

/** A plain-words empty state that offers the next sensible period. */
export function ReportEmpty({ text, report, today, period }: { text: string; report: string; today: string; period?: Period }) {
  const lastMonth = presets(today)[4];
  const offer = period && !(period.from === lastMonth[1] && period.to === lastMonth[2]);
  return <p className="report-empty">{text}{offer && <> <Link className="code-link" href={reportHref(report, { from: lastMonth[1], to: lastMonth[2] })}>Xem tháng trước</Link></>}</p>;
}

export function periodLabel(period: Period) { return periodText(period.from, period.to); }
export { dayText };
