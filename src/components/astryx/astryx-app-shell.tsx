"use client";

import { ChevronDown, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { TopNav, TopNavItem, TopNavMenu } from "@astryxdesign/core/TopNav";
import { adminGroups, navigation, type NavigationItem } from "@/components/app-shell";
import { BranchSwitcher, BranchSwitchList, type BranchChoice } from "@/components/branch-switcher";
import { ChatDock } from "@/components/messaging/chat-dock";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import { AppearanceButton } from "@/components/settings/appearance-button";
import { UatBrowserTiming } from "@/components/uat-browser-timing";
import { AiBubble } from "@/modules/ai/ai-bubble";
import { OPEN_AI_EVENT } from "@/modules/ai/events";
import "./ax.css";

/**
 * Khung vận hành kiểu Astryx: thanh tiện ích trắng (thương hiệu, chi nhánh, tìm nhanh, chuông, người dùng) trên thanh menu xanh
 * dựng bằng TopNav của Astryx; mục đang ở dính nền trang. Quyền hiển thị menu và các thành phần chức năng dùng chung với Classic.
 */
export function AstryxAppShell({ children, permissions, actorName, branchName, branchId, branches = [], logoUrl = null }: {
  children: React.ReactNode; permissions?: readonly string[]; actorName?: string; branchName?: string; branchId?: string; branches?: readonly BranchChoice[]; logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const [userMenu, setUserMenu] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const items = navigation.admin.filter((item) => item.permissionsAny
    ? item.permissionsAny.some((permission) => permissions?.includes(permission))
    : !item.permission || permissions?.includes(item.permission) || Boolean(item.managementPermission && permissions?.includes(item.managementPermission)))
    .map((item) => item.managementHref && item.permission && !permissions?.includes(item.permission) ? { ...item, href: item.managementHref } : item);
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const activeHref = items.filter((item) => pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)) || item.activePrefixes?.some(under))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  const initials = actorName?.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") ?? "";
  const asMenuItem = (item: NavigationItem) => { const Icon = item.icon; return { title: item.label, href: item.href, icon: <Icon size={18} aria-hidden /> }; };
  const canAi = Boolean(permissions?.includes("ai.use"));
  const canCreateOrder = Boolean(permissions?.includes("orders.create"));

  return <div className="ax-root">
    <a className="skip-link" href="#main-content">Bỏ qua menu</a>
    <header className="hx-util">
      <Link className="hx-logo" href="/admin">{logoUrl
        // eslint-disable-next-line @next/next/no-img-element -- the uploaded company logo, served by the app behind sign-in
        ? <img src={logoUrl} alt="" aria-hidden width={32} height={32} style={{ borderRadius: 9 }} />
        : <i aria-hidden>HX</i>}Hiền Xa</Link>
      {branchName && <BranchSwitcher branches={branches} currentId={branchId} currentName={branchName} surface="admin" pathname={pathname} />}
      <span style={{ flex: 1 }} />
      <GlobalSearch />
      {canAi && <button type="button" className="hx-btn sm" onClick={() => window.dispatchEvent(new Event(OPEN_AI_EVENT))} aria-label="Mở trợ lý AI"><Sparkles size={16} aria-hidden />Trợ lý AI</button>}
      {branchId && <NotificationBell branchId={branchId} />}
      <div ref={userRef} style={{ position: "relative" }} onKeyDown={(event) => { if (event.key === "Escape") setUserMenu(false); }}>
        <button type="button" className="hx-user" aria-expanded={userMenu} aria-controls="ax-user-menu" onClick={() => setUserMenu((value) => !value)}>
          <Avatar name={actorName ?? ""} size={32} /><div><b>{actorName}</b>{branchName && <small>{branchName}</small>}</div><ChevronDown size={15} aria-hidden /></button>
        <div id="ax-user-menu" className="user-menu-panel" hidden={!userMenu}>
          {branches.length > 1 && <div className="user-menu-branches"><p className="branch-switch-head">Đổi chi nhánh</p>
            <BranchSwitchList branches={branches} currentId={branchId} surface="admin" pathname={pathname} /></div>}
          <AppearanceButton />
          <form action="/auth/logout" method="post"><input type="hidden" name="surface" value="admin" /><button className="logout-button" type="submit"><LogOut size={17} aria-hidden />Đăng xuất</button></form>
        </div>
      </div>
    </header>
    <nav className="hx-menu" aria-label="Menu chính">
      <TopNav label="Menu chính">
        {items.filter((item) => item.href === "/admin").map((item) => <TopNavItem key={item.href} label={item.label} href={item.href} isSelected={item.href === activeHref} />)}
        {adminGroups.map((group) => {
          const groupItems = items.filter((item) => item.group === group.id);
          if (!groupItems.length) return null;
          if (groupItems.length === 1) return <TopNavItem key={group.id} label={groupItems[0].label} href={groupItems[0].href} isSelected={groupItems[0].href === activeHref} />;
          return <TopNavMenu key={group.id} label={group.label} items={groupItems.map(asMenuItem)} />;
        })}
        {items.filter((item) => !item.group && item.href !== "/admin").map((item) => <TopNavItem key={item.href} label={item.label} href={item.href} isSelected={item.href === activeHref} />)}
      </TopNav>
      {canCreateOrder && <Link className="hx-btn g" href="/admin/orders/new" style={{ marginLeft: "auto", marginBottom: 6 }}>+ Tạo đơn bán</Link>}
    </nav>
    <main className="hx-page" id="main-content" tabIndex={-1}>{children}{<UatBrowserTiming />}</main>
    <ChatDock surface="admin" />
    {canAi && <AiBubble />}
  </div>;
}
