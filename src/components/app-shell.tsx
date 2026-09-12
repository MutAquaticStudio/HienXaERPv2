"use client";

import { Boxes, ClipboardCheck, Factory, FileText, LayoutDashboard, LogOut, Menu, PackageSearch, ShieldCheck, ShoppingCart, Truck, UserRound, UsersRound, WalletCards, Warehouse, X } from "lucide-react";
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
    { href: "/admin/deliveries", label: "Giao hàng", icon: Truck, permission: "delivery.read" },
    { href: "/admin/debts", label: "Công nợ", icon: WalletCards, permission: "finance.ar.read" },
    { href: "/admin/customers", label: "Khách hàng", icon: UsersRound, permission: "customers.read" },
    { href: "/admin/suppliers", label: "Nhà cung cấp", icon: Factory, permission: "suppliers.read" },
    { href: "/admin/products", label: "Vật tư", icon: Boxes, permission: "catalog.read" },
    { href: "/admin/access", label: "Nhân viên & quyền", icon: ShieldCheck, permission: "roles.manage" },
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

const surfaceMeta = {
  admin: { name: "Điều hành", user: "Nguyễn An", initials: "NA" },
  work: { name: "Tác nghiệp", user: "Trần Bình", initials: "TB" },
  customer: { name: "Khách hàng", user: "Cửa hàng Minh Phát", initials: "MP" },
} as const;

export function AppShell({ surface, children, permissions }: { surface: Surface; children: React.ReactNode; permissions?: readonly string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const meta = surfaceMeta[surface];

  return (
    <div className="app-shell">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label={`Điều hướng ${meta.name}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">HX</span>
          <div><strong>HIỀN XẠ ERP</strong><span>{meta.name}</span></div>
          <button className="mobile-close" type="button" aria-label="Đóng menu" onClick={() => setOpen(false)}><X size={22} /></button>
        </div>
        <nav className="nav-list">
          {navigation[surface].filter((item) => !("permission" in item) || permissions?.includes(item.permission)).map((item) => {
            const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return <Link className={`nav-link${active ? " active" : ""}`} href={item.href} key={item.href} onClick={() => setOpen(false)}><Icon aria-hidden="true" size={20} strokeWidth={1.8} />{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-foot">
          <form action="/auth/logout" method="post"><button className="logout-button" type="submit"><LogOut size={17} />Đăng xuất</button></form>
          Bản dựng nội bộ · dữ liệu mẫu được gắn nhãn MOCK
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Mở menu" onClick={() => setOpen(true)}><Menu size={24} /></button>
          <span className="topbar-context">Công ty TNHH Hiền Xạ · Chi nhánh chính</span>
          <div className="identity"><span>{meta.user}</span><span className="identity-avatar" aria-hidden="true">{meta.initials}</span></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
