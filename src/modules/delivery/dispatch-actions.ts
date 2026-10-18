"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const boardPath = (value?: string) => `/admin/dispatch${value ? `?day=${value}` : ""}`;

/** D22 "Tự chia việc": every planned warehouse delivery of the day (and older ones still waiting) goes to a free truck + driver. */
export async function autoDispatchDayAction(formData: FormData) {
  const parsed = z.object({ day, operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
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
  const parsed = z.object({ deliveryId: z.uuid(), day: day.optional(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
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
