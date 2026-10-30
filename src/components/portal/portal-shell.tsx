"use client";

import type { ReactNode } from "react";
import { ChatDock } from "@/components/messaging/chat-dock";
import { ShiftLocationTracker } from "@/components/routing/shift-location-tracker";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  Clock3,
  ClipboardList,
  Compass,
  House,
  LogOut,
  MessageSquare,
  MapPin,
  Plus,
  UserRound,
} from "lucide-react";

import styles from "@/components/portal/portal.module.css";
import { QUOTATIONS_ENABLED } from "@/lib/features";

// FB18: the phone menu keeps four (worker) or five (customer) places; the rest sit one tap away ("Tôi", the chat icon).
const workerLinks = [
  { href: "/work", label: "Hôm nay", icon: House, bottom: true },
  { href: "/work/pool", label: "Nhận việc", icon: Compass, bottom: true },
  { href: "/work/earnings", label: "Thu nhập", icon: CircleDollarSign, bottom: true },
  { href: "/work/attendance", label: "Chấm công", icon: Clock3, bottom: false },
  { href: "/work/tracking", label: "Vị trí", icon: MapPin, bottom: false },
  { href: "/work/messages", label: "Tin nhắn", icon: MessageSquare, bottom: false },
  { href: "/work/profile", label: "Tôi", icon: UserRound, bottom: true },
];

const customerLinks = [
  { href: "/customer", label: "Trang chủ", icon: House, bottom: true },
  { href: "/customer/orders", label: "Đơn hàng", icon: BriefcaseBusiness, bottom: true },
  { href: "/customer/orders/new", label: "Đặt hàng", icon: Plus, bottom: true, raised: true },
  ...(QUOTATIONS_ENABLED ? [{ href: "/customer/quotations", label: "Báo giá", icon: ClipboardList, bottom: false }] : []),
  { href: "/customer/debts", label: "Công nợ", icon: CircleDollarSign, bottom: true },
  { href: "/customer/messages", label: "Tin nhắn", icon: MessageSquare, bottom: false },
  { href: "/customer/profile", label: "Tôi", icon: UserRound, bottom: true },
];

export function PortalShell({
  audience,
  canViewDebt,
  canOrder,
  children,
}: {
  audience: "worker" | "customer";
  canViewDebt?: boolean;
  /** D15: owners and finance contacts order on the portal; receivers only follow deliveries. */
  canOrder?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Sign-in, registration and the forced password change are full-screen auth pages without the portal menu.
  if (["/login", "/register", "/change-password"].some((page) => pathname.endsWith(page))) return children;
  const links = audience === "worker" ? workerLinks : customerLinks.filter((link) => (canViewDebt || link.href !== "/customer/debts") && (canOrder || link.href !== "/customer/orders/new"));
  const root = audience === "worker" ? "/work" : "/customer";
  const scope = audience === "worker" ? "Cổng nhân sự" : "Cổng khách hàng";

  const nav = (compact = false) => links.filter((link) => !compact || link.bottom).map(({ href, label, icon: Icon, ...link }) => {
    const within = (target: string) => pathname === target || (target !== root && pathname.startsWith(target + "/"));
    // The deepest matching link wins ("Đặt hàng" on /customer/orders/new, not "Đơn hàng" as well).
    const active = within(href) && !links.some((other) => other.href.length > href.length && within(other.href));
    return (
      <Link className={`${styles.navLink} ${active ? styles.navLinkActive : ""} ${compact && "raised" in link && link.raised ? styles.navRaised : ""}`} href={href} key={href} aria-current={active ? "page" : undefined}>
        {compact && "raised" in link && link.raised ? <span className={styles.navRaisedIcon}><Icon aria-hidden size={24} strokeWidth={2.6} /></span> : <Icon aria-hidden size={compact ? 22 : 19} strokeWidth={2.2} />}
        <span>{label}</span>
      </Link>
    );
  });

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <div className={styles.sideBrand}>
          <span className={styles.brandMark}>HX</span>
          <span className={styles.brand}>
            <span className={styles.brandName}>HIỀN XA</span>
            <span className={styles.brandScope}>{scope}</span>
          </span>
        </div>
        <nav className={styles.sideNav} aria-label={scope}>{nav()}</nav>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topIdentity}>
            <span className={styles.brandMark}>HX</span>
            <span className={styles.brand}>
              <span className={styles.brandName}>HIỀN XA</span>
              <span className={styles.brandScope}>{scope}</span>
            </span>
          </div>
          <div className={styles.topActions}>
            {audience === "worker" && <ShiftLocationTracker />}
            <Link className={styles.topIcon} href={`${root}/messages`} aria-label="Tin nhắn"><MessageSquare aria-hidden size={20} /></Link>
            <form action="/auth/logout" method="post">
              <input type="hidden" name="surface" value={audience === "worker" ? "work" : "customer"} />
              <button className={styles.logout} type="submit">
                <LogOut aria-hidden size={18} /><span>Đăng xuất</span>
              </button>
            </form>
          </div>
        </header>
        {children}
      </main>
      <nav className={styles.bottomNav} aria-label={scope}>{nav(true)}</nav>
      <ChatDock surface={audience === "worker" ? "work" : "customer"} />
    </div>
  );
}
