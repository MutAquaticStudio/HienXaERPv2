"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseDeliveryForm } from "@/modules/delivery/commands";
import { runDeliveryCommand } from "@/modules/delivery/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface DeliveryActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const messages = {
  "delivery.plan": "Đã lập chuyến giao từ phần chia nguồn.",
  "delivery.assign": "Đã phân công xe và tài xế.",
  "delivery.progress": "Đã cập nhật bước giao hàng.",
  "delivery.proof": "Đã lưu bằng chứng giao hàng.",
  "delivery.confirm": "Đã xác nhận số thực giao và thực nhận.",
} as const;

export async function runDeliveryAction(
  previous: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("office");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseDeliveryForm(formData);
    await runDeliveryCommand(principal, key, input);
    revalidatePath("/app/dispatch");
    revalidatePath("/work");
    return { status: "success", message: messages[input.kind], idempotencyKey: randomUUID() };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof PlatformError
        ? error.message
        : "Chưa ghi được thao tác. Dữ liệu chưa thay đổi; hãy kiểm tra và thử lại.",
      idempotencyKey: key,
    };
  }
}
