/** FB9: signing out returns to the sign-in page at `/`, on the tab of the portal just left (storage is cleared on sign-out). */
export function logoutDestination(surface: FormDataEntryValue | null): string {
  return surface === "work" || surface === "customer" ? `/?portal=${surface}` : "/";
}
