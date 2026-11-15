import type { Metadata } from "next";
import Link from "next/link";

import { AuthFrame } from "@/components/auth/auth-frame";
import { InstallGuide } from "@/components/install/install-guide";
import { loadSignInLogoUrl } from "@/lib/company/sign-in-logo";

export const metadata: Metadata = { title: "Tải app", description: "Cài app Hiền Xa trên điện thoại Android và iPhone." };

/** D81: public page (no sign-in) to send by Zalo; each phone sees the steps for itself. */
export default async function InstallAppPage() {
  return <AuthFrame logoUrl={await loadSignInLogoUrl().catch(() => null)} tagline="Tải app cho điện thoại">
    <h1>Cài app Hiền Xa</h1>
    <p className="muted">Một app cho cả ba cổng: Vận hành, Thợ & tài xế, Khách hàng. Mở app là vào trang đăng nhập.</p>
    <InstallGuide />
    <Link className="auth-switch" href="/">← Về màn đăng nhập</Link>
  </AuthFrame>;
}
