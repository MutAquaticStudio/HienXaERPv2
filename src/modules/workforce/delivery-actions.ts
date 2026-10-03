"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { requirePermission } from "@/lib/access/policy";
import { createServerSupabase } from "@/lib/supabase/server";

const publication = z.object({ deliveryId: z.uuid(), operationId: z.uuid() });
const verification = publication.extend({ workItemId: z.uuid(), version: z.coerce.number().int().positive() });

function failed(deliveryId: string, message: string): never {
  redirect(`/admin/deliveries/${deliveryId}?error=${encodeURIComponent(message)}`);
}

function refresh(deliveryId: string) {
  revalidatePath(`/admin/deliveries/${deliveryId}`);
  revalidatePath("/admin/workforce");
  revalidatePath("/work");
  revalidatePath("/work/jobs", "layout");
}

export async function publishDeliveryWorkItemAction(formData: FormData) {
  const parsed = publication.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-work-publication");
  const context = await requireInternalPermission("work.manage");
  requirePermission(context, "delivery.read");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("publish_work_item", {
    target_branch_id: context.branchId,
    source_kind: "DELIVERY",
    source_id: parsed.data.deliveryId,
    requested_assignment_mode: "DIRECT",
    target_employee_id: null,
    operation_id: parsed.data.operationId,
  });
  if (error) failed(parsed.data.deliveryId, "Chưa thể giao việc cho cổng thợ. Kiểm tra địa chỉ, tên/điện thoại người nhận, dòng vật tư, trạng thái Đã phân giao và lịch nhân viên/xe.");
  refresh(parsed.data.deliveryId);
  redirect(`/admin/deliveries/${parsed.data.deliveryId}?notice=work-published`);
}

export async function verifyDeliveryWorkItemAction(formData: FormData) {
  const parsed = verification.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/deliveries?error=invalid-work-verification");
  const context = await requireInternalPermission("work.verify");
  requirePermission(context, "delivery.read");
  const supabase = await createServerSupabase();
  const { data, error: sourceError } = await supabase.from("work_item_read")
    .select("id")
    .eq("id", parsed.data.workItemId)
    .eq("delivery_id", parsed.data.deliveryId)
    .eq("branch_id", context.branchId)
    .maybeSingle();
  if (sourceError || !data) failed(parsed.data.deliveryId, "Không tìm thấy công việc thuộc giao hàng và chi nhánh này.");
  const { error } = await supabase.rpc("verify_delivery_work_item", {
    target_work_item_id: parsed.data.workItemId,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  if (error) failed(parsed.data.deliveryId, "Chưa thể xác minh công việc. Thợ phải gửi kết quả và giao hàng phải được xác minh trước; tải lại nếu phiên bản đã thay đổi.");
  refresh(parsed.data.deliveryId);
  redirect(`/admin/deliveries/${parsed.data.deliveryId}?notice=verified`);
}
