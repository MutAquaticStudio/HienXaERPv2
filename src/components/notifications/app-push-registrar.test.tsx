import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ saveApp: vi.fn(), deleteApp: vi.fn(), path: "/work" }));
vi.mock("next/navigation", () => ({ usePathname: () => m.path }));
vi.mock("@/modules/notifications/push-actions", () => ({ saveAppPushTokenAction: m.saveApp, deleteAppPushTokenAction: m.deleteApp }));
import { forgetAppPushRegistration, signedInPortalPath } from "./app-push";
import { AppPushRegistrar } from "./app-push-registrar";

const token = "fcmRegistrarToken:APA91b" + "t".repeat(40);
function installApp(state: { token: string; permission: string }) {
  Object.assign(window, { HienXaAndroid: { pushToken: () => state.token, pushPermission: () => state.permission, requestPush: vi.fn() } });
}
function logoutForm() {
  const form = document.createElement("form");
  form.setAttribute("action", "/auth/logout");
  form.method = "post";
  form.innerHTML = '<input type="hidden" name="surface" value="work" />';
  form.addEventListener("submit", (event) => event.preventDefault());
  document.body.append(form);
  return form;
}

beforeEach(() => { m.path = "/work"; m.saveApp.mockResolvedValue(true); m.deleteApp.mockResolvedValue(true); });
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  delete (window as Window & { HienXaAndroid?: unknown }).HienXaAndroid;
  forgetAppPushRegistration();
  vi.clearAllMocks();
});

it("knows the signed-in portal pages", () => {
  expect(["/work", "/work/jobs/1", "/customer", "/customer/orders", "/admin", "/admin/settings/automation"].every(signedInPortalPath)).toBe(true);
  expect(["/", "/work/login", "/customer/login", "/customer/register", "/tai-app", "/workers", "/auth/logout"].some(signedInPortalPath)).toBe(false);
});

it("D86: in the app, a phone allowed to notify is registered on the signed-in pages without a tap (once per visit)", async () => {
  const state = { token: "", permission: "default" };
  installApp(state);
  const { rerender } = render(<AppPushRegistrar />);
  expect(m.saveApp).not.toHaveBeenCalled();
  // The first visit: the app asked Android, the worker allowed it, the app hands the token over.
  state.permission = "granted";
  state.token = token;
  await act(async () => { window.dispatchEvent(new CustomEvent("hx-push-token", { detail: token })); });
  expect(m.saveApp).toHaveBeenCalledWith({ token, platform: "ANDROID", userAgent: navigator.userAgent.slice(0, 300) });
  m.path = "/work/pool";
  rerender(<AppPushRegistrar />);
  await act(async () => { window.dispatchEvent(new CustomEvent("hx-push-token", { detail: token })); });
  expect(m.saveApp).toHaveBeenCalledTimes(1);
});

it("D86: not on the sign-in page, not in a browser; notifications switched off in Android stop the sending", async () => {
  m.path = "/work/login";
  installApp({ token, permission: "granted" });
  render(<AppPushRegistrar />);
  expect(m.saveApp).not.toHaveBeenCalled();
  cleanup();
  delete (window as Window & { HienXaAndroid?: unknown }).HienXaAndroid;
  m.path = "/customer";
  render(<AppPushRegistrar />);
  expect(m.saveApp).not.toHaveBeenCalled();
  cleanup();
  installApp({ token, permission: "denied" });
  render(<AppPushRegistrar />);
  expect(m.deleteApp).toHaveBeenCalledWith(token);
  expect(m.saveApp).not.toHaveBeenCalled();
});

it("D86: signing out in the app sends the phone's token with the sign-out", () => {
  installApp({ token, permission: "granted" });
  render(<AppPushRegistrar />);
  const form = logoutForm();
  form.requestSubmit();
  expect(form.querySelector<HTMLInputElement>('input[name="push_token"]')?.value).toBe(token);
  expect(new FormData(form).get("surface")).toBe("work");
  const other = document.createElement("form");
  other.setAttribute("action", "/customer/messages");
  other.addEventListener("submit", (event) => event.preventDefault());
  document.body.append(other);
  other.requestSubmit();
  expect(other.querySelector('input[name="push_token"]')).toBeNull();
});
