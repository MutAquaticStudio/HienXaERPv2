"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type SentResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string; sentAt?: string };
const schema = z.object({ purchaseOrderId: z.guid(), channel: z.enum(["ZALO", "EMAIL", "OTHER"]), operationId: z.guid() });

/** D17: records that the purchase order went to the supplier (the person sent it from their own Zalo/email). */
export async function recordPurchaseOrderSentAction(input: unknown): Promise<SentResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Thông tin gửi chưa hợp lệ. Tải lại trang." };
  await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("record_purchase_order_sent", { target_purchase_order_id: parsed.data.purchaseOrderId, channel: parsed.data.channel, operation_id: parsed.data.operationId });
    if (error) {
      if (!error.code) return { status: "UNKNOWN", message: "Chưa ghi được lúc gửi. Bấm lại để thử." };
      return { status: "FAILED", message: error.message.includes("purchase_order_not_sendable") ? "Chỉ gửi NCC đơn mua đã duyệt."
        : error.code === "42501" ? "Bạn không có quyền ghi nhận gửi đơn mua." : "Chưa ghi được lúc gửi. Tải lại trang rồi thử lại." };
    }
    revalidatePath("/admin/purchase-orders");
    revalidatePath(`/admin/purchase-orders/${parsed.data.purchaseOrderId}`);
    return { status: "SUCCESS", message: "Đã ghi nhận gửi NCC.", sentAt: new Date().toISOString() };
  } catch {
    return { status: "UNKNOWN", message: "Chưa ghi được lúc gửi. Bấm lại để thử." };
  }
}
