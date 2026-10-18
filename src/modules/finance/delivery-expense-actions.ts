"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";

function failure(message?: string, code?: string): CommandOutcome {
 return { status: isAuthoritativeRejection(code) ? "FAILED" : "UNKNOWN", message: message?.includes("version") ? "Phiếu giao đã thay đổi. Tải lại và kiểm tra nguồn chi phí." : message?.includes("unique") || code === "23505" ? "Tham chiếu chứng từ nhà cung cấp hoặc mã thao tác đã được dùng. Kiểm tra khoản đã ghi." : "Chưa hoàn tất ghi chi phí. Kiểm tra nguồn, quyền và kết quả thao tác." };
}
function refresh() { for (const page of ["/admin/expenses", "/admin/payables", "/admin"]) revalidatePath(page); }

export async function createDeliveryExpenseAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ assignment: z.string().regex(/^[0-9a-f-]{36}:[1-9]\d*$/i), categoryId: z.guid(), supplierId: z.guid(),
  amount: z.string().regex(/^[1-9]\d*$/), effectiveAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), dueDate: z.iso.date(),
  description: z.string().trim().min(3).max(500), costScope: z.enum(["DIRECT_DELIVERY", "OVERHEAD"]), supplierReference: z.string().trim().min(3).max(100),
  evidenceId: z.union([z.guid(), z.literal("")]), operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Chọn lần giao thực tế, chứng từ nhà cung cấp và thông tin chi phí hợp lệ." };
 const access = await requireInternalPermission("finance.expense.manage");
 const changed = await checkSavedCommandFieldsAction(form, "create_delivery_expense"); if (changed) return changed;
 const [assignmentId, version] = parsed.data.assignment.split(":");
 const db = await createServerSupabase();
 const { data, error } = await db.rpc("create_delivery_expense", { target_branch_id: access.branchId, target_assignment_id: assignmentId,
  target_category_id: parsed.data.categoryId, target_supplier_id: parsed.data.supplierId, amount_vnd: parsed.data.amount,
  effective_at: new Date(`${parsed.data.effectiveAt}:00+07:00`).toISOString(), due_date: parsed.data.dueDate, description: parsed.data.description,
  cost_scope: parsed.data.costScope, supplier_reference: parsed.data.supplierReference, target_evidence_id: parsed.data.evidenceId || null,
  expected_delivery_version: Number(version), operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code);
 refresh(); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi chi phí chờ duyệt theo đúng lần giao và xe." };
}

export async function approveExpenseWithOutcomeAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ expenseId: z.guid(), version: z.coerce.number().int().positive(), operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Thông tin duyệt chi phí không hợp lệ." };
 const access = await requireInternalPermission("finance.expense.manage");
 const changed = await checkSavedCommandFieldsAction(form, "approve_expense"); if (changed) return changed;
 const db = await createServerSupabase();
 const { data: source, error: readError } = await db.from("expense_read").select("id").eq("id", parsed.data.expenseId).eq("branch_id", access.branchId).maybeSingle();
 if (readError || !source) return { status: "FAILED", message: "Khoản chi phí không thuộc chi nhánh đang chọn." };
 const { data, error } = await db.rpc("approve_expense", { target_expense_id: parsed.data.expenseId, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code);
 refresh(); return { status: "SUCCESS", resultId: String(data), message: "Đã duyệt chi phí và ghi một khoản phải trả. Chi trả dùng nguồn này tại công nợ nhà cung cấp." };
}
