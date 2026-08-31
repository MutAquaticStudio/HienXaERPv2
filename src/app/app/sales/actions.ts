"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { parseSaveCustomer360Form } from "@/modules/customer-360/commands";
import { saveCustomer360 } from "@/modules/customer-360/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface Customer360ActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

export async function saveCustomer360Action(
  previousState: Customer360ActionState,
  formData: FormData,
): Promise<Customer360ActionState> {
  const submittedKey = formData.get("idempotencyKey");
  const idempotencyKey =
    typeof submittedKey === "string" && submittedKey
      ? submittedKey
      : previousState.idempotencyKey;

  try {
    const principal = await getCurrentPrincipal("office");
    if (!principal) {
      throw new PlatformError(
        "Bạn cần đăng nhập để tiếp tục.",
        "AUTHENTICATION_REQUIRED",
        401,
      );
    }
    const input = parseSaveCustomer360Form(formData);
    await saveCustomer360(principal, idempotencyKey, input);
    revalidatePath("/app/sales");
    return {
      status: "success",
      message: "Đã lưu và ghi nhận lịch sử kiểm soát.",
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PlatformError
          ? error.message
          : "Không thể lưu dữ liệu. Hãy kiểm tra và thử lại.",
      idempotencyKey,
    };
  }
}
