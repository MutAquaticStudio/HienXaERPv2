import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { jobSteps } from "@/modules/portal/presentation";
import "./ax-work.css";

/** Bộ thành phần dùng chung của cổng thợ kiểu Astryx (nhóm 6): thẻ, tiêu đề, bước, nút liên kết. Chỉ dùng khi thiết bị chọn Astryx. */

/** Thông báo đầu trang (Banner của Astryx); trạng thái luôn kèm chữ. */
export function WxNotice({ status = "info", title, children }: { status?: "info" | "warning" | "error" | "success"; title: string; children?: ReactNode }) {
  return <div className="wx-notice" role="status"><Banner status={status} title={title} description={children} /></div>;
}

export function WxHead({ title, sub, back, chip }: { title: string; sub?: string; back?: string; chip?: ReactNode }) {
  return <header className="wx-head">
    {back && <Link className="wx-back" href={back} aria-label="Quay lại"><ChevronLeft aria-hidden size={22} /></Link>}
    <div>{sub && <p>{sub}</p>}<h1>{title}</h1></div>{chip}
  </header>;
}

export function WxChip({ tone = "i", children }: { tone?: "i" | "s" | "w" | "e" | "g"; children: ReactNode }) {
  return <span className={`wx-chip ${tone}`}>{children}</span>;
}

export function WxBtnLink({ href, kind = "o", large, children, external }: { href: string; kind?: "p" | "g" | "o" | "d"; large?: boolean; children: ReactNode; external?: boolean }) {
  const className = `wx-btn ${kind}${large ? " lg" : ""}`;
  return external ? <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a> : <Link className={className} href={href}>{children}</Link>;
}

export function WxEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="wx-empty" role="status"><b>{title}</b>{children && <p>{children}</p>}</div>;
}

/** Bốn bước giao hàng (hoặc bước dịch vụ) dạng vòng tròn số: đã xong có dấu tích, bước hiện tại có vòng. */
export function WxSteps({ job }: { job: Parameters<typeof jobSteps>[0] }) {
  const { labels, done } = jobSteps(job);
  return <ol className="wx-steps" aria-label="Các bước">
    {labels.map((label, index) => {
      const state = index < done ? "done" : index === done ? "current" : "todo";
      return <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
        <span className="c" aria-hidden>{state === "done" ? "✓" : index + 1}</span><span>{label}</span>
      </li>;
    })}
  </ol>;
}
