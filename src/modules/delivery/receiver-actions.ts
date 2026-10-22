"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { reasonOrDefault } from "@/lib/core/reason";

const input = z.object({ deliveryId: z.guid(), version: z.coerce.number().int().positive(), operationId: z.guid(),
  receiverName: z.string().trim().min(1).max(120), receiverPhone: z.string().trim().min(1).max(40),
  reason: z.string().trim().max(500).optional() });

export async function updateDeliveryReceiverAction(formData: FormData) {
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-delivery-contact");
  await requireInternalPermission("delivery.assign");
  const value = parsed.data;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_delivery_receiver", { target_delivery_id: value.deliveryId,
    receiver_name: value.receiverName, receiver_phone: value.receiverPhone, reason: reasonOrDefault(value.reason, "Cập nhật người nhận"),
    expected_version: value.version, operation_id: value.operationId });
  const path = `/admin/deliveries/${value.deliveryId}`;
  if (error) redirect(`${path}?error=${encodeURIComponent("Không thể cập nhật người nhận. Tải lại để kiểm tra phiên bản; thông tin chỉ sửa được trước khi phát hành công việc/bàn giao.")}`);
  revalidatePath(path);
  revalidatePath("/work");
  redirect(`${path}?notice=delivery-contact-updated`);
}
