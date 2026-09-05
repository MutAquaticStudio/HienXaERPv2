import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { boundedSupabaseFetch } from "@/lib/supabase/bounded-fetch";

export async function updateSession(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    global: { fetch: boundedSupabaseFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  try {
    const { error } = await supabase.auth.getClaims();
    if (error && (!error.status || error.status === 429 || error.status >= 500)) {
      throw error;
    }
  } catch {
    // Do not mistake an unavailable auth service for an invalid session.
    return NextResponse.json(
      { error: "Dịch vụ đăng nhập tạm thời không phản hồi. Hãy thử lại." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } },
    );
  }
  return response;
}
