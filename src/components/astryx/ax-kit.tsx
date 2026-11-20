import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import "./ax.css";

/** Bộ thành phần của kiểu giao diện Astryx (concept "Hiền Xa trên Astryx"). Chỉ dùng khi thiết bị chọn Astryx. */

export type AxTone = "neutral" | "info" | "success" | "warning" | "error";
const TONE: Record<"success" | "warning" | "info" | "danger", AxTone> = { success: "success", warning: "warning", info: "info", danger: "error" };

/** Nhãn trạng thái: chữ tiếng Việt + màu; dùng Badge của Astryx. */
export function AxStatus({ tone = "neutral", children }: { tone?: AxTone | "danger"; children: string }) {
  return <Badge variant={tone === "danger" ? TONE.danger : tone} label={children} />;
}
export const toneOf = (tone: "success" | "warning" | "info" | "danger"): AxTone => TONE[tone];

export function AxPerson({ name, sub }: { name: string; sub?: string | null }) {
  return <div className="hx-person"><Avatar name={name} size={36} /><div><b>{name}</b>{sub ? <small>{sub}</small> : null}</div></div>;
}

export function AxButtonLink({ href, kind = "secondary", children, small }: { href: string; kind?: "primary" | "secondary" | "commerce"; children: ReactNode; small?: boolean }) {
  return <Link href={href} className={`hx-btn${kind === "primary" ? " p" : kind === "commerce" ? " g" : ""}${small ? " sm" : ""}`}>{children}</Link>;
}

export function AxPageHead({ crumbs, title, actions }: { crumbs?: string[]; title: string; actions?: ReactNode }) {
  return <div className="hx-head"><div>
    {crumbs && <div className="hx-crumbs">{crumbs.map((c, i) => <span key={c}>{i > 0 ? " / " : ""}{i === crumbs.length - 1 ? <b>{c}</b> : c}</span>)}</div>}
    <h1 className="hx-title">{title}</h1></div>{actions && <div className="hx-acts">{actions}</div>}</div>;
}

/** Khung "radio" lọc theo trạng thái: là liên kết (GET), nên hoạt động không cần JavaScript và giữ bộ lọc trên địa chỉ. */
export function AxFilterRadios({ title, options }: { title: string; options: { href: string; label: string; count?: string; active: boolean; dot?: string }[] }) {
  return <div className="hx-card hx-pad"><div className="hx-label" style={{ marginBottom: 8 }}>{title}</div>
    {options.map((option) => <Link key={option.label} href={option.href} className={`hx-radio${option.active ? " on" : ""}`} role="radio" aria-checked={option.active}>
      <i />{option.dot && <b className="hx-dot" style={{ background: option.dot }} />}<span>{option.label}</span>{option.count != null && <em>{option.count}</em>}</Link>)}</div>;
}
