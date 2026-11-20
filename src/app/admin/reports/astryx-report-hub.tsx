import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AxPageHead } from "@/components/astryx/ax-kit";
import { N4Card, N4Delta, N4Meter, N4Seg, N4Split, N4Stat, N4Table, type N4Column } from "@/components/astryx/n4-kit";
import { ReportExportButton } from "@/components/report-export-button";
import { formatVnd, vnd } from "@/lib/core/money";
import { asOfPresets, presets, reportHref, type Figure, type Period, type ReportNavItem } from "./report-hub";

/** Khung báo cáo chung (D57) kiểu Astryx: cùng tham số và liên kết với bản Classic; chỉ khác cách dựng giao diện. */

function NavList({ items, current, period }: { items: ReportNavItem[]; current: string; period: Period }) {
  const groups = [...new Set(items.map((item) => item.group))];
  return <>{groups.map((group, index) => <section key={group}>
    <p className="n4-navgroup" id={`ax-report-nav-${index}`}>{group}</p>
    <ul className="n4-navlist" aria-labelledby={`ax-report-nav-${index}`}>{items.filter((item) => item.group === group).map((item) =>
      <li key={item.key}><Link aria-current={item.key === current ? "page" : undefined} href={reportHref(item.key, period)}>{item.label}</Link></li>)}</ul>
  </section>)}</>;
}

export function AxReportHubShell({ title, hint, current, items, period, exportHref, fileName, filters, children }: {
  title: string; hint: string; current: string; items: ReportNavItem[]; period: Period; exportHref: string; fileName: string; filters: ReactNode; children: ReactNode;
}) {
  const group = items.find((item) => item.key === current)?.group;
  return <>
    <AxPageHead crumbs={["Tổng quan", "Báo cáo", ...(group && group !== title ? [group] : []), title].filter((value, index, all) => all.indexOf(value) === index)} title={title} actions={<ReportExportButton href={exportHref} fallbackName={fileName} />} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{hint}</p>
    <N4Split side={<nav className="hx-card" style={{ padding: 8 }} aria-label="Danh sách báo cáo"><NavList items={items} current={current} period={period} /></nav>}>
      {filters}{children}
    </N4Split>
  </>;
}

/** Dòng kỳ của thanh lọc: chọn nhanh kỳ (liên kết, nên nút Quay lại vẫn dùng được) rồi ngày chính xác. */
export function AxPeriodFilters({ report, mode, period, today, extra, note }: {
  report: string; mode: "range" | "asOf" | "none"; period: Period; today: string; extra?: ReactNode; note?: ReactNode;
}) {
  const quick: [string, string, string][] = mode === "range" ? presets(today) : mode === "asOf" ? asOfPresets(today).map(([label, day]) => [label, period.from, day]) : [];
  return <form className="hx-card filter-bar report-filters n4-filter" method="get" aria-label="Bộ lọc báo cáo">
    <input type="hidden" name="report" value={report} />
    {quick.length > 0 && <N4Seg label="Chọn nhanh kỳ" items={quick.map(([label, from, to]) => ({ label, href: reportHref(report, { from, to }), active: mode === "range" ? period.from === from && period.to === to : period.to === to }))} />}
    {mode === "range" && <><label>Từ ngày<input type="date" name="from" defaultValue={period.from} max={today} required /></label>
      <label>Đến ngày<input type="date" name="to" defaultValue={period.to} max={today} required /></label></>}
    {mode === "asOf" && <><input type="hidden" name="from" value={period.from} /><label>Số dư đến hết ngày<input type="date" name="to" defaultValue={period.to} max={today} required /></label></>}
    {extra}
    {mode === "none" ? note : <button className="hx-btn p" type="submit">Xem báo cáo</button>}
    {mode !== "none" && note}
  </form>;
}

function changeAgainst(current: bigint | null, previous: bigint | null) {
  if (current === null || previous === null || previous <= 0n) return null;
  const percent = Math.round(Number(((current - previous) * 1000n) / previous) / 10);
  return { percent: Math.abs(percent), up: current >= previous };
}

/** Số chính của báo cáo; có kỳ trước thì ghi "Tăng / Giảm x% so với kỳ trước" (chi tăng là cảnh báo). */
export function AxReportFigures({ figures, compareLabel }: { figures: Figure[]; compareLabel?: string }) {
  if (!figures.length) return null;
  const changes = figures.map((figure) => compareLabel && figure.previous !== undefined && figure.value !== null
    ? changeAgainst(BigInt(figure.value), figure.previous === null ? null : BigInt(figure.previous)) : null);
  return <>
    <section aria-label="Số liệu chính" className="n4-grid" style={{ gridTemplateColumns: `repeat(${Math.min(figures.length, 4)}, minmax(0, 1fr))` }}>{figures.map((figure, index) => {
      const value = figure.value === null ? null : BigInt(figure.value);
      const change = changes[index];
      const bad = change ? change.up === Boolean(figure.risingIsBad) && change.percent > 0 : false;
      return <N4Stat key={figure.label} label={figure.label} tone={value !== null && value < 0n ? "neg" : undefined}
        value={value === null ? "—" : figure.kind === "money" ? formatVnd(vnd(figure.value!)) : Number(figure.value).toLocaleString("vi-VN")}
        note={change ? <N4Delta good={change.percent === 0 ? null : !bad} text={change.percent === 0 ? "Bằng kỳ trước" : `${change.up ? "▲ Tăng" : "▼ Giảm"} ${change.percent.toLocaleString("vi-VN")}% so với kỳ trước`} /> : undefined} />;
    })}</section>
    {changes.some(Boolean) && <p className="hx-muted" style={{ margin: 0, fontSize: 13.5 }}>Kỳ trước: {compareLabel}.</p>}
  </>;
}

export function AxReportEmpty({ text, report, today, period }: { text: string; report: string; today: string; period?: Period }) {
  const lastMonth = presets(today)[4];
  const offer = period && !(period.from === lastMonth[1] && period.to === lastMonth[2]);
  return <p className="hx-muted" style={{ margin: 0 }}>{text}{offer && <> <Link className="hx-code" href={reportHref(report, { from: lastMonth[1], to: lastMonth[2] })}>Xem tháng trước</Link></>}</p>;
}

export type AxReportRow = { key: string; cells: ReactNode[]; strong?: boolean };
/** Bảng chi tiết: số căn phải, dòng Tổng cộng, cuộn ngang khi hẹp. */
export function AxReportTable({ columns, rows, total, countText, empty, footer }: { columns: N4Column[]; rows: AxReportRow[]; total?: ReactNode[]; countText?: string; empty: ReactNode; footer?: ReactNode }) {
  return <N4Card id="report-table" title="Chi tiết" pad={false} right={rows.length > 0 && countText ? <span>{countText}</span> : undefined}>
    {!rows.length ? <div style={{ padding: 16 }}>{empty}</div> : <div className="n4-scroll" role="region" aria-label="Bảng chi tiết báo cáo" tabIndex={0}>
      <N4Table caption="Chi tiết báo cáo" columns={columns} rows={rows.map((row) => row.cells)} total={total} onRowKey={(index) => rows[index].key} /></div>}
    {footer}
  </N4Card>;
}

export type AxBarItem = { key: string; label: string; display: string; percent: number; variant?: "accent" | "success" | "warning" | "error" | "neutral" };
export function AxReportBars({ title, chip, items }: { title: string; chip?: string; items: AxBarItem[] }) {
  return <N4Card id="report-chart" title={title} right={chip ? <span>{chip}</span> : undefined}>
    <div style={{ display: "grid", gap: 12 }}>{items.map((item) => <N4Meter key={item.key} label={item.label} display={item.display} percent={item.percent} variant={item.variant} />)}</div>
  </N4Card>;
}

export function AxReportColumns({ title, chip, items }: { title: string; chip?: string; items: { key: string; label: string; title: string; percent: number }[] }) {
  return <N4Card id="report-chart" title={title} right={chip ? <span>{chip}</span> : undefined}>
    <div className="n4-cols" aria-hidden="true">{items.map((item) => <span key={item.key} title={item.title}><i style={{ height: `${Math.max(item.percent, 2)}%` } as CSSProperties} /><small>{item.label}</small></span>)}</div>
    <p className="sr-only">Số liệu từng ngày có trong bảng chi tiết bên dưới.</p>
  </N4Card>;
}
