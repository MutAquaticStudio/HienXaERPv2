import { AppShell } from "@/components/app-shell";
import { requireInternalAccess } from "@/lib/access/context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireInternalAccess();
  return <AppShell surface="admin" permissions={[...access.permissions]} actorName={access.employeeName} branchName={access.branchName} branchId={access.branchId}>{children}</AppShell>;
}
