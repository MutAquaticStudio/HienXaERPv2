import type { ReactNode } from "react";
import { LoginForm } from "./login-form";

const copy = {
  admin: { eyebrow: "Cổng điều hành", title: "Đăng nhập để tiếp tục", detail: "Dành cho chủ doanh nghiệp và nhân viên văn phòng.", switchHref: "/work/login", switchLabel: "Đi tới cổng tác nghiệp" },
  work: { eyebrow: "Cổng tác nghiệp", title: "Bắt đầu ca làm việc", detail: "Dành cho kho, tài xế và đội hiện trường.", switchHref: "/login", switchLabel: "Đi tới cổng điều hành" },
  customer: { eyebrow: "Cổng khách hàng", title: "Theo dõi giao dịch", detail: "Đặt hàng, theo dõi giao nhận và công nợ của tài khoản này.", switchHref: "/login", switchLabel: "Đi tới cổng điều hành" },
} as const;

/** The sign-in screen; `title`/`detail`/`children` replace the login form for the other auth pages (register, change password). */
export function AuthScreen({ surface, title, detail, notice, children, switchLink }: {
  surface: keyof typeof copy; title?: string; detail?: string; notice?: string; children?: ReactNode; switchLink?: { href: string; label: string } | null;
}) {
  const content = copy[surface];
  const link = switchLink === undefined ? { href: content.switchHref, label: content.switchLabel } : switchLink;
  return <main className="auth-screen"><section className="auth-story"><span className="brand-mark">HX</span><p className="eyebrow">HIỀN XA ERP</p><h1>Một nguồn dữ liệu.<br />Ba không gian làm việc.</h1><p>Quản lý bán hàng, mua hàng, giao nhận và công nợ theo quyền của từng nhân viên.</p></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">{content.eyebrow}</p><h2>{title ?? content.title}</h2><p className="muted">{detail ?? content.detail}</p>{notice && <p className="form-message" role="status">{notice}</p>}{children ?? <LoginForm surface={surface} />}{link && <a className="auth-switch" href={link.href}>{link.label}</a>}</div></section></main>;
}
