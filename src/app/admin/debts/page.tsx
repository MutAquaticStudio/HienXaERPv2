import { redirect } from "next/navigation";
import { requireInternalAccess, requireInternalPermission } from "@/lib/access/context";

/**
 * "Công nợ" (FB2 Đợt 6): one menu entry for what the branch is owed and what it owes. The receivable and payable pages
 * keep their addresses (links, saved commands and returns point at them) and share the tabs in DebtTabs.
 */
export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const access = await requireInternalAccess();
  const { tab } = await searchParams;
  const canReceivable = access.permissions.has("finance.ar.read"), canPayable = access.permissions.has("finance.ap.read");
  if (canPayable && (tab === "phai-tra" || !canReceivable)) redirect("/admin/payables");
  if (canReceivable) redirect("/admin/receivables");
  await requireInternalPermission("finance.ar.read");
  return null;
}
