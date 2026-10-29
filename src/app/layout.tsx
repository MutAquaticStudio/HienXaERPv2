import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EMAIL_LINK_HANDOFF_SCRIPT } from "@/components/auth/email-link-handoff";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { VietnameseFormValidation } from "@/components/vietnamese-form-validation";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans/800.css";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import { APPEARANCE_COOKIE, APPEARANCE_SCRIPT, appearanceAttributes, parseAppearance } from "@/lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hiền Xa ERP",
    template: "%s | Hiền Xa ERP",
  },
  description: "Hệ thống điều hành bán hàng, cung ứng và công nợ Hiền Xa.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Giao diện is chosen per device (Cài đặt → Giao diện) and rendered here so the first paint already uses it.
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
  return (
    <html lang="vi" {...appearanceAttributes(appearance)} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: EMAIL_LINK_HANDOFF_SCRIPT }} /></head>
      <body><Suspense fallback={null}><NavigationProgress /></Suspense><VietnameseFormValidation />{children}</body>
    </html>
  );
}
