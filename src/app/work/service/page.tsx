import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { ServiceJobWorker } from "@/components/service-job-worker";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getServiceJobSnapshot } from "@/modules/service-jobs/service";
import { SERVICE_LOG_TYPES } from "@/modules/service-jobs/types";

export const metadata: Metadata = { title: "Máy & dịch vụ" };

export default async function WorkerServiceJobsPage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "service_job.update_assigned"))
    return <AccessDenied />;
  const data = await getServiceJobSnapshot(principal, "worker");
  const keys = Object.fromEntries(
    data.jobs.flatMap((job) =>
      SERVICE_LOG_TYPES.map((type) => [`${type}:${job.id}`, randomUUID()]),
    ),
  );
  return <ServiceJobWorker data={data} initialKeys={keys} />;
}
