import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LOGIN_FOOTNOTE } from "@/components/auth/auth-screen";
import { PortalLogin } from "@/components/auth/portal-login";
import { resolveInternalAccess } from "@/lib/access/context";
import { internalLandingPath } from "@/lib/access/landing";
import { AppError } from "@/lib/core/errors";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Supabase falls back to the site root when a recovery redirect is not allowed; finish it on the password page.
  const { code } = await searchParams;
  if (typeof code === "string" && code) redirect(`/recovery/confirm?surface=admin&code=${encodeURIComponent(code)}`);
  // Someone already signed in on the operations side goes straight to work; everyone else signs in here, on the tab
  // of the portal this device used last (D30).
  let landing: string | null = null;
  try {
    const access = await resolveInternalAccess();
    landing = internalLandingPath(access.permissions, access.roleName);
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") redirect("/select-branch?surface=admin");
  }
  if (landing) redirect(landing);
  return <AuthFrame footnote={LOGIN_FOOTNOTE}><PortalLogin initial="admin" remember /></AuthFrame>;
}
