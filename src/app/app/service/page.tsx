import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { ServiceJobCommandCenter } from "@/components/service-job-command-center";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getServiceJobSnapshot } from "@/modules/service-jobs/service";
import { SERVICE_LOG_TYPES } from "@/modules/service-jobs/types";

export const metadata: Metadata = { title: "Công việc dịch vụ" };

export default async function ServiceJobsPage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "service_job.read"))
    return <AccessDenied />;
  const data = await getServiceJobSnapshot(principal, "office");
  const names = [
    "type:new",
    "machine:new",
    "job:new",
    ...data.jobs.flatMap((job) => [
      `assign:${job.id}`,
      `approve:${job.id}`,
      `confirm:${job.id}`,
      `cost:${job.id}`,
      `cancel:${job.id}`,
      ...SERVICE_LOG_TYPES.map((type) => `${type}:${job.id}`),
    ]),
  ];
  return (
    <ServiceJobCommandCenter
      canApprove={hasPermission(principal, "service_job.approve")}
      canAssign={hasPermission(principal, "service_job.assign")}
      canConfirm={hasPermission(principal, "service_job.confirm")}
      canCost={hasPermission(principal, "service_job.cost.manage")}
      canManage={hasPermission(principal, "service_job.manage")}
      data={data}
      initialKeys={Object.fromEntries(
        names.map((name) => [name, randomUUID()]),
      )}
    />
  );
}
