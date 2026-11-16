import { createServerSupabase } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { expiredAuthCookies, logoutClearSiteData, logoutDestination } from "@/lib/auth/logout";
import { isSessionOnly } from "@/lib/supabase/cookie-options";
import { appPushToken } from "@/modules/notifications/app-push-token";

export async function POST(request: NextRequest) {
  let form: FormData | null = null;
  const sessionOnly = isSessionOnly((name) => request.cookies.get(name)?.value);
  try {
    form = await request.formData();
  } catch { /* no form body: back to the default tab */ }
  const surface = form?.get("surface") ?? null;
  // D86: signed out inside the Android app, the phone's Firebase token (added by AppPushRegistrar) leaves this login.
  const pushToken = appPushToken.safeParse(form?.get("push_token"));
  try {
    const supabase = await createServerSupabase();
    if (pushToken.success) {
      // Before the session ends (the database only deletes the caller's own token); a failure never blocks the sign-out.
      try { await supabase.rpc("delete_app_push_token", { token: pushToken.data }); } catch { /* signed out all the same */ }
    }
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
