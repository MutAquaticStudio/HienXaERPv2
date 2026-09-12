const LOCAL_SUPABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase runtime is not configured.");

  const parsed = new URL(url);
  const cloudApproved = process.env.HX_CLOUD_RUNTIME_APPROVED === "true";
  if (!LOCAL_SUPABASE_HOSTS.has(parsed.hostname) && !cloudApproved) {
    throw new Error("Supabase guard rejected a cloud runtime without explicit approval.");
  }

  return { url, publishableKey };
}
