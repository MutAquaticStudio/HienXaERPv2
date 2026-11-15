import type { ReactNode } from "react";

import { PendingUpdates } from "@/components/announcements/pending-updates";
import { PortalShell } from "@/components/portal/portal-shell";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function WorkLayout({ children }: { children: ReactNode }) {
  const logoUrl = await createServerSupabase().then(loadCompanyLogoUrl).catch(() => null);
  // D83: "Thông báo cập nhật" on "Hôm nay" (a visitor who is not signed in gets nothing).
  return <PortalShell audience="worker" logoUrl={logoUrl}>{children}<PendingUpdates surface="WORKER" home="/work" /></PortalShell>;
}
