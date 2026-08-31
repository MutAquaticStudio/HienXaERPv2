"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { parseSourcingForm } from "@/modules/sourcing/commands";
import { runSourcingCommand } from "@/modules/sourcing/service";

export interface SourcingActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const SUCCESS_MESSAGES = {
  "supplier.create": "Đã tạo hồ sơ nhà cung cấp.",
  "supplier-price.record": "Đã ghi nhận phiên bản giá mua mới.",
  "supply.allocate": "Đã chia nguồn cho dòng đơn bán.",
  "purchase-order.create": "Đã tạo đơn mua với giá mua được chụp lại.",
  "purchase-order.confirm":
    "Đã xác nhận đơn mua; chưa phát sinh công nợ nhà cung cấp.",
  "purchase-order.send": "Đã gửi đơn mua cho nhà cung cấp.",
  "purchase-order.acknowledge": "Đã ghi nhận nhà cung cấp xác nhận đơn.",
  "purchase-order.cancel": "Đã hủy đơn mua và lưu lý do.",
} as const;

export async function runSourcingAction(
  previousState: SourcingActionState,
  formData: FormData,
): Promise<SourcingActionState> {
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
    const today = new Date().toISOString().slice(0, 10);
    const input = parseSourcingForm(formData, today);
    await runSourcingCommand(principal, idempotencyKey, input);
    revalidatePath("/app/sourcing");
    revalidatePath("/app");
    return {
      status: "success",
      message: SUCCESS_MESSAGES[input.kind],
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PlatformError
          ? error.message
          : "Không thể hoàn tất thao tác. Hãy kiểm tra dữ liệu và thử lại.",
      idempotencyKey,
    };
  }
}
