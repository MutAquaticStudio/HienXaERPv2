import { Fragment, type ReactNode } from "react";
import { Download } from "lucide-react";

/** D87: the app download page (Owner 16/11/2026: "ở trang app.hienxavlxd.com nên thêm phần mục tải về … gán với route /tai-ve"). */
export const DOWNLOAD_PATH = "/tai-ve";

/** "A · B": each part stays whole; on a phone they stack and the dot is hidden, so no line starts with "·". */
function footnoteParts(text: string) {
  return text.split(" · ").map((part, index) => <Fragment key={part}>{index > 0 && <span className="auth-footnote-dot" aria-hidden="true"> · </span>}<span className="auth-footnote-part">{part}</span></Fragment>);
}

/**
 * D30: the frame of every sign-in screen — a slim brand bar (the company logo when one is set, D49) over the app's blue
 * band and one compact card. An internal ERP opens straight on the form; there is no promotional panel.
 */
export function AuthFrame({ children, footnote, logoUrl, tagline = "Hệ thống nội bộ", installLink = false }: {
  children: ReactNode; footnote?: ReactNode; logoUrl?: string | null; tagline?: string;
  /** D81/D87: the sign-in screens show "Tải về" (top bar + a panel under the card) pointing to /tai-ve; hidden once opened
   *  from the installed app (display-mode standalone) and inside the Android app (D82). */
  installLink?: boolean;
}) {
  return <main className="auth-screen">
    <header className="auth-topbar">{logoUrl
      // eslint-disable-next-line @next/next/no-img-element -- the uploaded company logo, served by the app (D49)
      ? <img className="brand-mark brand-logo" src={logoUrl} alt="" aria-hidden="true" width={36} height={36} />
      : <span className="brand-mark" aria-hidden="true">HX</span>}
      <span className="auth-brand"><strong>Hiền Xa ERP</strong><span>{tagline}</span></span>
      {installLink && <a className="auth-topbar-download" href={DOWNLOAD_PATH}><Download aria-hidden size={16} />Tải về</a>}</header>
    <section className="auth-panel"><div className="auth-card">{children}</div>
      {footnote && <p className="auth-footnote">{typeof footnote === "string" ? footnoteParts(footnote) : footnote}</p>}
      {installLink && <aside className="auth-download" aria-labelledby="auth-download-title">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own home-screen icon, a small static file */}
        <img className="auth-download-icon" src="/apple-touch-icon.png" alt="" width={44} height={44} />
        <div className="auth-download-text"><strong id="auth-download-title">Tải app Hiền Xa về điện thoại</strong>
          <span>Android và iPhone · một app cho khách hàng, thợ và văn phòng</span></div>
        <a className="button button-primary auth-download-action" href={DOWNLOAD_PATH}><Download aria-hidden size={18} />Tải về</a>
      </aside>}</section>
  </main>;
}
