/**
 * D82: the Android app "Hiền Xa" (mobile/android) shows this website in its own WebView and adds
 * " HienXaAndroid/<version>" to the user agent, so pages can tell they are inside the app.
 */
const NATIVE_APP_AGENT = /\bHienXaAndroid\//;

export function isNativeApp(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && NATIVE_APP_AGENT.test(userAgent));
}
