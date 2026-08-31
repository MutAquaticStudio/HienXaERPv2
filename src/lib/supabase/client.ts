"use client";

import { createBrowserClient } from "@supabase/ssr";

export interface BrowserSupabaseConfig {
  url: string;
  publishableKey: string;
}

// The Server Component must obtain this config through getSupabasePublicConfig,
// which enforces the hosted-runtime guard before serializing public values.
export function createClient(config: BrowserSupabaseConfig) {
  return createBrowserClient(config.url, config.publishableKey);
}
