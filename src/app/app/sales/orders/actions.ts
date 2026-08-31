"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { parseCommercialForm } from "@/modules/commercial/commands";
import { runCommercialCommand } from "@/modules/commercial/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface CommercialActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const SUCCESS_MESSAGES = {
  "quotation.create": "Đã tạo báo giá và phiên bản nháp đầu tiên.",
  "quotation.add-line": "Đã thêm dòng với giá và đơn vị tính đã chụp.",
  "quotation.refresh-prices": "Đã làm mới giá cho toàn bộ bản nháp.",
  "quotation.send": "Đã gửi và khóa phiên bản báo giá.",
  "quotation.accept": "Đã ghi nhận khách chấp nhận báo giá.",
  "quotation.revise":
    "Đã tạo phiên bản nháp mới; bản đã gửi vẫn được giữ nguyên.",
  "sales-order.convert": "Đã chuyển báo giá đã chấp nhận thành đơn bán.",
  "sales-order.confirm":
    "Đã xác nhận đơn và tạo yêu cầu thực hiện; chưa phát sinh công nợ.",
} as const;

export async function runCommercialAction(
  previousState: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
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
    const input = parseCommercialForm(formData, today);
    await runCommercialCommand(principal, idempotencyKey, input);
    revalidatePath("/app/sales/orders");
    revalidatePath("/app/sales");
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
