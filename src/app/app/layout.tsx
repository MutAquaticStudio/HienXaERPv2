import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { OfficeShell } from "@/components/office-shell";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await getCurrentPrincipal("office");
  if (!principal) redirect("/login");
  if (!hasPermission(principal, "platform.access_office")) {
    return <AccessDenied />;
  }

  return <OfficeShell principal={principal}>{children}</OfficeShell>;
}
