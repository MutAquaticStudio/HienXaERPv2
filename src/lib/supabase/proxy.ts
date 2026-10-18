import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "./config";

/** Pages a login with a temporary password may still open (D14/C1: the first sign-in must change it). */
const PASSWORD_CHANGE_OPEN = ["/customer/change-password", "/work/change-password", "/customer/login", "/work/login", "/login", "/auth", "/api", "/recovery"];

/** Where a request of a login that must change its password is sent, or null to let it through. */
export function passwordChangeRedirect(pathname: string, mustChange: boolean): string | null {
  if (!mustChange || PASSWORD_CHANGE_OPEN.some((open) => pathname === open || pathname.startsWith(`${open}/`))) return null;
  if (pathname === "/customer" || pathname.startsWith("/customer/")) return "/customer/change-password";
  if (pathname === "/work" || pathname.startsWith("/work/")) return "/work/change-password";
  return null;
}

export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const metadata = data?.claims?.app_metadata as { hx_must_change_password?: boolean } | undefined;
  const target = passwordChangeRedirect(request.nextUrl.pathname, metadata?.hx_must_change_password === true);
  if (!target) return response;
  const redirect = NextResponse.redirect(new URL(target, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
