import "server-only";
import { headers } from "next/headers";

/**
 * Public origin of this app for links sent by email (password recovery, staff invites).
 * NEXT_PUBLIC_APP_URL wins; without it, the host the request came in on is used, so links
 * never point at localhost in a deployment. Supabase Auth still only follows redirect URLs
 * on its allow list, so a forged host cannot send a link elsewhere.
 */
export async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  const list = await headers();
  const host = list.get("x-forwarded-host")?.split(",")[0]?.trim() || list.get("host")?.trim();
  if (!host) return "http://localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = list.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
  return new URL(`${protocol}://${host}`).origin;
}

/** Where Supabase sends the user to choose a password, for recovery and invite emails alike. */
export async function passwordSetupUrl(surface: "admin" | "work" | "customer"): Promise<string> {
  const url = new URL("/recovery/confirm", await appOrigin());
  url.searchParams.set("surface", surface);
  return url.toString();
}

/**
 * Activation link a manager copies to a new employee (Zalo, SMS…), so activation does not depend on email delivery.
 * It opens the app's password page directly with the hashed one-time token; the page verifies it in the browser,
 * so link previews (which do not run scripts) cannot use it up, and Supabase's redirect allow list is not involved.
 */
export async function activationUrl(surface: "admin" | "work" | "customer", tokenHash: string, type: "invite" | "recovery"): Promise<string> {
  const url = new URL(await passwordSetupUrl(surface));
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}
