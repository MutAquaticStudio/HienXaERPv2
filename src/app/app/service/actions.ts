"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { PlatformError } from "@/modules/platform/errors";
import { parseServiceJobForm } from "@/modules/service-jobs/commands";
import { runServiceJobCommand } from "@/modules/service-jobs/service";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface ServiceJobActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const successMessages = {
  "service.type.create": "Đã tạo loại dịch vụ.",
  "service.machine.create": "Đã tạo máy phục vụ công việc.",
  "service.job.create": "Đã lên lịch công việc dịch vụ.",
  "service.job.assign": "Đã phân công người vận hành và tạo WorkItem.",
  "service.job.log": "Đã ghi nhật ký công việc.",
  "service.job.approve": "Đã duyệt riêng giờ thực tế và sản lượng tính tiền.",
  "service.job.cost": "Đã ghi chi phí trực tiếp.",
  "service.job.confirm": "Đã xác nhận khách hàng và tạo phải thu đúng một lần.",
  "service.job.cancel": "Đã hủy công việc chưa bắt đầu.",
} as const;

function serviceJobErrorMessage(error: unknown) {
  if (error instanceof PlatformError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SERVICE_MACHINE_SCHEDULE_CONFLICT"))
    return "Máy đã có lịch trùng trong khoảng thời gian này. Dữ liệu chưa thay đổi.";
  if (message.includes("SERVICE_JOB_NOT_ASSIGNED_TO_ACTOR"))
    return "Công việc không được phân cho tài khoản này. Dữ liệu chưa thay đổi.";
  if (message.includes("SERVICE_LOG_TIME_MUST_BE_MONOTONIC"))
    return "Thời điểm nhật ký phải sau thao tác gần nhất. Dữ liệu chưa thay đổi.";
  if (message.includes("STARTED_SERVICE_JOB_CANNOT_BE_CANCELLED_BLINDLY"))
    return "Công việc đã bắt đầu nên không thể hủy trực tiếp. Dữ liệu chưa thay đổi.";
  return "Chưa ghi được thao tác. Dữ liệu chưa thay đổi; hãy kiểm tra và thử lại.";
}

export async function runServiceJobAction(
  previous: ServiceJobActionState,
  formData: FormData,
): Promise<ServiceJobActionState> {
  const submitted = formData.get("idempotencyKey");
  const key =
    typeof submitted === "string" && submitted
      ? submitted
      : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("office");
    if (!principal)
      throw new PlatformError(
        "Bạn cần đăng nhập để tiếp tục.",
        "AUTHENTICATION_REQUIRED",
        401,
      );
    const input = parseServiceJobForm(formData);
    await runServiceJobCommand(principal, key, input);
    revalidatePath("/app/service");
    revalidatePath("/app/finance");
    revalidatePath("/app/workforce");
    revalidatePath("/work");
    revalidatePath("/work/service");
    return {
      status: "success",
      message: successMessages[input.kind],
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message: serviceJobErrorMessage(error),
      idempotencyKey: key,
    };
  }
}
