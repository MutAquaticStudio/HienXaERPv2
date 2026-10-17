"use client";

import { BarChart3, Boxes, ChevronDown, ClipboardCheck, Factory, FileText, LayoutDashboard, LogOut, Menu, MessageSquare, PackageSearch, Route, ScrollText, Settings2, ShieldCheck, ShoppingCart, Truck, UserRound, UsersRound, WalletCards, Warehouse, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

const surfaceNames = { admin: "Điều hành", work: "Tác nghiệp", customer: "Khách hàng" } as const;

export function AppShell({ surface, children, permissions, actorName }: { surface: Surface; children: React.ReactNode; permissions?: readonly string[]; actorName?: string; branchName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, { pathname: string; open: boolean }>>({});
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreMenuFocus = useRef(false);
  const visibleItems = navigation[surface].filter((item) => item.permissionsAny
    ? item.permissionsAny.some((permission) => permissions?.includes(permission))
    : !item.permission || permissions?.includes(item.permission) || Boolean(item.managementPermission && permissions?.includes(item.managementPermission)))
    .map((item) => item.managementHref && item.permission && !permissions?.includes(item.permission)
      ? { ...item, href: item.managementHref } : item);
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const activeHref = visibleItems.filter((item) => pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)) || item.activePrefixes?.some(under))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  const initials = actorName?.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") ?? "";

  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      menuButton.current?.focus();
    }
  }, [open]);

  function closeMenu() { restoreMenuFocus.current = true; setOpen(false); }
  function renderLink(item: NavigationItem, nested = false) {
    const Icon = item.icon;
    const active = item.href === activeHref;
    return <Link className={`nav-link${nested ? " nav-link-nested" : ""}${active ? " active" : ""}`} href={item.href} key={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}><Icon aria-hidden="true" size={nested ? 18 : 20} strokeWidth={1.8} /><span>{item.label}</span></Link>;
  }

  return (
    <div className="app-shell">
      {open && <button className="sidebar-backdrop" type="button" tabIndex={-1} aria-label="Đóng điều hướng" onClick={closeMenu} />}
      <aside id="app-sidebar" className={`sidebar${open ? " open" : ""}`} aria-label={`Điều hướng ${surfaceNames[surface]}`} onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
        if (event.key === "Tab") {
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')].filter((element) => element.getClientRects().length > 0);
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <div className="brand">
          <div><strong>Hiền Xa ERP</strong></div>
          <button ref={closeButton} className="mobile-close" type="button" aria-label="Đóng menu" onClick={closeMenu}><X size={22} /></button>
        </div>
        <nav className="nav-list" aria-label="Các phân hệ">
          {surface !== "admin" ? visibleItems.map((item) => renderLink(item)) : <>
            {visibleItems.filter((item) => item.href === "/admin").map((item) => renderLink(item))}
            {adminGroups.map((group) => {
              const items = visibleItems.filter((item) => item.group === group.id);
              if (!items.length) return null;
              if (items.length === 1) return renderLink(items[0]);
              const active = items.some((item) => item.href === activeHref);
              const preference = expandedGroups[group.id];
              const expanded = preference?.pathname === pathname ? preference.open : active;
              const Icon = group.icon;
              return <section className="nav-group" key={group.id}>
                <button className={`nav-group-toggle${active ? " current" : ""}`} type="button" aria-expanded={expanded} aria-controls={`nav-${group.id}`} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: { pathname, open: !expanded } }))}>
                  <Icon aria-hidden="true" size={20} strokeWidth={1.8} /><span>{group.label}</span><ChevronDown className="nav-chevron" aria-hidden="true" size={16} />
                </button>
                <div id={`nav-${group.id}`} className="nav-group-links" hidden={!expanded}>{items.map((item) => renderLink(item, true))}</div>
              </section>;
            })}
            {visibleItems.filter((item) => !item.group && item.href !== "/admin").map((item) => renderLink(item))}
          </>}
        </nav>
        <div className="sidebar-foot">
          <form action="/auth/logout" method="post"><button className="logout-button" type="submit"><LogOut size={17} />Đăng xuất</button></form>
          Phiên làm việc có phân quyền
        </div>
      </aside>
      <div className="workspace" inert={open}>
        <header className="topbar">
          <button ref={menuButton} className="mobile-menu" type="button" aria-label="Mở menu" aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen(true)}><Menu size={24} /></button>
          <div className="identity"><span>{actorName}</span><span className="identity-avatar" aria-hidden="true">{initials}</span></div>
        </header>
        <main className="content">{children}{surface === "admin" && <UatBrowserTiming />}</main>
      </div>
    </div>
  );
}
