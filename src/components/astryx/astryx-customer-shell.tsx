"use client";

import { BriefcaseBusiness, ChartColumn, CircleDollarSign, House, LogOut, MessageSquare, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { roleLabel } from "@/components/access/presentation";
import { ChatDock } from "@/components/messaging/chat-dock";
import { OrderChoiceSheet } from "@/components/portal/order-choice-sheet";
import "./ax.css";
import "./customer.css";

// Sáu mục của menu dưới trên điện thoại (cùng danh sách và quyền với portal-shell.tsx); "Đặt" nổi giữa mở tờ Hàng hóa / Dịch vụ (D75).
// "Tin nhắn" chỉ có ở biểu tượng thanh trên (điện thoại) và thanh menu máy tính; báo giá tắt hẳn (D1) nên không có mục.
const LINKS = [
  { href: "/customer", label: "Trang chủ", icon: House, phone: true },
  { href: "/customer/orders", label: "Đơn hàng", icon: BriefcaseBusiness, phone: true },
  { href: "/customer/orders/new", label: "Đặt", pcLabel: "Đặt hàng", icon: Plus, phone: true, raised: true },
  { href: "/customer/reports/ordered", label: "Báo cáo", icon: ChartColumn, phone: true },
  { href: "/customer/debts", label: "Công nợ", icon: CircleDollarSign, phone: true },
  { href: "/customer/messages", label: "Tin nhắn", icon: MessageSquare, phone: false },
  { href: "/customer/profile", label: "Tôi", icon: UserRound, phone: true },
] as const;

const AUTH_PAGES = ["/login", "/register", "/change-password"];

/**
 * Khung cổng khách kiểu Astryx: điện thoại = thanh trên + menu dưới 64px (6 mục, "Đặt" nổi giữa);
 * từ 800px = thanh tiện ích trắng (khách, tin nhắn, đăng xuất) + menu xanh ngang. Quyền hiển thị menu giống Classic.
 */
export function AstryxCustomerShell({ children, logoUrl = null, canViewDebt = false, canOrder = false, customerName, customerCode, membershipRole }: {
  children: ReactNode; logoUrl?: string | null; canViewDebt?: boolean; canOrder?: boolean; customerName?: string; customerCode?: string; membershipRole?: string;
}) {
  const pathname = usePathname();
  // D75: tờ "Bạn muốn đặt gì?" và nút đã mở nó (tiêu điểm quay về đó).
  const [sheet, setSheet] = useState<{ from: HTMLElement } | null>(null);
  // eslint-disable-next-line @next/next/no-img-element -- logo công ty nhỏ, riêng tư, phục vụ từ /api/company/logo
  const mark = logoUrl ? <i className="cx-mark" aria-hidden><img src={logoUrl} alt="" width={34} height={34} /></i> : <i className="cx-mark" aria-hidden>HX</i>;
  // Đăng nhập, đăng ký và đổi mật khẩu bắt buộc là trang toàn màn hình, không có menu cổng.
  if (AUTH_PAGES.some((page) => pathname.endsWith(page))) return <div className="ax-root cx-root">{children}</div>;

  const links = LINKS.filter((link) => (canViewDebt || link.href !== "/customer/debts") && (canOrder || link.href !== "/customer/orders/new"));
  const servicesNew = pathname === "/customer/services/new";
  const within = (target: string) => pathname === target || (target !== "/customer" && pathname.startsWith(`${target}/`));
  // "Đơn hàng" cũng bao trang theo dõi yêu cầu dịch vụ; "Đặt" cũng bao form dịch vụ. Mục sâu nhất khớp thì thắng.
  const matches = (target: string) => target === "/customer/orders" ? within(target) || (pathname.startsWith("/customer/services/") && !servicesNew)
    : target === "/customer/orders/new" ? within(target) || servicesNew : within(target);
  const isActive = (href: string) => matches(href) && !links.some((other) => other.href.length > href.length && matches(other.href));
  const openSheet = (event: React.MouseEvent<HTMLButtonElement>) => setSheet({ from: event.currentTarget });

  return <div className="ax-root cx-root">
    <a className="skip-link" href="#main-content">Bỏ qua menu</a>
    <header className="cx-top">
      <Link className="cx-brand" href="/customer">{mark}<span><b>Hiền Xa</b><small>Cổng khách hàng</small></span></Link>
      <span className="cx-spacer" />
      <Link className="cx-iconlink" href="/customer/messages" aria-label="Tin nhắn"><MessageSquare aria-hidden size={24} /></Link>
    </header>
    <header className="cx-util">
      <Link className="cx-brand" href="/customer">{mark}<span><b>Hiền Xa</b><small>Cổng khách hàng</small></span></Link>
      <span className="cx-spacer" />
      {customerName && <div className="cx-ident"><Avatar name={customerName} size={32} /><div><b>{customerName}</b><small>{[customerCode, membershipRole ? roleLabel(membershipRole) : null].filter(Boolean).join(" · ")}</small></div></div>}
      <Link className="cx-iconlink" href="/customer/messages" aria-label="Tin nhắn"><MessageSquare aria-hidden size={22} /></Link>
      <form action="/auth/logout" method="post">
        <input type="hidden" name="surface" value="customer" />
        <button className="cx-btn" type="submit" style={{ minHeight: 40 }}><LogOut className="hx-ico" aria-hidden />Đăng xuất</button>
      </form>
    </header>
    <nav className="cx-pcmenu" aria-label="Cổng khách hàng">
      {links.map((link) => {
        const active = isActive(link.href);
        if ("raised" in link) return <button type="button" key={link.href} className={active ? "on" : undefined} aria-haspopup="dialog" aria-expanded={sheet !== null} onClick={openSheet}>{link.pcLabel}</button>;
        return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>{link.label}</Link>;
      })}
    </nav>
    <main className="cx-main" id="main-content" tabIndex={-1}>{children}</main>
    <nav className="cx-bottom" aria-label="Cổng khách hàng">
      {links.filter((link) => link.phone).map(({ href, label, icon: Icon, ...link }) => {
        const active = isActive(href);
        // D75: mục đặt là nút mở tờ chọn, các mục khác là liên kết.
        if ("raised" in link) return <button type="button" key={href} className={`cx-raised${active ? " on" : ""}`} aria-haspopup="dialog" aria-expanded={sheet !== null} onClick={openSheet}>
          <span className="cx-raised-ic"><Icon aria-hidden size={26} strokeWidth={2.6} /></span><span>{label}</span></button>;
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon aria-hidden size={24} strokeWidth={active ? 2.4 : 1.9} /><span>{label}</span></Link>;
      })}
    </nav>
    {sheet && <OrderChoiceSheet onClose={() => setSheet(null)} returnFocusTo={sheet.from} />}
    <ChatDock surface="customer" />
  </div>;
}
