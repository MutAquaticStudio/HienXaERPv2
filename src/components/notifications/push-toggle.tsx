"use client";

import { useEffect, useState } from "react";
import { deletePushSubscriptionAction, savePushSubscriptionAction } from "@/modules/notifications/push-actions";

type Status = "checking" | "unsupported" | "not-configured" | "blocked" | "off" | "on" | "install-first";

function applicationServerKey(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/**
 * F5 "Thông báo trên điện thoại": registers the service worker and this browser's push address, so the automation rules can
 * reach this phone. On iPhone the app must first be added to the home screen (Safari → Chia sẻ → Thêm vào MH chính).
 */
export function PushToggle({ publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "" }: { publicKey?: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function check() {
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

  async function turnOn() {
    setBusy(true); setMessage(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") { setStatus("blocked"); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const json = subscription.toJSON();
      const saved = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) });
      if (!saved) { await subscription.unsubscribe(); setMessage("Chưa lưu được máy này. Thử lại sau."); return; }
      setStatus("on"); setMessage("Đã bật. Máy này sẽ nhận thông báo theo quy tắc tự động.");
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
  };
  return <div className="push-toggle">
    <p className="muted">{text[status]}</p>
    {status === "off" && <button type="button" className="button button-primary" disabled={busy} onClick={() => { void turnOn(); }}>{busy ? "Đang bật..." : "Bật thông báo trên máy này"}</button>}
    {status === "on" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => { void turnOff(); }}>{busy ? "Đang tắt..." : "Tắt thông báo trên máy này"}</button>}
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
