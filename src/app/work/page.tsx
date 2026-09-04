import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { DriverDeliveryWorkspace } from "@/components/driver-delivery-workspace";
import { WorkerWorkspace } from "@/components/worker-workspace";
import { getDeliverySnapshot } from "@/modules/delivery/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getWorkforceSnapshot } from "@/modules/workforce/service";

export const metadata: Metadata = { title: "Việc của tôi" };

export default async function WorkerHomePage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "work_item.read_assigned")) return <AccessDenied />;
  const [data, deliveryData] = await Promise.all([
    getWorkforceSnapshot(principal, "worker"),
    getDeliverySnapshot(principal, "assigned"),
  ]);
  const initialKeys = Object.fromEntries(data.assigned.flatMap((item) => [
    [`start:${item.id}`, randomUUID()],
    [`heartbeat:${item.id}`, randomUUID()],
    [`block:${item.id}`, randomUUID()],
    [`complete:${item.id}`, randomUUID()],
  ]));
  const deliveryKeys = Object.fromEntries(deliveryData.deliveries.flatMap((delivery) => [
    [`progress:${delivery.id}`, randomUUID()],
    [`fail:${delivery.id}`, randomUUID()],
    [`proof:${delivery.id}`, randomUUID()],
    [`photo:${delivery.id}`, randomUUID()],
  ]));
  return <>
    <WorkerWorkspace data={data} initialKeys={initialKeys} mode="assigned" />
    <div className="worker-source-divider"><strong>Chi tiết chuyến giao</strong><span>Delivery là nguồn nghiệp vụ; công việc ở trên phản ánh kết quả.</span></div>
    <DriverDeliveryWorkspace deliveries={deliveryData.deliveries} evidence={deliveryData.evidence} heading="Chi tiết chuyến giao" initialKeys={deliveryKeys} showReload={false} />
  </>;
}
