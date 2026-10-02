import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import type { CustomerPortalSnapshot } from "@/modules/portal/types";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const authenticated = await authenticatedPortalClient();
  const snapshot = authenticated ? await portalRpc<CustomerPortalSnapshot>(authenticated.supabase, "customer_portal_snapshot", { target_customer_id: null }) : null;
  return <PortalShell audience="customer" canViewDebt={Boolean(snapshot?.can_view_debt)}>{children}</PortalShell>;
}
