import type { ReactNode } from "react";

import { PendingUpdates } from "@/components/announcements/pending-updates";
import { LiveRefresh } from "@/components/notifications/live-refresh";
import { AstryxWorkShell } from "@/components/astryx/astryx-work-shell";
import { PortalShell } from "@/components/portal/portal-shell";
import { currentSkin } from "@/lib/skin";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadFieldDispatchSummary } from "@/modules/portal/field-dispatch-server";

export default async function WorkLayout({ children }: { children: ReactNode }) {
  const [logoUrl, dispatch] = await Promise.all([
    createServerSupabase().then(loadCompanyLogoUrl).catch(() => null),
    // D85: a lead worker's fifth menu item "Điều phối" with the jobs waiting for a person; null = an ordinary worker, no item.
    loadFieldDispatchSummary().catch(() => null),
  ]);
  // D83: "Thông báo cập nhật" on "Hôm nay" (a visitor who is not signed in gets nothing). D92: the open page re-reads its data
  // when a push arrives, so new jobs, the counts and the popup appear without tapping the notification.
  const extras = <><PendingUpdates surface="WORKER" home="/work" /><LiveRefresh /></>;
  // Kiểu giao diện Astryx dùng khung cổng thợ riêng; Classic giữ nguyên PortalShell.
  if ((await currentSkin()) === "astryx") return <AstryxWorkShell logoUrl={logoUrl} dispatchCount={dispatch ? dispatch.waiting : null}>{children}{extras}</AstryxWorkShell>;
  return <PortalShell audience="worker" logoUrl={logoUrl} dispatchCount={dispatch ? dispatch.waiting : null}>{children}{extras}</PortalShell>;
}
