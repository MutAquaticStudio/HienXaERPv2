import type { ReactNode } from "react";
import { loadSignInLogoUrl } from "@/lib/company/sign-in-logo";
import { AuthFrame } from "./auth-frame";
import { PortalLogin } from "./portal-login";

const copy = {
  admin: { eyebrow: "Khối vận hành" },
  work: { eyebrow: "Cổng thợ & tài xế" },
  customer: { eyebrow: "Cổng khách hàng" },
} as const;

export const LOGIN_FOOTNOTE = "Máy này nhớ cổng bạn dùng lần trước · Quên tài khoản: hỏi quản lý cửa hàng";

/**
 * A sign-in screen. Without `children` it is the portal's login (D30: the tabbed card, opened on this portal's tab);
 * with `children` (register, change password) it shows `title`/`detail` and the given form in the same compact card.
 */
export async function AuthScreen({ surface, title, detail, notice, children, switchLink }: {
  surface: keyof typeof copy; title?: string; detail?: string; notice?: string; children?: ReactNode; switchLink?: { href: string; label: string } | null;
}) {
  const logoUrl = await loadSignInLogoUrl();
  // The shared sign-in also serves customers, so it does not call itself internal; the customer screens name the portal.
  if (!children) return <AuthFrame footnote={LOGIN_FOOTNOTE} logoUrl={logoUrl} tagline="Đăng nhập nhân viên và khách hàng"><PortalLogin initial={surface} notice={notice} /></AuthFrame>;
  const link = switchLink === undefined ? { href: "/", label: "← Về màn đăng nhập" } : switchLink;
  return <AuthFrame logoUrl={logoUrl} tagline={surface === "customer" ? "Cổng khách hàng" : undefined}><p className="eyebrow">{copy[surface].eyebrow}</p><h1>{title}</h1>{detail && <p className="muted">{detail}</p>}
    {notice && <p className="form-message" role="status">{notice}</p>}{children}
    {link && <a className="auth-switch" href={link.href}>{link.label}</a>}</AuthFrame>;
}
