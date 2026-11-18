"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PAYMENT_NOTICES_ENABLED, QUOTATIONS_ENABLED } from "@/lib/features";

import { fetchOrderedReport } from "@/modules/portal/ordered-report-server";
import type { OrderedReportResult } from "@/modules/portal/ordered-report-schema";
import { authenticatedPortalClient, portalRpc, PortalRpcError } from "@/modules/portal/server";
import type {
  CustomerOrder,
  CustomerPortalSnapshot,
  PaymentNotice,
  WorkerJob,
  WorkerPoolDelivery,
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

/** D79: deliveries waiting for dispatch that the signed-in worker may take ("Nhận việc"). */
export async function getWorkerDeliveryPool() {
  const supabase = await portalClientOrRedirect("/work/login");
  return portalRpc<WorkerPoolDelivery[]>(supabase, "worker_delivery_pool");
}

export async function getWorkerDeliveryPoolCount() {
  const supabase = await portalClientOrRedirect("/work/login");
  try {
    return await portalRpc<number>(supabase, "worker_delivery_pool_count");
  } catch {
    return 0;
  }
}

export async function getWorkerPortalJob(id: string) {
  const supabase = await portalClientOrRedirect("/work/login");
  try {
    return await portalRpc<WorkerJob>(supabase, "worker_portal_job", { target_work_item_id: id });
  } catch (error) {
    if (error instanceof PortalRpcError && error.code === "42501") redirect("/work?notice=work-unavailable");
    throw error;
  }
}

export async function getCustomerPortalSnapshot(customerId?: string) {
  const supabase = await portalClientOrRedirect("/customer/login");
  const snapshot = await portalRpc<CustomerPortalSnapshot>(supabase, "customer_portal_snapshot", {
    target_customer_id: customerId ?? null,
  });
  if (snapshot.quotation) {
    const { data, error } = await supabase.from("quotation_revisions")
      .select("state, expires_at").eq("id", snapshot.quotation.current_revision_id).maybeSingle();
    if (error) throw new Error("Không thể tải trạng thái báo giá hiện tại.");
    snapshot.quotation = data ? {
      ...snapshot.quotation, state: data.state, valid_until: data.expires_at ?? undefined,
      can_respond: data.state === "SENT" && (!data.expires_at || new Date(data.expires_at).getTime() > Date.now()),
    } : null;
  }
  return snapshot;
}

/** D98: the customer's "Báo cáo hàng đã đặt" for a period; the page words a refusal or a failure, it never sees a code. */
export async function loadOrderedReport(request: { customerId: string; from: string; to: string }): Promise<OrderedReportResult> {
  const supabase = await portalClientOrRedirect("/customer/login");
  return fetchOrderedReport(supabase, request);
}

export async function getCustomerPortalOrder(id: string) {
  const supabase = await portalClientOrRedirect("/customer/login");
  try {
    return await portalRpc<CustomerOrder>(supabase, "customer_portal_order", { target_order_id: id });
  } catch (error) {
    if (error instanceof PortalRpcError && error.code === "42501") redirect("/customer/orders?notice=order-unavailable");
    throw error;
  }
}

export async function getAdminPaymentNotices() {
  if (!PAYMENT_NOTICES_ENABLED) return [] as PaymentNotice[];
  const supabase = await portalClientOrRedirect("/login");
  return portalRpc<PaymentNotice[]>(supabase, "admin_payment_notice_snapshot");
}

export async function requestQuotationChangeAction(formData: FormData) {
  if (!QUOTATIONS_ENABLED) redirect("/customer");
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
  if (!PAYMENT_NOTICES_ENABLED) redirect("/admin");
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
