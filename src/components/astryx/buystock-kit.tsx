import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { AxButtonLink } from "./ax-kit";
import "./ax.css";
import "./buystock.css";

/** Thành phần dùng chung của nhóm Mua hàng, Kho, Vật tư trên kiểu giao diện Astryx (chỉ trình bày; nghiệp vụ nằm ở trang và action hiện có). */

/** Địa chỉ có bộ lọc: bỏ khóa trống. */
export function axHref(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** Thẻ có tiêu đề (tuỳ chọn có nút bên phải). `pad={false}` để bảng sát mép. */
export function AxPanel({ title, sub, right, pad = true, tone, children, id }: { title?: string; sub?: string; right?: ReactNode; pad?: boolean; tone?: "warn"; children: ReactNode; id?: string }) {
  return <section id={id} className={`hx-card bs-panel${tone ? ` ${tone}` : ""}`} aria-label={title}>
    {(title || right) && <div className="bs-phead"><div>{title && <h2>{title}</h2>}{sub && <p>{sub}</p>}</div>{right}</div>}
    {pad ? <div className="bs-body">{children}</div> : children}
  </section>;
}

/** Bảng thật (`<table>`) trong thẻ: `heads` là tiêu đề cột; `num` căn phải; hàng truyền vào là các `<tr>`. */
export function AxTable({ label, heads, children, empty, foot }: { label: string; heads: (string | { label: string; num?: boolean; hidden?: boolean })[]; children?: ReactNode; empty?: ReactNode; foot?: ReactNode }) {
  return <div className="hx-card bs-panel" style={{ marginBottom: 16 }}>
    <div className="bs-scroll"><table className="bs-table" aria-label={label}>
      <thead><tr>{heads.map((head, index) => {
        const h = typeof head === "string" ? { label: head } : head;
        return <th key={index} scope="col" className={"num" in h && h.num ? "hx-num" : undefined}>{"hidden" in h && h.hidden ? <span className="sr-only">{h.label}</span> : h.label}</th>;
      })}</tr></thead>
      <tbody>{children}</tbody>
    </table></div>
    {empty && <div className="hx-empty" role="status">{empty}</div>}
    {foot && <div className="bs-foot">{foot}</div>}
  </div>;
}

/** Hàng thông tin nhanh đầu trang chi tiết. */
export function AxFacts({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return <div className="bs-facts">{items.map((item) => <div key={item.label} className="hx-card bs-fact"><span className="hx-label">{item.label}</span><b>{item.value}</b>{item.sub != null && <span className="hx-sub">{item.sub}</span>}</div>)}</div>;
}

/** Danh sách nhãn/giá trị dạng lưới. */
export function AxDetails({ items }: { items: { label: string; value: ReactNode; full?: boolean }[] }) {
  return <dl className="bs-dl">{items.map((item) => <div key={item.label} style={item.full ? { gridColumn: "1 / -1" } : undefined}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function AxKv({ label, value, big }: { label: string; value: ReactNode; big?: boolean }) {
  return <div className={`bs-kv${big ? " big" : ""}`}><span>{label}</span><b className="hx-num">{value}</b></div>;
}

export function AxTwoCol({ left, right, wide }: { left: ReactNode; right: ReactNode; wide?: boolean }) {
  return <div className={`bs-two${wide ? " wide" : ""}`}><div style={{ minWidth: 0 }}>{left}</div><div style={{ minWidth: 0 }}>{right}</div></div>;
}

/** Tiến trình theo bước (danh sách có đánh dấu bước hiện tại). */
export function AxSteps({ steps, at, label }: { steps: string[]; at: number; label: string }) {
  return <ol className="bs-steps" aria-label={label}>{steps.map((step, index) => <li key={step} className={index < at ? "done" : index === at ? "at" : undefined} aria-current={index === at ? "step" : undefined}><i />{step}</li>)}</ol>;
}

/** Thanh tiến độ bằng ProgressBar của Astryx, kèm chữ "đã/tổng". */
export function AxBar({ value, max, label, text }: { value: number; max: number; label: string; text: string }) {
  return <div className="bs-bar"><ProgressBar label={label} isLabelHidden value={Math.min(value, max)} max={Math.max(max, 1)} variant={value >= max && max > 0 ? "success" : "accent"} /><small>{text}</small></div>;
}

/** Bao một khối chức năng Classic (form có server action) trong thẻ Astryx và giữ nguyên bên trong. */
export function AxLegacy({ title, sub, children, id }: { title?: string; sub?: string; children: ReactNode; id?: string }) {
  return <AxPanel title={title} sub={sub} id={id}><div className="bs-legacy">{children}</div></AxPanel>;
}

/** Khung lọc GET (hoạt động không cần JavaScript; địa chỉ giữ bộ lọc). */
export function AxFilters({ action, label, children, clearHref, showClear }: { action: string; label: string; children: ReactNode; clearHref?: string; showClear?: boolean }) {
  return <form method="get" action={action} className="hx-card hx-pad bs-filters" aria-label={label}>
    {children}
    <button type="submit" className="hx-btn p">Lọc</button>
    {showClear && clearHref && <Link href={clearHref} style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
  </form>;
}
export function AxField({ label, name, defaultValue, type = "text", placeholder }: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return <label className="hx-label">{label}<input className="hx-in" type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} /></label>;
}
export function AxSelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[] }) {
  return <label className="hx-label">{label}<select className="hx-in" name={name} defaultValue={defaultValue}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

/** Trạng thái trống có nút xóa lọc / tạo mới. */
export function AxEmpty({ text, href, action }: { text: string; href?: string; action?: string }) {
  return <><p>{text}</p>{href && action && <AxButtonLink href={href}>{action}</AxButtonLink>}</>;
}

/** Trang có form Classic giữ nguyên: tiêu đề Astryx, phần form (server action, operationId, expectedVersion) đặt nguyên bên dưới. */
export function AxFormFrame({ crumbs, title, lede, actions, children }: { crumbs: string[]; title: string; lede?: string; actions?: ReactNode; children: ReactNode }) {
  return <>
    <div className="hx-head"><div>
      <div className="hx-crumbs">{crumbs.map((c, i) => <span key={c}>{i > 0 ? " / " : ""}{i === crumbs.length - 1 ? <b>{c}</b> : c}</span>)}</div>
      <h1 className="hx-title">{title}</h1>{lede && <p className="hx-muted" style={{ margin: "6px 0 0" }}>{lede}</p>}</div>{actions && <div className="hx-acts">{actions}</div>}</div>
    <div className="bs-formwrap">{children}</div>
  </>;
}
