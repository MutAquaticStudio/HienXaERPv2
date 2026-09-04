import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { ActiveDeliveryTracker } from "@/components/active-delivery-tracker";
import { DriverDeliveryWorkspace } from "@/components/driver-delivery-workspace";
import { DriverRouteToday } from "@/components/driver-route-today";
import { OperationalChatPanel } from "@/components/operational-chat-panel";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { WorkerWorkspace } from "@/components/worker-workspace";
import { getDeliverySnapshot } from "@/modules/delivery/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getApprovedDriverRoute } from "@/modules/route-optimization/service";
import { getWorkerTrackingSnapshot } from "@/modules/gps/service";
import { getOperationalChatSnapshot } from "@/modules/chat/service";
import type { ChatContextOption } from "@/modules/chat/types";
import { getWorkforceSnapshot } from "@/modules/workforce/service";

export const metadata: Metadata = { title: "Việc của tôi" };

export default async function WorkerHomePage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "work_item.read_assigned")) return <AccessDenied />;
  const canSubmitLocation = hasPermission(principal, "gps.location.submit");
  const canReadChat = hasPermission(principal, "chat.read");
  const [data, deliveryData, route, tracking, chat] = await Promise.all([
    getWorkforceSnapshot(principal, "worker"),
    getDeliverySnapshot(principal, "assigned"),
    getApprovedDriverRoute(principal),
    canSubmitLocation ? getWorkerTrackingSnapshot(principal) : Promise.resolve(null),
    canReadChat ? getOperationalChatSnapshot(principal, "worker") : Promise.resolve(null),
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
  const chatContexts: ChatContextOption[] = deliveryData.deliveries.map((delivery) => ({
    contextType: "DELIVERY",
    contextId: delivery.id,
    subject: `Chuyến giao ${delivery.deliveryNumber}`,
    audience: "worker",
  }));
  return <>
    <WorkerWorkspace data={data} initialKeys={initialKeys} mode="assigned" />
    <DriverRouteToday route={route} />
    {tracking ? <ActiveDeliveryTracker initialKey={randomUUID()} snapshot={tracking} /> : null}
    {chat ? <OperationalChatPanel canManage={false} contexts={chatContexts} snapshot={chat} surface="worker" supabaseConfig={getSupabasePublicConfig()} /> : null}
    <div className="worker-source-divider"><strong>Chi tiết chuyến giao</strong><span>Delivery là nguồn nghiệp vụ; công việc ở trên phản ánh kết quả.</span></div>
    <DriverDeliveryWorkspace deliveries={deliveryData.deliveries} evidence={deliveryData.evidence} heading="Chi tiết chuyến giao" initialKeys={deliveryKeys} showReload={false} supabaseConfig={getSupabasePublicConfig()} />
  </>;
}
