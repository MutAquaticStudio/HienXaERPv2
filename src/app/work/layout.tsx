import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { WorkerShell } from "@/components/worker-shell";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const dynamic = "force-dynamic";

export default async function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await getCurrentPrincipal("worker");
  if (!principal) redirect("/login");
  if (!hasPermission(principal, "platform.access_worker")) {
    return <AccessDenied />;
  }

  return <WorkerShell>{children}</WorkerShell>;
}
