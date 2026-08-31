import "server-only";

import { assertSafeRuntimeConfiguration } from "@/modules/platform/environment";

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  assertSafeRuntimeConfiguration();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  }
  return config;
}
