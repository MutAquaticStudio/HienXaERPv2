import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { AxStatus, type AxTone } from "@/components/astryx/ax-kit";
import "./ax.css";
import "./customer.css";

/** Bộ thành phần dùng chung của cổng khách hàng kiểu Astryx (nhãn và nghiệp vụ lấy từ presentation của module, không đặt ở đây). */

/** Màu nhãn của trạng thái đơn như khách thấy (portalOrderStateLabel): chờ = cam, đã duyệt/đang giao = xanh dương, hoàn tất = xanh lá, hủy = đỏ. */
export function orderTone(label: string): AxTone {
  if (label === "Chờ duyệt") return "warning";
  if (label.startsWith("Hoàn tất")) return "success";
  if (label === "Đã hủy") return "error";
  if (label === "Đang soạn") return "neutral";
  return "info";
}

/** serviceStageTone (module portal) → màu nhãn Astryx. */
export function serviceTone(tone: "warm" | "done" | "stopped" | "active"): AxTone {
  return tone === "warm" ? "warning" : tone === "done" ? "success" : tone === "stopped" ? "error" : "info";
}

export function CxHead({ back, title, sub, chip, actions }: { back?: { href: string; label: string }; title: string; sub?: ReactNode; chip?: ReactNode; actions?: ReactNode }) {
  return <header className="cx-head">
    {back && <Link className="cx-back" href={back.href}><ChevronLeft className="hx-ico" aria-hidden />{back.label}</Link>}
    <div className="cx-headrow">
      <div><h1 className="cx-title">{title}</h1>{(sub || chip) && <div className="cx-sub">{sub && <span>{sub}</span>}{chip}</div>}</div>
      {actions && <div className="cx-actions">{actions}</div>}
    </div>
  </header>;
}

/** Nút/liên kết: `commerce` xanh lá cho hành động đặt hàng, `primary` xanh dương, mặc định viền. */
export function CxLink({ href, kind = "secondary", lg, block, children }: { href: string; kind?: "primary" | "commerce" | "secondary" | "quiet"; lg?: boolean; block?: boolean; children: ReactNode }) {
  const tone = kind === "commerce" ? " g" : kind === "primary" ? " p" : kind === "quiet" ? " q" : "";
  return <Link href={href} className={`cx-btn${tone}${lg ? " lg" : ""}${block ? " block" : ""}`}>{children}</Link>;
}

/** Thông báo ngắn đầu trang (Banner của Astryx); vùng role="status" để trình đọc màn hình đọc ra. */
export function CxNotice({ children, status = "info" }: { children?: string | null; status?: "info" | "success" | "warning" | "error" }) {
  if (!children) return null;
  return <div role="status" className="cx-notice"><Banner status={status} title={children} /></div>;
}

export { AxStatus };
