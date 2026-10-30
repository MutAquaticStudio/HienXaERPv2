"use server";
import { E_INVOICES_ENABLED, E_INVOICES_PAUSED_MESSAGE } from "@/lib/features";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { reasonOrDefault } from "@/lib/core/reason";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";

function failed(message?: string, code?: string): CommandOutcome {
 return { status: isAuthoritativeRejection(code) ? "FAILED" : "UNKNOWN", message: message?.includes("variance") ? "Chứng từ còn lệch nguồn. Giữ ngoại lệ để sửa nguồn hoặc chứng từ; chưa thể duyệt là đã khớp." : message?.includes("version") ? "Chứng từ đã thay đổi. Tải lại trước khi rà soát." : code === "23505" ? "Nguồn hoặc tham chiếu đã có chứng từ. Tra cứu thao tác và bản đã ghi." : "Chưa hoàn tất lưu chứng từ. Kiểm tra nguồn, phạm vi và kết quả đã lưu." };
}
function refresh(id?: string) { revalidatePath("/admin/invoices"); revalidatePath("/admin/invoices/purchases"); revalidatePath("/admin/invoices/purchases/matching"); if (id) revalidatePath(`/admin/invoices/purchases/matching/${id}`); }
const line = z.object({ source_kind: z.enum(["RECEIPT_LINE", "FULFILLMENT_LINE", "RETURN_CREDIT"]), source_id: z.guid(), document_quantity: z.string().regex(/^\d{1,14}(?:\.\d{1,6})?$/), document_unit_cost: z.string().regex(/^\d{1,26}(?:\.\d{1,6})?$/), document_value_vnd: z.string().regex(/^\d+$/) });
export async function registerSupplierDocumentAction(form: FormData): Promise<CommandOutcome> {
 if (!E_INVOICES_ENABLED) return { status: "FAILED", message: E_INVOICES_PAUSED_MESSAGE };
 const parsed = z.object({ supplierId: z.guid(), kind: z.enum(["INVOICE", "CREDIT_NOTE"]), number: z.string().trim().min(2).max(100), date: z.iso.date(), total: z.string().regex(/^\d+$/), lines: z.string().max(20000), operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Nhập tham chiếu, ngày và các dòng chứng từ hợp lệ." };
 let entries: z.infer<typeof line>[]; try { entries = z.array(line).min(1).max(50).parse(JSON.parse(parsed.data.lines)); } catch { return { status: "FAILED", message: "Chọn tối đa 50 nguồn; lượng và giá có tối đa 6 chữ số thập phân." }; }
 const access = await requireInternalPermission("finance.ap.adjust"), changed = await checkSavedCommandFieldsAction(form, "register_supplier_document"); if (changed) return changed;
 const db = await createServerSupabase(); const { data, error } = await db.rpc("register_supplier_document", { target_branch_id: access.branchId, target_supplier_id: parsed.data.supplierId,
  target_document_kind: parsed.data.kind, target_document_number: parsed.data.number, target_document_date: parsed.data.date, declared_total_vnd: parsed.data.total, document_lines: entries, operation_id: parsed.data.operationId });
 if (error || !data) return failed(error?.message, error?.code); refresh(); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi đối chiếu theo nguồn. Không tạo phải trả hoặc giảm phải trả lần nữa; chứng từ pháp lý chưa được xác minh." };
}
export async function reviewSupplierDocumentAction(form: FormData): Promise<CommandOutcome> {
 if (!E_INVOICES_ENABLED) return { status: "FAILED", message: E_INVOICES_PAUSED_MESSAGE };
 const parsed = z.object({ documentId: z.guid(), decision: z.enum(["APPROVE_MATCH", "CANCEL"]), reason: z.string().trim().max(500).optional(), version: z.coerce.number().int().positive(), operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Chứng từ đã thay đổi hoặc ghi chú quá 500 ký tự. Tải lại trước khi rà soát." };
 const access = await requireInternalPermission(parsed.data.decision === "CANCEL" ? "finance.ap.adjust" : "finance.reconcile"), changed = await checkSavedCommandFieldsAction(form, "review_supplier_document"); if (changed) return changed;
 const db = await createServerSupabase(); const { data: source } = await db.from("supplier_document_read").select("id").eq("id", parsed.data.documentId).eq("branch_id", access.branchId).maybeSingle(); if (!source) return { status: "FAILED", message: "Chứng từ không thuộc chi nhánh đang chọn." };
 const { data, error } = await db.rpc("review_supplier_document", { target_document_id: parsed.data.documentId, review_decision: parsed.data.decision, review_reason: reasonOrDefault(parsed.data.reason, parsed.data.decision === "CANCEL" ? "Hủy bản đối chiếu" : "Duyệt khớp nguồn"), expected_version: parsed.data.version, operation_id: parsed.data.operationId });
 if (error || !data) return failed(error?.message, error?.code); refresh(parsed.data.documentId); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi quyết định nội bộ; trạng thái phát hành và công nợ không đổi bởi thao tác này." };
}

export async function invoiceCommandWithOutcomeAction(form: FormData): Promise<CommandOutcome> {
 if (!E_INVOICES_ENABLED) return { status: "FAILED", message: E_INVOICES_PAUSED_MESSAGE };
 const kind = z.enum(["draft", "approve", "cancel", "adjustment", "purchase"]).safeParse(form.get("kind")), op = z.guid().safeParse(form.get("operationId"));
 if (!kind.success || !op.success) return { status: "FAILED", message: "Thông tin thao tác hóa đơn không hợp lệ." };
 const config = { draft: ["create_invoice_draft", "finance.ar.adjust"], approve: ["approve_invoice_business", "finance.reconcile"], cancel: ["cancel_invoice_draft", "finance.ar.adjust"], adjustment: ["create_invoice_adjustment_draft", "finance.ar.adjust"], purchase: ["register_purchase_invoice_source", "finance.ap.adjust"] } as const;
 const [command, permission] = config[kind.data], access = await requireInternalPermission(permission), changed = await checkSavedCommandFieldsAction(form, command); if (changed) return changed;
 const db = await createServerSupabase(), sourceId = String(form.get("source_id") || ""), invoiceId = String(form.get("invoice_id") || ""), adjustmentId = String(form.get("adjustment_id") || ""), version = Number(form.get("version")), reason = String(form.get("reason") || "").trim();
 if (reason.length > 500) return { status: "FAILED", message: "Ghi chú tối đa 500 ký tự." };
 if (!z.guid().safeParse(kind.data === "draft" || kind.data === "purchase" ? sourceId : invoiceId).success) return { status: "FAILED", message: "Nguồn chứng từ không hợp lệ." };
 const table = kind.data === "draft" ? "receivable_read" : kind.data === "purchase" ? "payable_read" : "invoice_intents", id = kind.data === "draft" || kind.data === "purchase" ? sourceId : invoiceId;
 const { data: source } = await db.from(table).select("id").eq("id", id).eq("branch_id", access.branchId).maybeSingle(); if (!source) return { status: "FAILED", message: "Nguồn không thuộc chi nhánh đang chọn." };
 let payload: Record<string, unknown>;
 if (kind.data === "draft") payload = { target_obligation_id: sourceId };
 else if (kind.data === "purchase") {
  const number = String(form.get("document_number") || "").trim(), date = String(form.get("document_date") || "");
  if (number.length > 100 || date && !z.iso.date().safeParse(date).success) return { status: "FAILED", message: "Tham chiếu hoặc ngày chứng từ không hợp lệ." };
  payload = { target_payable_obligation_id: sourceId, target_document_number: number || null, target_document_date: date || null };
 } else if (kind.data === "adjustment") { if (!z.guid().safeParse(adjustmentId).success) return { status: "FAILED", message: "Nguồn điều chỉnh không hợp lệ." }; payload = { target_invoice_id: invoiceId, target_receivable_adjustment_id: adjustmentId }; }
 else { if (!Number.isInteger(version) || version < 1) return { status: "FAILED", message: "Phiên bản chứng từ không hợp lệ. Tải lại trang." }; payload = { target_invoice_id: invoiceId, expected_version: version, ...(kind.data === "approve" ? { review_reason: reasonOrDefault(reason, "Duyệt nguồn nghiệp vụ") } : { cancel_reason: reasonOrDefault(reason, "Hủy nháp hóa đơn") }) }; }
 const { data, error } = await db.rpc(command, { ...payload, operation_id: op.data }); if (error || !data) return failed(error?.message, error?.code);
 refresh(); revalidatePath(`/admin/invoices/${invoiceId || String(data)}`); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi hồ sơ nghiệp vụ. Đây là duyệt nội bộ, chưa phát hành hóa đơn điện tử; không ghi công nợ lần hai." };
}
