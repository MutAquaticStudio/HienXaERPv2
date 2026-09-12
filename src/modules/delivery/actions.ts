"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const positive = z.string().trim().refine((value) => { try { return new Decimal(value).isPositive(); } catch { return false; } });
const nonNegative = z.string().trim().refine((value) => { try { return !new Decimal(value).isNegative(); } catch { return false; } });

function message(value?: string) {
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("version")) return "Phiếu đã được người khác cập nhật. Hãy tải lại.";
  if (value?.includes("inventory") || value?.includes("reservation")) return "Tồn khả dụng hoặc reservation không còn đủ.";
  if (value?.includes("billing")) return "Lượng tính tiền khác lượng nhận cần quyền và lý do.";
  if (value?.includes("exceeds")) return "Số lượng vượt phần còn lại của nguồn.";
  return "Không thể hoàn tất thao tác giao hàng. Không có hậu quả nào được ghi một phần.";
}

export async function createDeliveryAction(formData: FormData) {
  const parsed = z.object({ allocationId: z.uuid(), quantity: positive, scheduledAt: z.string().optional(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/orders?error=invalid-delivery");
  await requireInternalPermission("delivery.create");
  const supabase = await createServerSupabase();
  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt).toISOString() : null;
  const { data, error } = await supabase.rpc("create_delivery_from_allocation", { target_supply_allocation_id: parsed.data.allocationId, planned_base_quantity: parsed.data.quantity, scheduled_at: scheduledAt, operation_id: parsed.data.operationId });
  if (error || !data) redirect(`/admin/orders?error=${encodeURIComponent(message(error?.message))}`);
  revalidatePath("/admin/deliveries");
  redirect(`/admin/deliveries/${data}?notice=created`);
}

export async function assignDeliveryAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), employeeId: z.string().optional(), vehicleId: z.string().optional(), externalCarrierName: z.string().trim().optional(), externalCarrierPhone: z.string().trim().optional(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-assignment");
  await requireInternalPermission("delivery.assign");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("assign_delivery", {
    target_delivery_id: parsed.data.deliveryId,
    target_employee_id: parsed.data.employeeId || null,
    target_vehicle_id: parsed.data.vehicleId || null,
    external_carrier_name: parsed.data.externalCarrierName || "",
    external_carrier_phone: parsed.data.externalCarrierPhone || "",
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=assigned`);
}

async function simpleDeliveryCommand(formData: FormData, permission: string, rpc: string, notice: string, extra: Record<string, unknown> = {}) {
  const parsed = z.object({ deliveryId: z.uuid(), version: z.coerce.number().int().positive(), operationId: z.uuid(), occurredAt: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-command");
  await requireInternalPermission(permission);
  const supabase = await createServerSupabase();
  const args: Record<string, unknown> = { target_delivery_id: parsed.data.deliveryId, expected_version: parsed.data.version, operation_id: parsed.data.operationId, ...extra };
  if (rpc === "handoff_delivery") args.handed_off_at = parsed.data.occurredAt || new Date().toISOString();
  const { error } = await supabase.rpc(rpc, args);
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=${notice}`);
}

export async function handoffDeliveryAction(formData: FormData) {
  return simpleDeliveryCommand(formData, "delivery.handoff", "handoff_delivery", "dispatched");
}

export async function markDeliveryArrivedAction(formData: FormData) {
  return simpleDeliveryCommand(formData, "delivery.submit", "mark_delivery_arrived", "arrived");
}

export async function submitDeliveryResultAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), deliveryLineId: z.uuid(), resultKind: z.enum(["FULL", "PARTIAL", "FAILED"]), actualQuantity: nonNegative, receiverName: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), missingArrivalReason: z.string().trim().max(500).optional(), evidenceId: z.union([z.uuid(), z.literal("")]).optional(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-result");
  await requireInternalPermission("delivery.submit");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("submit_delivery_result", {
    target_delivery_id: parsed.data.deliveryId,
    result_kind: parsed.data.resultKind,
    result_lines: [{ delivery_line_id: parsed.data.deliveryLineId, actual_base_quantity: parsed.data.actualQuantity }],
    receiver_name: parsed.data.receiverName || "",
    note: parsed.data.note || "",
    missing_arrival_reason: parsed.data.missingArrivalReason || "",
    target_evidence_id: parsed.data.evidenceId || null,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=result-submitted`);
}

export async function uploadDeliveryEvidenceAction(formData: FormData) {
  const candidate = formData.get("file");
  const parsed = z.object({ deliveryId: z.uuid() }).safeParse(Object.fromEntries(formData));
  const destination = parsed.success ? `/admin/deliveries/${parsed.data.deliveryId}` : "/admin/deliveries";
  if (!parsed.success || !(candidate instanceof File) || candidate.size <= 0) redirect(`${destination}?error=invalid-evidence`);

  const access = await requireInternalPermission("evidence.manage");
  const supabase = await createServerSupabase();
  const { data: delivery } = await supabase.from("delivery_read").select("id").eq("id", parsed.data.deliveryId).eq("branch_id", access.branchId).maybeSingle();
  if (!delivery) redirect(`${destination}?error=invalid-evidence`);

  const safeName = candidate.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "proof";
  const bucketName = "delivery-proofs";
  const objectPath = `${access.branchId}/${parsed.data.deliveryId}/${crypto.randomUUID()}-${safeName}`;
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await candidate.arrayBuffer())))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const { data: evidenceId, error: createError } = await supabase.rpc("create_evidence_upload", {
    target_branch_id: access.branchId,
    bucket_name: bucketName,
    object_path: objectPath,
    audience: "INTERNAL",
    operation_id: crypto.randomUUID(),
  });
  if (createError || !evidenceId) redirect(`${destination}?error=${encodeURIComponent(message(createError?.message ?? "evidence_create_failed"))}`);

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(objectPath, candidate, { contentType: candidate.type || "application/octet-stream", upsert: false });
  if (uploadError) redirect(`${destination}?error=${encodeURIComponent(message(uploadError.message))}`);

  const { error: finalizeError } = await supabase.rpc("finalize_evidence_upload", {
    target_evidence_id: evidenceId,
    checksum_sha256: checksum,
    byte_size: candidate.size,
    operation_id: crypto.randomUUID(),
  });
  if (finalizeError) redirect(`${destination}?error=${encodeURIComponent(message(finalizeError.message))}`);

  revalidatePath(destination);
  redirect(`${destination}?notice=evidence-uploaded&evidence=${evidenceId}`);
}

export async function verifyDeliveryAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), deliveryResultId: z.uuid(), deliveryLineId: z.uuid(), acceptedQuantity: nonNegative, billableQuantity: nonNegative, billingVarianceReason: z.string().trim().max(500).optional(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-verification");
  await requireInternalPermission("delivery.verify");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("verify_delivery", {
    target_delivery_result_id: parsed.data.deliveryResultId,
    verification_lines: [{ delivery_line_id: parsed.data.deliveryLineId, accepted_base_quantity: parsed.data.acceptedQuantity, billable_base_quantity: parsed.data.billableQuantity, billing_variance_reason: parsed.data.billingVarianceReason || "" }],
    expected_delivery_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=verified`);
}

export async function openReturnCaseAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), verificationLineId: z.uuid(), caseKind: z.enum(["CUSTOMER_RETURN", "TRANSIT_REMAINDER", "TRANSIT_LOSS"]), quantity: positive, reason: z.string().trim().min(3).max(500), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-return");
  await requireInternalPermission("delivery.exception");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("open_return_case", { target_delivery_verification_line_id: parsed.data.verificationLineId, case_kind: parsed.data.caseKind, requested_base_quantity: parsed.data.quantity, reason: parsed.data.reason, target_evidence_id: null, operation_id: parsed.data.operationId });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=exception-opened`);
}

export async function resolveReturnCaseAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), returnCaseId: z.uuid(), resolution: z.enum(["RETURNED", "LOSS_APPROVED"]), warehouseId: z.string().optional(), reason: z.string().trim().min(3).max(500), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-resolution");
  await requireInternalPermission("delivery.exception");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("resolve_return_case", { target_return_case_id: parsed.data.returnCaseId, resolution: parsed.data.resolution, target_warehouse_id: parsed.data.warehouseId || null, resolution_reason: parsed.data.reason, target_evidence_id: null, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=exception-resolved`);
}
