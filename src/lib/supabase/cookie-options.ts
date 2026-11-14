import type { CookieOptions, CookieOptionsWithName } from "@supabase/ssr";

/**
 * Login cookie flags (security scan 04/11/2026, P2). Secure in production so the session never travels over plain http;
 * SameSite=Lax (the library default, stated here on purpose). Not HttpOnly: the browser client (notifications, messages,
 * uploads, password recovery) reads the session from document.cookie, as @supabase/ssr is designed.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };

/**
 * D77: set at sign-in when "Ghi nhớ đăng nhập" is off. It lives only while the browser is open, and while it is there the
 * login cookies are written the same way, so closing the browser signs this device out. Other devices are not touched.
 */
export const SESSION_ONLY_COOKIE = "hx_session_only";

/** Whether the cookies of a request say the login is kept only until the browser closes. */
export function isSessionOnly(read: (name: string) => string | undefined): boolean {
  return read(SESSION_ONLY_COOKIE) === "1";
}

/**
 * The options one login cookie is written with: unchanged when the login is remembered (the library keeps it 400 days),
 * without a lifetime when it is not. A cookie being removed (max-age 0) is always removed.
 */
export function authCookieWriteOptions(options: CookieOptions, sessionOnly: boolean): CookieOptions {
  if (!sessionOnly || options.maxAge === 0) return options;
  const { maxAge: _maxAge, expires: _expires, ...browserSession } = options;
  return browserSession;
}
