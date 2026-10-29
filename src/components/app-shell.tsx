"use client";

import { BarChart3, Boxes, ChevronDown, ClipboardCheck, Clock3, Sparkles, Factory, FileText, LayoutDashboard, LogOut, MapPin, Menu, MessageSquare, PackageSearch, Plus, Route, ScrollText, Settings2, ShieldCheck, ShoppingCart, Truck, UserRound, UsersRound, WalletCards, Warehouse, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { aiModuleOf } from "@/modules/ai/sources";
import { AppearanceButton } from "@/components/settings/appearance-button";
import { UatBrowserTiming } from "@/components/uat-browser-timing";
import { PAYMENT_NOTICES_ENABLED, QUOTATIONS_ENABLED } from "@/lib/features";

type Surface = "admin" | "work" | "customer";

type NavigationItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; permission?: string; permissionsAny?: readonly string[]; group?: string; managementPermission?: string; managementHref?: string;
  /** Other sections shown under this one, e.g. "Công nợ" covers the receivable and payable pages. */
  activePrefixes?: readonly string[] };

const adminGroups = [
  { id: "sales", label: "Bán hàng", icon: ShoppingCart },
  { id: "purchasing", label: "Mua hàng", icon: PackageSearch },
  { id: "inventory", label: "Kho hàng", icon: Warehouse },
  { id: "delivery", label: "Giao hàng", icon: Truck },
  { id: "finance", label: "Tài chính", icon: WalletCards },
  { id: "workforce", label: "Nhân công", icon: UsersRound },
  { id: "administration", label: "Quản trị", icon: Settings2 },
] as const;

const navigation: Record<Surface, readonly NavigationItem[]> = {
  admin: [
    { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, exact: true, permission: "dashboard.read" },
    { href: "/admin/orders", label: "Đơn bán", icon: ShoppingCart, permission: "orders.read", group: "sales" },
    ...(QUOTATIONS_ENABLED ? [{ href: "/admin/quotations", label: "Báo giá", icon: FileText, permission: "quotation.read", group: "sales" }] : []),
    { href: "/admin/customers", label: "Khách hàng", icon: UsersRound, permission: "customers.read", managementPermission: "customers.manage", managementHref: "/admin/customers/manage", group: "sales" },
    { href: "/admin/service-jobs", label: "Dịch vụ", icon: Truck, permission: "service.read", group: "sales" },
    { href: "/admin/purchase-orders", label: "Đơn mua", icon: PackageSearch, permission: "purchasing.read", group: "purchasing" },
    { href: "/admin/suppliers", label: "Nhà cung cấp", icon: Factory, permission: "suppliers.read", managementPermission: "suppliers.manage", managementHref: "/admin/suppliers/manage", group: "purchasing" },
    { href: "/admin/products", label: "Vật tư", icon: Boxes, permission: "catalog.read", managementPermission: "catalog.manage", managementHref: "/admin/products/manage", group: "inventory" },
    { href: "/admin/products/pricing", label: "Giá bán", icon: WalletCards, permission: "pricing.read", group: "inventory" },
    { href: "/admin/inventory", label: "Tồn kho", icon: Warehouse, permission: "inventory.read", managementPermission: "roles.manage", managementHref: "/admin/inventory/warehouses", group: "inventory" },
    { href: "/admin/stock-counts", label: "Kiểm kho", icon: ClipboardCheck, permission: "inventory.read", group: "inventory" },
    { href: "/admin/dispatch", label: "Điều phối", icon: ClipboardCheck, permission: "delivery.read", managementPermission: "roles.manage", managementHref: "/admin/dispatch/resources", group: "delivery" },
    { href: "/admin/deliveries", label: "Phiếu giao", icon: Truck, permission: "delivery.read", group: "delivery" },
    { href: "/admin/routes", label: "Lộ trình", icon: Route, permission: "delivery.read", group: "delivery" },
    { href: "/admin/debts", label: "Công nợ", icon: WalletCards, permissionsAny: ["finance.ar.read", "finance.ap.read"], activePrefixes: ["/admin/receivables", "/admin/payables"], group: "finance" },
    { href: "/admin/cashbook", label: "Sổ quỹ", icon: WalletCards, permission: "finance.ar.read", group: "finance" },
    { href: "/admin/expenses", label: "Chi phí", icon: FileText, permission: "finance.expense.read", group: "finance" },
    ...(PAYMENT_NOTICES_ENABLED ? [{ href: "/admin/payment-notices", label: "Báo chuyển khoản", icon: WalletCards, permission: "finance.payment_notice.review", group: "finance" }] : []),
    { href: "/admin/invoices", label: "Hóa đơn", icon: FileText, permissionsAny: ["finance.ar.read", "finance.ap.read"], group: "finance" },
    { href: "/admin/workforce", label: "Nhân sự & công việc", icon: UsersRound, permission: "workforce.read", group: "workforce" },
    { href: "/admin/attendance", label: "Chấm công", icon: Clock3, permission: "attendance.read", group: "workforce" },
    { href: "/admin/payroll", label: "Bảng lương", icon: WalletCards, permission: "compensation.read", group: "workforce" },
    { href: "/admin/compensation", label: "Thu nhập", icon: WalletCards, permission: "compensation.read", group: "workforce" },
    { href: "/admin/access", label: "Nhân viên & quyền", icon: ShieldCheck, permission: "roles.manage", group: "administration" },
    { href: "/admin/reports", label: "Báo cáo", icon: BarChart3, permissionsAny: ["finance.ar.read", "finance.ap.read", "finance.expense.read"] },
    { href: "/admin/audit", label: "Nhật ký", icon: ScrollText, permission: "roles.manage", group: "administration" },
    { href: "/admin/messages", label: "Tin nhắn", icon: MessageSquare },
    { href: "/admin/settings", label: "Cài đặt", icon: Settings2, permission: "roles.manage", group: "administration" },
  ],
  work: [
    { href: "/work", label: "Việc cần làm", icon: ClipboardCheck, exact: true },
    { href: "/work/warehouse", label: "Kho hàng", icon: Warehouse },
    { href: "/work/deliveries", label: "Chuyến giao", icon: Truck },
  ],
  customer: [
    { href: "/customer", label: "Tài khoản", icon: UserRound, exact: true },
    ...(QUOTATIONS_ENABLED ? [{ href: "/customer/quotations", label: "Báo giá", icon: FileText }] : []),
    { href: "/customer/orders", label: "Đơn của tôi", icon: ShoppingCart },
    { href: "/customer/debts", label: "Công nợ", icon: WalletCards },
  ],
} as const;

/** Below this width the blue menu becomes a drawer opened from the top bar (D29). */
const COMPACT_QUERY = "(max-width: 1179px)";
function subscribeCompact(onChange: () => void) {
  const query = typeof window !== "undefined" ? window.matchMedia?.(COMPACT_QUERY) : undefined;
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
const compactNow = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(COMPACT_QUERY).matches);

/**
 * D29 office frame: a white bar (brand, branch, bell, the user's menu) over a blue menu bar whose groups open as
 * drop-downs; the current section reads as a tab joined to the page. On narrow screens the same menu is a drawer.
 */
export function AppShell({ surface, children, permissions, actorName, branchName, branchId }: { surface: Surface; children: React.ReactNode; permissions?: readonly string[]; actorName?: string; branchName?: string; branchId?: string }) {
  const pathname = usePathname();
  const compact = useSyncExternalStore(subscribeCompact, compactNow, () => false);
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, { pathname: string; open: boolean }>>({});
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreMenuFocus = useRef(false);
  const navRef = useRef<HTMLElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleItems = navigation[surface].filter((item) => item.permissionsAny
    ? item.permissionsAny.some((permission) => permissions?.includes(permission))
    : !item.permission || permissions?.includes(item.permission) || Boolean(item.managementPermission && permissions?.includes(item.managementPermission)))
    .map((item) => item.managementHref && item.permission && !permissions?.includes(item.permission)
      ? { ...item, href: item.managementHref } : item);
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const activeHref = visibleItems.filter((item) => pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)) || item.activePrefixes?.some(under))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  const initials = actorName?.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") ?? "";
  const canCreateOrder = surface === "admin" && Boolean(permissions?.includes("orders.create"));

  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      menuButton.current?.focus();
    }
  }, [open]);

  // A drop-down or the user menu closes on a click elsewhere; the page under it stays usable.
  useEffect(() => {
    if (!dropdown && !userMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (dropdown && !navRef.current?.contains(target)) setDropdown(null);
      if (userMenu && !userRef.current?.contains(target)) setUserMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [dropdown, userMenu]);

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  function closeMenu() { restoreMenuFocus.current = true; setOpen(false); }
  function navigated() { setOpen(false); setDropdown(null); }
  function renderLink(item: NavigationItem, nested = false) {
    const Icon = item.icon;
    const active = item.href === activeHref;
    return <Link className={`nav-link${nested ? " nav-link-nested" : ""}${active ? " active" : ""}`} href={item.href} key={item.href} aria-current={active ? "page" : undefined} onClick={navigated}><Icon aria-hidden="true" size={nested ? 18 : 17} strokeWidth={1.9} /><span>{item.label}</span></Link>;
  }
  // Mouse users get KiotViet-style hover menus; touch, pen and keyboard use the button.
  function hover(groupId: string | null, pointerType: string) {
    if (compact || pointerType !== "mouse") return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setDropdown(groupId), groupId ? 60 : 160);
  }

  return (
    <div className="app-shell">
      {open && <button className="sidebar-backdrop" type="button" tabIndex={-1} aria-label="Đóng điều hướng" onClick={closeMenu} />}
      <header className="utility-bar" inert={open}>
        <div className="utility-inner">
          <button ref={menuButton} className="mobile-menu" type="button" aria-label="Mở menu" aria-expanded={open} aria-controls="app-menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <Link className="brand" href={surface === "admin" ? "/admin" : `/${surface}`}><span className="brand-mark" aria-hidden="true">HX</span><strong>Hiền Xa ERP</strong></Link>
          {branchName && <span className="utility-branch"><MapPin aria-hidden="true" size={15} />{branchName}</span>}
          <div className="utility-actions">
            {surface === "admin" && permissions?.includes("ai.use") && <Link className="utility-ai" href={`/admin/ai?module=${aiModuleOf(visibleItems.find((item) => item.href === activeHref)?.group)}`}
              aria-label="Hỏi trợ lý AI về trang này"><Sparkles aria-hidden="true" size={17} /><span>Hỏi AI</span></Link>}
            {surface === "admin" && branchId && <NotificationBell branchId={branchId} />}
            <div className="user-menu" ref={userRef} onKeyDown={(event) => { if (event.key === "Escape" && userMenu) { event.preventDefault(); setUserMenu(false); } }}>
              <button className="identity" type="button" aria-expanded={userMenu} aria-controls="user-menu-panel" onClick={() => setUserMenu((value) => !value)}>
                <span className="identity-avatar" aria-hidden="true">{initials}</span><span className="identity-name">{actorName}</span><ChevronDown className="nav-chevron" aria-hidden="true" size={15} />
              </button>
              <div id="user-menu-panel" className="user-menu-panel" hidden={!userMenu}>
                <p className="user-menu-head"><strong>{actorName}</strong>{branchName && <span>{branchName}</span>}</p>
                <AppearanceButton />
                <form action="/auth/logout" method="post"><input type="hidden" name="surface" value={surface} /><button className="logout-button" type="submit"><LogOut size={17} />Đăng xuất</button></form>
              </div>
            </div>
          </div>
        </div>
      </header>
      <nav id="app-menu" ref={navRef} className={`main-menu${open ? " open" : ""}`} aria-label="Menu chính" onKeyDown={(event) => {
        if (event.key === "Escape" && dropdown && !open) {
          event.preventDefault();
          const owner = dropdown;
          setDropdown(null);
          navRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="nav-${owner}"]`)?.focus();
          return;
        }
        if (!open) return;
        if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
        if (event.key === "Tab") {
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')].filter((element) => element.getClientRects().length > 0);
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <div className="menu-drawer-head">
          <strong>Hiền Xa ERP</strong>
          <button ref={closeButton} className="mobile-close" type="button" aria-label="Đóng menu" onClick={closeMenu}><X size={22} /></button>
        </div>
        <div className="main-menu-inner">
          <div className="nav-list">
            {surface !== "admin" ? visibleItems.map((item) => renderLink(item)) : <>
              {visibleItems.filter((item) => item.href === "/admin").map((item) => renderLink(item))}
              {adminGroups.map((group) => {
                const items = visibleItems.filter((item) => item.group === group.id);
                if (!items.length) return null;
                if (items.length === 1) return renderLink(items[0]);
                const active = items.some((item) => item.href === activeHref);
                const preference = expandedGroups[group.id];
                const expanded = compact || open
                  ? (preference?.pathname === pathname ? preference.open : active)
                  : dropdown === group.id;
                const Icon = group.icon;
                return <div className={`nav-group${expanded ? " expanded" : ""}`} key={group.id}
                  onPointerEnter={(event) => hover(group.id, event.pointerType)} onPointerLeave={(event) => hover(null, event.pointerType)}
                  onBlur={(event) => { if (!compact && !open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setDropdown((current) => current === group.id ? null : current); }}>
                  <button className={`nav-group-toggle${active ? " current" : ""}`} type="button" aria-expanded={expanded} aria-controls={`nav-${group.id}`}
                    onClick={() => compact || open
                      ? setExpandedGroups((current) => ({ ...current, [group.id]: { pathname, open: !expanded } }))
                      : setDropdown(expanded ? null : group.id)}>
                    <Icon aria-hidden="true" size={17} strokeWidth={1.9} /><span>{group.label}</span><ChevronDown className="nav-chevron" aria-hidden="true" size={15} />
                  </button>
                  <div id={`nav-${group.id}`} className="nav-group-links" hidden={!expanded}>{items.map((item) => renderLink(item, true))}</div>
                </div>;
              })}
              {visibleItems.filter((item) => !item.group && item.href !== "/admin").map((item) => renderLink(item))}
            </>}
          </div>
          {canCreateOrder && <Link className="button button-commerce menu-cta" href="/admin/orders/new" onClick={navigated}><Plus aria-hidden="true" size={17} strokeWidth={2.4} />Tạo đơn bán</Link>}
        </div>
      </nav>
      <div className="workspace" inert={open}>
        <main className="content">{children}{surface === "admin" && <UatBrowserTiming />}</main>
      </div>
    </div>
  );
}
