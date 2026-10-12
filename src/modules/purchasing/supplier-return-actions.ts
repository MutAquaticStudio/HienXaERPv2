"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";

const uuidOrBlank = z.union([z.uuid(), z.literal("")]);
const quantity = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,6})?$/);
const reason = z.string().trim().min(3).max(500);
function failure(message?: string, code?: string): CommandOutcome {
 return { status: isAuthoritativeRejection(code) ? "FAILED" : "UNKNOWN", message: message?.includes("version") ? "Hồ sơ trả nhà cung cấp đã thay đổi. Tải lại và đối chiếu nguồn."
  : message?.includes("exceeds") ? "Lượng hoặc tiền vượt phần nguồn đã nhận, thực trả, được chấp nhận hoặc còn khả dụng."
  : message?.includes("insufficient_available") ? "Kho không đủ lượng khả dụng đã ghi nhận để thực trả."
  : message?.includes("custody") ? "Nguồn giao thẳng cần hồ sơ hàng trả đang mở đúng dòng giao; hàng được trả thẳng tới nhà cung cấp."
  : code === "23505" ? "Nguồn chấp nhận, chứng từ hoặc mã thao tác đã được ghi. Tra cứu kết quả trước khi tạo lần mới."
  : "Chưa hoàn tất thao tác trả nhà cung cấp. Kiểm tra nguồn, quyền và kết quả đã lưu." };
}
function refresh(id?: string) { for (const path of ["/admin/purchases/returns", "/admin/inventory", "/admin/payables", "/admin/cashbook", "/admin/dispatch", "/admin"]) revalidatePath(path); if (id) revalidatePath(`/admin/purchases/returns/${id}`); }
async function assertCase(id: string, branchId: string) {
 const db = await createServerSupabase(); const { data, error } = await db.from("supplier_return_read").select("id").eq("id", id).eq("branch_id", branchId).maybeSingle(); return !error && Boolean(data);
}
export async function createSupplierReturnAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ source: z.string(), quantity, reason, operationId: z.uuid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Chọn nguồn trả, lượng cơ sở tối đa 6 chữ số thập phân và lý do." };
 const ids = parsed.data.source.split("|"); if (ids.length !== 3 || !ids.every(id => uuidOrBlank.safeParse(id).success)) return { status: "FAILED", message: "Nguồn nhận hàng hoặc giao thẳng chưa hợp lệ." };
 const access = await requireInternalPermission("purchasing.create"), changed = await checkSavedCommandFieldsAction(form, "create_supplier_return"); if (changed) return changed;
 const db = await createServerSupabase(); const { data, error } = await db.rpc("create_supplier_return", { target_branch_id: access.branchId, target_receipt_line_id: ids[0] || null,
  target_fulfillment_line_id: ids[1] || null, target_custody_case_id: ids[2] || null, requested_base_quantity: parsed.data.quantity, return_reason: parsed.data.reason, operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code); refresh(); return { status: "SUCCESS", resultId: String(data), message: "Đã mở hồ sơ trả theo nguồn. Lượng thực trả, nhà cung cấp chấp nhận và tiền được xử lý riêng." };
}
export async function recordSupplierReturnAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ caseId: z.uuid(), kind: z.enum(["PHYSICAL_RETURN", "SUPPLIER_ACCEPTANCE", "CLOSE_DISPATCH"]), quantity, supplierReference: z.string().trim().max(100), reason, version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Lượng, phiên bản hoặc chứng từ chấp nhận chưa hợp lệ." };
 const permission = parsed.data.kind === "PHYSICAL_RETURN" ? "inventory.reserve" : parsed.data.kind === "CLOSE_DISPATCH" ? "purchasing.cancel" : "purchasing.confirm";
 const access = await requireInternalPermission(permission), changed = await checkSavedCommandFieldsAction(form, "record_supplier_return_event"); if (changed) return changed;
 if (!await assertCase(parsed.data.caseId, access.branchId)) return { status: "FAILED", message: "Hồ sơ không thuộc chi nhánh đang chọn." };
 const db = await createServerSupabase(); const { data, error } = await db.rpc("record_supplier_return_event", { target_case_id: parsed.data.caseId, target_event_kind: parsed.data.kind,
  actual_base_quantity: parsed.data.quantity, target_supplier_reference: parsed.data.supplierReference || null, event_reason: parsed.data.reason, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code); refresh(parsed.data.caseId); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi lượng theo nguồn. Bước này không giảm phải trả hoặc tạo tiền." };
}
export async function approveSupplierCreditAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ caseId: z.uuid(), acceptanceId: z.uuid(), amount: z.string().regex(/^\d+$/), reason, version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Kiểm tra khoản giảm theo chấp nhận của nhà cung cấp." };
 const access = await requireInternalPermission("finance.ap.adjust"), changed = await checkSavedCommandFieldsAction(form, "approve_supplier_return_credit"); if (changed) return changed;
 if (!await assertCase(parsed.data.caseId, access.branchId)) return { status: "FAILED", message: "Hồ sơ không thuộc chi nhánh đang chọn." };
 const db = await createServerSupabase(); const { data: event } = await db.from("supplier_return_events").select("id").eq("case_id", parsed.data.caseId).eq("id", parsed.data.acceptanceId).maybeSingle(); if (!event) return { status: "FAILED", message: "Chấp nhận không thuộc hồ sơ này." };
 const { data, error } = await db.rpc("approve_supplier_return_credit", { target_acceptance_event_id: parsed.data.acceptanceId, credit_amount_vnd: parsed.data.amount, approval_reason: parsed.data.reason, expected_case_version: parsed.data.version, operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code); refresh(parsed.data.caseId); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi quyết định giảm phải trả. Phần đã thanh toán giữ nguồn chờ nhà cung cấp hoàn hoặc bù trừ." };
}
export async function settleSupplierCreditAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ caseId: z.uuid(), creditId: z.uuid(), kind: z.enum(["REFUND", "OFFSET"]), amount: z.string().regex(/^[1-9]\d*$/), accountId: uuidOrBlank, obligationId: uuidOrBlank,
  receivedAt: z.string(), method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), reference: z.string().trim().max(160), operationId: z.uuid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Kiểm tra tiền thực hoàn hoặc nguồn phải trả để bù trừ." };
 const command = parsed.data.kind === "REFUND" ? "refund_supplier_credit" : "offset_supplier_credit";
 const access = await requireInternalPermission("finance.payment.post"), changed = await checkSavedCommandFieldsAction(form, command); if (changed) return changed;
 const db = await createServerSupabase(); const { data: credit } = await db.from("supplier_return_credit_read").select("id").eq("id", parsed.data.creditId).eq("case_id", parsed.data.caseId).eq("branch_id", access.branchId).maybeSingle(); if (!credit) return { status: "FAILED", message: "Khoản cần hoàn không thuộc nguồn hoặc chi nhánh đang chọn." };
 const refund = parsed.data.kind === "REFUND";
 if (refund && (!Number.isFinite(Date.parse(`${parsed.data.receivedAt}:00+07:00`)) || !parsed.data.accountId || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(parsed.data.receivedAt))) return { status: "FAILED", message: "Chọn tài khoản đã nhận tiền và thời điểm nhận thực tế." };
 if (!refund && !parsed.data.obligationId) return { status: "FAILED", message: "Chọn khoản phải trả cùng nhà cung cấp." };
 const payload = refund ? { target_credit_id: parsed.data.creditId, target_account_id: parsed.data.accountId, refund_amount_vnd: parsed.data.amount, refunded_at: new Date(`${parsed.data.receivedAt}:00+07:00`).toISOString(), refund_method: parsed.data.method, refund_reference: parsed.data.reference, operation_id: parsed.data.operationId }
  : { target_credit_id: parsed.data.creditId, target_obligation_id: parsed.data.obligationId, offset_amount_vnd: parsed.data.amount, operation_id: parsed.data.operationId };
 const { data, error } = await db.rpc(command, payload); if (error || !data) return failure(error?.message, error?.code);
 refresh(parsed.data.caseId); return { status: "SUCCESS", resultId: String(data), message: refund ? "Đã ghi phiếu thu tiền nhà cung cấp hoàn theo nguồn." : "Đã bù trừ vào phải trả cùng nhà cung cấp; không tạo thu hoặc chi lần nữa." };
}
