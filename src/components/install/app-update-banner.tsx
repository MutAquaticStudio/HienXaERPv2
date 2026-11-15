"use client";

import { useSyncExternalStore } from "react";
import { ANDROID_APK_PATH, ANDROID_APP_VERSION, androidAppNeedsUpdate, TWA_REFERRER } from "@/lib/app-shell/native-app";

const LATER = "hx-app-update-later";
const FROM_TWA = "hx-from-twa";
const listeners = new Set<() => void>();

function readSession(key: string) {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string) {
  try { window.sessionStorage.setItem(key, value); } catch { /* private mode: the card just shows again */ }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function needsUpdate() {
  // The D81 app only says who opened the site on its first page; remember it for this visit.
  if (document.referrer.startsWith(TWA_REFERRER)) writeSession(FROM_TWA, "1");
  if (readSession(LATER) === ANDROID_APP_VERSION) return false;
  return androidAppNeedsUpdate(navigator.userAgent, document.referrer) || readSession(FROM_TWA) === "1";
}
function later() {
  writeSession(LATER, ANDROID_APP_VERSION);
  listeners.forEach((listener) => listener());
}

/** D82: inside an older Android app, a card offers the new APK (installs over the old one). "Để sau" hides it until the app is opened again. */
export function AppUpdateBanner() {
  const show = useSyncExternalStore(subscribe, needsUpdate, () => false);
  if (!show) return null;
  return <aside className="app-update" aria-labelledby="app-update-title">
    <div className="app-update-text">
      <strong id="app-update-title">Có bản app Hiền Xa mới</strong>
      <p>Bấm Cập nhật, tải xong bấm Cài đặt. App mới cài đè lên app cũ.</p>
    </div>
    <div className="app-update-actions">
      <button type="button" className="button button-secondary" onClick={later}>Để sau</button>
      <a className="button button-primary" href={ANDROID_APK_PATH} download>Cập nhật</a>
    </div>
  </aside>;
}
