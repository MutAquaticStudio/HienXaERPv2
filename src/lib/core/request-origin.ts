// Next may construct an internal localhost URL. The actual HTTP Host is the
// browser's destination; never substitute a caller-supplied forwarded host.
export function hasSameRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const internal = new URL(request.url);
    const host = request.headers.get("host");
    const destination = host ? new URL(internal.protocol + "//" + host) : internal;
    if (destination.username || destination.password || destination.search || destination.hash ||
      (host && destination.pathname !== "/")) return false;
    return new URL(origin).origin === origin && origin === destination.origin;
  } catch { return false; }
}

/**
 * D97 (G-6): the answer to a cookie-authenticated POST sent by a page of another site (a sibling subdomain counts as
 * "same-site" for SameSite=Lax cookies, so the cookie alone does not stop it), or null to carry on. Webhooks that are
 * checked by a signature (SePay, /api/automation/deliver) do not use this.
 */
export function crossOriginRefusal(request: Request): Response | null {
  if (hasSameRequestOrigin(request)) return null;
  return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403, headers: { "cache-control": "no-store" } });
}
