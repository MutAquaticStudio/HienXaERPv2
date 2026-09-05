import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { DeferredRead } from "@/components/deferred-read";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { DispatchWorkspace } from "@/components/dispatch-workspace";
import { FleetLiveMap } from "@/components/fleet-live-map";
import { OperationalChatPanel } from "@/components/operational-chat-panel";
import { RoutePlanWorkspace } from "@/components/route-plan-workspace";
import { getDeliverySnapshot } from "@/modules/delivery/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getRouteOptimizationSnapshot } from "@/modules/route-optimization/service";
import { getFleetTrackingSnapshot } from "@/modules/gps/service";
import { getOperationalChatSnapshot } from "@/modules/chat/service";
import type { ChatContextOption } from "@/modules/chat/types";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Điều phối giao hàng" };

export default async function DispatchPage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "delivery.read")) return <AccessDenied />;
  const canReadRoutePlans = hasPermission(principal, "route_plan.read");
  const canReadFleetLocation = hasPermission(principal, "gps.location.read_fleet");
  const canReadChat = hasPermission(principal, "chat.read");
  const data = await getDeliverySnapshot(principal);
  const initialKeys = Object.fromEntries(
    [
      ...data.planningOptions.map((item) => `plan:${item.id}`),
      ...data.deliveries.flatMap((item) => [
        `assign:${item.id}`,
        `dispatch:${item.id}`,
        `cancel:${item.id}`,
        `confirm:${item.id}`,
      ]),
    ].map((item) => [item, randomUUID()]),
  );
  const chatContexts: ChatContextOption[] = data.deliveries.map((delivery) => ({
    contextType: "DELIVERY", contextId: delivery.id, subject: `Chuyến giao ${delivery.deliveryNumber}`, audience: "office",
  }));
  return (
    <>
      <DispatchWorkspace
        canAssign={hasPermission(principal, "delivery.assign")}
        canConfirm={hasPermission(principal, "delivery.confirm")}
        canDispatch={hasPermission(principal, "delivery.dispatch")}
        canPlan={hasPermission(principal, "delivery.plan")}
        canUpdate={hasPermission(principal, "delivery.update_assigned")}
        data={data}
        initialKeys={initialKeys}
      />
      {canReadFleetLocation ? <Suspense fallback={<p role="status">Đang tải vị trí phương tiện...</p>}>
        <DeferredRead label="vị trí phương tiện" load={() => getFleetTrackingSnapshot(principal)} render={fleetData => <FleetLiveMap data={fleetData} />} />
      </Suspense> : null}
      {canReadRoutePlans ? <Suspense fallback={<p role="status">Đang tải lộ trình...</p>}><DeferredRead label="lộ trình" load={() => getRouteOptimizationSnapshot(principal)} render={routeData => <RoutePlanWorkspace
        canManage={hasPermission(principal, "route_plan.manage")}
        data={routeData}
        initialKeys={Object.fromEntries([
          ["create", randomUUID()],
          ...routeData.plans.flatMap((plan) => [[`approve:${plan.id}`, randomUUID()], [`apply:${plan.id}`, randomUUID()]]),
        ])}
      />} /></Suspense> : null}
      {canReadChat ? <Suspense fallback={<p role="status">Đang tải trao đổi...</p>}><DeferredRead label="trao đổi" load={() => getOperationalChatSnapshot(principal, "office")} render={chat => <OperationalChatPanel canManage={hasPermission(principal, "chat.manage")} contexts={chatContexts} snapshot={chat} surface="office" supabaseConfig={getSupabasePublicConfig()} />} /></Suspense> : null}
    </>
  );
}
