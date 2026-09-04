"use client";

import { CircleUserRound, ClipboardList, Coins, Layers3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LargeTextToggle } from "@/components/large-text-toggle";

const workerNavigation = [
  { href: "/work", label: "Việc của tôi", icon: ClipboardList },
  { href: "/work/pool", label: "Bể công việc", icon: Layers3 },
  { href: "/work/earnings", label: "Thu nhập", icon: Coins },
  { href: "/work/profile", label: "Tôi", icon: CircleUserRound },
] as const;

export function WorkerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="worker-shell">
      <header className="worker-header">
        <strong className="worker-header-title">Việc của tôi</strong>
        <LargeTextToggle />
      </header>
      <main className="worker-content">{children}</main>
      <nav className="worker-nav" aria-label="Điều hướng người lao động">
        {workerNavigation.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            aria-current={pathname === href ? "page" : undefined}
            prefetch={false}
          >
            <Icon aria-hidden="true" size={26} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
