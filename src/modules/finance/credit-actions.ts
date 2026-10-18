"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { parseBusinessDateTime } from "@/lib/core/business-time";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CreditCommand } from "./credit-command";

const wholeMoney = z.string().trim().regex(/^\d{1,19}$/).refine(value => BigInt(value) <= 9223372036854775807n);
const positiveMoney = wholeMoney.refine(value => BigInt(value) > 0n);
const identity = { operationId: z.guid(), creditId: z.guid() };
function failure(value?: string) {
  if (value?.includes("legacy_return_credit_source_mismatch")) return "Giá trị phải khớp điều chỉnh đã ghi và nguồn hàng trả. Không ghi giảm lần nữa.";
  if (value?.includes("legacy_return_adjustment_sources_ambiguous")) return "Hồ sơ có nhiều điều chỉnh cũ. Cần đối chiếu từng nguồn trước khi xử lý khoản có.";
  if (value?.includes("exceeds_remaining")) return "Số tiền vượt khoản có còn lại. Tải lại để đối chiếu trước khi ghi.";
  if (value?.includes("return_credit_exceeds_source")) return "Số tiền giảm vượt lượng hàng trả hoặc giá trị nguồn đã xác minh.";
  if (value?.includes("already_decided")) return "Hồ sơ đã có quyết định tài chính. Tải lại để xem khoản có và lịch sử.";
  if (value?.includes("legacy_")) return "Điều chỉnh đã ghi trước đây cần được đối chiếu với nguồn tiền; không ghi giảm lần nữa.";
  if (value?.includes("scope_mismatch")) return "Khoản nợ được chọn không thuộc cùng khách hoặc chi nhánh.";
  if (value?.includes("allocation_exceeds_outstanding")) return "Số tiền cấn trừ vượt công nợ còn lại của khoản được chọn.";
  if (value?.includes("sources_changed_retry")) return "Nguồn thanh toán vừa thay đổi. Tải lại và đối chiếu trước khi duyệt.";
  if (value?.includes("funding")) return "Chưa khớp đủ nguồn tiền đã thu để tạo khoản hoàn hoặc cấn trừ.";
  if (value?.includes("payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tra cứu thao tác đã ghi.";
  return "Không thể ghi thao tác khoản có. Kiểm tra nguồn, quyền và số tiền còn lại.";
}
async function run(form: FormData, command: CreditCommand, permission: string, sourceId: string, args: Record<string, unknown>): Promise<CommandOutcome> {
  const access = await requireInternalPermission(permission);
  const changed = await checkSavedCommandFieldsAction(form, command);
  if (changed) return changed;
  const supabase = await createServerSupabase();
  const resource = command === "adjust_return_receivable" ? "customer_return_finance_read" : "customer_credits";
  let { data: source, error: sourceError } = await supabase.from(resource).select("branch_id").eq("id", sourceId).eq("branch_id", access.branchId).maybeSingle();
  if (!sourceError && !source && command === "adjust_return_receivable") {
    const recorded = await supabase.from("customer_credit_read").select("branch_id").eq("return_case_id", sourceId).eq("branch_id", access.branchId).maybeSingle();
    source = recorded.data; sourceError = recorded.error;
  }
  if (sourceError || !source) return { status: "FAILED", message: "Hồ sơ không thuộc chi nhánh đang chọn hoặc đã thay đổi. Hãy tải lại." };
  const { data, error } = await supabase.rpc(command, args);
  if (error || !data) return { status: isAuthoritativeRejection(error?.code) ? "FAILED" : "UNKNOWN",
    message: error && isAuthoritativeRejection(error.code) ? failure(error.message) : "Chưa xác định được kết quả. Giữ thao tác để tra cứu hoặc thử lại cùng yêu cầu." };
  for (const path of ["/admin/receivables", "/admin/cashbook", "/admin/customers", "/admin"]) revalidatePath(path);
  return { status: "SUCCESS", resultId: String(data), message: command === "adjust_return_receivable" ? "Đã ghi quyết định theo hàng trả. Xem công nợ và khoản có bên dưới." : command === "refund_customer_credit" ? "Đã ghi phiếu hoàn tiền từ khoản có đã duyệt." : "Đã cấn trừ khoản có vào nghĩa vụ được chọn; không ghi thu tiền lần nữa." };
}
export async function approveReturnCreditAction(form: FormData): Promise<CommandOutcome> {
  const parsed = z.object({ returnCaseId: z.guid(), amount: wholeMoney, reason: z.string().trim().min(3).max(500), operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "FAILED", message: "Chọn hồ sơ hàng đã nhận lại, số tiền VND nguyên và lý do duyệt." };
  return run(form, "adjust_return_receivable", "finance.ar.adjust", parsed.data.returnCaseId, { target_return_case_id: parsed.data.returnCaseId,
    credit_amount_vnd: parsed.data.amount, adjustment_reason: parsed.data.reason, operation_id: parsed.data.operationId });
}
export async function refundCustomerCreditAction(form: FormData): Promise<CommandOutcome> {
  const parsed = z.object({ ...identity, amount: positiveMoney, accountId: z.guid(), refundedAt: z.string(),
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), reference: z.string().trim().max(160) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "FAILED", message: "Nhập khoản có, tài khoản chi, thời điểm và số tiền hoàn hợp lệ." };
  const when = parseBusinessDateTime(parsed.data.refundedAt);
  if (!when) return { status: "FAILED", message: "Thời điểm ghi hoàn tiền chưa hợp lệ." };
  return run(form, "refund_customer_credit", "finance.payment.post", parsed.data.creditId, { target_credit_id: parsed.data.creditId,
    target_account_id: parsed.data.accountId, refund_amount_vnd: parsed.data.amount, refunded_at: when,
    refund_method: parsed.data.method, refund_reference: parsed.data.reference, operation_id: parsed.data.operationId });
}
export async function offsetCustomerCreditAction(form: FormData): Promise<CommandOutcome> {
  const parsed = z.object({ ...identity, amount: positiveMoney, obligationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "FAILED", message: "Chọn nghĩa vụ cùng khách và nhập số tiền cấn trừ hợp lệ." };
  return run(form, "offset_customer_credit", "finance.payment.post", parsed.data.creditId, { target_credit_id: parsed.data.creditId,
    target_obligation_id: parsed.data.obligationId, offset_amount_vnd: parsed.data.amount, operation_id: parsed.data.operationId });
}
