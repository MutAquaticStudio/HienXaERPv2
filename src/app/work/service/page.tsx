import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { ServiceJobWorker } from "@/components/service-job-worker";
import { OperationalChatPanel } from "@/components/operational-chat-panel";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getServiceJobSnapshot } from "@/modules/service-jobs/service";
import { getOperationalChatSnapshot } from "@/modules/chat/service";
import type { ChatContextOption } from "@/modules/chat/types";
import { SERVICE_LOG_TYPES } from "@/modules/service-jobs/types";

export const metadata: Metadata = { title: "Máy & dịch vụ" };

export default async function WorkerServiceJobsPage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "service_job.update_assigned"))
    return <AccessDenied />;
  const [data, chat] = await Promise.all([
    getServiceJobSnapshot(principal, "worker"),
    hasPermission(principal, "chat.read") ? getOperationalChatSnapshot(principal, "worker") : Promise.resolve(null),
  ]);
  const keys = Object.fromEntries(
    data.jobs.flatMap((job) =>
      SERVICE_LOG_TYPES.map((type) => [`${type}:${job.id}`, randomUUID()]),
    ),
  );
  const chatContexts: ChatContextOption[] = data.jobs.map((job) => ({
    contextType: "SERVICE_JOB", contextId: job.id, subject: `Công việc dịch vụ ${job.jobNumber}`, audience: "worker",
  }));
  return <>
    <ServiceJobWorker data={data} initialKeys={keys} supabaseConfig={getSupabasePublicConfig()} />
    {chat ? <OperationalChatPanel canManage={false} contexts={chatContexts} snapshot={chat} surface="worker" supabaseConfig={getSupabasePublicConfig()} /> : null}
  </>;
}
