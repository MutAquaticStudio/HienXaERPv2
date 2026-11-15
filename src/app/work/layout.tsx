import type { ReactNode } from "react";

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
  return <PortalShell audience="worker" logoUrl={logoUrl} dispatchCount={dispatch ? dispatch.waiting : null}>{children}</PortalShell>;
}
