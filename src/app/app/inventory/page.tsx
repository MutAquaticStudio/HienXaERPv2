import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { InventoryWorkspace } from "@/components/inventory-workspace";
import { getInventorySnapshot } from "@/modules/inventory/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Kho & bãi" };

export default async function InventoryPage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "inventory.read"))
    return <AccessDenied />;
  const data = await getInventorySnapshot(principal);
  const keys = Object.fromEntries(
    [
      "receipt.confirm",
      "issue.confirm",
      "stock-count.record",
      "reorder-policy.set",
      ...data.warehouseAllocations.map(
        (item) => `inventory.reserve:${item.id}`,
      ),
      ...data.reservations.map((item) => `reservation.release:${item.id}`),
      ...data.stockCounts.map((item) => `stock-adjustment.approve:${item.id}`),
    ].map((key) => [key, randomUUID()]),
  );
  return (
    <InventoryWorkspace
      canAdjust={hasPermission(principal, "inventory.adjust")}
      canCount={hasPermission(principal, "inventory.count")}
      canIssue={hasPermission(principal, "inventory.issue")}
      canManagePolicy={hasPermission(principal, "inventory.policy.manage")}
      canReceive={hasPermission(principal, "inventory.receive")}
      canReserve={hasPermission(principal, "inventory.reserve")}
      data={data}
      initialKeys={keys}
    />
  );
}
