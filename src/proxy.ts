import type { NextRequest } from "next/server";
import { refreshAuthSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return refreshAuthSession(request);
}

export const config = {
  // D81: the APK and the Android app-link file are plain static files; no session work for them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|apk)$).*)"],
};
