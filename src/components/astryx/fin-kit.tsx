import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import "./ax.css";
import "./fin-kit.css";

/** Thành phần dùng chung của nhóm Giao hàng & Tài chính (kiểu Astryx). Chỉ dùng khi thiết bị chọn Astryx. */

/** Thẻ có tiêu đề: tiêu đề bên trái, hành động bên phải; `flush` bỏ lề trong để đặt bảng sát viền. */
export function AxCard({ title, right, children, flush, id, label, style }: { title?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean; id?: string; label?: string; style?: CSSProperties }) {
  return <section className="hx-card" id={id} aria-label={label} style={{ boxShadow: "var(--sh-2)", overflow: flush ? "hidden" : undefined, ...style }}>
    {title && <div className={`hx-ch${flush ? " bd" : ""}`}><div className="l"><h2 className="hx-sec" style={{ margin: 0 }}>{title}</h2></div>{right}</div>}
    <div style={flush ? undefined : { padding: title ? "0 16px 16px" : 16 }}>{children}</div>
  </section>;
}

/** Số liệu nổi bật; `tone`: b xanh dương, g xanh lá (tiền vào), r đỏ (quá hạn / chi), o cam, n xám. */
const KPI_TONE = { b: ["#0B63C6", "#E8F1FC"], g: ["#12804A", "#E6F5EC"], o: ["#E8890C", "#FFF3DC"], r: ["#B4291F", "#FDECEA"], n: ["#5A6B82", "#EEF1F5"] } as const;
export function AxKpi({ label, value, note, tone = "b", lead }: { label: string; value: ReactNode; note?: ReactNode; tone?: keyof typeof KPI_TONE; lead?: boolean }) {
  const [accent, bg] = KPI_TONE[tone];
  return <div className={`hx-card hx-kpi${lead ? " lead" : ""}`} style={{ "--kc": accent, "--kb": bg, flex: lead ? 1.5 : 1 } as CSSProperties}>
    <div className="top"><div className="hx-label">{label}</div></div>
    <div className="v" style={{ color: lead || tone === "g" || tone === "r" ? accent : undefined }}>{value}</div>{note && <div className="d">{note}</div>}</div>;
}

export function AxKV({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="fk-kv">{rows.map(([key, value]) => <div key={key} style={{ display: "contents" }}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

/** Thông báo trong trang (Banner của Astryx). */
export function AxNote({ status = "info", title, children }: { status?: "info" | "warning" | "error" | "success"; title: string; children?: ReactNode }) {
  return <div style={{ marginBottom: 16 }}><Banner status={status} title={title} description={children} /></div>;
}

export function AxEmpty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="hx-empty" role="status"><b>{title}</b>{children && <p>{children}</p>}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}

/** Hàng tiêu đề của bảng lưới; `num` là chỉ số cột căn phải. */
export function AxHead({ template, heads, num = [] }: { template: string; heads: readonly string[]; num?: readonly number[] }) {
  return <div className="hx-th" role="row" style={{ gridTemplateColumns: template }}>{heads.map((head, index) => <span key={head + index} role="columnheader" className={num.includes(index) ? "hx-num" : undefined}>{head}</span>)}</div>;
}
export function AxRow({ template, cells, num = [], muted, total, selected }: { template: string; cells: readonly ReactNode[]; num?: readonly number[]; muted?: boolean; total?: boolean; selected?: boolean }) {
  return <div className={`hx-row${selected ? " sel" : ""}`} style={muted ? { opacity: 0.6 } : undefined}><div className={`hx-tr${total ? " tot" : ""}`} role="row" style={{ gridTemplateColumns: template }}>
    {cells.map((cell, index) => <span key={index} role="cell" className={num.includes(index) ? "hx-num" : undefined}>{cell}</span>)}</div></div>;
}
/** Bảng lưới hoàn chỉnh (tiêu đề + dòng); cuộn ngang trên màn hẹp. */
export function AxGrid({ template, heads, rows, num, label, minWidth = 720 }: { template: string; heads: readonly string[]; rows: readonly { key: string; cells: readonly ReactNode[]; muted?: boolean; total?: boolean; selected?: boolean }[]; num?: readonly number[]; label: string; minWidth?: number }) {
  return <div className="fk-scroll" role="table" aria-label={label}><div style={{ minWidth }}><AxHead template={template} heads={heads} num={num} />
    {rows.map((row) => <AxRow key={row.key} template={template} cells={row.cells} num={num} muted={row.muted} total={row.total} selected={row.selected} />)}</div></div>;
}

/** Ô tìm kiếm GET trong thẻ; `hidden` giữ các tham số khác trên địa chỉ. */
export function AxSearch({ action, q, placeholder, label = "Tìm kiếm", hidden, name = "q" }: { action: string; q?: string; placeholder: string; label?: string; hidden?: Record<string, string | undefined>; name?: string }) {
  return <form action={action} method="get" className="fk-inline-form" role="search" aria-label={label}>
    {Object.entries(hidden ?? {}).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
    <label className="hx-label" style={{ flex: 1, minWidth: 220 }}>{label}<input className="hx-in" type="search" name={name} defaultValue={q} placeholder={placeholder} maxLength={80} style={{ width: "100%" }} /></label>
    <button type="submit" className="hx-btn p">Tìm</button>{q && <Link className="hx-btn ghost" href={action}>Xóa tìm kiếm</Link>}</form>;
}

/** Thanh tab dạng liên kết (GET): chạy không cần JavaScript, giữ trạng thái trên địa chỉ. */
export function AxTabLinks({ items, label }: { items: readonly { href: string; label: string; count?: string | number; active: boolean }[]; label: string }) {
  return <nav className="fk-tabs" role="tablist" aria-label={label}>{items.map((item) =>
    <Link key={item.label} href={item.href} role="tab" aria-selected={item.active} aria-current={item.active ? "page" : undefined}>{item.label}{item.count != null && <em>{item.count}</em>}</Link>)}</nav>;
}

/** Bọc một thành phần chức năng của Classic (biểu mẫu có server action) vào thẻ Astryx mà giữ nguyên bên trong. */
export function AxClassic({ children }: { children: ReactNode }) {
  return <div className="fk-classic">{children}</div>;
}
