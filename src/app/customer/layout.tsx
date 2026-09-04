import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { CustomerShell } from "@/components/customer-shell";
import { getCustomerPortalAccess } from "@/modules/customer-portal/service";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const access = await getCustomerPortalAccess();
  if (access.kind === "unauthenticated") redirect("/login?next=/customer");
  if (access.kind === "not-member") return <AccessDenied />;
  return <CustomerShell>{children}</CustomerShell>;
}
