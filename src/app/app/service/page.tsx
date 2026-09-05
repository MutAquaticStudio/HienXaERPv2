import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { DeferredRead } from "@/components/deferred-read";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { ServiceJobCommandCenter } from "@/components/service-job-command-center";
import { OperationalChatPanel } from "@/components/operational-chat-panel";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getServiceJobSnapshot } from "@/modules/service-jobs/service";
import { getOperationalChatSnapshot } from "@/modules/chat/service";
import type { ChatContextOption } from "@/modules/chat/types";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
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
  const chatContexts: ChatContextOption[] = data.jobs.map((job) => ({
    contextType: "SERVICE_JOB", contextId: job.id, subject: `Công việc dịch vụ ${job.jobNumber}`, audience: "office",
  }));
  return <>
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
    {hasPermission(principal, "chat.read") ? <Suspense fallback={<p role="status">Đang tải trao đổi...</p>}><DeferredRead label="trao đổi" load={() => getOperationalChatSnapshot(principal, "office")} render={chat => <OperationalChatPanel canManage={hasPermission(principal, "chat.manage")} contexts={chatContexts} snapshot={chat} surface="office" supabaseConfig={getSupabasePublicConfig()} />} /></Suspense> : null}
  </>;
}
