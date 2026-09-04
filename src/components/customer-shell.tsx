"use client";

import { CircleUserRound, FileText, HandCoins, House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LargeTextToggle } from "@/components/large-text-toggle";

const navigation = [
  { href: "/customer", label: "Trang chủ", icon: House },
  { href: "/customer/orders", label: "Đơn hàng", icon: FileText },
  { href: "/customer/debt", label: "Công nợ", icon: HandCoins },
  { href: "/customer/profile", label: "Tôi", icon: CircleUserRound },
] as const;

export function CustomerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="customer-shell">
      <header className="customer-header">
        <div><strong>Cổng khách hàng</strong><span>Hiền Xa VLXD</span></div>
        <LargeTextToggle />
      </header>
      <main className="customer-content">{children}</main>
      <nav className="customer-nav" aria-label="Điều hướng khách hàng">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link aria-current={pathname === href ? "page" : undefined} href={href} key={href} prefetch={false}>
            <Icon aria-hidden="true" size={25} /><span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
