import { expect, it } from "vitest";

import { ANDROID_APP_VERSION, androidAppNeedsUpdate, isNativeApp, isOlderVersion, nativeAppVersion } from "./native-app";

const WEBVIEW = "Mozilla/5.0 (Linux; Android 14; 23021RAA2Y Build/UKQ1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

it("recognises only the Android app's user agent, and reads its version", () => {
  expect(isNativeApp(`${WEBVIEW} HienXaAndroid/2.0.0`)).toBe(true);
  expect(nativeAppVersion(`${WEBVIEW} HienXaAndroid/2.0.0`)).toBe("2.0.0");
  expect(isNativeApp(WEBVIEW)).toBe(false);
  expect(isNativeApp(CHROME)).toBe(false);
  expect(isNativeApp(null)).toBe(false);
  expect(isNativeApp("")).toBe(false);
  expect(nativeAppVersion(CHROME)).toBeNull();
});

it("compares versions part by part", () => {
  expect(isOlderVersion("2.0.0", "2.1.0")).toBe(true);
  expect(isOlderVersion("2.1.0", "2.1.0")).toBe(false);
  expect(isOlderVersion("2.10.0", "2.9.1")).toBe(false);
  expect(isOlderVersion("2.1", "2.1.1")).toBe(true);
});

it("D82: an older native app or the D81 app opened from Chrome needs the new APK; the current app and browsers do not", () => {
  expect(androidAppNeedsUpdate(`${WEBVIEW} HienXaAndroid/2.0.0`)).toBe(true);
  expect(androidAppNeedsUpdate(`${WEBVIEW} HienXaAndroid/${ANDROID_APP_VERSION}`)).toBe(false);
  expect(androidAppNeedsUpdate(CHROME, "android-app://com.hienxavlxd.app/")).toBe(true);
  expect(androidAppNeedsUpdate(CHROME, "https://zalo.me/")).toBe(false);
  expect(androidAppNeedsUpdate(CHROME)).toBe(false);
});
