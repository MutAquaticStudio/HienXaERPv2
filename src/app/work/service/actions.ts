"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { parseServiceJobForm } from "@/modules/service-jobs/commands";
import { runServiceJobCommand } from "@/modules/service-jobs/service";
import type { ServiceJobActionState } from "@/app/app/service/actions";

export async function runWorkerServiceJobAction(
  previous: ServiceJobActionState,
  formData: FormData,
): Promise<ServiceJobActionState> {
  const submitted = formData.get("idempotencyKey");
  const key =
    typeof submitted === "string" && submitted
      ? submitted
      : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("worker");
    if (!principal)
      throw new PlatformError(
        "Bạn cần đăng nhập để tiếp tục.",
        "AUTHENTICATION_REQUIRED",
        401,
      );
    const input = parseServiceJobForm(formData);
    if (input.kind !== "service.job.log")
      throw new PlatformError(
        "Thao tác này chỉ dành cho văn phòng.",
        "ACCESS_DENIED",
        403,
      );
    await runServiceJobCommand(principal, key, input);
    revalidatePath("/work/service");
    revalidatePath("/work");
    revalidatePath("/app/service");
    revalidatePath("/app/workforce");
    const message =
      input.logType === "INCIDENT"
        ? "Đã báo sự cố cho giám sát."
        : input.logType === "END"
          ? "Đã kết thúc. Giờ thực tế đang chờ duyệt."
          : "Đã ghi nhật ký công việc.";
    return { status: "success", message, idempotencyKey: randomUUID() };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PlatformError
          ? error.message
          : "Chưa gửi được. Dữ liệu cũ vẫn được giữ; hãy thử lại khi có mạng.",
      idempotencyKey: key,
    };
  }
}
