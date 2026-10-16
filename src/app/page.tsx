import { requireInternalAccess } from "@/lib/access/context";
import { internalLandingPath } from "@/lib/access/landing";
import { redirect } from "next/navigation";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Supabase falls back to the site root when a recovery redirect is not allowed; finish it on the password page.
  const { code } = await searchParams;
  if (typeof code === "string" && code) redirect(`/recovery/confirm?surface=admin&code=${encodeURIComponent(code)}`);
  const access = await requireInternalAccess();
  redirect(internalLandingPath(access.permissions, access.roleName));
}
