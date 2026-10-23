import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import type { CustomerPortalSnapshot } from "@/modules/portal/types";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const authenticated = await authenticatedPortalClient();
  // The menu only needs to know whether debts are visible; a login without a customer yet (registration still being
  // completed, or a revoked one) gets the basic menu and the page itself explains.
  const snapshot = authenticated ? await portalRpc<CustomerPortalSnapshot>(authenticated.supabase, "customer_portal_snapshot", { target_customer_id: null }).catch(() => null) : null;
  return <PortalShell audience="customer" canViewDebt={Boolean(snapshot?.can_view_debt)} canOrder={snapshot?.membership_role === "OWNER"}>{children}</PortalShell>;
}
