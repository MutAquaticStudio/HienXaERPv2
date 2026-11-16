import type { ReactNode } from "react";

import { PendingUpdates } from "@/components/announcements/pending-updates";
import { PortalShell } from "@/components/portal/portal-shell";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadFieldDispatchSummary } from "@/modules/portal/field-dispatch-server";

export default async function WorkLayout({ children }: { children: ReactNode }) {
  const [logoUrl, dispatch] = await Promise.all([
    createServerSupabase().then(loadCompanyLogoUrl).catch(() => null),
    // D85: a lead worker's fifth menu item "Điều phối" with the jobs waiting for a person; null = an ordinary worker, no item.
    loadFieldDispatchSummary().catch(() => null),
  ]);
  // D83: "Thông báo cập nhật" on "Hôm nay" (a visitor who is not signed in gets nothing).
  return <PortalShell audience="worker" logoUrl={logoUrl} dispatchCount={dispatch ? dispatch.waiting : null}>{children}<PendingUpdates surface="WORKER" home="/work" /></PortalShell>;
}
