import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NO_EMPLOYEE_MESSAGE, resolveInternalAccess, requireInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";

const WORKER_ONLY = new Set(["work.read", "work.claim"]);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // FB9: the operations side is for staff only — a signed-in customer goes to the customer portal, a worker to the jobs.
  try {
    await resolveInternalAccess();
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN" && error.message === NO_EMPLOYEE_MESSAGE) redirect("/customer");
  }
  const access = await requireInternalAccess();
  if (![...access.permissions].some((permission) => !WORKER_ONLY.has(permission))) redirect("/work");
  const logoUrl = await loadCompanyLogoUrl(await createServerSupabase());
  return <AppShell surface="admin" permissions={[...access.permissions]} actorName={access.employeeName} branchName={access.branchName} branchId={access.branchId}
    branches={access.branches} logoUrl={logoUrl}>{children}</AppShell>;
}
