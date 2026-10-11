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
