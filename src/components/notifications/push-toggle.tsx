"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/app-shell/native-app";
import { deletePushSubscriptionAction, savePushSubscriptionAction } from "@/modules/notifications/push-actions";
import { APP_PUSH_EVENT, appPushBridge, readAppPush, registerAppPush, requestAppPush } from "./app-push";

type Status = "checking" | "unsupported" | "not-configured" | "blocked" | "off" | "on" | "install-first" | "android-app"
  | "app-off" | "app-on" | "app-blocked";

function applicationServerKey(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/**
 * F5 "Thông báo trên điện thoại": registers the service worker and this browser's push address, so the automation rules can
 * reach this phone. On iPhone the app must first be added to the home screen (Safari → Chia sẻ → Thêm vào MH chính).
 * D86: inside the Android app 2.3.0+ the app receives the notifications itself (Firebase): the button asks the app, and a
 * phone whose app may already notify is registered without a tap. An older app (D82) cannot receive push: it says so, and the
 * home-screen card stays hidden (the "Có bản app Hiền Xa mới" card offers the new app).
 */
export function PushToggle({ publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "", prompt, onText }: {
  publicKey?: string;
  /** D83: what "Đã bật" says on this page (the customer portal: the store's announcements, not automation rules). */
  onText?: string;
  /** D80: a short card (heading + one button) shown only while this phone could still switch notifications on. */
  prompt?: { title: string; text: string; className?: string };
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const bridge = appPushBridge();
    if (bridge) {
      const check = async (): Promise<Status> => {
        const { token, permission } = readAppPush(bridge);
        if (permission === "denied") return "app-blocked";
        if (permission === "granted" && token) return (await registerAppPush(token)) ? "app-on" : "app-off";
        return "app-off";
      };
      const update = () => { void check().then((next) => { if (live) setStatus(next); }); };
      update();
      // The app answers later: Android's permission dialog, a new token, notifications switched on in Android settings.
      window.addEventListener(APP_PUSH_EVENT, update);
      return () => { live = false; window.removeEventListener(APP_PUSH_EVENT, update); };
    }
    async function check() {
      if (isNativeApp(navigator.userAgent)) return "android-app" as const;
      if (!publicKey) return "not-configured" as const;
      const iphone = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return iphone && !standalone ? "install-first" as const : "unsupported" as const;
      if (Notification.permission === "denied") return "blocked" as const;
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      return (await registration.pushManager.getSubscription()) ? "on" as const : "off" as const;
    }
    check().then((next) => { if (live) setStatus(next); }).catch(() => { if (live) setStatus("unsupported"); });
    return () => { live = false; };
  }, [publicKey]);

  const enabledText = onText ?? (prompt ? "Đã bật. Điện thoại sẽ báo khi có việc mới." : "Đã bật. Máy này sẽ nhận thông báo theo quy tắc tự động.");

  async function turnOnApp() {
    const bridge = appPushBridge();
    if (!bridge) return;
    setBusy(true); setMessage(null);
    try {
      const token = await requestAppPush(bridge);
      const { permission } = readAppPush(bridge);
      if (permission === "denied") { setStatus("app-blocked"); return; }
      if (permission !== "granted") { setMessage("Chưa được phép gửi thông báo. Bấm lại và chọn “Cho phép”."); return; }
      if (!token || !(await registerAppPush(token))) { setMessage("Chưa bật được thông báo trên máy này. Kiểm tra mạng rồi thử lại."); return; }
      setStatus("app-on"); setMessage(enabledText);
    } finally {
      setBusy(false);
    }
  }

  async function turnOn() {
    if (status === "app-off") { await turnOnApp(); return; }
    setBusy(true); setMessage(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") { setStatus("blocked"); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const json = subscription.toJSON();
      const saved = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) });
      if (!saved) { await subscription.unsubscribe(); setMessage("Chưa lưu được máy này. Thử lại sau."); return; }
      setStatus("on"); setMessage(enabledText);
    } catch {
      setMessage("Không bật được thông báo trên trình duyệt này.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true); setMessage(null);
    try {
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (subscription) { await deletePushSubscriptionAction(subscription.endpoint); await subscription.unsubscribe(); }
      setStatus("off"); setMessage("Đã tắt thông báo trên máy này.");
    } catch {
      setMessage("Không tắt được. Tắt trong cài đặt thông báo của trình duyệt.");
    } finally {
      setBusy(false);
    }
  }

  const text: Record<Status, string> = {
    checking: "Đang kiểm tra máy này...",
    unsupported: "Trình duyệt này không nhận được thông báo đẩy.",
    "not-configured": "Thông báo đẩy chưa được cấu hình cho ứng dụng.",
    blocked: "Máy này đang chặn thông báo. Cho phép thông báo của trang trong cài đặt trình duyệt rồi tải lại.",
    off: "Máy này chưa nhận thông báo.",
    on: "Máy này đang nhận thông báo.",
    "install-first": "Trên iPhone: mở bằng Safari → Chia sẻ → “Thêm vào MH chính”, rồi mở ứng dụng từ màn hình chính để bật thông báo.",
    "android-app": "Bản app Hiền Xa trên máy này chưa nhận được thông báo đẩy. Cập nhật app (thẻ “Có bản app Hiền Xa mới”) để bật.",
    "app-off": "Máy này chưa nhận thông báo.",
    "app-on": "Máy này đang nhận thông báo. Muốn tắt: Cài đặt của điện thoại → Ứng dụng → Hiền Xa → Thông báo.",
    "app-blocked": "Máy này đang chặn thông báo của app Hiền Xa. Bật lại trong Cài đặt của điện thoại → Ứng dụng → Hiền Xa → Thông báo.",
  };
  const canTurnOn = status === "off" || status === "app-off";
  const button = canTurnOn && <button type="button" className="button button-primary" disabled={busy} onClick={() => { void turnOn(); }}>{busy ? "Đang bật..." : "Bật thông báo trên máy này"}</button>;
  if (prompt) {
    if (!canTurnOn && status !== "install-first" && !message) return null;
    return <section className={prompt.className} aria-label={prompt.title}>
      <h2>{prompt.title}</h2>
      <div className="push-toggle">
        <p className="muted">{canTurnOn ? prompt.text : status === "install-first" ? text["install-first"] : null}</p>
        {button}
        {message && <p className="form-message" role="status">{message}</p>}
      </div>
    </section>;
  }
  return <div className="push-toggle">
    <p className="muted">{text[status]}</p>
    {button}
    {status === "on" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => { void turnOff(); }}>{busy ? "Đang tắt..." : "Tắt thông báo trên máy này"}</button>}
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
