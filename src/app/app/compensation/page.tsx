import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { CompensationCommandCenter } from "@/components/compensation-command-center";
import { getCompensationSnapshot } from "@/modules/compensation/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Thu nhập & sản lượng" };

export default async function CompensationPage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "compensation.read"))
    return <AccessDenied />;
  const data = await getCompensationSnapshot(principal);
  const names = [
    "profile:new",
    "plan:new",
    "rule:new",
    "bonus:new",
    "period:new",
    ...data.verifiedWork.map((work) => `work:${work.id}`),
    ...data.events.flatMap((event) => [
      `approve:${event.id}`,
      `reverse:${event.id}`,
      ...event.allocations.map((allocation) => `adjust:${allocation.id}`),
    ]),
    ...data.periods.flatMap((period) => [
      `generate:${period.id}`,
      `close:${period.id}`,
      ...period.lines.map((line) => `payment:${line.id}`),
    ]),
  ];
  return (
    <CompensationCommandCenter
      canAdjust={hasPermission(principal, "earning.adjust")}
      canApprove={hasPermission(principal, "earning.approve")}
      canClosePayroll={hasPermission(principal, "payroll.close")}
      canManage={hasPermission(principal, "compensation.manage")}
      data={data}
      initialKeys={Object.fromEntries(
        names.map((name) => [name, randomUUID()]),
      )}
    />
  );
}
