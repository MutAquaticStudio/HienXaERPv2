"use client";

import {
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
import { usePathname } from "next/navigation";

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

export function OfficeNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng văn phòng">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/app" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "nav-link nav-link-active" : "nav-link"}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" size={22} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
