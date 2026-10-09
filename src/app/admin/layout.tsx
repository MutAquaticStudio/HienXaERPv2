import { AppShell } from "@/components/app-shell";
import { Suspense } from "react";
import { OperationalStateNotice } from "@/components/operational-state-notice";
import { requireInternalAccess } from "@/lib/access/context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireInternalAccess();
  return <AppShell surface="admin" permissions={[...access.permissions]} actorName={access.employeeName} branchName={access.branchName}><Suspense fallback={null}><OperationalStateNotice branchId={access.branchId} /></Suspense>{children}</AppShell>;
}
