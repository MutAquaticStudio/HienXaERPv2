import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import "./ax.css";
import "./n4.css";

/** Thành phần dùng chung của nhóm Tổng quan, Nhân công, Hệ thống (kiểu Astryx). Chỉ trình bày; dữ liệu và quyền do trang cấp. */

/** Thẻ có tiêu đề: tiêu đề bên trái, phần phải (liên kết, chú giải) và nội dung. `pad={false}` cho bảng sát mép. */
export function N4Card({ title, id, right, pad = true, children, style, tone }: { title?: ReactNode; id?: string; right?: ReactNode; pad?: boolean; children: ReactNode; style?: CSSProperties; tone?: "warn" | "danger" }) {
  const titleId = id ? `${id}-title` : undefined;
  return <section className={`hx-card n4-card${tone ? ` ${tone}` : ""}`} id={id} aria-labelledby={title && titleId ? titleId : undefined} style={style}>
    {(title || right) && <div className="hx-ch bd"><h2 className="hx-sec n4-h2" id={titleId}>{title}</h2>{right && <div className="n4-right">{right}</div>}</div>}
    <div style={pad ? { padding: 16 } : undefined}>{children}</div>
  </section>;
}

/** Nhóm chọn dạng liên kết (GET), dùng cho kỳ nhanh và độ chia biểu đồ. */
export function N4Seg({ label, items }: { label: string; items: { href: string; label: string; active: boolean }[] }) {
  return <nav className="n4-seg" aria-label={label}>{items.map((item) => <Link key={item.label} href={item.href} aria-current={item.active ? "true" : undefined} scroll={false}>{item.label}</Link>)}</nav>;
}

/** Thẻ số liệu: nhãn, giá trị lớn căn trái, dòng ghi chú (so kỳ trước, biên…). */
export function N4Stat({ label, value, note, tone, lead, title }: { label: string; value: ReactNode; note?: ReactNode; tone?: "pos" | "neg"; lead?: boolean; title?: string }) {
  return <article className={`hx-card hx-kpi${lead ? " lead" : ""}`} style={lead ? ({ "--kb": "#E8F1FC", "--kc": "#BFD7F3" } as CSSProperties) : undefined}>
    <div className="hx-label">{label}</div>
    <div className={`v${tone ? ` hx-${tone === "pos" ? "pos" : "neg"}` : ""}`} title={title}>{value}</div>
    {note && <div className="d">{note}</div>}
  </article>;
}

/** Mức tăng giảm so với kỳ trước: chữ và mũi tên, không chỉ màu. */
export function N4Delta({ text, good }: { text: string; good: boolean | null }) {
  return <span className={`n4-delta${good === null ? "" : good ? " good" : " bad"}`}>{text}</span>;
}

export type N4Column = { label: string; width: string; num?: boolean };
/** Bảng lưới có tiêu đề cột, dòng cuối "Tổng cộng" tùy chọn. Số căn phải. */
export function N4Table({ caption, columns, rows, total, empty, onRowKey }: { caption: string; columns: N4Column[]; rows: ReactNode[][]; total?: ReactNode[]; empty?: string; onRowKey?: (index: number) => string }) {
  const template = columns.map((column) => column.width).join(" ");
  const cell = (content: ReactNode, index: number) => <span key={index} role="cell" className={columns[index]?.num ? "hx-num" : undefined}>{content}</span>;
  return <div role="table" aria-label={caption} className="n4-table">
    <div role="row" className="hx-th" style={{ gridTemplateColumns: template }}>{columns.map((column) => <span key={column.label} role="columnheader" className={column.num ? "hx-num" : undefined}>{column.label}</span>)}</div>
    {rows.length === 0 ? <div className="hx-empty" role="status"><p>{empty ?? "Chưa có dữ liệu."}</p></div>
      : rows.map((row, index) => <div role="row" className="hx-row" key={onRowKey ? onRowKey(index) : index}><div className="hx-tr" style={{ gridTemplateColumns: template }}>{row.map(cell)}</div></div>)}
    {total && rows.length > 0 && <div role="row" className="hx-tr tot" style={{ gridTemplateColumns: template, borderTop: "2px solid var(--hx-line-2)" }}>{total.map(cell)}</div>}
  </div>;
}

/** Thanh tiến độ của Astryx kèm nhãn và số. */
export function N4Meter({ label, value, display, percent, variant = "accent" }: { label: string; value?: ReactNode; display?: ReactNode; percent: number; variant?: "accent" | "success" | "warning" | "error" | "neutral" }) {
  return <div className="n4-meter"><div className="n4-meter-head"><span>{label}</span><b>{display ?? value}</b></div>
    <ProgressBar label={label} isLabelHidden value={Math.max(0, Math.min(100, percent))} variant={variant} /></div>;
}

/** Ô thông báo nhỏ có biểu tượng chữ: cảnh báo, thông tin (không dùng màu làm tín hiệu duy nhất). */
export function N4Note({ kind = "info", title, children }: { kind?: "info" | "warn" | "danger"; title: string; children?: ReactNode }) {
  return <div className={`n4-note ${kind}`} role="status"><b>{title}</b>{children && <div>{children}</div>}</div>;
}

/** Hai cột: bên trái lọc/menu, bên phải nội dung. */
export function N4Split({ side, children }: { side: ReactNode; children: ReactNode }) {
  return <div className="n4-split"><aside className="hx-side">{side}</aside><div className="n4-main">{children}</div></div>;
}
