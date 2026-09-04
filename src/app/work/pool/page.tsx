import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { WorkerWorkspace } from "@/components/worker-workspace";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getWorkforceSnapshot } from "@/modules/workforce/service";

export const metadata: Metadata = { title: "Bể công việc" };

export default async function WorkPoolPage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "work_pool.read")) return <AccessDenied />;
  const data = await getWorkforceSnapshot(principal, "worker");
  const initialKeys = Object.fromEntries(
    data.pool.map((item) => [`claim:${item.id}`, randomUUID()]),
  );
  return <WorkerWorkspace data={data} initialKeys={initialKeys} mode="pool" />;
}
