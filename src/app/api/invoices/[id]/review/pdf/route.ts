import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createStandardPdf, pdfResponse } from "@/lib/pdf/standard-document";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let access;
  try {
    access = await requireInternalPermission("finance.ar.read");
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(error.toResponseBody(), { status: error.status, headers: { "cache-control": "no-store" } });
    }
    throw error;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Mã hồ sơ không hợp lệ", { status: 400 });
  }
  const supabase = await createServerSupabase();
  const { data: invoice, error } = await supabase.from("invoice_intents").select("id,branch_id,customer_name_snapshot,source_obligation_id,source_type,source_id,source_amount_vnd,billing_verified_at,invoice_due_at,status,policy_state,provider_state,create_operation_id").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error) throw error;
  if (!invoice) return new Response("Không tìm thấy hồ sơ", { status: 404 });
  const { data: lines, error: linesError } = await supabase.from("invoice_draft_lines").select("line_number,source_line_id,description_snapshot,quantity_snapshot,source_amount_vnd").eq("invoice_intent_id", id).order("line_number").limit(100);
  if (linesError) throw linesError;
  const money = (value: string | number) => Number(value).toLocaleString("vi-VN") + " VND";
  const bytes = await createStandardPdf({
    title: "PHIẾU RÀ SOÁT NGUỒN",
    reference: `Hồ sơ ${invoice.id}`,
    subtitle: "Chưa phát hành hóa đơn",
    fields: [
      { label: "Khách hàng", value: invoice.customer_name_snapshot },
      { label: "Nguồn", value: `${invoice.source_type} · ${invoice.source_id}` },
      { label: "Xác minh nghiệp vụ", value: new Date(invoice.billing_verified_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) },
      { label: "Hạn lập hóa đơn", value: invoice.invoice_due_at ? new Date(invoice.invoice_due_at).toLocaleString("vi-VN") : "Chờ policy được xác nhận" },
      { label: "Trạng thái hồ sơ", value: invoice.status },
      { label: "Provider", value: "Chưa cấu hình · chưa phát hành" },
    ],
    columns: [
      { label: "Dòng", key: "number", width: 42 },
      { label: "Mô tả nguồn", key: "description", width: 270 },
      { label: "Số lượng", key: "quantity", width: 86, align: "right" },
      { label: "Giá trị nguồn", key: "amount", width: 113, align: "right" },
    ],
    rows: (lines ?? []).map((line) => ({ number: String(line.line_number), description: line.description_snapshot, quantity: Number(line.quantity_snapshot).toLocaleString("vi-VN"), amount: money(line.source_amount_vnd) })),
    totals: [{ label: "Số tiền nguồn", value: money(invoice.source_amount_vnd) }],
    trace: `Nguồn AR: ${invoice.source_obligation_id} · Intent: ${invoice.create_operation_id}`,
    disclaimer: "KHÔNG PHẢI HÓA ĐƠN ĐIỆN TỬ · KHÔNG DÙNG ĐỂ KÊ KHAI THUẾ",
  });
  return pdfResponse(bytes, `invoice-review-${invoice.id}.pdf`);
}
