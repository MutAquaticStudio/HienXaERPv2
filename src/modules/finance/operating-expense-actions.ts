"use server";

import { revalidatePath } from "next/cache";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { operatingExpenseError, parseOperatingExpense } from "./operating-expense";

/**
 * "Ghi chi phí" (FB7, like KiotViet): recorded and approved at once. Paid now → a disbursement in Sổ quỹ from the chosen
 * account; owed → a supplier payable. Pressing again after an unclear answer sends the same operation, which the database
 * answers with the expense already recorded.
 */
export async function recordOperatingExpenseAction(form: FormData): Promise<CommandOutcome> {
  const parsed = parseOperatingExpense(form);
  if (!parsed.ok) return { status: "FAILED", message: parsed.message, field: parsed.field || undefined };
  const input = parsed.value;
  const access = await requireInternalPermission("finance.expense.manage");
  const db = await createServerSupabase();
  const { data, error } = await db.rpc("record_operating_expense", {
    target_branch_id: access.branchId, target_category_id: null, new_category_name: input.categoryName, amount_vnd: input.amount,
    effective_at: new Date(`${input.effectiveAt}:00+07:00`).toISOString(), payee_kind: input.payeeKind,
    target_supplier_id: input.supplierId, target_employee_id: input.employeeId, payee_name: input.payeeName, settlement: input.settlement,
    target_account_id: input.accountId, counts_in_profit: input.countsInProfit, description: input.description,
    target_sales_order_id: input.salesOrderId, operation_id: input.operationId,
  });
  if (error || !data) {
    if (!isAuthoritativeRejection(error?.code)) return { status: "UNKNOWN", message: "Chưa rõ đã ghi được chưa. Bấm Ghi chi phí lần nữa để kiểm tra; hệ thống không ghi hai lần." };
    const refused = operatingExpenseError(error?.message, error?.code);
    return { status: "FAILED", message: refused.message, field: refused.field };
  }
  for (const page of ["/admin/expenses", "/admin/cashbook", "/admin/payables", "/admin"]) revalidatePath(page);
  return { status: "SUCCESS", resultId: String(data), message: input.settlement === "PAID_NOW" ? "Đã ghi chi phí và phiếu chi trong Sổ quỹ." : "Đã ghi chi phí vào công nợ nhà cung cấp." };
}
