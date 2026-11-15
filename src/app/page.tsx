import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LOGIN_FOOTNOTE } from "@/components/auth/auth-screen";
import { PortalLogin } from "@/components/auth/portal-login";
import { resolveInternalAccess } from "@/lib/access/context";
import { internalLandingPath } from "@/lib/access/landing";
import { loadSignInLogoUrl } from "@/lib/company/sign-in-logo";
import { openedInNativeApp } from "@/lib/app-shell/server";
import { accountPortals } from "@/lib/auth/account-portals";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

/** D81: a customer still signed in (the installed app reopened) goes straight to the customer portal. */
async function signedInCustomer() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user) && (await accountPortals(supabase, data.user!.id)).customer;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  // Supabase falls back to the site root when a recovery redirect is not allowed; finish it on the password page.
  const { code, portal } = await searchParams;
  if (typeof code === "string" && code) redirect(`/recovery/confirm?surface=admin&code=${encodeURIComponent(code)}`);
  // Someone already signed in on the operations side goes straight to work; everyone else signs in here, on the tab
  // of the portal this device used last (D30).
  let landing: string | null = null;
  try {
    const access = await resolveInternalAccess();
    landing = internalLandingPath(access.permissions, access.roleName);
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") redirect("/select-branch?surface=admin");
    if (error instanceof AppError && error.code === "FORBIDDEN" && await signedInCustomer().catch(() => false)) redirect("/customer");
  }
  if (landing) redirect(landing);
  return <AuthFrame footnote={LOGIN_FOOTNOTE} logoUrl={await loadSignInLogoUrl()} tagline="Đăng nhập nhân viên và khách hàng" installLink={!(await openedInNativeApp())}><PortalLogin initial={portal === "work" || portal === "customer" ? portal : "admin"} remember={portal !== "work" && portal !== "customer"} /></AuthFrame>;
}
