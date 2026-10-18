/**
 * C1 (Owner 17/10/2026): customers and field staff often have no email, so a login can be a Vietnamese phone number. The
 * number becomes an internal sign-in name on the owner's domain (no mail is ever sent there); everywhere it is shown, the
 * phone number is shown instead.
 */
export const PHONE_LOGIN_DOMAIN = "sdt.hienxavlxd.com";

/** "0912 345 678", "+84 912 345 678" → "0912345678"; null when it is not a Vietnamese mobile/landline number. */
export function normalizePhone(value: string): string | null {
  const digits = value.trim().replace(/[\s.()-]/g, "").replace(/^\+84/, "0").replace(/^84(?=\d{9,10}$)/, "0");
  return /^0\d{9,10}$/.test(digits) ? digits : null;
}

/** What the person typed in "Email hoặc số điện thoại" as the sign-in name, or null when it is neither. */
export function loginEmail(value: string): string | null {
  const text = value.trim();
  if (text.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text.toLowerCase() : null;
  const phone = normalizePhone(text);
  return phone ? `${phone}@${PHONE_LOGIN_DOMAIN}` : null;
}

export function isPhoneLogin(email?: string | null) {
  return !!email && email.toLowerCase().endsWith(`@${PHONE_LOGIN_DOMAIN}`);
}

/** How a sign-in name is shown: the phone number for phone logins, the email otherwise. */
export function displayLogin(email?: string | null) {
  if (!email) return "";
  return isPhoneLogin(email) ? email.slice(0, email.indexOf("@")) : email;
}
