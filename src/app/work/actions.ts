"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseDeliveryForm } from "@/modules/delivery/commands";
import { runDeliveryCommand } from "@/modules/delivery/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface DriverDeliveryActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

export async function runDriverDeliveryAction(
  previous: DriverDeliveryActionState,
  formData: FormData,
): Promise<DriverDeliveryActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("worker");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseDeliveryForm(formData);
    if (!["delivery.progress", "delivery.proof"].includes(input.kind)) {
      throw new PlatformError("Tài xế không được thực hiện thao tác này.", "ACCESS_DENIED", 403);
    }
    await runDeliveryCommand(principal, key, input);
    revalidatePath("/work");
    revalidatePath("/app/dispatch");
    return {
      status: "success",
      message: input.kind === "delivery.proof" ? "Đã lưu bằng chứng." : "Đã cập nhật chuyến giao.",
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof PlatformError
        ? error.message
        : "Chưa gửi được. Chuyến vẫn giữ trạng thái cũ; hãy thử lại khi có mạng.",
      idempotencyKey: key,
    };
  }
}
