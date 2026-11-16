"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { APP_PUSH_EVENT, appPushBridge, dropAppPush, forgetAppPushRegistration, readAppPush, registerAppPush, signedInPortalPath } from "./app-push";

/**
 * D86, inside the Android app (2.3.0+) only — renders nothing:
 * - on the signed-in pages, a phone whose app may already notify is registered for the login without anyone tapping
 *   "Bật thông báo" (also right after Android's "Cho phép gửi thông báo?" is answered on the first visit); a phone where the
 *   app's notifications were switched off in Android settings stops being sent to;
 * - signing out ("Đăng xuất", any /auth/logout form) sends the phone's token along, so the sign-out removes it from the login.
 */
export function AppPushRegistrar() {
  const portal = signedInPortalPath(usePathname() ?? "");

  useEffect(() => {
    const bridge = appPushBridge();
    if (!bridge) return;
    if (!portal) { forgetAppPushRegistration(); return; }
    const sync = () => {
      const { token, permission } = readAppPush(bridge);
      if (!token) return;
      if (permission === "granted") void registerAppPush(token);
      else if (permission === "denied") dropAppPush(token);
    };
    sync();
    window.addEventListener(APP_PUSH_EVENT, sync);
    return () => window.removeEventListener(APP_PUSH_EVENT, sync);
  }, [portal]);

  useEffect(() => {
    const bridge = appPushBridge();
    if (!bridge) return;
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      let path = "";
      try { path = new URL(form.getAttribute("action") ?? "", window.location.href).pathname; } catch { return; }
      if (path !== "/auth/logout") return;
      const { token } = readAppPush(bridge);
      if (!token) return;
      let input = form.querySelector<HTMLInputElement>('input[name="push_token"]');
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "push_token";
        form.append(input);
      }
      input.value = token;
    };
    // Capture: added before the form's fields are collected for the request.
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
