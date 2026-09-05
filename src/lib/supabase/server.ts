import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabasePublicConfig } from "@/lib/supabase/config";
import { boundedSupabaseFetch } from "@/lib/supabase/bounded-fetch";

export async function createClient() {
  const cookieStore = await cookies();
  const config = requireSupabasePublicConfig();

  return createServerClient(config.url, config.publishableKey, {
    global: { fetch: boundedSupabaseFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes them.
        }
      },
    },
  });
}
