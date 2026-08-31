import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { CommercialWorkspace } from "@/components/commercial-workspace";
import { getCommercialSnapshot } from "@/modules/commercial/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Báo giá & đơn bán" };

export default async function CommercialPage() {
  const principal = await getCurrentPrincipal("office");
  if (
    !principal ||
    !hasPermission(principal, "quotation.read") ||
    !hasPermission(principal, "sales_order.read")
  ) {
    return <AccessDenied />;
  }

  const data = await getCommercialSnapshot(principal);
  const keyNames = [
    "quotation.create",
    ...data.revisions.flatMap((revision) => [
      `quotation.add-line:${revision.id}`,
      `quotation.refresh-prices:${revision.id}`,
      `quotation.send:${revision.id}`,
      `quotation.accept:${revision.id}`,
      `quotation.revise:${revision.id}`,
      `sales-order.convert:${revision.id}`,
    ]),
    ...data.salesOrders.map((order) => `sales-order.confirm:${order.id}`),
  ];
  const initialKeys = Object.fromEntries(
    keyNames.map((key) => [key, randomUUID()]),
  );

  return (
    <CommercialWorkspace
      canAcceptQuotation={hasPermission(principal, "quotation.accept")}
      canConfirmOrder={hasPermission(principal, "sales_order.confirm")}
      canCreateOrder={hasPermission(principal, "sales_order.create")}
      canCreateQuotation={hasPermission(principal, "quotation.create")}
      canOverrideCredit={hasPermission(principal, "customer_credit.override")}
      canOverridePrice={hasPermission(principal, "price.override")}
      canSendQuotation={hasPermission(principal, "quotation.send")}
      data={data}
      initialKeys={initialKeys}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
