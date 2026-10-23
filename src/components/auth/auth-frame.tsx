import type { ReactNode } from "react";

/**
 * D30: the frame of every sign-in screen — a slim brand bar over the app's blue band and one compact card. An internal
 * ERP opens straight on the form; there is no promotional panel.
 */
export function AuthFrame({ children, footnote }: { children: ReactNode; footnote?: ReactNode }) {
  return <main className="auth-screen">
    <header className="auth-topbar"><span className="brand-mark" aria-hidden="true">HX</span>
      <span className="auth-brand"><strong>Hiền Xa ERP</strong><span>Hệ thống nội bộ</span></span></header>
    <section className="auth-panel"><div className="auth-card">{children}</div>
      {footnote && <p className="auth-footnote">{footnote}</p>}</section>
  </main>;
}
