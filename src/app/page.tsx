import { redirect } from "next/navigation";
import { PortalChooser } from "@/components/auth/portal-chooser";
import { resolveInternalAccess } from "@/lib/access/context";
import { internalLandingPath } from "@/lib/access/landing";
import { AppError } from "@/lib/core/errors";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Supabase falls back to the site root when a recovery redirect is not allowed; finish it on the password page.
  const { code } = await searchParams;
  if (typeof code === "string" && code) redirect(`/recovery/confirm?surface=admin&code=${encodeURIComponent(code)}`);
  // Someone already signed in on the operations side goes straight to work; everyone else chooses a portal (FB7).
  let landing: string | null = null;
  try {
    const access = await resolveInternalAccess();
    landing = internalLandingPath(access.permissions, access.roleName);
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") redirect("/select-branch?surface=admin");
  }
  if (landing) redirect(landing);
  return <PortalChooser />;
}
