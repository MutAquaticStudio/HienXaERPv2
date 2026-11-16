import { deleteAppPushTokenAction, saveAppPushTokenAction } from "@/modules/notifications/push-actions";

/**
 * D86: push inside the Android app "Hiền Xa" (2.3.0+). The app receives notifications itself through Firebase; the page only
 * hands the phone's token to the signed-in login. The app offers on `window.HienXaAndroid` (MainActivity.Bridge):
 * pushToken() — the phone's Firebase token or ""; pushPermission() — "granted" / "denied" / "default"; requestPush() — asks
 * Android for permission when needed, then fires APP_PUSH_EVENT with the token. Older apps have none of these.
 */
export type AppPushBridge = { pushToken(): string; pushPermission(): string; requestPush(): void };
export type AppPushPermission = "granted" | "denied" | "default";
/** Fired by the app on `window` (detail: the token, "" when there is none) after requestPush(), a permission answer or a new token. */
export const APP_PUSH_EVENT = "hx-push-token";

export function appPushBridge(): AppPushBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { HienXaAndroid?: Partial<AppPushBridge> }).HienXaAndroid;
  return bridge && typeof bridge.pushToken === "function" && typeof bridge.pushPermission === "function" && typeof bridge.requestPush === "function"
    ? bridge as AppPushBridge : null;
}

export function readAppPush(bridge: AppPushBridge): { token: string; permission: AppPushPermission } {
  try {
    const token = String(bridge.pushToken() ?? "");
    const permission = String(bridge.pushPermission());
    return { token, permission: permission === "granted" || permission === "denied" ? permission : "default" };
  } catch {
    return { token: "", permission: "default" };
  }
}

/** A page of a signed-in portal (not its sign-in or sign-up page): the phone's token belongs to that login there. */
export function signedInPortalPath(pathname: string): boolean {
  const match = /^\/(?:work|customer|admin)(?:\/([^/]*))?(?:\/|$)/.exec(pathname);
  return Boolean(match) && !["login", "register"].includes(match?.[1] ?? "");
}

let saved: { token: string; result: Promise<boolean> } | null = null;
let dropped: string | null = null;

/** Saves this phone's token for the signed-in login, once per page visit (the silent registration and "Bật thông báo" share it). */
export function registerAppPush(token: string): Promise<boolean> {
  if (saved?.token === token) return saved.result;
  const result = saveAppPushTokenAction({ token, platform: "ANDROID", userAgent: navigator.userAgent.slice(0, 300) }).catch(() => false);
  const entry = { token, result };
  saved = entry;
  dropped = null;
  void result.then((ok) => { if (!ok && saved === entry) saved = null; });
  return result;
}

/** Left the signed-in pages: the next login on this phone saves the token again. */
export function forgetAppPushRegistration() {
  saved = null;
}

/** Notifications of the app were switched off in Android settings: the login stops sending to this phone. */
export function dropAppPush(token: string) {
  if (dropped === token) return;
  dropped = token;
  if (saved?.token === token) saved = null;
  void deleteAppPushTokenAction(token).catch(() => false);
}

/** Asks the app (Android's "Cho phép gửi thông báo?" on Android 13+ when needed) and waits for its answer: the token or "". */
export function requestAppPush(bridge: AppPushBridge, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve) => {
    const done = (token: string) => {
      window.clearTimeout(timer);
      window.removeEventListener(APP_PUSH_EVENT, listener);
      resolve(token);
    };
    const listener = (event: Event) => done(String((event as CustomEvent<unknown>).detail ?? ""));
    const timer = window.setTimeout(() => done(readAppPush(bridge).token), timeoutMs);
    window.addEventListener(APP_PUSH_EVENT, listener);
    try { bridge.requestPush(); } catch { done(""); }
  });
}
