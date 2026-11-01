"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { paymentRequestSchema, type PaymentRequest } from "./sepay";

export type PaymentRequestResult =
  | { status: "SUCCESS"; request: PaymentRequest }
  | { status: "FAILED" | "UNKNOWN"; message: string };

const createInput = z.object({
  customerId: z.guid(),
  keys: z.array(z.string().min(1).max(64)).min(1).max(50),
  operationId: z.guid(),
});

/** D44 refusals from the database, in plain Vietnamese. */
function requestMessage(value?: string) {
  if (value?.includes("payment_request_nothing_owed")) return "Các khoản đã chọn không còn nợ. Tải lại trang để xem công nợ mới nhất.";
  if (value?.includes("payment_request_too_many")) return "Chọn tối đa 50 khoản cho một lần thanh toán.";
  if (value?.includes("payment_request_empty")) return "Chọn ít nhất một khoản cần thanh toán.";
  if (value?.includes("bank_feed_not_ready")) return "Cửa hàng chưa bật thanh toán tự xác nhận qua ngân hàng.";
  if (value?.includes("customer_inactive")) return "Khách hàng đã ngừng giao dịch.";
  if (value?.includes("payment_request_already_paid")) return "Yêu cầu này đã được thanh toán, không hủy được.";
  if (value?.includes("forbidden")) return "Bạn không có quyền tạo thanh toán cho khách hàng này.";
  return "Không tạo được mã thanh toán. Không có thay đổi nào được ghi.";
}

/**
 * "Thanh toán các khoản đã chọn" (customer portal) or "Tạo QR thu nợ" (staff): the database checks who is asking, takes
 * the amounts owed now and returns the request with its code and transfer note. Clicking again with the same operation
 * returns the same request.
 */
export async function createPaymentRequestAction(input: unknown): Promise<PaymentRequestResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Chọn ít nhất một khoản cần thanh toán (tối đa 50)." };
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("create_payment_request", {
      target_customer_id: parsed.data.customerId, group_keys: [...new Set(parsed.data.keys)], operation_id: parsed.data.operationId,
    });
    if (error) {
      return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: requestMessage(error.message) }
        : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra." };
    }
    const request = paymentRequestSchema.safeParse(data);
    if (!request.success) return { status: "UNKNOWN", message: "Chưa đọc được mã thanh toán. Bấm lại đúng nút này để kiểm tra." };
    return { status: "SUCCESS", request: request.data };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra." };
  }
}

const cancelInput = z.object({ requestId: z.guid(), operationId: z.guid(), customerId: z.guid().optional() });

/** "Hủy yêu cầu": the QR stops being offered (a transfer that still arrives with the code is still recognised). */
export async function cancelPaymentRequestAction(input: unknown): Promise<{ status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string }> {
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Yêu cầu không hợp lệ." };
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("cancel_payment_request", { target_request_id: parsed.data.requestId, operation_id: parsed.data.operationId });
    if (error) {
      return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: requestMessage(error.message) }
        : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };
    }
    if (parsed.data.customerId) revalidatePath(`/admin/customers/${parsed.data.customerId}`);
    return { status: "SUCCESS", message: "Đã hủy yêu cầu thanh toán." };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };
  }
}
