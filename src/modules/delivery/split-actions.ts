"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { parseBusinessDateTime } from "@/lib/core/business-time";
import { isExactEntryQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryCommandMessage } from "./errors";
import { SPLIT_MAX_PARTS, SPLIT_MIN_PARTS } from "./split";

export type SplitDeliveryResult =
  | { status: "SUCCESS"; deliveries: { id: string; number: string; state: string }[] }
  | { status: "FAILED" | "UNKNOWN"; message: string };

const partSchema = z.object({
  lines: z.array(z.object({ delivery_line_id: z.guid(), base_quantity: z.string().refine((value) => isExactEntryQuantity(value)) })).min(1).max(50),
  employee_id: z.guid().optional(),
  vehicle_id: z.guid().optional(),
  scheduled_start: z.string().optional(),
});
const input = z.object({
  deliveryId: z.guid(),
  version: z.number().int().positive(),
  parts: z.array(partSchema).min(SPLIT_MIN_PARTS).max(SPLIT_MAX_PARTS),
  operationId: z.guid(),
});
const answer = z.object({ deliveries: z.array(z.object({ id: z.guid(), number: z.string(), state: z.string() })) });

/** D46 refusals from the database, in plain Vietnamese. */
function splitMessage(error: { message?: string; details?: string | null; hint?: string | null }) {
  const value = error.message;
  if (value?.includes("delivery_split_assignment_refused")) return `Phiếu ${error.details ?? ""}: ${deliveryCommandMessage(error.hint ?? undefined)} Chưa tách phiếu nào.`;
  if (value?.includes("delivery_split_version_conflict")) return "Phiếu đã thay đổi hoặc đã lấy hàng lên xe. Tải lại trang rồi chia lại.";
  if (value?.includes("delivery_split_already_loaded")) return "Phiếu đã lấy hàng lên xe hoặc đã có kết quả giao, không tách được nữa.";
  if (value?.includes("delivery_split_after_work_started")) return "Người giao đã bắt đầu việc này. Không tách được; liên hệ người giao trước.";
  if (value?.includes("delivery_split_quantity_mismatch")) return "Tổng số lượng các phiếu phải đúng bằng số lượng từng dòng của phiếu gốc.";
  if (value?.includes("delivery_split_line_not_on_delivery")) return "Có dòng hàng không thuộc phiếu này. Tải lại trang rồi chia lại.";
  if (value?.includes("delivery_split_part_empty")) return "Mỗi phiếu mới phải có ít nhất một dòng hàng.";
  if (value?.includes("delivery_split_parts_invalid")) return `Chọn tách thành ${SPLIT_MIN_PARTS} đến ${SPLIT_MAX_PARTS} phiếu.`;
  if (value?.includes("delivery_split_assignment_incomplete")) return "Chọn đủ người giao, xe và giờ giao cho phiếu muốn phân ngay, hoặc để trống cả ba.";
  if (value?.includes("delivery_split_direct_assignment")) return "Phiếu NCC giao thẳng không phân người và xe nội bộ. Để trống rồi phân giao ngoài trên từng phiếu.";
  if (value?.includes("delivery_split_schedule_window")) return "Giờ kết thúc phải sau giờ bắt đầu.";
  if (value?.includes("delivery_split_quantity_invalid")) return "Số lượng chỉ gồm chữ số, tối đa 6 chữ số sau dấu thập phân.";
  if (value?.includes("delivery_reservation_state_conflict")) return "Hàng giữ chỗ trong kho không khớp với phiếu. Chưa tách; cần kiểm tra kho.";
  return deliveryCommandMessage(value);
}

/**
 * "Tách phiếu giao": the original note is cancelled and 2–5 new notes are created with the quantities chosen, in one
 * database command; a part with a driver, vehicle and time is assigned at once. The same click again returns the same notes.
 */
export async function splitDeliveryAction(raw: unknown): Promise<SplitDeliveryResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: "FAILED", message: "Dữ liệu chia phiếu không hợp lệ. Kiểm tra số lượng từng phiếu rồi thử lại." };
  const parts = [];
  for (const [index, part] of parsed.data.parts.entries()) {
    let start: string | undefined;
    if (part.scheduled_start) {
      const value = parseBusinessDateTime(part.scheduled_start);
      if (!value) return { status: "FAILED", message: `Phiếu ${index + 1}: giờ giao không hợp lệ.` };
      start = value;
    }
    parts.push({ lines: part.lines, ...(part.employee_id && part.vehicle_id && start ? { employee_id: part.employee_id, vehicle_id: part.vehicle_id, scheduled_start: start } : {}) });
  }
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("split_delivery", {
      target_delivery_id: parsed.data.deliveryId, expected_version: parsed.data.version, parts, operation_id: parsed.data.operationId,
    });
    if (error) {
      return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: splitMessage(error) }
        : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra — hệ thống không tách trùng." };
    }
    const result = answer.safeParse(data);
    if (!result.success) return { status: "UNKNOWN", message: "Chưa đọc được kết quả. Tải lại trang để kiểm tra các phiếu mới." };
    revalidatePath("/admin/deliveries");
    revalidatePath(`/admin/deliveries/${parsed.data.deliveryId}`);
    revalidatePath("/admin/dispatch");
    revalidatePath("/admin/inventory");
    return { status: "SUCCESS", deliveries: result.data.deliveries };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra — hệ thống không tách trùng." };
  }
}
