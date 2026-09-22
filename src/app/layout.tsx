import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
