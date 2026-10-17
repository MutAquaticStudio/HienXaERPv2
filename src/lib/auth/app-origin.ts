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
