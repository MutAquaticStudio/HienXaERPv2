import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { SourcingWorkspace } from "@/components/sourcing-workspace";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getSourcingSnapshot } from "@/modules/sourcing/service";

export const metadata: Metadata = { title: "Mua & nguồn hàng" };

export default async function SourcingPage() {
  const principal = await getCurrentPrincipal("office");
  if (
    !principal ||
    !hasPermission(principal, "sourcing.read") ||
    !hasPermission(principal, "purchase_order.read")
  ) {
    return <AccessDenied />;
  }

  const data = await getSourcingSnapshot(principal);
  const keyNames = [
    "supplier.create",
    "supplier-price.record",
    "supply.allocate",
    ...data.allocations.map((item) => `purchase-order.create:${item.id}`),
    ...data.purchaseOrders.flatMap((order) => [
      `purchase-order.confirm:${order.id}`,
      `purchase-order.send:${order.id}`,
      `purchase-order.acknowledge:${order.id}`,
      `purchase-order.cancel:${order.id}`,
    ]),
  ];
  const initialKeys = Object.fromEntries(
    keyNames.map((key) => [key, randomUUID()]),
  );

  return (
    <SourcingWorkspace
      canConfirmPurchaseOrder={hasPermission(
        principal,
        "purchase_order.confirm",
      )}
      canCreatePurchaseOrder={hasPermission(principal, "purchase_order.create")}
      canManagePrices={hasPermission(principal, "supplier_price.manage")}
      canManageSourcing={hasPermission(principal, "sourcing.manage")}
      canManageSuppliers={hasPermission(principal, "supplier.manage")}
      canSendPurchaseOrder={hasPermission(principal, "purchase_order.send")}
      data={data}
      initialKeys={initialKeys}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
