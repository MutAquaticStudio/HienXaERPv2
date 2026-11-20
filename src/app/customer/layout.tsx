import type { ReactNode } from "react";

import { PendingUpdates } from "@/components/announcements/pending-updates";
import { LiveRefresh } from "@/components/notifications/live-refresh";
import { AstryxCustomerShell } from "@/components/astryx/astryx-customer-shell";
import { PortalShell } from "@/components/portal/portal-shell";
import { loadCompanyLogoUrl } from "@/lib/company/profile";
import { currentSkin } from "@/lib/skin";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import type { CustomerPortalSnapshot } from "@/modules/portal/types";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const authenticated = await authenticatedPortalClient();
  // The menu only needs to know whether debts are visible; a login without a customer yet (registration still being
  // completed, or a revoked one) gets the basic menu and the page itself explains.
  const snapshot = authenticated ? await portalRpc<CustomerPortalSnapshot>(authenticated.supabase, "customer_portal_snapshot", { target_customer_id: null }).catch(() => null) : null;
  const logoUrl = authenticated ? await loadCompanyLogoUrl(authenticated.supabase).catch(() => null) : null;
  const extras = <>
    {/* D83: "Thông báo cập nhật" on the customer's home page. */}
    {authenticated && <PendingUpdates surface="CUSTOMER" home="/customer" />}
    {/* D92: the open page re-reads its data when a push arrives. */}
    {authenticated && <LiveRefresh />}
  </>;
  // Kiểu giao diện Astryx dùng khung riêng của cổng khách; Classic giữ nguyên PortalShell.
  if ((await currentSkin()) === "astryx") return <AstryxCustomerShell logoUrl={logoUrl} canViewDebt={Boolean(snapshot?.can_view_debt)} canOrder={snapshot?.membership_role === "OWNER"}
    customerName={snapshot?.customer.display_name} customerCode={snapshot?.customer.code} membershipRole={snapshot?.membership_role}>{children}{extras}</AstryxCustomerShell>;
  return <PortalShell audience="customer" logoUrl={logoUrl} canViewDebt={Boolean(snapshot?.can_view_debt)} canOrder={snapshot?.membership_role === "OWNER"}>
    {children}
    {extras}
  </PortalShell>;
}
