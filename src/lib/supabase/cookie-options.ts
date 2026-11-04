import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Login cookie flags (security scan 04/11/2026, P2). Secure in production so the session never travels over plain http;
 * SameSite=Lax (the library default, stated here on purpose). Not HttpOnly: the browser client (notifications, messages,
 * uploads, password recovery) reads the session from document.cookie, as @supabase/ssr is designed.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
