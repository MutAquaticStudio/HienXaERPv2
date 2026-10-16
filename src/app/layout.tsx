import type { Metadata } from "next";
import { EMAIL_LINK_HANDOFF_SCRIPT } from "@/components/auth/email-link-handoff";
import { VietnameseFormValidation } from "@/components/vietnamese-form-validation";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hiền Xa ERP",
    template: "%s | Hiền Xa ERP",
  },
  description: "Hệ thống điều hành bán hàng, cung ứng và công nợ Hiền Xa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <head><script dangerouslySetInnerHTML={{ __html: EMAIL_LINK_HANDOFF_SCRIPT }} /></head>
      <body><VietnameseFormValidation />{children}</body>
    </html>
  );
}
