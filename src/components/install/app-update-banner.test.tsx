import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ANDROID_APP_VERSION } from "@/lib/app-shell/native-app";
import { AppUpdateBanner } from "./app-update-banner";

const WEBVIEW = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
const as = (agent: string, referrer = "") => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);
  vi.spyOn(document, "referrer", "get").mockReturnValue(referrer);
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); });

it("offers the new APK inside an older Android app; 'Để sau' hides it for this visit", () => {
  as(`${WEBVIEW} HienXaAndroid/2.0.0`);
  render(<AppUpdateBanner />);
  expect(screen.getByRole("complementary", { name: "Có bản app Hiền Xa mới" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cập nhật" })).toHaveAttribute("href", "/app/hien-xa.apk");
  fireEvent.click(screen.getByRole("button", { name: "Để sau" }));
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  cleanup();
  render(<AppUpdateBanner />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
});

it("stays hidden in the current app and in a browser", () => {
  as(`${WEBVIEW} HienXaAndroid/${ANDROID_APP_VERSION}`);
  const { container } = render(<AppUpdateBanner />);
  expect(container.innerHTML).toBe("");
  cleanup();
  as("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36");
  expect(render(<AppUpdateBanner />).container.innerHTML).toBe("");
});

it("the D81 app (opened from Chrome) is offered the new app for the whole visit", () => {
  const chrome = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
  as(chrome, "android-app://com.hienxavlxd.app/");
  render(<AppUpdateBanner />);
  expect(screen.getByRole("link", { name: "Cập nhật" })).toBeInTheDocument();
  cleanup();
  as(chrome, "https://app.hienxavlxd.com/work");
  render(<AppUpdateBanner />);
  expect(screen.getByRole("link", { name: "Cập nhật" })).toBeInTheDocument();
});
