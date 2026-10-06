import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

// Call only after the current session passes the canonical evidence RPC.
// This client is never used to decide business authorization.
export function createPortalEvidenceStorage() {
  const { url } = getSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Private evidence storage is not configured");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.any([
          ...(init.signal ? [init.signal] : []),
          AbortSignal.timeout(15000),
        ]),
      }),
    },
  }).storage;
}
