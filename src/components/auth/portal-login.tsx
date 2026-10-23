"use client";

import { BriefcaseBusiness, Truck, UserRound } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { LoginForm } from "./login-form";

export type PortalSurface = "admin" | "work" | "customer";

const PORTALS = [
  { id: "admin", label: "Vận hành", icon: BriefcaseBusiness, hint: "Chủ doanh nghiệp, văn phòng, kho, điều phối." },
  { id: "work", label: "Thợ & tài xế", icon: Truck, hint: "Xem việc hôm nay, lấy hàng lên xe, báo đã giao." },
  { id: "customer", label: "Khách hàng", icon: UserRound, hint: "Đặt hàng, theo dõi giao nhận và công nợ của bạn." },
] as const satisfies readonly { id: PortalSurface; label: string; hint: string; icon: unknown }[];

/** This device's last sign-in portal (D30); a convenience only, so an unreadable storage just means "none". */
export const LAST_PORTAL_KEY = "hx.lastPortal";

function readLastPortal(): PortalSurface | null {
  try {
    const value = window.localStorage.getItem(LAST_PORTAL_KEY);
    return PORTALS.some((portal) => portal.id === value) ? value as PortalSurface : null;
  } catch { return null; }
}
function rememberPortal(surface: PortalSurface) {
  try { window.localStorage.setItem(LAST_PORTAL_KEY, surface); } catch { /* private mode: nothing to remember */ }
}
const subscribe = (changed: () => void) => {
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
};

/**
 * D30: one sign-in card with a tab per portal (Vận hành / Thợ & tài xế / Khách hàng). The home page opens on the tab
 * used last on this device (`remember`); a portal's own login page opens on its tab. Signing in posts the same form as
 * before, with the chosen portal as `surface`.
 */
export function PortalLogin({ initial, remember = false, notice }: { initial: PortalSurface; remember?: boolean; notice?: string }) {
  const stored = useSyncExternalStore(subscribe, readLastPortal, () => null);
  const [chosen, setChosen] = useState<PortalSurface | null>(null);
  const surface = chosen ?? (remember ? stored : null) ?? initial;
  const current = PORTALS.find((portal) => portal.id === surface) ?? PORTALS[0];
  const tabs = useRef(new Map<PortalSurface, HTMLButtonElement>());

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const index = PORTALS.findIndex((portal) => portal.id === surface);
    const next = event.key === "ArrowRight" ? (index + 1) % PORTALS.length
      : event.key === "ArrowLeft" ? (index + PORTALS.length - 1) % PORTALS.length
      : event.key === "Home" ? 0 : event.key === "End" ? PORTALS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setChosen(PORTALS[next].id);
    tabs.current.get(PORTALS[next].id)?.focus();
  }

  return <>
    <h1>Đăng nhập</h1>
    <p className="muted">Chọn đúng nơi bạn làm việc rồi nhập tài khoản.</p>
    {notice && <p className="form-message" role="status">{notice}</p>}
    <div className="portal-tabs" role="tablist" aria-label="Cổng đăng nhập" onKeyDown={move}>
      {PORTALS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" id={`portal-tab-${id}`} className="portal-tab"
        aria-selected={id === surface} aria-controls="portal-panel" tabIndex={id === surface ? 0 : -1}
        ref={(element) => { if (element) tabs.current.set(id, element); else tabs.current.delete(id); }}
        onClick={() => setChosen(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}
    </div>
    <div role="tabpanel" id="portal-panel" aria-labelledby={`portal-tab-${surface}`} onSubmitCapture={() => rememberPortal(surface)}>
      <p className="portal-hint">{current.hint}</p>
      <LoginForm key={surface} surface={surface} />
    </div>
  </>;
}
