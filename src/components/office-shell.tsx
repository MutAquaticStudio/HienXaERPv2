import { Banknote } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { LargeTextToggle } from "@/components/large-text-toggle";
import { OfficeNav } from "@/components/office-nav";
import { logout } from "@/app/login/actions";
import type { Principal } from "@/modules/platform/types";

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
        <OfficeNav />
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
