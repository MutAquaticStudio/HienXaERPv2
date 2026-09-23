"use client";

import { BarChart3, Boxes, ClipboardCheck, Factory, FileText, LayoutDashboard, LogOut, Menu, MessageSquare, PackageSearch, Route, ScrollText, Settings2, ShieldCheck, ShoppingCart, Truck, UserRound, UsersRound, WalletCards, Warehouse, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Surface = "admin" | "work" | "customer";

const navigation = {
  admin: [
    { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, exact: true, permission: "dashboard.read" },
    { href: "/admin/quotations", label: "Báo giá", icon: FileText, permission: "quotation.read" },
    { href: "/admin/orders", label: "Đơn bán", icon: ShoppingCart, permission: "orders.read" },
    { href: "/admin/purchase-orders", label: "Đơn mua", icon: PackageSearch, permission: "purchasing.read" },
    { href: "/admin/inventory", label: "Tồn kho", icon: Warehouse, permission: "inventory.read" },
    { href: "/admin/dispatch", label: "Điều phối", icon: ClipboardCheck, permission: "delivery.read" },
    { href: "/admin/routes", label: "Lộ trình", icon: Route, permission: "delivery.read" },
    { href: "/admin/deliveries", label: "Giao hàng", icon: Truck, permission: "delivery.read" },
    { href: "/admin/service-jobs", label: "Dịch vụ", icon: Truck, permission: "service.read" },
    { href: "/admin/workforce", label: "Nhân sự", icon: UsersRound, permission: "workforce.read" },
    { href: "/admin/compensation", label: "Thu nhập", icon: WalletCards, permission: "compensation.read" },
    { href: "/admin/receivables", label: "Phải thu", icon: WalletCards, permission: "finance.ar.read" },
    { href: "/admin/payment-notices", label: "Báo chuyển khoản", icon: WalletCards, permission: "finance.payment_notice.review" },
    { href: "/admin/payables", label: "Phải trả", icon: WalletCards, permission: "finance.ap.read" },
    { href: "/admin/cashbook", label: "Sổ tiền", icon: WalletCards, permission: "finance.ar.read" },
    { href: "/admin/expenses", label: "Chi phí", icon: FileText, permission: "finance.expense.read" },
    { href: "/admin/invoices", label: "Hồ sơ hóa đơn", icon: FileText, permission: "finance.ar.read" },
    { href: "/admin/customers", label: "Khách hàng", icon: UsersRound, permission: "customers.read" },
    { href: "/admin/suppliers", label: "Nhà cung cấp", icon: Factory, permission: "suppliers.read" },
    { href: "/admin/products", label: "Vật tư", icon: Boxes, permission: "catalog.read" },
    { href: "/admin/access", label: "Nhân viên & quyền", icon: ShieldCheck, permission: "roles.manage" },
    { href: "/admin/reports", label: "Báo cáo", icon: BarChart3, permissionsAny: ["finance.ar.read", "finance.ap.read", "finance.expense.read"] },
    { href: "/admin/audit", label: "Nhật ký", icon: ScrollText, permission: "roles.manage" },
    { href: "/admin/messages", label: "Tin nhắn", icon: MessageSquare },
    { href: "/admin/settings", label: "Cài đặt", icon: Settings2, permissionsAny: ["customers.manage", "suppliers.manage", "catalog.manage", "roles.manage", "pricing.read"] },
  ],
  work: [
    { href: "/work", label: "Việc cần làm", icon: ClipboardCheck, exact: true },
    { href: "/work/warehouse", label: "Kho hàng", icon: Warehouse },
    { href: "/work/deliveries", label: "Chuyến giao", icon: Truck },
  ],
  customer: [
    { href: "/customer", label: "Tài khoản", icon: UserRound, exact: true },
    { href: "/customer/quotations", label: "Báo giá", icon: FileText },
    { href: "/customer/orders", label: "Đơn của tôi", icon: ShoppingCart },
    { href: "/customer/debts", label: "Công nợ", icon: WalletCards },
  ],
} as const;

const surfaceNames = { admin: "Điều hành", work: "Tác nghiệp", customer: "Khách hàng" } as const;

export function AppShell({ surface, children, permissions, actorName, branchName }: { surface: Surface; children: React.ReactNode; permissions?: readonly string[]; actorName?: string; branchName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initials = actorName?.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") ?? "";

  return (
    <div className="app-shell">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label={`Điều hướng ${surfaceNames[surface]}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">HX</span>
          <div><strong>HIỀN XA ERP</strong><span>{surfaceNames[surface]}</span></div>
          <button className="mobile-close" type="button" aria-label="Đóng menu" onClick={() => setOpen(false)}><X size={22} /></button>
        </div>
        <nav className="nav-list">
          {navigation[surface].filter((item) => "permissionsAny" in item ? item.permissionsAny.some((permission) => permissions?.includes(permission)) : !("permission" in item) || permissions?.includes(item.permission)).map((item) => {
            const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return <Link className={`nav-link${active ? " active" : ""}`} href={item.href} key={item.href} onClick={() => setOpen(false)}><Icon aria-hidden="true" size={20} strokeWidth={1.8} />{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-foot">
          <form action="/auth/logout" method="post"><button className="logout-button" type="submit"><LogOut size={17} />Đăng xuất</button></form>
          Phiên làm việc có phân quyền
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Mở menu" onClick={() => setOpen(true)}><Menu size={24} /></button>
          <span className="topbar-context">{branchName}</span>
          <div className="identity"><span>{actorName}</span><span className="identity-avatar" aria-hidden="true">{initials}</span></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
