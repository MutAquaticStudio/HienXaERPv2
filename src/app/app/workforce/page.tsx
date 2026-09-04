import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { WorkforceCommandCenter } from "@/components/workforce-command-center";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getWorkforceSnapshot } from "@/modules/workforce/service";

export const metadata: Metadata = { title: "Điều hành công việc" };

export default async function WorkforcePage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "work_item.verify")) return <AccessDenied />;
  const data = await getWorkforceSnapshot(principal, "office");
  const initialKeys: Record<string, string> = { sweep: randomUUID() };
  for (const item of data.attention) {
    initialKeys[`verify:${item.id}`] = randomUUID();
    initialKeys[`supervise:${item.id}`] = randomUUID();
  }
  return <WorkforceCommandCenter data={data} initialKeys={initialKeys} />;
}
