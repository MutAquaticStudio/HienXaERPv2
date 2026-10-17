"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { parseBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryCommandMessage } from "./errors";

export type OrderDeliveryResult = { success: boolean; message: string; deliveryId?: string; outcomeUnknown?: boolean };

const quantity = z.string().trim().refine((value) => {
  try { const amount = new Decimal(value); return amount.isFinite() && amount.gt(0) && amount.decimalPlaces() <= 6; } catch { return false; }
});
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const inputSchema = z.object({
  operationId: z.uuid(),
  orderId: z.uuid(),
  warehouseId: z.uuid(),
  scheduledAt: localDateTime,
  lines: z.array(z.object({ salesOrderLineId: z.uuid(), quantity })).min(1).max(50),
  assignment: z.object({ employeeId: z.uuid(), vehicleId: z.uuid(), scheduledEnd: localDateTime }).nullable(),
});

/**
 * "Lập phiếu giao" in one step from a confirmed order (FB2 Đợt 3): warehouse source, delivery and (optionally) driver
 * and vehicle, all in create_delivery_for_order. Quantities are in the unit each line was sold in.
 */
export async function createDeliveryForOrderAction(input: unknown): Promise<OrderDeliveryResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { success: false, message: field === "lines" ? "Nhập số lượng giao lớn hơn 0 (tối đa 6 chữ số thập phân) cho ít nhất một dòng."
      : field === "assignment" ? "Chọn cả người giao, xe và giờ kết thúc, hoặc bỏ phân giao." : "Chọn kho xuất và thời gian giao." };
  }
  const data = parsed.data;
  const scheduledAt = parseBusinessDateTime(data.scheduledAt);
  const scheduledEnd = data.assignment ? parseBusinessDateTime(data.assignment.scheduledEnd) : null;
  if (!scheduledAt || (data.assignment && !scheduledEnd)) return { success: false, message: "Thời gian giao không hợp lệ." };
  if (scheduledEnd && Date.parse(scheduledEnd) <= Date.parse(scheduledAt)) return { success: false, message: "Giờ kết thúc phải sau giờ bắt đầu giao." };
  await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { data: result, error } = await supabase.rpc("create_delivery_for_order", {
      target_sales_order_id: data.orderId,
      target_warehouse_id: data.warehouseId,
      delivery_lines: data.lines.map((line) => ({ sales_order_line_id: line.salesOrderLineId, quantity: new Decimal(line.quantity).toFixed() })),
      scheduled_at: scheduledAt,
      assignment: data.assignment ? { employee_id: data.assignment.employeeId, vehicle_id: data.assignment.vehicleId, scheduled_start: scheduledAt, scheduled_end: scheduledEnd } : null,
      operation_id: data.operationId,
    });
    if (error) return { success: false, message: deliveryCommandMessage(error.message) };
    const deliveryId = (result as { delivery_id?: string } | null)?.delivery_id;
    revalidatePath(`/admin/orders/${data.orderId}`);
    revalidatePath("/admin/deliveries");
    return { success: true, deliveryId, message: data.assignment ? "Đã lập phiếu giao và phân xe." : "Đã lập phiếu giao. Phân xe và người giao ở phiếu giao." };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra; hệ thống không tạo trùng phiếu." };
  }
}
