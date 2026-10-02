"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const money = z.string().trim().regex(/^\d+$/).refine((value) => BigInt(value) > 0n);
const signedMoney = z.string().trim().regex(/^-?\d+$/).refine((value) => BigInt(value) !== 0n);
const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const destinationSchema = z.string().startsWith("/admin/").max(300);

function toInstant(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

function destination(value: FormDataEntryValue | null, fallback: string) {
  const parsed = destinationSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function withQuery(target: string, values: Record<string, string>) {
  const url = new URL(target, "http://localhost");
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function message(value?: string) {
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("exceeds_payment")) return "Tổng phân bổ và tiền ứng vượt số tiền của phiếu.";
  if (value?.includes("exceeds_outstanding")) return "Phân bổ hoặc điều chỉnh vượt số dư hiện tại.";
  if (value?.includes("scope_mismatch")) return "Khoản được chọn không cùng đối tác hoặc chi nhánh.";
  if (value?.includes("version")) return "Dữ liệu đã thay đổi. Hãy tải lại trước khi duyệt.";
  if (value?.includes("reversed")) return "Phiếu đã đảo hoặc không còn cho phép thao tác này.";
  return "Không thể hoàn tất thao tác tài chính. Không có hậu quả nào được ghi một phần.";
}

export async function createFinanceAccountAction(formData: FormData) {
  const parsed = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,24}$/),
    name: z.string().trim().min(2).max(120),
    kind: z.enum(["CASH", "BANK"]),
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/cashbook?error=invalid-account");
  const access = await requireInternalPermission("finance.account.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_finance_account", {
    target_branch_id: access.branchId,
    account_code: parsed.data.code,
    account_name: parsed.data.name,
    account_kind: parsed.data.kind,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`/admin/cashbook?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/cashbook");
  redirect("/admin/cashbook?notice=account-created");
}

export async function postPaymentAction(formData: FormData) {
  const parsed = z.object({
    direction: z.enum(["RECEIPT", "DISBURSEMENT"]),
    partyId: z.uuid(),
    accountId: z.uuid(),
    amount: money,
    effectiveAt: localDateTime,
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
    reference: z.string().trim().max(160).optional(),
    advanceAmount: z.string().trim().regex(/^\d+$/).optional(),
    allocationsJson: z.string(),
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const target = destination(formData.get("redirectTo"), "/admin/cashbook");
  if (!parsed.success) redirect(withQuery(target, { error: "invalid-payment" }));

  let allocations: Array<{ obligation_id: string; amount_vnd: string }>;
  try {
    allocations = z.array(z.object({ obligation_id: z.uuid(), amount_vnd: money })).parse(JSON.parse(parsed.data.allocationsJson));
  } catch {
    redirect(withQuery(target, { error: "invalid-allocations" }));
  }

  const access = await requireInternalPermission("finance.payment.post");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("post_payment", {
    target_branch_id: access.branchId,
    direction: parsed.data.direction,
    target_customer_id: parsed.data.direction === "RECEIPT" ? parsed.data.partyId : null,
    target_supplier_id: parsed.data.direction === "DISBURSEMENT" ? parsed.data.partyId : null,
    target_account_id: parsed.data.accountId,
    amount_vnd: parsed.data.amount,
    effective_at: toInstant(parsed.data.effectiveAt),
    method: parsed.data.method,
    external_reference: parsed.data.reference || "",
    allocation_lines: allocations,
    advance_amount_vnd: parsed.data.advanceAmount || "0",
    operation_id: parsed.data.operationId,
  });
  if (error || !data) redirect(withQuery(target, { error: message(error?.message) }));
  revalidatePath("/admin");
  revalidatePath("/admin/receivables");
  revalidatePath("/admin/payables");
  revalidatePath("/admin/cashbook");
  redirect(withQuery(target, { notice: "payment-posted", payment: String(data) }));
}

export async function reversePaymentAction(formData: FormData) {
  const parsed = z.object({ paymentId: z.uuid(), reason: z.string().trim().min(3).max(500), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/cashbook?error=invalid-reversal");
  await requireInternalPermission("finance.payment.reverse");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("reverse_payment", {
    target_payment_id: parsed.data.paymentId,
    reversal_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`/admin/cashbook?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin");
  revalidatePath("/admin/receivables");
  revalidatePath("/admin/payables");
  revalidatePath("/admin/cashbook");
  redirect("/admin/cashbook?notice=payment-reversed");
}

export async function reconcilePaymentAction(formData: FormData) {
  const parsed = z.object({
    paymentId: z.uuid(),
    amount: money,
    effectiveAt: localDateTime,
    reference: z.string().trim().min(2).max(160),
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/cashbook?error=invalid-reconciliation");
  await requireInternalPermission("finance.reconcile");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("record_payment_reconciliation", {
    target_payment_id: parsed.data.paymentId,
    matched_amount_vnd: parsed.data.amount,
    statement_effective_at: toInstant(parsed.data.effectiveAt),
    statement_reference: parsed.data.reference,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`/admin/cashbook?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/cashbook");
  redirect("/admin/cashbook?notice=reconciled");
}

export async function createExpenseCategoryAction(formData: FormData) {
  const parsed = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,24}$/),
    name: z.string().trim().min(2).max(120),
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/expenses?error=invalid-category");
  const access = await requireInternalPermission("finance.expense.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_expense_category", {
    target_branch_id: access.branchId,
    category_code: parsed.data.code,
    category_name: parsed.data.name,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`/admin/expenses?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses?notice=category-created");
}

export async function createExpenseAction(formData: FormData) {
  const parsed = z.object({
    categoryId: z.uuid(),
    supplierId: z.uuid(),
    amount: money,
    effectiveAt: localDateTime,
    dueDate: z.iso.date(),
    description: z.string().trim().min(3).max(500),
    activityKind: z.enum(["OPERATIONS", "SALES", "DELIVERY", "SERVICE", "ADMIN"]),
    salesOrderId: optionalUuid,
    evidenceId: optionalUuid,
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/expenses?error=invalid-expense");
  const access = await requireInternalPermission("finance.expense.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_expense", {
    target_branch_id: access.branchId,
    target_category_id: parsed.data.categoryId,
    target_supplier_id: parsed.data.supplierId,
    amount_vnd: parsed.data.amount,
    effective_at: toInstant(parsed.data.effectiveAt),
    due_date: parsed.data.dueDate,
    description: parsed.data.description,
    activity_kind: parsed.data.activityKind,
    target_sales_order_id: parsed.data.salesOrderId || null,
    target_evidence_id: parsed.data.evidenceId || null,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`/admin/expenses?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses?notice=expense-created");
}

export async function approveExpenseAction(formData: FormData) {
  const parsed = z.object({ expenseId: z.uuid(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/expenses?error=invalid-approval");
  await requireInternalPermission("finance.expense.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("approve_expense", {
    target_expense_id: parsed.data.expenseId,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`/admin/expenses?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin");
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/payables");
  redirect("/admin/expenses?notice=expense-approved");
}

async function adjustmentAction(formData: FormData, side: "AR" | "AP") {
  const parsed = z.object({
    obligationId: z.uuid(),
    amount: signedMoney,
    reason: z.string().trim().min(3).max(500),
    evidenceId: optionalUuid,
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  const base = side === "AR" ? "/admin/receivables" : "/admin/payables";
  const target = parsed.success ? `${base}/${parsed.data.obligationId}` : base;
  if (!parsed.success) redirect(`${target}?error=invalid-adjustment`);
  await requireInternalPermission(side === "AR" ? "finance.ar.adjust" : "finance.ap.adjust");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc(side === "AR" ? "record_receivable_adjustment" : "record_payable_adjustment", {
    target_obligation_id: parsed.data.obligationId,
    amount_delta_vnd: parsed.data.amount,
    reason: parsed.data.reason,
    target_evidence_id: parsed.data.evidenceId || null,
    operation_id: parsed.data.operationId,
  });
  if (error) redirect(`${target}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin");
  revalidatePath(base);
  revalidatePath(target);
  redirect(`${target}?notice=adjusted`);
}

export async function recordReceivableAdjustmentAction(formData: FormData) {
  return adjustmentAction(formData, "AR");
}

export async function recordPayableAdjustmentAction(formData: FormData) {
  return adjustmentAction(formData, "AP");
}
