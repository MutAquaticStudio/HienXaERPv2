import {
  Banknote,
  Boxes,
  CircleDollarSign,
  Database,
  Gauge,
  PackageSearch,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { LargeTextToggle } from "@/components/large-text-toggle";
import { logout } from "@/app/login/actions";
import type { Principal } from "@/modules/platform/types";

const navItems = [
  { href: "/app", label: "Tổng quan", icon: Gauge },
  { href: "/app/sales", label: "Bán hàng", icon: ShoppingBag },
  { href: "/app/sourcing", label: "Mua & nguồn hàng", icon: PackageSearch },
  { href: "/app/operations", label: "Vận hành", icon: Boxes },
  { href: "/app/finance", label: "Tài chính", icon: CircleDollarSign },
  { href: "/app/workforce", label: "Nhân sự & sản lượng", icon: Users },
  { href: "/app/data", label: "Dữ liệu", icon: Database },
  { href: "/app/settings", label: "Audit / Cài đặt", icon: Settings },
] as const;

export function OfficeShell({
  principal,
  children,
}: {
  principal: Principal;
  children: ReactNode;
}) {
  return (
    <div className="office-shell">
      <aside className="office-sidebar">
        <Brand />
        <nav aria-label="Điều hướng văn phòng">
          {navItems.map(({ href, label, icon: Icon }, index) => (
            <Link
              href={href}
              key={href}
              className={index === 0 ? "nav-link nav-link-active" : "nav-link"}
            >
              <Icon aria-hidden="true" size={22} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Banknote size={22} aria-hidden="true" />
          <span>Đúng dữ liệu, rõ trách nhiệm</span>
        </div>
      </aside>
      <div className="office-main">
        <header className="office-header">
          <LargeTextToggle />
          <div className="user-summary">
            <span className="user-avatar" aria-hidden="true">
              {principal.displayName.slice(0, 1)}
            </span>
            <span>
              <strong>{principal.displayName}</strong>
              <small>Quản trị hệ thống</small>
            </span>
          </div>
          <form action={logout}>
            <button className="secondary-button" type="submit">
              Đăng xuất
            </button>
          </form>
        </header>
        <main className="office-content">{children}</main>
      </div>
    </div>
  );
}
