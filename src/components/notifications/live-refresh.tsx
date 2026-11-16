"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The page's event when a push arrives: posted by public/sw.js, fired on window by the Android app (2.3.1+). */
export const LIVE_PUSH_EVENT = "hx-push";
/** At most one refresh in this window; a burst of pushes (or push + coming back to the tab) refreshes once. */
export const LIVE_REFRESH_GAP_MS = 4_000;
/** Safety net while the page is visible: a push that never reached this page still shows within a minute. */
export const LIVE_REFRESH_INTERVAL_MS = 60_000;

/**
 * D92 "Màn hình tự cập nhật khi có thông báo mới": the open page re-reads its data (router.refresh, nothing else) when a push
 * arrives, when it becomes visible again, and every minute while visible — so the D83 popup, new jobs on "Hôm nay", the
 * "Nhận việc"/"Điều phối" counts and the office bell appear without tapping the notification or reloading. Renders nothing.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      pending = null;
      last = Date.now();
      router.refresh();
    };
    const refresh = () => {
      if (pending) return;
      const wait = last + LIVE_REFRESH_GAP_MS - Date.now();
      if (wait <= 0) run();
      else pending = setTimeout(run, wait);
    };
    const hidden = () => document.visibilityState === "hidden";
    const startInterval = () => {
      if (!interval) interval = setInterval(() => { if (!hidden()) refresh(); }, LIVE_REFRESH_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (data && typeof data === "object" && (data as { type?: unknown }).type === LIVE_PUSH_EVENT) refresh();
    };
    const onVisibility = () => {
      if (hidden()) {
        stopInterval();
        return;
      }
      startInterval();
      refresh();
    };

    const worker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    worker?.addEventListener("message", onMessage);
    window.addEventListener(LIVE_PUSH_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisibility);
    if (!hidden()) startInterval();

    return () => {
      worker?.removeEventListener("message", onMessage);
      window.removeEventListener(LIVE_PUSH_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      stopInterval();
      if (pending) clearTimeout(pending);
    };
  }, [router]);

  return null;
}
