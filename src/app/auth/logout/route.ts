import { createServerSupabase } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { expiredAuthCookies, logoutClearSiteData, logoutDestination } from "@/lib/auth/logout";
import { isSessionOnly } from "@/lib/supabase/cookie-options";

export async function POST(request: NextRequest) {
  let surface: FormDataEntryValue | null = null;
  const sessionOnly = isSessionOnly((name) => request.cookies.get(name)?.value);
  try {
    surface = (await request.formData()).get("surface");
  } catch { /* no form body: back to the default tab */ }
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } finally {
    const response = NextResponse.redirect(new URL(logoutDestination(surface, sessionOnly), request.url), 303);
    response.headers.set("Clear-Site-Data", logoutClearSiteData(sessionOnly));
    // D77: the login cookies go even when Supabase could not be reached to end the session (a remembered device no longer
    // relies on Clear-Site-Data for them).
    for (const name of expiredAuthCookies(request.cookies.getAll().map((cookie) => cookie.name))) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return response;
  }
}
