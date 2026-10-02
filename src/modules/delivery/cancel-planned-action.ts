"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

function errorMessage(message?: string) {
  if (message?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại trang.";
  if (message?.includes("delivery_cancel_version_conflict")) return "Phiếu đã thay đổi hoặc không còn ở trạng thái kế hoạch. Hãy tải lại.";
  if (message?.includes("delivery_cancel_not_safe")) return "Phiếu đã có bước thực thi nên không thể hủy bằng luồng này.";
  if (message?.includes("delivery_reservation_state_conflict")) return "Tồn đặt trước không khớp trạng thái phiếu. Chưa hủy, cần kiểm tra kho.";
  return "Không thể hủy phiếu giao. Không có thay đổi nào được chốt.";
}

export async function cancelPlannedDeliveryAction(formData: FormData) {
  const parsed = z.object({
    deliveryId: z.uuid(),
    version: z.coerce.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
    operationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const id = z.uuid().safeParse(formData.get("deliveryId"));
    redirect(id.success ? `/admin/deliveries/${id.data}/cancel?error=invalid` : "/admin/deliveries");
  }
  await requireInternalPermission("delivery.exception");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("cancel_planned_delivery", {
    target_delivery_id: parsed.data.deliveryId,
    expected_version: parsed.data.version,
    cancellation_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/deliveries/${parsed.data.deliveryId}/cancel`;
  if (error || !data) redirect(`${destination}?error=${encodeURIComponent(errorMessage(error?.message))}`);
  revalidatePath("/admin/deliveries");
  revalidatePath(`/admin/deliveries/${parsed.data.deliveryId}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=cancelled`);
}
