"use server";
import { operationalPostingError } from "@/lib/core/errors";


import { revalidatePath } from "next/cache";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type InvoiceActionState = { status: "idle" | "success" | "error"; message: string; invoiceId?: string };

function input(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function validId(value: string) { return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value); }
function failure(message: string): InvoiceActionState { return { status: "error", message }; }
function safeError(message: string) {
  const postingError = operationalPostingError(message);
  if (postingError) return postingError;
  if (message.includes("already_covered") || message.includes("duplicate key")) return "Nguồn đã có nháp hoặc chứng từ tương ứng. Tải lại danh sách.";
  if (message.includes("version_conflict")) return "Dữ liệu đã thay đổi. Tải lại trước khi thao tác.";
  if (message.includes("forbidden")) return "Bạn không có quyền thực hiện thao tác này.";
  return "Không hoàn tất được thao tác. Kiểm tra nguồn và thử lại.";
}

export async function createInvoiceDraftAction(_state: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  await requireInternalPermission("finance.ar.adjust");
  const source = input(formData, "source_id"), operation = input(formData, "operation_id");
  if (!validId(source) || !validId(operation)) return failure("Nguồn hoặc mã thao tác không hợp lệ.");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_invoice_draft", { target_obligation_id: source, operation_id: operation });
  if (error) return failure(safeError(error.message));
  revalidatePath("/admin/invoices");
  return { status: "success", message: "Đã tạo nháp nghiệp vụ, chưa phải hóa đơn điện tử.", invoiceId: String(data) };
}

export async function approveInvoiceBusinessAction(_state: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  await requireInternalPermission("finance.reconcile");
  const id = input(formData, "invoice_id"), operation = input(formData, "operation_id");
  const reason = input(formData, "reason"), version = Number(input(formData, "version"));
  if (!validId(id) || !validId(operation) || !Number.isInteger(version) || version < 1 || reason.length < 3 || reason.length > 500) return failure("Nhập lý do duyệt hợp lệ.");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("approve_invoice_business", { target_invoice_id: id, expected_version: version, review_reason: reason, operation_id: operation });
  if (error) return failure(safeError(error.message));
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
  return { status: "success", message: "Đã duyệt nguồn nghiệp vụ. Chờ cấu hình dịch vụ và chính sách phát hành." };
}

export async function cancelInvoiceDraftAction(_state: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  await requireInternalPermission("finance.ar.adjust");
  const id = input(formData, "invoice_id"), operation = input(formData, "operation_id");
  const reason = input(formData, "reason"), version = Number(input(formData, "version"));
  if (!validId(id) || !validId(operation) || !Number.isInteger(version) || version < 1 || reason.length < 3 || reason.length > 500) return failure("Nhập lý do hủy hợp lệ.");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_invoice_draft", { target_invoice_id: id, expected_version: version, cancel_reason: reason, operation_id: operation });
  if (error) return failure(safeError(error.message));
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
  return { status: "success", message: "Đã hủy nháp. Nguồn nghiệp vụ có thể dùng để lập nháp mới." };
}

export async function createInvoiceAdjustmentAction(_state: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  await requireInternalPermission("finance.ar.adjust");
  const id = input(formData, "invoice_id"), adjustment = input(formData, "adjustment_id"), operation = input(formData, "operation_id");
  if (![id, adjustment, operation].every(validId)) return failure("Nguồn điều chỉnh không hợp lệ.");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_invoice_adjustment_draft", { target_invoice_id: id, target_receivable_adjustment_id: adjustment, operation_id: operation });
  if (error) return failure(safeError(error.message));
  revalidatePath(`/admin/invoices/${id}`);
  return { status: "success", message: "Đã lập nháp điều chỉnh từ công nợ phải thu; chờ quy trình phát hành." };
}

export async function registerPurchaseSourceAction(_state: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  await requireInternalPermission("finance.ap.adjust");
  const source = input(formData, "source_id"), operation = input(formData, "operation_id");
  const number = input(formData, "document_number"), date = input(formData, "document_date");
  if (!validId(source) || !validId(operation) || number.length > 100 || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return failure("Thông tin chứng từ nguồn không hợp lệ.");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("register_purchase_invoice_source", {
    target_payable_obligation_id: source,
    target_document_number: number || null,
    target_document_date: date || null,
    operation_id: operation,
  });
  if (error) return failure(safeError(error.message));
  revalidatePath("/admin/invoices/purchases");
  return { status: "success", message: "Đã ghi nguồn công nợ phải trả; chưa xác nhận chứng từ pháp lý." };
}
