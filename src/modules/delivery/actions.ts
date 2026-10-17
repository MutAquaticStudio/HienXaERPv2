"use server";
import { operationalPostingError } from "@/lib/core/errors";
import { deliveryCommandMessage as message } from "./errors";


import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { parseBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";

const positive = z.string().trim().refine((value) => { try { const quantity = new Decimal(value); return quantity.isFinite() && quantity.gt(0) && quantity.decimalPlaces() <= 6; } catch { return false; } });
const nonNegative = z.string().trim().refine((value) => { try { const quantity = new Decimal(value); return quantity.isFinite() && !quantity.isNegative() && quantity.decimalPlaces() <= 6; } catch { return false; } });

function quantityLines(formData: FormData, idName: string, quantityName: string, idKey: string, quantityKey: string, allowBlank: boolean, schema: z.ZodType<string>) {
  const ids = formData.getAll(idName);
  const quantities = formData.getAll(quantityName);
  if (!ids.length || ids.length > 50 || ids.length !== quantities.length) return null;
  const seen = new Set<string>();
  const lines: Record<string, string>[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const raw = quantities[index];
    if (typeof id !== "string" || typeof raw !== "string") return null;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success || seen.has(parsedId.data)) return null;
    seen.add(parsedId.data);
    if (allowBlank && !raw.trim()) continue;
    const parsedQuantity = schema.safeParse(raw);
    if (!parsedQuantity.success) return null;
    lines.push({ [idKey]: parsedId.data, [quantityKey]: parsedQuantity.data });
  }
  return lines.length ? lines : null;
}

function verificationLines(formData: FormData) {
  const adjustmentReason = String(formData.get("verificationAdjustmentReason") ?? "").trim();
  if (adjustmentReason.length > 500) return null;
  const ids = formData.getAll("deliveryLineId");
  const accepted = formData.getAll("acceptedQuantity");
  const billable = formData.getAll("billableQuantity");
  const reasons = formData.getAll("billingVarianceReason");
  if (!ids.length || ids.length > 50 || [accepted, billable, reasons].some((values) => values.length !== ids.length)) return null;
  const seen = new Set<string>();
  const lines: { delivery_line_id: string; accepted_base_quantity: string; billable_base_quantity: string; billing_variance_reason: string; verification_adjustment_reason: string }[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const reason = reasons[index];
    const parsedId = typeof id === "string" ? z.uuid().safeParse(id) : null;
    const parsedAccepted = typeof accepted[index] === "string" ? nonNegative.safeParse(accepted[index]) : null;
    const parsedBillable = typeof billable[index] === "string" ? nonNegative.safeParse(billable[index]) : null;
    if (!parsedId?.success || !parsedAccepted?.success || !parsedBillable?.success || seen.has(parsedId.data) || typeof reason !== "string" || reason.trim().length > 500) return null;
    seen.add(parsedId.data);
    lines.push({ delivery_line_id: parsedId.data, accepted_base_quantity: parsedAccepted.data, billable_base_quantity: parsedBillable.data, billing_variance_reason: reason.trim(), verification_adjustment_reason: adjustmentReason });
  }
  return lines;
}

export async function allocateWarehouseSourceAction(formData: FormData) {
  const parsed = z.object({ salesOrderId: z.uuid(), salesLineId: z.uuid(), warehouseId: z.uuid(), quantity: positive, operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/orders?error=invalid-source");
  const destination = `/admin/orders/${parsed.data.salesOrderId}`;
  const access = await requireInternalPermission("purchasing.create");
  const supabase = await createServerSupabase();
  const [order, line] = await Promise.all([
    supabase.from("sales_orders").select("id, commercial_state").eq("id", parsed.data.salesOrderId).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("sales_order_lines").select("id").eq("id", parsed.data.salesLineId).eq("sales_order_id", parsed.data.salesOrderId).maybeSingle(),
  ]);
  if (order.error || line.error || order.data?.commercial_state !== "CONFIRMED" || !line.data) redirect(`${destination}?error=invalid-source`);
  const { error } = await supabase.rpc("upsert_supply_allocation", {
    target_sales_order_line_id: parsed.data.salesLineId,
    supply_mode: "WAREHOUSE",
    target_purchase_order_line_id: null,
    target_warehouse_id: parsed.data.warehouseId,
    requested_base_quantity: parsed.data.quantity,
    target_allocation_id: null,
    expected_version: null,
    operation_id: parsed.data.operationId,
  });
  if (error) {
    const reason = operationalPostingError(error.message) ?? (error.message.includes("supply_allocation_exceeds_need") ? "Lượng phân nguồn vượt phần còn thiếu."
      : error.message.includes("warehouse_invalid") ? "Kho không còn hợp lệ trong chi nhánh."
      : "Không thể phân nguồn kho. Kiểm tra dữ liệu và thử lại.");
    redirect(`${destination}?error=${encodeURIComponent(reason)}`);
  }
  revalidatePath(destination);
  redirect(`${destination}?notice=source-selected`);
}

export async function createDeliveryAction(formData: FormData) {
  const parsed = z.object({ salesOrderId: z.uuid(), scheduledAt: z.string().optional(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  const lines = quantityLines(formData, "allocationId", "quantity", "supply_allocation_id", "planned_base_quantity", true, positive);
  if (!parsed.success || !lines) redirect("/admin/orders?error=invalid-delivery");
  await requireInternalPermission("delivery.create");
  const supabase = await createServerSupabase();
  const scheduledInput = parsed.data.scheduledAt?.trim() ?? "";
  const scheduledAt = scheduledInput ? parseBusinessDateTime(scheduledInput) : null;
  if (scheduledInput && !scheduledAt) redirect("/admin/orders?error=invalid-delivery");
  const { data, error } = await supabase.rpc("create_delivery_from_allocations", { target_sales_order_id: parsed.data.salesOrderId, planned_lines: lines, scheduled_at: scheduledAt, operation_id: parsed.data.operationId });
  if (error || !data) redirect(`/admin/orders?error=${encodeURIComponent(message(error?.message))}`);
  revalidatePath("/admin/deliveries");
  redirect(`/admin/deliveries/${data}?notice=created`);
}

export async function assignDeliveryAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), employeeId: z.string().optional(), vehicleId: z.string().optional(), externalCarrierName: z.string().trim().optional(), externalCarrierPhone: z.string().trim().optional(), scheduledStart: z.string().trim().min(1), scheduledEnd: z.string().trim().min(1), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-assignment");
  await requireInternalPermission("delivery.assign");
  const supabase = await createServerSupabase();
  const scheduledStart = parseBusinessDateTime(parsed.data.scheduledStart);
  const scheduledEnd = parseBusinessDateTime(parsed.data.scheduledEnd);
  if (!scheduledStart || !scheduledEnd || Date.parse(scheduledEnd) <= Date.parse(scheduledStart)) {
    redirect(`/admin/deliveries/${parsed.data.deliveryId}?error=${encodeURIComponent("Nhập khung giờ giao hợp lệ; giờ kết thúc phải sau giờ bắt đầu.")}`);
  }
  const { error } = await supabase.rpc("assign_delivery_scheduled", {
    target_delivery_id: parsed.data.deliveryId,
    target_employee_id: parsed.data.employeeId || null,
    target_vehicle_id: parsed.data.vehicleId || null,
    external_carrier_name: parsed.data.externalCarrierName || "",
    external_carrier_phone: parsed.data.externalCarrierPhone || "",
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message, error.hint))}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=assigned`);
}

async function simpleDeliveryCommand(formData: FormData, permission: string, rpc: string, notice: string, extra: Record<string, unknown> = {}) {
  const parsed = z.object({ deliveryId: z.uuid(), version: z.coerce.number().int().positive(), operationId: z.uuid(), occurredAt: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-command");
  await requireInternalPermission(permission);
  const supabase = await createServerSupabase();
  const args: Record<string, unknown> = { target_delivery_id: parsed.data.deliveryId, expected_version: parsed.data.version, operation_id: parsed.data.operationId, ...extra };
  if (rpc === "handoff_delivery") {
    const occurredInput = parsed.data.occurredAt?.trim() ?? "";
    const occurredAt = occurredInput ? parseBusinessDateTime(occurredInput) : new Date().toISOString();
    if (!occurredAt) redirect(`/admin/deliveries/${parsed.data.deliveryId}?error=invalid-command`);
    args.handed_off_at = occurredAt;
  }
  const { error } = await supabase.rpc(rpc, args);
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=${notice}`);
}

export async function handoffDeliveryAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), version: z.coerce.number().int().positive(), operationId: z.uuid(), occurredAt: z.string().optional() }).safeParse(Object.fromEntries(formData));
  const lines = quantityLines(formData, "deliveryLineId", "loadedQuantity", "delivery_line_id", "loaded_base_quantity", false, nonNegative);
  if (!parsed.success || !lines) redirect(`/admin/deliveries?error=${encodeURIComponent("Nhập lượng thực lấy hợp lệ cho từng dòng.")}`);
  await requireInternalPermission("delivery.handoff");
  const when = parsed.data.occurredAt ? parseBusinessDateTime(parsed.data.occurredAt) : new Date().toISOString();
  if (!when) redirect(`/admin/deliveries/${parsed.data.deliveryId}?error=${encodeURIComponent("Thời điểm bàn giao chưa hợp lệ.")}`);
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("handoff_delivery_actual", {
    target_delivery_id: parsed.data.deliveryId, expected_version: parsed.data.version,
    handed_off_at: when, operation_id: parsed.data.operationId, loaded_lines: lines,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/orders/${String(formData.get("salesOrderId") ?? "")}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=dispatched`);
}

export async function markDeliveryArrivedAction(formData: FormData) {
  return simpleDeliveryCommand(formData, "delivery.submit", "mark_delivery_arrived", "arrived");
}

export async function submitDeliveryResultAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.uuid(), resultKind: z.enum(["FULL", "PARTIAL", "FAILED"]), receiverName: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), missingArrivalReason: z.string().trim().max(500).optional(), evidenceId: z.union([z.uuid(), z.literal("")]).optional(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  const lines = quantityLines(formData, "deliveryLineId", "actualQuantity", "delivery_line_id", "actual_base_quantity", false, nonNegative);
  if (!parsed.success || !lines) {
    const deliveryId = z.uuid().safeParse(formData.get("deliveryId"));
    const path = deliveryId.success ? `/admin/deliveries/${deliveryId.data}` : "/admin/deliveries";
    redirect(`${path}?error=${encodeURIComponent("Kết quả chưa hợp lệ. Kiểm tra số lượng không âm của từng dòng và thông tin kết quả.")}`);
  }
  await requireInternalPermission("delivery.submit");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("submit_delivery_result", {
    target_delivery_id: parsed.data.deliveryId,
    result_kind: parsed.data.resultKind,
    result_lines: lines,
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
  const parsed = z.object({ deliveryId: z.uuid(), deliveryResultId: z.uuid(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  const lines = verificationLines(formData);
  if (!parsed.success || !lines) redirect("/admin/deliveries?error=invalid-verification");
  await requireInternalPermission("delivery.verify");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("verify_delivery", {
    target_delivery_result_id: parsed.data.deliveryResultId,
    verification_lines: lines,
    expected_delivery_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=verified`);
}

export type OpenReturnCaseState = { success: boolean; error: string | null };

export async function openReturnCaseAction(_previous: OpenReturnCaseState, formData: FormData): Promise<OpenReturnCaseState> {
  const parsed = z.object({ deliveryId: z.uuid(), verificationLineId: z.uuid(), caseKind: z.enum(["CUSTOMER_RETURN", "TRANSIT_REMAINDER", "TRANSIT_LOSS"]), quantity: positive, reason: z.string().trim().min(3).max(500), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, error: "Kiểm tra dòng giao, loại vấn đề, số lượng dương và lý do ít nhất 3 ký tự." };
  try {
    await requireInternalPermission("delivery.exception");
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("open_return_case", { target_delivery_verification_line_id: parsed.data.verificationLineId, case_kind: parsed.data.caseKind, requested_base_quantity: parsed.data.quantity, reason: parsed.data.reason, target_evidence_id: null, operation_id: parsed.data.operationId });
    if (error) return { success: false, error: message(error.message) };
  } catch (error) {
    unstable_rethrow(error);
    return { success: false, error: message(error instanceof Error ? error.message : undefined) };
  }
  revalidatePath(`/admin/deliveries/${parsed.data.deliveryId}`);
  return { success: true, error: null };
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
