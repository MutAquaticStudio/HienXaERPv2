"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Share, SquarePlus } from "lucide-react";
import { isNativeApp } from "@/lib/app-shell/native-app";

export const APK_PATH = "/app/hien-xa.apk";
type Device = "android" | "ios-safari" | "ios-other" | "installed" | "desktop";

/** Which install steps fit this device (D81). In-app browsers (Zalo, Facebook) count as "not Safari" on iPhone; the Android app itself (D82) is "installed". */
export function detectDevice(userAgent: string, standalone: boolean): Device {
  if (standalone || isNativeApp(userAgent)) return "installed";
  const iphone = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent));
  if (iphone) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Zalo|FBAN|FBAV|Instagram|Line\//.test(userAgent);
    return otherBrowser || !/Safari\//.test(userAgent) ? "ios-other" : "ios-safari";
  }
  return /Android/.test(userAgent) ? "android" : "desktop";
}

function CopyLink({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const link = `${window.location.origin}/tai-app`;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { window.prompt("Chép link này:", link); }
  }
  return <button type="button" className="button button-secondary" onClick={() => { void copy(); }}>{copied ? "Đã chép link" : label}</button>;
}

function AndroidSteps({ inApp }: { inApp: boolean }) {
  return <section className="install-block" aria-labelledby="install-android">
    <h2 id="install-android">Điện thoại Android</h2>
    <a className="button button-primary install-action" href={APK_PATH} download>Tải app Android</a>
    {inApp && <p className="form-message warning" role="note">Đang mở trong Zalo / Facebook: nếu bấm tải không được, chọn “Mở bằng trình duyệt” (Chrome) rồi tải lại.</p>}
    <ol className="install-steps">
      <li>Bấm <strong>Tải app Android</strong>, tải xong thì mở tệp <strong>hien-xa.apk</strong>.</li>
      <li>Nếu máy hỏi, cho phép <strong>cài ứng dụng từ nguồn này</strong>, rồi bấm <strong>Cài đặt</strong> (đã có app cũ: bấm <strong>Cập nhật</strong>, không cần gỡ).</li>
      <li>Mở app <strong>Hiền Xa</strong>, đăng nhập đúng tab của mình. Khi app hỏi, cho phép <strong>Máy ảnh</strong> và <strong>Vị trí</strong> để chụp ảnh giao hàng và chấm công.</li>
    </ol>
    <p className="muted">Android 7 trở lên.</p>
  </section>;
}

function IphoneSteps({ safari }: { safari: boolean }) {
  return <section className="install-block" aria-labelledby="install-iphone">
    <h2 id="install-iphone">iPhone</h2>
    {!safari && <div className="install-safari">
      <p className="form-message warning" role="note">Trên iPhone, app chỉ cài được từ <strong>Safari</strong>. Chép link, mở Safari, dán link rồi làm theo các bước dưới.</p>
      <CopyLink label="Chép link cài app" />
    </div>}
    <ol className="install-steps">
      <li>Trong Safari, bấm nút <strong>Chia sẻ</strong> <Share aria-label="biểu tượng Chia sẻ" size={18} className="install-icon" /> ở thanh dưới (iPad: góc trên).</li>
      <li>Chọn <strong>Thêm vào MH chính</strong> <SquarePlus aria-hidden size={18} className="install-icon" /> (kéo xuống nếu chưa thấy), rồi bấm <strong>Thêm</strong>.</li>
      <li>Mở app <strong>Hiền Xa</strong> trên màn hình chính và đăng nhập.</li>
    </ol>
    <p className="muted">Thợ & tài xế: vào <strong>Hồ sơ</strong> → <strong>Bật thông báo trên máy này</strong> để nhận việc mới (iOS 16.4 trở lên).</p>
  </section>;
}

/** D81 "Cài app Hiền Xa": one app for the three portals; Android installs the APK, iPhone adds the site from Safari. */
const subscribeNever = () => () => {};
/** This browser, read once on the client ("" on the server, so the first paint shows both ways). */
function readBrowser() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return `${detectDevice(navigator.userAgent, standalone)}|${/Zalo|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent) ? "in-app" : ""}`;
}

export function InstallGuide() {
  const browser = useSyncExternalStore(subscribeNever, readBrowser, () => "");
  const [showAll, setShowAll] = useState(false);
  const device = (browser.split("|")[0] || null) as Device | null;
  const inApp = browser.endsWith("|in-app");

  if (device === "installed") {
    return <div className="install-guide">
      <p className="form-message success" role="status">App Hiền Xa đã được cài trên máy này.</p>
      <Link className="button button-primary install-action" href="/">Mở trang đăng nhập</Link>
    </div>;
  }
  const both = device === null || device === "desktop" || showAll;
  return <div className="install-guide">
    {both || device === "android" ? <AndroidSteps inApp={inApp} /> : null}
    {both || device === "ios-safari" || device === "ios-other" ? <IphoneSteps safari={device === "ios-safari"} /> : null}
    {device === "desktop" && <section className="install-block" aria-labelledby="install-share">
      <h2 id="install-share">Gửi cho nhân viên, khách hàng</h2>
      <p className="muted">Gửi link trang này qua Zalo; mở trên điện thoại sẽ thấy đúng cách cài cho máy đó.</p>
      <CopyLink label="Chép link trang này" />
    </section>}
    {!both && <button type="button" className="auth-link install-more" onClick={() => setShowAll(true)}>Xem cách cài cho máy khác</button>}
  </div>;
}
