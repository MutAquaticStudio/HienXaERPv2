/**
 * FB9: signing out returns to the sign-in page at `/`, on the tab of the portal just left. D77: a device that did not
 * remember the login is told so in the address (`remember=off`), because the sign-out wipes its storage and the sign-in
 * form would otherwise forget that this is a shared device.
 */
export function logoutDestination(surface: FormDataEntryValue | null, sessionOnly = false): string {
  const params = new URLSearchParams();
  if (surface === "work" || surface === "customer") params.set("portal", surface);
  if (sessionOnly) params.set("remember", "off");
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/**
 * What the browser clears on sign-out. A login that was not remembered ("Ghi nhớ đăng nhập" off, a shared device) leaves
 * nothing behind; a remembered one (D77, the person's own device) keeps what this device remembers for the next sign-in
 * (the account name, the last portal). The login cookies themselves are always expired (`expiredAuthCookies`).
 */
export function logoutClearSiteData(sessionOnly: boolean): string {
  return sessionOnly ? '"cache", "cookies", "storage"' : '"cache"';
}

/** The Supabase login cookies of a request (`sb-<ref>-auth-token` and its `.0`, `.1`… chunks), expired on every sign-out. */
export function expiredAuthCookies(names: string[]): string[] {
  return names.filter((name) => /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(name));
}
