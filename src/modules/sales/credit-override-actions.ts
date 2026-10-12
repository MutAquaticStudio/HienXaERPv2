"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { operationalPostingError } from "@/lib/core/errors";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  orderId: z.uuid(), operationId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function confirmSalesOrderCreditOverride(formData: FormData): Promise<void> {
  const context = await requireInternalPermission("orders.confirm");
  const input = inputSchema.safeParse(Object.fromEntries(formData));
  const returnId = z.uuid().safeParse(formData.get("orderId"));
  const path = returnId.success ? `/admin/orders/${returnId.data}` : "/admin/orders";
  let message: string | undefined;
  if (!context.permissions.has("finance.ar.adjust")) {
    message = "Bạn không có quyền duyệt ngoại lệ tín dụng.";
  } else if (!input.success) {
    message = "Nhập lý do từ 3 đến 500 ký tự; tải lại nếu bản duyệt đã cũ.";
  } else {
    const supabase = await createServerSupabase();
    const { data: order, error: orderError } = await supabase.from("sales_orders")
      .select("id").eq("id", input.data.orderId).eq("branch_id", context.branchId).maybeSingle();
    if (orderError || !order) {
      message = "Không thể duyệt đơn ngoài chi nhánh đang hoạt động.";
    } else {
      const { error } = await supabase.rpc("confirm_sales_order_with_credit_override", {
        target_order_id: input.data.orderId, override_reason: input.data.reason,
        expected_snapshot_hash: input.data.snapshotHash, operation_id: input.data.operationId,
      });
      if (error) {
        const postingError = operationalPostingError(error.message);
        if (postingError) {
          message = postingError;
        } else if (error.message.includes("credit_snapshot_changed")) {
          message = "Số dư hoặc bản nháp đã thay đổi. Kiểm tra thông tin tín dụng mới trước khi duyệt lại.";
        } else if (error.message.includes("credit_override_not_required")) {
          message = "Đơn đang đủ điều kiện tín dụng. Hãy dùng Xác nhận đơn thông thường.";
        } else if (error.code === "42501") {
          message = "Bạn không có quyền duyệt ngoại lệ tín dụng cho đơn này.";
        } else if (error.message.includes("operation_payload_conflict")) {
          message = "Mã thao tác đã dùng với nội dung khác. Hãy tải lại trang.";
        } else {
          message = "Không thể xác nhận ngoại lệ. Đơn chưa được duyệt bởi thao tác này.";
        }
      }
    }
  }
  if (!message) {
    for (const url of [path, "/admin/orders", "/admin/customers", "/customer/orders"]) revalidatePath(url);
  }
  redirect(`${path}?${message ? `error=${encodeURIComponent(message)}` : `success=${encodeURIComponent("Đã xác nhận đơn với ngoại lệ tín dụng riêng cho lần này.")}`}`);
}
