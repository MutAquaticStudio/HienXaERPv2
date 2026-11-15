import { expect, it } from "vitest";

import { isNativeApp } from "./native-app";

it("recognises only the Android app's user agent", () => {
  const webView = "Mozilla/5.0 (Linux; Android 14; 23021RAA2Y Build/UKQ1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
  expect(isNativeApp(`${webView} HienXaAndroid/2.0.0`)).toBe(true);
  expect(isNativeApp(webView)).toBe(false);
  expect(isNativeApp("Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36")).toBe(false);
  expect(isNativeApp(null)).toBe(false);
  expect(isNativeApp("")).toBe(false);
});
