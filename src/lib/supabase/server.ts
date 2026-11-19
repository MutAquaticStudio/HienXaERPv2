import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS, authCookieWriteOptions, isSessionOnly } from "./cookie-options";
import { getSupabaseConfig } from "./config";

/**
 * `sessionOnly` (D77) says how the login cookies written by this client live; left out, it follows the request (a login
 * made without "Ghi nhớ đăng nhập" keeps ending when the browser closes, also when its session is refreshed).
 */
export async function createServerSupabase(options: { sessionOnly?: boolean } = {}) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();
  const sessionOnly = () => options.sessionOnly ?? isSessionOnly((name) => cookieStore.get(name)?.value);

  return createServerClient(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          const browserSession = sessionOnly();
          cookiesToSet.forEach(({ name, value, options: cookie }) => cookieStore.set(name, value, authCookieWriteOptions(cookie, browserSession)));
        } catch {
          // A Server Component cannot write cookies. Proxy refresh owns that path.
        }
      },
    },
  });
}
