"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseBusinessDateTime } from "@/lib/core/business-time";
import { deliveryCommandMessage } from "./errors";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const boardPath = (value?: string) => `/admin/dispatch${value ? `?day=${value}` : ""}`;

/** D22 "Tự chia việc": every planned warehouse delivery of the day (and older ones still waiting) goes to a free truck + driver. */
export async function autoDispatchDayAction(formData: FormData) {
  const parsed = z.object({ day, operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/dispatch?error=${encodeURIComponent("Ngày chưa hợp lệ. Tải lại trang rồi thử lại.")}`);
  const access = await requireInternalPermission("delivery.assign");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("auto_dispatch_day", { target_branch_id: access.branchId, target_day: parsed.data.day, operation_id: parsed.data.operationId });
  const path = boardPath(parsed.data.day);
  if (error) redirect(`${path}&error=${encodeURIComponent(error.code === "42501" ? "Bạn không có quyền phân xe." : "Chưa tự chia việc được. Tải lại trang rồi thử lại.")}`);
  revalidatePath("/admin/dispatch");
  const result = (data ?? {}) as { assigned?: number; waiting?: number; replayed?: boolean };
  const text = result.replayed ? "Đã tự chia việc trước đó." : `Đã chia ${result.assigned ?? 0} phiếu${result.waiting ? `; ${result.waiting} phiếu chưa có xe/tài xế phù hợp` : ""}.`;
  redirect(`${path}&dispatched=${encodeURIComponent(text)}`);
}

/** SUGGEST mode: apply the proposal shown on the board (the assignment checks run again). */
export async function applyDispatchProposalAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.guid(), day: day.optional(), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/dispatch?error=invalid-command");
  await requireInternalPermission("delivery.assign");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("apply_dispatch_proposal", { target_delivery_id: parsed.data.deliveryId, operation_id: parsed.data.operationId });
  const path = boardPath(parsed.data.day);
  if (error) redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message.includes("dispatch_proposal_missing")
    ? "Gợi ý đã được áp dụng hoặc đã hết. Tải lại bảng." : "Không áp dụng được gợi ý (lịch hoặc xe đã thay đổi). Phân xe trên phiếu giao.")}`);
  revalidatePath("/admin/dispatch");
  redirect(`${path}${path.includes("?") ? "&" : "?"}dispatched=${encodeURIComponent("Đã áp dụng gợi ý điều phối.")}`);
}

const withQuery = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

/**
 * "Gán nhanh" on the board: a waiting delivery gets a driver, a truck and a time without opening it. The same
 * assign_delivery_scheduled command runs, with all its checks (rights, capacity, clashes, worker account, version).
 */
export async function quickAssignDeliveryAction(formData: FormData) {
  const parsed = z.object({ deliveryId: z.guid(), version: z.coerce.number().int().positive(), employeeId: z.guid(), vehicleId: z.guid(),
    scheduledStart: z.string().min(1), scheduledEnd: z.string().min(1), day: day.optional(), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  const path = boardPath(typeof formData.get("day") === "string" && day.safeParse(formData.get("day")).success ? String(formData.get("day")) : undefined);
  if (!parsed.success) redirect(withQuery(path, "error", "Chọn người giao, xe và giờ giao rồi thử lại."));
  await requireInternalPermission("delivery.assign");
  const scheduledStart = parseBusinessDateTime(parsed.data.scheduledStart);
  const scheduledEnd = parseBusinessDateTime(parsed.data.scheduledEnd);
  if (!scheduledStart || !scheduledEnd || Date.parse(scheduledEnd) <= Date.parse(scheduledStart)) {
    redirect(withQuery(path, "error", "Nhập khung giờ giao hợp lệ; giờ kết thúc phải sau giờ bắt đầu."));
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("assign_delivery_scheduled", {
    target_delivery_id: parsed.data.deliveryId, target_employee_id: parsed.data.employeeId, target_vehicle_id: parsed.data.vehicleId,
    external_carrier_name: "", external_carrier_phone: "", scheduled_start: scheduledStart, scheduled_end: scheduledEnd,
    expected_version: parsed.data.version, operation_id: parsed.data.operationId,
  });
  if (error) redirect(withQuery(path, "error", deliveryCommandMessage(error.message, error.hint)));
  revalidatePath("/admin/dispatch");
  revalidatePath(`/admin/deliveries/${parsed.data.deliveryId}`);
  redirect(withQuery(path, "dispatched", "Đã phân người và xe cho phiếu giao."));
}
