import { redirect } from "next/navigation";
import { PendingUpdates } from "@/components/announcements/pending-updates";
import { LiveRefresh } from "@/components/notifications/live-refresh";
import { AppShell } from "@/components/app-shell";
import { AstryxAppShell } from "@/components/astryx/astryx-app-shell";
import { currentSkin } from "@/lib/skin";
import { NO_EMPLOYEE_MESSAGE, resolveInternalAccess, requireInternalAccess } from "@/lib/access/context";
import { internalLandingPath } from "@/lib/access/landing";
import { AppError } from "@/lib/core/errors";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";

// D85: the lead worker's "Điều phối" is a worker-portal permission, not a door to the office.
const WORKER_ONLY = new Set(["work.read", "work.claim", "work.field_dispatch"]);

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
  // D92: <LiveRefresh> re-reads the open page (bell, lists, popup) when a push arrives.
  // D83: the office popup waits for this person's own home page (the page "/" opens for them).
  let home = "/admin";
  try { home = internalLandingPath(access.permissions, access.roleName); } catch { /* no landing page: keep /admin */ }
  const extras = <><PendingUpdates surface="OFFICE" home={home} /><LiveRefresh /></>;
  // Kiểu giao diện Astryx dùng khung riêng; Classic giữ nguyên khung cũ.
  if ((await currentSkin()) === "astryx") return <AstryxAppShell permissions={[...access.permissions]} actorName={access.employeeName} branchName={access.branchName} branchId={access.branchId}
    branches={access.branches} logoUrl={logoUrl}>{children}{extras}</AstryxAppShell>;
  return <AppShell surface="admin" permissions={[...access.permissions]} actorName={access.employeeName} branchName={access.branchName} branchId={access.branchId}
    branches={access.branches} logoUrl={logoUrl}>{children}{extras}</AppShell>;
}
