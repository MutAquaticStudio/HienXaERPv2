import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { DispatchWorkspace } from "@/components/dispatch-workspace";
import { RoutePlanWorkspace } from "@/components/route-plan-workspace";
import { getDeliverySnapshot } from "@/modules/delivery/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getRouteOptimizationSnapshot } from "@/modules/route-optimization/service";

export const metadata: Metadata = { title: "Điều phối giao hàng" };

export default async function DispatchPage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "delivery.read")) return <AccessDenied />;
  const canReadRoutePlans = hasPermission(principal, "route_plan.read");
  const [data, routeData] = await Promise.all([
    getDeliverySnapshot(principal),
    canReadRoutePlans ? getRouteOptimizationSnapshot(principal) : Promise.resolve(null),
  ]);
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
      {routeData ? <RoutePlanWorkspace
        canManage={hasPermission(principal, "route_plan.manage")}
        data={routeData}
        initialKeys={Object.fromEntries([
          ["create", randomUUID()],
          ...routeData.plans.flatMap((plan) => [[`approve:${plan.id}`, randomUUID()], [`apply:${plan.id}`, randomUUID()]]),
        ])}
      /> : null}
    </>
  );
}
