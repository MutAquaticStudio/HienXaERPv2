"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { userFacingError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

// D75: staff side of "Yêu cầu từ khách". "Xếp lịch" calls schedule_service_request (the existing schedule_service_job plus the link
// back to the request, one transaction); "Từ chối" needs a reason the customer will read. Both need service.manage.

const optionalUuid = z.union([z.guid(), z.literal("")]);
const decimal = z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const toInstant = (value: string) => new Date(value + ":00+07:00").toISOString();

function requestMessage(message?: string) {
  if (!message) return userFacingError(message);
  if (message.includes("service_request_not_open")) return "Yêu cầu này đã được xử lý (xếp lịch, hủy hoặc từ chối). Tải lại trang để xem trạng thái mới.";
  if (message.includes("stale_service_request")) return "Yêu cầu vừa thay đổi. Tải lại trang rồi thử lại.";
  if (message.includes("reject_reason_required")) return "Nhập lý do từ chối (3–300 ký tự) để khách đọc được.";
  if (message.includes("service_resource_mismatch")) return "Loại dịch vụ này không dùng xe hoặc máy đã chọn. Bỏ chọn rồi thử lại.";
  if (message.includes("invalid_service_type")) return "Loại dịch vụ đã ngừng dùng hoặc không thuộc chi nhánh này. Chọn loại khác.";
  if (message.includes("invalid_service_job")) return "Kiểm tra lại thời gian (kết thúc sau bắt đầu) và số lượng (lớn hơn 0).";
  if (message.includes("schedule_collision") || message.includes("resource_conflict")) return "Xe, máy hoặc nhân viên đã có lịch trùng. Chọn lịch khác rồi thử lại.";
  if (message === "forbidden") return "Bạn không có quyền xếp lịch hoặc từ chối yêu cầu dịch vụ.";
  return userFacingError(message);
}
const fail = (path: string, message?: string): never => redirect(path + "?error=" + encodeURIComponent(requestMessage(message)));

export async function scheduleServiceRequestAction(formData: FormData) {
  const parsed = z.object({
    requestId: z.guid(), version: z.coerce.number().int().positive(), serviceTypeId: z.guid(),
    scheduledStart: localDateTime, scheduledEnd: localDateTime, plannedQuantity: z.union([decimal, z.literal("")]).optional(),
    description: z.string().trim().max(500).optional(), salesEmployeeId: optionalUuid.optional(),
    vehicleId: optionalUuid.optional(), machineId: optionalUuid.optional(), operationId: z.guid(),
  }).safeParse(Object.fromEntries(formData));
  const base = "/admin/service-jobs/requests";
  const target = parsed.success ? `${base}/${parsed.data.requestId}` : base;
  if (!parsed.success) return fail(target, "invalid_service_job");
  await requireInternalPermission("service.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("schedule_service_request", {
    target_request_id: parsed.data.requestId, expected_version: parsed.data.version, target_service_type_id: parsed.data.serviceTypeId,
    job_start: toInstant(parsed.data.scheduledStart), job_end: toInstant(parsed.data.scheduledEnd), job_quantity: parsed.data.plannedQuantity || null,
    job_description: parsed.data.description ?? "", target_sales_employee_id: parsed.data.salesEmployeeId || null,
    target_vehicle_id: parsed.data.vehicleId || null, target_machine_id: parsed.data.machineId || null, operation_id: parsed.data.operationId,
  });
  if (error || !data) fail(target, error?.message);
  revalidatePath(base);
  revalidatePath("/admin/service-jobs");
  redirect(`/admin/service-jobs/${data}?notice=service-created`);
}

export async function rejectServiceRequestAction(formData: FormData) {
  const parsed = z.object({
    requestId: z.guid(), version: z.coerce.number().int().positive(), reason: z.string().trim().max(300).optional(), operationId: z.guid(),
  }).safeParse(Object.fromEntries(formData));
  const base = "/admin/service-jobs/requests";
  const target = parsed.success ? `${base}/${parsed.data.requestId}` : base;
  if (!parsed.success) return fail(target, "reject_reason_required");
  await requireInternalPermission("service.manage");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("reject_service_request", {
    target_request_id: parsed.data.requestId, reject_reason: parsed.data.reason ?? "", expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  if (error) fail(target, error.message);
  revalidatePath(base);
  revalidatePath(target);
  redirect(`${target}?notice=request-rejected`);
}
