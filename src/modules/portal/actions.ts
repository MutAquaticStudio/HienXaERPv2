"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import type {
  CustomerOrder,
  CustomerPortalSnapshot,
  PaymentNotice,
  WorkerJob,
  WorkerPortalSnapshot,
} from "@/modules/portal/types";

async function portalClientOrRedirect(loginPath: string) {
  const context = await authenticatedPortalClient();
  if (!context) redirect(loginPath);
  return context.supabase;
}

export async function getWorkerPortalSnapshot() {
  const supabase = await portalClientOrRedirect("/work/login");
  return portalRpc<WorkerPortalSnapshot>(supabase, "worker_portal_snapshot");
}

export async function getWorkerPortalJob(id: string) {
  const supabase = await portalClientOrRedirect("/work/login");
  return portalRpc<WorkerJob>(supabase, "worker_portal_job", { target_work_item_id: id });
}

export async function getCustomerPortalSnapshot(customerId?: string) {
  const supabase = await portalClientOrRedirect("/customer/login");
  return portalRpc<CustomerPortalSnapshot>(supabase, "customer_portal_snapshot", {
    target_customer_id: customerId ?? null,
  });
}

export async function getCustomerPortalOrder(id: string) {
  const supabase = await portalClientOrRedirect("/customer/login");
  return portalRpc<CustomerOrder>(supabase, "customer_portal_order", { target_order_id: id });
}

export async function getAdminPaymentNotices() {
  const supabase = await portalClientOrRedirect("/login");
  return portalRpc<PaymentNotice[]>(supabase, "admin_payment_notice_snapshot");
}

export async function requestQuotationChangeAction(formData: FormData) {
  const revisionId = String(formData.get("revision_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const operationId = String(formData.get("operation_id") ?? randomUUID());
  const supabase = await portalClientOrRedirect("/customer/login");
  await portalRpc<string>(supabase, "request_quotation_change", {
    target_revision_id: revisionId,
    reason,
    operation_id: operationId,
  });
  revalidatePath("/customer");
  redirect("/customer/quotations");
}

export async function reviewPaymentNoticeAction(formData: FormData) {
  const noticeId = String(formData.get("notice_id") ?? "");
  const state = String(formData.get("state") ?? "");
  const note = String(formData.get("review_note") ?? "");
  const version = Number(formData.get("version"));
  const operationId = String(formData.get("operation_id") ?? randomUUID());
  const supabase = await portalClientOrRedirect("/login");
  await portalRpc<string>(supabase, "review_payment_notice", {
    target_payment_notice_id: noticeId,
    target_state: state,
    target_review_note: note,
    expected_version: version,
    operation_id: operationId,
  });
  revalidatePath("/admin/payment-notices");
}
