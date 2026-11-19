import "server-only";

// D50 (Owner 03/11/2026): the Claude API key entered in Cài đặt → Trợ lý AI lives in Supabase Vault. Only the server reads
// it back, with the service role (SUPABASE_SECRET_KEY — allowed here by the Owner, D50); no browser session can. Without a
// key in the app the server keeps using ANTHROPIC_API_KEY of the environment.
import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/config";

export type AiKeySource = "APP" | "ENVIRONMENT";

/** The key to call Claude with and where it came from, or null when neither the app nor the environment has one. */
export async function resolveAiApiKey(): Promise<{ key: string; source: AiKeySource } | null> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (secret) {
    try {
      const service = createClient(getSupabaseConfig().url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init = {}) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) }) },
      });
      const { data, error } = await service.rpc("ai_api_key_for_server");
      if (!error && typeof data === "string" && data.trim()) return { key: data.trim(), source: "APP" };
      if (error) console.error("[ai] reading the API key from Vault failed", { code: error.code, message: error.message });
    } catch (error) {
      console.error("[ai] reading the API key from Vault failed", error instanceof Error ? error.message : String(error));
    }
  }
  const environment = process.env.ANTHROPIC_API_KEY?.trim();
  return environment ? { key: environment, source: "ENVIRONMENT" } : null;
}

/** Whether the environment has a key of its own (shown in Cài đặt as the fallback). */
export function environmentHasAiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
