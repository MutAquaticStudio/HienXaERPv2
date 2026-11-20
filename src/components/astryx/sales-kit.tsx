import Link from "next/link";
import type { ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import { AxPageHead } from "./ax-kit";
import "./ax.css";
import "./sales-ax.css";

/** Bộ thành phần bố cục dùng chung cho nhóm Bán hàng (đơn bán, khách 360, dịch vụ) kiểu Astryx. Không có trạng thái; dùng được ở server. */

export function AxPanel({ title, sub, right, children, flush, tone, id }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean; tone?: "warn" | "accent"; id?: string }) {
  return <section className={`sx-panel${tone ? ` ${tone}` : ""}`} aria-labelledby={title && id ? id : undefined}>
    {(title || right) && <div className="sx-ph"><div>{title && <h2 id={id}>{title}</h2>}{sub && <small>{sub}</small>}</div>{right}</div>}
    <div className={`sx-pb${flush ? " flush" : ""}`}>{children}</div>
  </section>;
}

export type AxFactItem = { label: string; value: ReactNode; sub?: ReactNode; full?: boolean };
/** Lưới "nhãn / giá trị" (thay cho <dl class="detail-grid"> của bản Classic). */
export function AxFacts({ items }: { items: (AxFactItem | false | null | undefined)[] }) {
  return <dl className="sx-facts">{items.filter((item): item is AxFactItem => !!item).map((item) =>
    <div key={item.label} className={`sx-fact${item.full ? " full" : ""}`}><dt>{item.label}</dt><dd>{item.value}{item.sub ? <small>{item.sub}</small> : null}</dd></div>)}</dl>;
}

/** Dải thông tin tóm tắt ngang đầu trang chi tiết. */
export function AxStrip({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; num?: boolean }[] }) {
  return <div className="sx-strip">{items.map((item) => <div key={item.label}><div className="l">{item.label}</div><div className={`v${item.num ? " num" : ""}`}>{item.value}</div>{item.sub ? <div className="s">{item.sub}</div> : null}</div>)}</div>;
}

export function AxSum({ label, value, big, neg }: { label: string; value: ReactNode; big?: boolean; neg?: boolean }) {
  return <div className={`sx-sum${big ? " big" : ""}${neg ? " neg" : ""}`}><span>{label}</span><b>{value}</b></div>;
}

export function AxTag({ tone, children }: { tone?: "w" | "i" | "s" | "e"; children: ReactNode }) {
  return <span className={`sx-tag${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

/** Thanh tiến độ tín dụng / hạn mức; vượt 100% chuyển đỏ. */
export function AxMeter({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className={`sx-bar${percent > 100 ? " over" : ""}`}><i style={{ width: `${value}%` }} /></div>;
}

/** Tiến trình đơn: các bước của Astryx Stepper (đọc được bằng trình đọc màn hình). */
export function AxFlow({ steps, at, label }: { steps: readonly string[]; at: number; label: string }) {
  return <Stepper activeStep={at} orientation="vertical" label={label}>{steps.map((step, index) => <Step key={step} step={index} label={step} />)}</Stepper>;
}

/** Băng thông báo của Astryx (Banner) với vùng hành động bên phải. */
export function AxBanner({ status, title, description, actions }: { status: "info" | "success" | "warning" | "error"; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <div className="sx-bannerwrap"><Banner status={status} title={title} description={description} endContent={actions} collapsible={false} /></div>;
}

export function AxTabs({ tabs, active, href, label }: { tabs: { id: string; label: string; count?: number | string }[]; active: string; href: (tab: string) => string; label: string }) {
  return <nav className="sx-tabs" aria-label={label}>{tabs.map((tab) =>
    <Link key={tab.id} href={href(tab.id)} scroll={false} aria-current={tab.id === active ? "page" : undefined}>{tab.label}{tab.count !== undefined && <em>{tab.count}</em>}</Link>)}</nav>;
}

/** Khung trang form/nhập liệu: tiêu đề kiểu Astryx, câu dẫn, rồi form chức năng (giữ nguyên) trong vùng .sx-form-scope. */
export function AxFormPage({ crumbs, title, lede, actions, children }: { crumbs: string[]; title: string; lede?: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="sx-legacy">
    <AxPageHead crumbs={crumbs} title={title} actions={actions} />
    {lede && <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{lede}</p>}
    <div className="sx-form-scope">{children}</div>
  </div>;
}
