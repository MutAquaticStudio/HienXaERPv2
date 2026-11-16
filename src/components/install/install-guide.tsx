"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, Check, ChevronDown, Copy, Download, Share, SquarePlus } from "lucide-react";
import { ANDROID_APK_PATH, isNativeApp } from "@/lib/app-shell/native-app";

export const APK_PATH = ANDROID_APK_PATH;
/** The home-screen icon of the app (the same picture on iPhone and on Android). */
export const APP_ICON_PATH = "/apple-touch-icon.png";
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

const subscribeNever = () => () => {};
/** The link to send: this page on this site ("" on the server). */
const readLink = () => `${window.location.origin}/tai-ve`;

function CopyLink({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const link = readLink();
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { window.prompt("Chép link này:", link); }
  }
  return <button type="button" className="button button-secondary install-copy" onClick={() => { void copy(); }}>
    {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}{copied ? "Đã chép link" : label}
  </button>;
}

/** The guide revealed by "Xem cách cài cho máy khác" takes the focus, so the phone scrolls to it. */
const focusOnReveal = (heading: HTMLHeadingElement | null) => heading?.focus();

function PlatformHead({ id, title, note, reveal }: { id: string; title: string; note: string; reveal: boolean }) {
  return <div className="install-head">
    <h2 id={id} tabIndex={reveal ? -1 : undefined} ref={reveal ? focusOnReveal : undefined}>{title}</h2>
    <span className="install-pill">{note}</span>
  </div>;
}

/* What the phone shows at a step (drawn, not a screenshot): screen readers get the same thing from the step's words. */
function HomeIconFigure() {
  return <span className="install-figure install-figure-home" aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- the app's own home-screen icon, a small static file */}
    <img src={APP_ICON_PATH} alt="" width={40} height={40} /><span>Hiền Xa</span>
  </span>;
}

function AndroidSteps({ inApp, reveal = false }: { inApp: boolean; reveal?: boolean }) {
  return <section className="install-block" aria-labelledby="install-android">
    <PlatformHead id="install-android" title="Điện thoại Android" note="Android 7 trở lên" reveal={reveal} />
    <a className="button button-primary install-action" href={APK_PATH} download><Download aria-hidden size={20} />Tải app Android</a>
    {inApp && <p className="form-message warning" role="note">Đang mở trong Zalo / Facebook: nếu bấm tải không được, chọn “Mở bằng trình duyệt” (Chrome) rồi tải lại.</p>}
    <ol className="install-steps" role="list">
      <li>Bấm <strong>Tải app Android</strong>, tải xong thì mở tệp <strong>hien-xa.apk</strong>.</li>
      <li>Nếu máy hỏi, cho phép <strong>cài ứng dụng từ nguồn này</strong>, rồi bấm <strong>Cài đặt</strong> (đã có app cũ: bấm <strong>Cập nhật</strong>, không cần gỡ).</li>
      <li>Mở app <strong>Hiền Xa</strong>, đăng nhập đúng tab của mình. Khi app hỏi, cho phép <strong>Máy ảnh</strong> và <strong>Vị trí</strong> để chụp ảnh giao hàng và chấm công.<HomeIconFigure /></li>
    </ol>
  </section>;
}

/** "safari": steps only; "other-browser": an iPhone in Zalo, Chrome… is first sent to Safari; "not-iphone": read from another device. */
type IphoneBrowser = "safari" | "other-browser" | "not-iphone";

function IphoneSteps({ browser, reveal = false }: { browser: IphoneBrowser; reveal?: boolean }) {
  return <section className="install-block" aria-labelledby="install-iphone">
    <PlatformHead id="install-iphone" title="iPhone" note="Cài từ Safari" reveal={reveal} />
    {browser === "other-browser" && <div className="install-safari">
      <p className="form-message warning" role="note">Trên iPhone, app chỉ cài được từ <strong>Safari</strong>. Chép link, mở Safari, dán link rồi làm theo các bước dưới.</p>
      <CopyLink label="Chép link cài app" />
    </div>}
    <ol className="install-steps" role="list">
      <li>Trong Safari, bấm nút <strong>Chia sẻ</strong> ở thanh dưới (iPad: góc trên).
        <span className="install-figure" aria-hidden="true"><span className="install-figure-tap install-figure-share"><Share size={20} /></span>Chia sẻ</span></li>
      <li>Chọn <strong>Thêm vào MH chính</strong> (kéo xuống nếu chưa thấy), rồi bấm <strong>Thêm</strong>.
        <span className="install-figure" aria-hidden="true"><span className="install-figure-tap install-figure-row">Thêm vào MH chính<SquarePlus size={20} /></span></span></li>
      <li>Mở app <strong>Hiền Xa</strong> trên màn hình chính và đăng nhập.<HomeIconFigure /></li>
    </ol>
    <p className="install-note"><Bell aria-hidden size={16} /><span>Thợ & tài xế: vào <strong>Hồ sơ</strong> → <strong>Bật thông báo trên máy này</strong> để nhận việc mới (iOS 16.4 trở lên).</span></p>
  </section>;
}

/** On a computer the job is to send the link: it comes first, with the address it copies. */
function ShareLink() {
  const link = useSyncExternalStore(subscribeNever, readLink, () => "");
  return <section className="install-share" aria-labelledby="install-share">
    <h2 id="install-share">Gửi cho nhân viên, khách hàng</h2>
    <p className="muted">Gửi link trang này qua Zalo; mở trên điện thoại sẽ thấy đúng cách cài cho máy đó.</p>
    <div className="install-share-row">
      <span className="install-link">{link.replace(/^https?:\/\//, "")}</span>
      <CopyLink label="Chép link trang này" />
    </div>
  </section>;
}

/** D81 "Cài app Hiền Xa": one app for the three portals; Android installs the APK, iPhone adds the site from Safari. */
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
    return <div className="install-guide install-done">
      <p className="form-message success" role="status"><Check aria-hidden size={18} />App Hiền Xa đã được cài trên máy này.</p>
      <Link className="button button-primary install-action" href="/">Mở trang đăng nhập</Link>
    </div>;
  }
  const iphone = device === "ios-safari" || device === "ios-other";
  const both = device === null || device === "desktop" || showAll;
  const android = both || device === "android" ? <AndroidSteps key="android" inApp={inApp} reveal={showAll && iphone} /> : null;
  const ios = both || iphone
    ? <IphoneSteps key="iphone" browser={device === "ios-safari" ? "safari" : device === "ios-other" ? "other-browser" : "not-iphone"} reveal={showAll && !iphone} />
    : null;
  return <div className="install-guide">
    {device === "desktop" && <ShareLink />}
    {/* This phone's own way first; the other one opens under it. */}
    <div className={both ? "install-platforms install-platforms-both" : "install-platforms"}>{iphone ? [ios, android] : [android, ios]}</div>
    {!both && <button type="button" className="install-more" onClick={() => setShowAll(true)}>Xem cách cài cho máy khác<ChevronDown aria-hidden size={16} /></button>}
  </div>;
}
