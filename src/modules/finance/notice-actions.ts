"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";

export async function paymentNoticeCommandAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ kind: z.enum(["REVIEW", "MATCH", "REVERSE_MATCH"]), noticeId: z.uuid(), version: z.coerce.number().int().positive(), reason: z.string().trim().min(3).max(500), operationId: z.uuid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Kiểm tra phiên bản thông báo và ghi căn cứ đối chiếu." };
 const access = await requireInternalPermission("finance.payment_notice.review"), db = await createServerSupabase();
 const command = parsed.data.kind === "REVIEW" ? "review_payment_notice" : parsed.data.kind === "MATCH" ? "match_payment_notice" : "reverse_payment_notice_match";
 const changed = await checkSavedCommandFieldsAction(form, command); if (changed) return changed;
 const { data: source } = await db.from("payment_notice_read").select("id").eq("id", parsed.data.noticeId).eq("branch_id", access.branchId).maybeSingle(); if (!source) return { status: "FAILED", message: "Thông báo không thuộc chi nhánh đang chọn." };
 let payload: Record<string, unknown>;
 if (parsed.data.kind === "REVIEW") {
  const state = z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]).safeParse(form.get("state")); if (!state.success) return { status: "FAILED", message: "Chọn kết quả rà soát chứng từ." };
  payload = { target_payment_notice_id: parsed.data.noticeId, target_state: state.data, target_review_note: parsed.data.reason, expected_version: parsed.data.version };
 } else if (parsed.data.kind === "MATCH") {
  await requireInternalPermission("finance.reconcile"); const match = z.uuid().safeParse(form.get("reconciliationId")), amount = z.string().regex(/^[1-9]\d*$/).safeParse(form.get("amount"));
  if (!match.success || !amount.success) return { status: "FAILED", message: "Chọn tiền thực đã đối chiếu ngân hàng và số tiền cần nối với thông báo." };
  payload = { target_notice_id: parsed.data.noticeId, target_reconciliation_match_id: match.data, match_amount_vnd: amount.data, match_reason: parsed.data.reason, expected_notice_version: parsed.data.version };
 } else {
  await requireInternalPermission("finance.reconcile"); const id = z.uuid().safeParse(form.get("matchId")); if (!id.success) return { status: "FAILED", message: "Nguồn đối chiếu cần sửa không hợp lệ." };
  const { data: match } = await db.from("payment_notice_matches").select("id").eq("id", id.data).eq("notice_id", parsed.data.noticeId).maybeSingle(); if (!match) return { status: "FAILED", message: "Liên kết không thuộc thông báo này." };
  payload = { target_match_id: id.data, reversal_reason: parsed.data.reason, expected_notice_version: parsed.data.version };
 }
 const { data, error } = await db.rpc(command, { ...payload, operation_id: parsed.data.operationId });
 if (error || !data) return { status: isAuthoritativeRejection(error?.code) ? "FAILED" : "UNKNOWN", message: error?.message.includes("version") ? "Thông báo đã thay đổi. Tải lại trước khi tiếp tục." : error?.message.includes("exceeds") ? "Tiền vượt phần còn lại của thông báo hoặc nguồn ngân hàng đã dùng cho thông báo khác." : error?.message.includes("active_matches") ? "Sửa liên kết tiền theo nguồn trước khi đổi kết quả rà soát chứng từ." : "Chưa hoàn tất đối chiếu. Kiểm tra đúng khách, nguồn tiền, trạng thái và kết quả đã lưu." };
 revalidatePath("/admin/payment-notices"); return { status: "SUCCESS", resultId: String(data), message: parsed.data.kind === "REVIEW" ? "Đã ghi rà soát chứng từ. Chưa xác nhận tiền hoặc giảm nợ." : "Đã ghi liên kết / sửa đối chiếu theo nguồn. Không tạo phiếu thu hoặc phân bổ công nợ lần nữa." };
}
