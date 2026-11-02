import { Fragment, type ReactNode } from "react";

/** "A · B": each part stays whole; on a phone they stack and the dot is hidden, so no line starts with "·". */
function footnoteParts(text: string) {
  return text.split(" · ").map((part, index) => <Fragment key={part}>{index > 0 && <span className="auth-footnote-dot" aria-hidden="true"> · </span>}<span className="auth-footnote-part">{part}</span></Fragment>);
}

/**
 * D30: the frame of every sign-in screen — a slim brand bar over the app's blue band and one compact card. An internal
 * ERP opens straight on the form; there is no promotional panel.
 */
export function AuthFrame({ children, footnote }: { children: ReactNode; footnote?: ReactNode }) {
  return <main className="auth-screen">
    <header className="auth-topbar"><span className="brand-mark" aria-hidden="true">HX</span>
      <span className="auth-brand"><strong>Hiền Xa ERP</strong><span>Hệ thống nội bộ</span></span></header>
    <section className="auth-panel"><div className="auth-card">{children}</div>
      {footnote && <p className="auth-footnote">{typeof footnote === "string" ? footnoteParts(footnote) : footnote}</p>}</section>
  </main>;
}
