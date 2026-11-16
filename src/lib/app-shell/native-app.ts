/**
 * D82: the Android app "Hiền Xa" (mobile/android) shows this website in its own WebView and adds
 * " HienXaAndroid/<version>" to the user agent, so pages can tell they are inside the app.
 */
const NATIVE_APP_AGENT = /\bHienXaAndroid\/(\d+(?:\.\d+)*)/;

/** The APK published at /app/hien-xa.apk. scripts/mobile/build-android.mjs refuses an APK with another versionName. */
export const ANDROID_APP_VERSION = "2.3.0";
/** D86: the first app that receives push (Firebase). Older apps keep D82's "no push": the push sections stay hidden there. */
export const ANDROID_PUSH_VERSION = "2.3.0";
export const ANDROID_APK_PATH = "/app/hien-xa.apk";
/** The D81 app (Trusted Web Activity) opened the site in Chrome with this referrer. */
export const TWA_REFERRER = "android-app://com.hienxavlxd.app";

export function isNativeApp(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && NATIVE_APP_AGENT.test(userAgent));
}

export function nativeAppVersion(userAgent: string | null | undefined): string | null {
  return (userAgent && NATIVE_APP_AGENT.exec(userAgent)?.[1]) || null;
}

/** D86: the Android app on this phone can receive push (2.3.0 or newer). */
export function nativeAppHasPush(userAgent: string | null | undefined): boolean {
  const version = nativeAppVersion(userAgent);
  return version !== null && !isOlderVersion(version, ANDROID_PUSH_VERSION);
}

/** "2.0.0" < "2.1.0" < "2.10.0": compared part by part as numbers. */
export function isOlderVersion(version: string, than: string): boolean {
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left < right;
  }
  return false;
}

/** D82: an older app on this phone (the native app before ANDROID_APP_VERSION, or the D81 app opened from Chrome). */
export function androidAppNeedsUpdate(userAgent: string, referrer = ""): boolean {
  const version = nativeAppVersion(userAgent);
  if (version) return isOlderVersion(version, ANDROID_APP_VERSION);
  return referrer.startsWith(TWA_REFERRER);
}
