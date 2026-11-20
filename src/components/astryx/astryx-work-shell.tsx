"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Clock3, Compass, CircleDollarSign, House, LogOut, MapPin, MessageSquare, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { ChatDock } from "@/components/messaging/chat-dock";
import { ShiftLocationTracker } from "@/components/routing/shift-location-tracker";
import portal from "@/components/portal/portal.module.css";
import "./ax-work.css";

type WorkLink = { href: string; label: string; icon: LucideIcon; bottom: boolean };

// Cùng danh sách với PortalShell (src/components/portal/portal-shell.tsx, FB18/D85): bốn mục dưới + Điều phối của thợ chính ở giữa.
const links: WorkLink[] = [
  { href: "/work", label: "Hôm nay", icon: House, bottom: true },
  { href: "/work/pool", label: "Nhận việc", icon: Compass, bottom: true },
  { href: "/work/earnings", label: "Thu nhập", icon: CircleDollarSign, bottom: true },
  { href: "/work/attendance", label: "Chấm công", icon: Clock3, bottom: false },
  { href: "/work/tracking", label: "Vị trí", icon: MapPin, bottom: false },
  { href: "/work/messages", label: "Tin nhắn", icon: MessageSquare, bottom: false },
  { href: "/work/profile", label: "Tôi", icon: UserRound, bottom: true },
];
const dispatchLink: WorkLink = { href: "/work/dispatch", label: "Điều phối", icon: UsersRound, bottom: true };

// Đăng nhập, đăng ký và đổi mật khẩu bắt buộc là màn đầy đủ, không có menu cổng.
const BARE_PAGES = ["/login", "/register", "/change-password"];

/**
 * Khung cổng thợ kiểu Astryx: thanh trên xanh, menu dưới 64px trên điện thoại (menu dọc bên trái từ 800px), nút ≥ 52px.
 * Màu lấy từ biến --portal-* nên nền sáng/tối (D84) đổi theo thiết bị; menu và quyền "Điều phối" giống PortalShell.
 */
export function AstryxWorkShell({ children, logoUrl = null, dispatchCount = null }: {
  children: ReactNode; logoUrl?: string | null;
  /** D85: số việc đang chờ người của thợ chính; null = thợ thường (không có mục Điều phối). */
  dispatchCount?: number | null;
}) {
  const pathname = usePathname();
  if (BARE_PAGES.some((page) => pathname.endsWith(page))) return <>{children}</>;
  const items = dispatchCount === null ? links : [...links.slice(0, 2), dispatchLink, ...links.slice(2)];
  const within = (target: string) => pathname === target || (target !== "/work" && pathname.startsWith(`${target}/`));
  // Mục sâu nhất khớp thắng ("Hôm nay" chỉ sáng ở đúng /work và /work/jobs/…).
  const isActive = (href: string) => href === "/work" ? pathname === "/work" || pathname.startsWith("/work/jobs/") : within(href);
  const nav = (compact: boolean) => items.filter((link) => !compact || link.bottom).map(({ href, label, icon: Icon }) => {
    const active = isActive(href);
    const waiting = href === dispatchLink.href && dispatchCount ? dispatchCount : 0;
    return <Link key={href} href={href} className={`wx-nav-link${active ? " on" : ""}`} aria-current={active ? "page" : undefined}
      aria-label={waiting ? `${label}, ${waiting} việc chờ người` : undefined}>
      <Icon aria-hidden size={compact ? 24 : 20} strokeWidth={2.2} /><span>{label}</span>
      {waiting > 0 && <span className="wx-nav-badge" aria-hidden>{waiting > 99 ? "99+" : waiting}</span>}
    </Link>;
  });
  const mark = logoUrl
    // eslint-disable-next-line @next/next/no-img-element -- ảnh logo nhỏ riêng tư từ /api/company/logo
    ? <img className="wx-mark wx-mark-logo" src={logoUrl} alt="" aria-hidden width={36} height={36} />
    : <span className="wx-mark" aria-hidden>HX</span>;
  const brand = <span className="wx-brand"><b>HIỀN XA</b><small>Cổng nhân sự</small></span>;

  return <div className={`${portal.shell} portal-shell wx-root`}>
    <a className="skip-link" href="#main-content">Bỏ qua menu</a>
    <aside className="wx-side">
      <div className="wx-side-brand">{mark}{brand}</div>
      <nav aria-label="Cổng nhân sự">{nav(false)}</nav>
    </aside>
    <div className="wx-col">
      <header className="wx-top">
        <div className="wx-top-id">{mark}{brand}</div>
        <div className="wx-top-acts">
          <ShiftLocationTracker />
          <Link className="wx-top-ib" href="/work/messages" aria-label="Tin nhắn"><MessageSquare aria-hidden size={22} /></Link>
          <form action="/auth/logout" method="post">
            <input type="hidden" name="surface" value="work" />
            <button className="wx-top-out" type="submit" aria-label="Đăng xuất"><LogOut aria-hidden size={18} /><span>Đăng xuất</span></button>
          </form>
        </div>
      </header>
      <main className="wx-main" id="main-content" tabIndex={-1}>{children}</main>
    </div>
    <nav className="wx-bottom" aria-label="Cổng nhân sự">{nav(true)}</nav>
    <ChatDock surface="work" />
  </div>;
}
