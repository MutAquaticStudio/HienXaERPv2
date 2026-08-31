import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { DriverDeliveryWorkspace } from "@/components/driver-delivery-workspace";
import { getDeliverySnapshot } from "@/modules/delivery/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Việc của tôi" };

export default async function WorkerHomePage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "delivery.update_assigned")) return <AccessDenied />;
  const data = await getDeliverySnapshot(principal);
  const initialKeys = Object.fromEntries(data.deliveries.flatMap((delivery) => [
    [`progress:${delivery.id}`, randomUUID()],
    [`fail:${delivery.id}`, randomUUID()],
    [`proof:${delivery.id}`, randomUUID()],
    [`photo:${delivery.id}`, randomUUID()],
  ]));
  return (
    <DriverDeliveryWorkspace deliveries={data.deliveries} evidence={data.evidence} initialKeys={initialKeys} />
  );
}
