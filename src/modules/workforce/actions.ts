"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const optionalUuid = z.union([z.uuid(), z.literal("")]);
const decimal = z.string().trim().regex(/^-?\d+(?:\.\d{1,6})?$/);
const positiveMoney = z.string().trim().regex(/^\d+$/).refine((value) => BigInt(value) > 0n);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const toInstant = (value: string) => new Date(value + ":00+07:00").toISOString();
const fail = (path: string, message?: string): never => redirect(path + "?error=" + encodeURIComponent(message ?? "command-failed"));

export async function createServiceJobAction(formData: FormData) {
  const parsed = z.object({
    customerId: z.uuid(), siteId: z.uuid(), salesEmployeeId: optionalUuid,
    serviceType: z.string().trim().min(2).max(120), description: z.string().trim().min(3).max(500),
    scheduledStart: localDateTime, scheduledEnd: localDateTime, plannedQuantity: decimal,
    unitLabel: z.string().trim().min(1).max(30), vehicleId: optionalUuid, machineId: optionalUuid,
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("/admin/service-jobs", "invalid-service-job");
  const access = await requireInternalPermission("service.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_service_job", {
    target_branch_id: access.branchId,
    target_customer_id: parsed.data.customerId,
    target_site_id: parsed.data.siteId,
    service_type: parsed.data.serviceType,
    description: parsed.data.description,
    scheduled_start: toInstant(parsed.data.scheduledStart),
    scheduled_end: toInstant(parsed.data.scheduledEnd),
    planned_quantity: parsed.data.plannedQuantity,
    unit_label: parsed.data.unitLabel,
       target_sales_employee_id: parsed.data.salesEmployeeId || null,
    target_vehicle_id: parsed.data.vehicleId || null,
    target_machine_id: parsed.data.machineId || null,
    operation_id: parsed.data.operationId,
  });
  if (error || !data) fail("/admin/service-jobs", error?.message);
  revalidatePath("/admin/service-jobs");
  redirect("/admin/service-jobs/" + data + "?notice=service-created");
}

export async function cancelScheduledServiceJobAction(formData: FormData) {
  const parsed = z.object({
    serviceJobId: z.uuid(), version: z.coerce.number().int().positive(),
    reason: z.string().trim().min(3).max(500), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? "/admin/service-jobs/" + parsed.data.serviceJobId : "/admin/service-jobs";
  if (!parsed.success) return fail(target, "invalid-service-cancel");
  await requireInternalPermission("service.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_scheduled_service_job", {
    target_service_job_id: parsed.data.serviceJobId,
    expected_version: parsed.data.version,
    cancellation_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath("/admin/service-jobs");
  revalidatePath(target);
  redirect(target + "?notice=service-cancelled");
}

export async function publishWorkItemAction(formData: FormData) {
  const parsed = z.object({
    serviceJobId: z.uuid(), assignmentMode: z.enum(["DIRECT", "POOL_CLAIM"]),
    employeeId: optionalUuid, operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? "/admin/service-jobs/" + parsed.data.serviceJobId : "/admin/service-jobs";
  if (!parsed.success) return fail(target, "invalid-work-item");
  const access = await requireInternalPermission("work.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("publish_work_item", {
    target_branch_id: access.branchId, source_kind: "SERVICE_JOB", source_id: parsed.data.serviceJobId,
    requested_assignment_mode: parsed.data.assignmentMode, target_employee_id: parsed.data.employeeId || null,
    operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath(target);
  revalidatePath("/admin/workforce");
  redirect(target + "?notice=work-published");
}

async function workStateAction(formData: FormData, command: "assign" | "claim" | "start") {
  const parsed = z.object({
    workItemId: z.uuid(), serviceJobId: z.uuid(), version: z.coerce.number().int().positive(),
    employeeId: optionalUuid.optional(), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? "/admin/service-jobs/" + parsed.data.serviceJobId : "/admin/service-jobs";
  if (!parsed.success) return fail(target, "invalid-work-command");
  await requireInternalPermission(command === "assign" ? "work.manage" : "work.claim");
  const supabase = await createServerSupabase();
  const rpc = command === "assign" ? "assign_work_item" : command === "claim" ? "claim_work_item" : "start_work_item";
  const args = command === "assign"
    ? { target_work_item_id: parsed.data.workItemId, target_employee_id: parsed.data.employeeId || null, expected_version: parsed.data.version, operation_id: parsed.data.operationId }
    : { target_work_item_id: parsed.data.workItemId, expected_version: parsed.data.version, operation_id: parsed.data.operationId };
  const { error } = await supabase.rpc(rpc, args);
  if (error) fail(target, error.message);
  revalidatePath(target);
  revalidatePath("/admin/workforce");
  const notice = command === "assign" ? "work-assigned" : command === "claim" ? "work-claimed" : "work-started";
  redirect(target + "?notice=" + notice);
}

export async function assignWorkItemAction(formData: FormData) { return workStateAction(formData, "assign"); }
export async function claimWorkItemAction(formData: FormData) { return workStateAction(formData, "claim"); }
export async function startWorkItemAction(formData: FormData) { return workStateAction(formData, "start"); }

export async function heartbeatWorkItemAction(formData: FormData) {
  const parsed = z.object({
    workItemId: z.uuid(), serviceJobId: z.uuid(), note: z.string().trim().min(3).max(300), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? "/admin/service-jobs/" + parsed.data.serviceJobId : "/admin/service-jobs";
  if (!parsed.success) return fail(target, "invalid-heartbeat");
  await requireInternalPermission("work.claim");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("heartbeat_work_item", {
    target_work_item_id: parsed.data.workItemId, status_note: parsed.data.note, operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath(target);
  redirect(target + "?notice=heartbeat-recorded");
}

export async function submitWorkResultAction(formData: FormData) {
  const parsed = z.object({
    workItemId: z.uuid(), serviceJobId: z.uuid(), actualQuantity: decimal,
    note: z.string().trim().min(3).max(1000), receiverName: z.string().trim().max(160),
    evidenceId: optionalUuid, version: z.coerce.number().int().positive(), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? "/admin/service-jobs/" + parsed.data.serviceJobId : "/admin/service-jobs";
  if (!parsed.success) return fail(target, "invalid-work-result");
  await requireInternalPermission("work.claim");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("submit_work_result", {
    target_work_item_id: parsed.data.workItemId, actual_quantity: parsed.data.actualQuantity,
    note: parsed.data.note, receiver_name: parsed.data.receiverName || null,
    target_evidence_id: parsed.data.evidenceId || null, expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath(target);
  revalidatePath("/admin/workforce");
  redirect(target + "?notice=work-submitted");
}

export async function verifyServiceJobAction(formData: FormData) {
  const parsed = z.object({
    serviceJobId: z.uuid(), billableQuantity: decimal, compensableQuantity: decimal,
    billableAmount: z.string().trim().regex(/^\d+$/), dueDate: z.iso.date(),
    note: z.string().trim().min(3).max(1000), jobVersion: z.coerce.number().int().positive(),
    workVersion: z.coerce.number().int().positive(), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? "/admin/service-jobs/" + parsed.data.serviceJobId : "/admin/service-jobs";
  if (!parsed.success) return fail(target, "invalid-service-verification");
  await requireInternalPermission("service.verify");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("verify_service_job", {
    target_service_job_id: parsed.data.serviceJobId, billable_quantity: parsed.data.billableQuantity,
    compensable_quantity: parsed.data.compensableQuantity, billable_amount_vnd: parsed.data.billableAmount,
    due_date: parsed.data.dueDate, verification_note: parsed.data.note,
    expected_job_version: parsed.data.jobVersion, expected_work_version: parsed.data.workVersion,
    operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath(target);
  revalidatePath("/admin");
  revalidatePath("/admin/receivables");
  redirect(target + "?notice=service-verified");
}

export async function createCompensationRuleAction(formData: FormData) {
  const parsed = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/),
    name: z.string().trim().min(2).max(160), employeeId: optionalUuid,
    earningType: z.enum(["FIXED_MONTHLY","PER_JOB","PER_TRIP","PER_HOUR","PER_SHIFT","PER_DAY","PER_TON","PER_M3","PER_BAG","PER_UNIT","BONUS","ADJUSTMENT","SALES_COMMISSION"]),
    calculationKind: z.enum(["FIXED_PER_BASIS","PERCENT_BPS"]), rate: z.string().trim(),
    classification: z.enum(["DIRECT_LABOR","OPEX","SALES_COMMISSION"]),
    effectiveFrom: z.iso.date(), effectiveTo: z.union([z.iso.date(), z.literal("")]), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("/admin/compensation", "invalid-rule");
  const access = await requireInternalPermission("compensation.manage");
  const percentage = parsed.data.calculationKind === "PERCENT_BPS";
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_compensation_rule", {
    target_branch_id: access.branchId, rule_code: parsed.data.code, rule_name: parsed.data.name,
    target_employee_id: parsed.data.employeeId || null, earning_type: parsed.data.earningType,
    calculation_kind: parsed.data.calculationKind, rate_vnd_per_unit: percentage ? null : parsed.data.rate,
    rate_bps: percentage ? Number(parsed.data.rate) : null, classification: parsed.data.classification,
    effective_from: parsed.data.effectiveFrom, effective_to: parsed.data.effectiveTo || null,
    operation_id: parsed.data.operationId,
  });
  if (error) fail("/admin/compensation", error.message);
  revalidatePath("/admin/compensation");
  redirect("/admin/compensation?notice=rule-created");
}

export async function recordCompensationBasisAction(formData: FormData) {
  const parsed = z.object({
    employeeId: z.uuid(), basisType: z.enum(["FIXED_MONTHLY","PER_SHIFT","PER_DAY","BONUS","ADJUSTMENT"]),
    basisQuantity: decimal, periodStart: z.iso.date(), periodEnd: z.iso.date(),
    description: z.string().trim().min(3).max(500), adjustsEarningId: optionalUuid,
    evidenceId: optionalUuid, operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("/admin/compensation", "invalid-basis");
  const access = await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("record_compensation_basis", {
    target_branch_id: access.branchId, target_employee_id: parsed.data.employeeId,
    basis_type: parsed.data.basisType, basis_quantity: parsed.data.basisQuantity,
    period_start: parsed.data.periodStart, period_end: parsed.data.periodEnd,
    description: parsed.data.description, adjusts_earning_event_id: parsed.data.adjustsEarningId || null,
    target_evidence_id: parsed.data.evidenceId || null, operation_id: parsed.data.operationId,
  });
  if (error) fail("/admin/compensation", error.message);
  revalidatePath("/admin/compensation");
  redirect("/admin/compensation?notice=basis-recorded");
}

export async function calculateEarningAction(formData: FormData) {
  const parsed = z.object({
    ruleId: z.uuid(), sourceKind: z.enum(["SERVICE_VERIFICATION","WORK_ITEM_VERIFICATION","SALES_ORDER","MANUAL_BASIS"]),
    sourceId: z.uuid(), returnTo: z.string().startsWith("/admin/"), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = parsed.success ? parsed.data.returnTo : "/admin/compensation";
  if (!parsed.success) return fail(target, "invalid-earning-source");
  await requireInternalPermission("compensation.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("calculate_earning_event", {
    target_rule_id: parsed.data.ruleId, source_kind: parsed.data.sourceKind,
    source_id: parsed.data.sourceId, operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath("/admin/compensation");
  revalidatePath(target);
  redirect(target + "?notice=earning-calculated");
}

export async function approveEarningAction(formData: FormData) {
  const parsed = z.object({
    earningId: z.uuid(), approvedAmount: z.string().trim().regex(/^-?\d+$/),
    dueDate: z.iso.date(), version: z.coerce.number().int().positive(), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("/admin/compensation", "invalid-earning-approval");
  await requireInternalPermission("compensation.approve");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("approve_earning_event", {
    target_earning_event_id: parsed.data.earningId, approved_amount_vnd: parsed.data.approvedAmount,
    due_date: parsed.data.dueDate, expected_version: parsed.data.version, operation_id: parsed.data.operationId,
  });
  if (error) fail("/admin/compensation", error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/compensation");
  revalidatePath("/admin/payables");
  redirect("/admin/compensation?notice=earning-approved");
}

export async function payEarningAction(formData: FormData) {
  const parsed = z.object({
    employeeId: z.uuid(), obligationId: z.uuid(), accountId: z.uuid(), amount: positiveMoney,
    effectiveAt: localDateTime, method: z.enum(["CASH","BANK_TRANSFER","CARD","OTHER"]),
    reference: z.string().trim().max(160), operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("/admin/compensation", "invalid-earning-payment");
  const access = await requireInternalPermission("finance.payment.post");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("post_payment", {
    target_branch_id: access.branchId, direction: "DISBURSEMENT", target_customer_id: null,
    target_supplier_id: null, target_employee_id: parsed.data.employeeId,
    target_account_id: parsed.data.accountId, amount_vnd: parsed.data.amount,
    effective_at: toInstant(parsed.data.effectiveAt), method: parsed.data.method,
    external_reference: parsed.data.reference,
    allocation_lines: [{ obligation_id: parsed.data.obligationId, amount_vnd: parsed.data.amount }],
    advance_amount_vnd: 0, operation_id: parsed.data.operationId,
  });
  if (error) fail("/admin/compensation", error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/compensation");
  revalidatePath("/admin/payables");
  revalidatePath("/admin/cashbook");
  redirect("/admin/compensation?notice=earning-paid");
}
