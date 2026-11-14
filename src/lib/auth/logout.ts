/** FB9: signing out returns to the sign-in page at `/`, on the tab of the portal just left (storage is cleared on sign-out). */
export function logoutDestination(surface: FormDataEntryValue | null): string {
  return surface === "work" || surface === "customer" ? `/?portal=${surface}` : "/";
}

/**
 * What the browser clears on sign-out. A login that was not remembered ("Ghi nhớ đăng nhập" off, a shared device) leaves
 * nothing behind; a remembered one (D77, the person's own device) keeps what this device remembers for the next sign-in
 * (the account name, the last portal). The session itself is ended by Supabase on both.
 */
export function logoutClearSiteData(sessionOnly: boolean): string {
  return sessionOnly ? '"cache", "cookies", "storage"' : '"cache"';
}
