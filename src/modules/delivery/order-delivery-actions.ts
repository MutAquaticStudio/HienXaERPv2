"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { businessInputValue, parseBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryCommandMessage, nextFreeAt } from "./errors";

export type OrderDeliveryResult = {
  success: boolean; message: string; deliveryId?: string; outcomeUnknown?: boolean;
  /** On a clash at a chosen time: the nearest free start, as a datetime-local value, to offer instead. */
  nextFreeAt?: string;
};

const quantity = z.string().trim().refine((value) => {
  try { const amount = new Decimal(value); return amount.isFinite() && amount.gt(0) && amount.decimalPlaces() <= 6; } catch { return false; }
});
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const inputSchema = z.object({
  operationId: z.guid(),
  orderId: z.guid(),
  warehouseId: z.guid(),
  /** NOW: deliver as soon as possible (a busy driver gets it right after their current jobs); AT: at `scheduledAt`. */
  scheduleMode: z.enum(["NOW", "AT"]),
  /** For NOW, the moment "Giao ngay" was first pressed, so a retry sends the same command. */
  scheduledAt: localDateTime,
  lines: z.array(z.object({ salesOrderLineId: z.guid(), quantity })).min(1).max(50),
  assignment: z.object({ employeeId: z.guid(), vehicleId: z.guid() }).nullable(),
});

/**
 * "Lập phiếu giao" in one step from a confirmed order (FB2 Đợt 3, A4): warehouse source, delivery and (optionally)
 * driver and vehicle, all in create_delivery_for_order. Quantities are in the unit each line was sold in. The stop
 * length is the branch's "thời gian mỗi điểm giao"; assigning a driver puts the job on their worker portal (A2).
 */
export async function createDeliveryForOrderAction(input: unknown): Promise<OrderDeliveryResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { success: false, message: field === "lines" ? "Nhập số lượng giao lớn hơn 0 (tối đa 6 chữ số thập phân) cho ít nhất một dòng."
      : field === "assignment" ? "Chọn cả người giao và xe, hoặc bỏ phân xe." : "Chọn kho xuất và thời gian giao." };
  }
  const data = parsed.data;
  const scheduledAt = parseBusinessDateTime(data.scheduledAt);
  if (!scheduledAt) return { success: false, message: "Thời gian giao không hợp lệ." };
  await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { data: result, error } = await supabase.rpc("create_delivery_for_order", {
      target_sales_order_id: data.orderId,
      target_warehouse_id: data.warehouseId,
      delivery_lines: data.lines.map((line) => ({ sales_order_line_id: line.salesOrderLineId, quantity: new Decimal(line.quantity).toFixed() })),
      scheduled_at: scheduledAt,
      assignment: data.assignment ? { employee_id: data.assignment.employeeId, vehicle_id: data.assignment.vehicleId, scheduled_start: scheduledAt, schedule_mode: data.scheduleMode } : null,
      operation_id: data.operationId,
    });
    if (error) {
      const free = nextFreeAt(error.hint);
      return { success: false, message: deliveryCommandMessage(error.message, error.hint), nextFreeAt: free ? businessInputValue(free) : undefined };
    }
    const deliveryId = (result as { delivery_id?: string } | null)?.delivery_id;
    revalidatePath(`/admin/orders/${data.orderId}`);
    revalidatePath("/admin/deliveries");
    return { success: true, deliveryId, message: data.assignment ? "Đã lập phiếu giao và phân xe." : "Đã lập phiếu giao. Phân xe và người giao ở phiếu giao." };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra; hệ thống không tạo trùng phiếu." };
  }
}
