import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function WorkLayout({ children }: { children: ReactNode }) {
  const logoUrl = await createServerSupabase().then(loadCompanyLogoUrl).catch(() => null);
  return <PortalShell audience="worker" logoUrl={logoUrl}>{children}</PortalShell>;
}
