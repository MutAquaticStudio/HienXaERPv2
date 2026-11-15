import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, Truck, UserRound } from "lucide-react";

import { AuthFrame } from "@/components/auth/auth-frame";
import { APP_ICON_PATH, InstallGuide } from "@/components/install/install-guide";
import { loadSignInLogoUrl } from "@/lib/company/sign-in-logo";

export const metadata: Metadata = { title: "Tải app", description: "Cài app Hiền Xa trên điện thoại Android và iPhone." };

/** The three portals inside the one app, with the icons of the sign-in tabs (portal-login.tsx). */
const PORTALS = [
  { label: "Vận hành", icon: BriefcaseBusiness },
  { label: "Thợ & tài xế", icon: Truck },
  { label: "Khách hàng", icon: UserRound },
] as const;

/** D81: public page (no sign-in) to send by Zalo; each phone sees the steps for itself. */
export default async function InstallAppPage() {
  return <AuthFrame logoUrl={await loadSignInLogoUrl().catch(() => null)} tagline="Tải app cho điện thoại">
    <div className="install-page">
      <div className="install-hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own home-screen icon, a small static file */}
        <img className="install-app-icon" src={APP_ICON_PATH} alt="" width={64} height={64} />
        <div className="install-hero-text">
          <h1>Cài app Hiền Xa</h1>
          <p className="muted"><span>Một app cho cả ba cổng.</span> <span>Mở app là vào trang đăng nhập.</span></p>
        </div>
      </div>
      <ul className="install-portals" role="list" aria-label="Ba cổng trong app">
        {PORTALS.map(({ label, icon: Icon }) => <li key={label}><Icon aria-hidden size={16} />{label}</li>)}
      </ul>
      <InstallGuide />
      <Link className="auth-switch" href="/">← Về màn đăng nhập</Link>
    </div>
  </AuthFrame>;
}
