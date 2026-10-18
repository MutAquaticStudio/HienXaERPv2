"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";

export type OperationSettingsResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string; version?: number };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  operationId: z.guid(),
  /** Version shown in the form, or null before the branch has its own settings. */
  expectedVersion: z.number().int().positive().nullable(),
  stopMinutes: z.number().int().min(5).max(720),
  // D19/D22: optional; a key left out keeps its saved value.
  defaultWarehouseId: z.guid().nullable().optional(),
  autoSource: z.boolean().optional(),
  tripCostVnd: z.string().regex(/^\d{1,12}$/).nullable().optional(),
  dispatchMode: z.enum(["OFF", "SUGGEST", "AUTO"]).optional(),
  workDayStart: time.optional(),
  workDayEnd: time.optional(),
}).refine((value) => !value.workDayStart || !value.workDayEnd || value.workDayEnd > value.workDayStart);

function settingsMessage(value?: string) {
  if (value?.includes("operation_settings_changed")) return "Cài đặt vừa được sửa ở nơi khác. Hãy tải lại trang rồi nhập lại.";
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("forbidden")) return "Chỉ chủ doanh nghiệp được đổi cài đặt vận hành.";
  if (value?.includes("operation_settings_invalid")) return "Kiểm tra lại: thời gian mỗi điểm giao từ 5 đến 720 phút, kho mặc định đang dùng, giờ kết thúc sau giờ bắt đầu.";
  return "Không thể lưu cài đặt. Không có thay đổi nào được ghi.";
}

/** "Thời gian mỗi điểm giao" of the branch (D21): how long one delivery stop holds its driver and vehicle. */
export async function saveOperationSettingsAction(input: unknown): Promise<OperationSettingsResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Thời gian mỗi điểm giao là số phút nguyên từ 5 đến 720; giờ kết thúc ngày làm việc phải sau giờ bắt đầu." };
  const values = parsed.data;
  const settings: Record<string, string | null> = { stop_minutes: String(values.stopMinutes) };
  if (values.defaultWarehouseId !== undefined) settings.default_warehouse_id = values.defaultWarehouseId;
  if (values.autoSource !== undefined) settings.auto_source_enabled = String(values.autoSource);
  if (values.tripCostVnd !== undefined) settings.trip_cost_vnd = values.tripCostVnd;
  if (values.dispatchMode !== undefined) settings.dispatch_mode = values.dispatchMode;
  if (values.workDayStart !== undefined) settings.work_day_start = values.workDayStart;
  if (values.workDayEnd !== undefined) settings.work_day_end = values.workDayEnd;
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  try {
    const { data: version, error } = await supabase.rpc("save_branch_operation_settings", {
      target_branch_id: access.branchId, settings,
      expected_version: parsed.data.expectedVersion, operation_id: parsed.data.operationId,
    });
    if (error) return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: settingsMessage(error.message) }
      : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
    revalidatePath("/admin/settings");
    return { status: "SUCCESS", version: Number(version), message: `Đã lưu. Phiếu giao mới tính mỗi điểm giao ${parsed.data.stopMinutes} phút.` };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
  }
}
