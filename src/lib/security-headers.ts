/**
 * Browser security headers for every page and API answer (security scan 04/11/2026, P2).
 *
 * The CSP has no nonces (they would force every page to render on demand), so scripts keep 'unsafe-inline' for Next's
 * inline bootstrap; it still forbids plugins, other <base> targets, posting forms elsewhere, framing the app (clickjacking)
 * and sending data to any server other than the app and its Supabase project. Images may come from any https host:
 * map tiles are configurable (NEXT_PUBLIC_MAP_TILE_URL) and the VietQR picture comes from vietqr.app.
 */
export type HeaderPair = { key: string; value: string };

export function supabaseOrigins(url: string | undefined): string[] {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];
    return [parsed.origin, `${parsed.protocol === "https:" ? "wss" : "ws"}://${parsed.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy({ supabaseUrl, dev = false, preview = false }: { supabaseUrl?: string; dev?: boolean; preview?: boolean }): string {
  // Vercel's preview toolbar (QA builds only) loads its script and frame from vercel.live.
  const live = preview ? ["https://vercel.live"] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...live],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabaseOrigins(supabaseUrl), ...live, ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": live.length ? live : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: { supabaseUrl?: string; dev?: boolean; preview?: boolean }): HeaderPair[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Location is used by drivers' GPS and attendance; photos come from the file picker, which needs no camera permission.
    { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  ];
}
