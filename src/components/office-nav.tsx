"use client";

import {
  Boxes,
  CircleDollarSign,
  Coins,
  Construction,
  Database,
  Gauge,
  PackageSearch,
  Settings,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/app", label: "Tổng quan", icon: Gauge },
  { href: "/app/sales", label: "Bán hàng", icon: ShoppingBag },
  { href: "/app/sourcing", label: "Mua & nguồn hàng", icon: PackageSearch },
  { href: "/app/inventory", label: "Kho & bãi", icon: Boxes },
  { href: "/app/dispatch", label: "Điều phối", icon: Truck },
  { href: "/app/service", label: "Dịch vụ", icon: Construction },
  { href: "/app/finance", label: "Tài chính", icon: CircleDollarSign },
  { href: "/app/workforce", label: "Điều hành công việc", icon: Users },
  { href: "/app/compensation", label: "Thu nhập & sản lượng", icon: Coins },
  { href: "/app/data", label: "Dữ liệu", icon: Database },
  { href: "/app/settings", label: "Audit / Cài đặt", icon: Settings },
] as const;

function NavigationLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite">{label}{pending ? " · Đang mở..." : ""}</span>;
}

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
            prefetch={false}
          >
            <Icon aria-hidden="true" size={22} />
            <NavigationLabel label={label} />
          </Link>
        );
      })}
    </nav>
  );
}
