import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, authCookieWriteOptions, isSessionOnly } from "./cookie-options";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase browser runtime is not configured.");
  return createBrowserClient(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    // The library's own document.cookie reader and writer, except that a login kept only until the browser closes (D77)
    // is written without a lifetime when the browser refreshes it.
    cookies: {
      getAll: () => parseCookieHeader(document.cookie),
      setAll: (cookiesToSet) => {
        const all = parseCookieHeader(document.cookie);
        const browserSession = isSessionOnly((name) => all.find((cookie) => cookie.name === name)?.value);
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, authCookieWriteOptions(options, browserSession));
        });
      },
    },
  });
}
