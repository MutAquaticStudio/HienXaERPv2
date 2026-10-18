"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type PriceGroupResult = { success: boolean; message: string; outcomeUnknown?: boolean };

const inputSchema = z.object({
  operationId: z.guid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/),
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

/** Creates a customer price group, or renames / stops an existing one (save_customer_price_group). */
export async function savePriceGroupAction(input: unknown): Promise<PriceGroupResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { success: false, message: field === "code" ? "Mã nhóm gồm 2–40 ký tự: chữ không dấu, số, gạch ngang hoặc gạch dưới (vd SI, DAI_LY)."
      : field === "name" ? "Cần tên nhóm (tối đa 80 ký tự)." : field === "reason" ? "Cần lý do thay đổi từ 3 đến 500 ký tự." : "Thông tin nhóm giá chưa hợp lệ." };
  }
  const access = await requireInternalPermission("pricing.manage");
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("save_customer_price_group", {
      target_branch_id: access.branchId, group_code: parsed.data.code, group_name: parsed.data.name, group_active: parsed.data.active,
      change_reason: parsed.data.reason, operation_id: parsed.data.operationId,
    });
    if (error) return { success: false, message: error.code === "42501" ? "Bạn không có quyền quản lý nhóm giá ở chi nhánh này."
      : error.message.includes("operation_payload_conflict") ? "Lần lưu trước chưa rõ kết quả và nội dung đã đổi. Đóng rồi mở lại biểu mẫu."
      : "Không thể lưu nhóm giá. Kiểm tra mã và tên nhóm." };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả. Bấm lưu lại đúng thao tác này để kiểm tra; hệ thống không lưu trùng." };
  }
  for (const path of ["/admin/settings/pricing", "/admin/customers", "/admin/customers/manage", "/admin/products/pricing"]) revalidatePath(path);
  return { success: true, message: `Đã lưu nhóm giá ${parsed.data.name}.` };
}
