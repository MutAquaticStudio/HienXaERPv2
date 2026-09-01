"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseProfitabilityForm } from "@/modules/profitability/commands";
import { runProfitabilityCommand } from "@/modules/profitability/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface ProfitabilityActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const messages = {
  "profitability.cost.record":
    "Đã ghi chi phí trực tiếp và cập nhật biên lợi nhuận.",
  "profitability.finalize":
    "Đã chốt lợi nhuận. Chi phí đến muộn cần mở lại có lý do.",
  "profitability.reopen": "Đã mở lại lợi nhuận và lưu dấu vết kiểm toán.",
} as const;

export async function runProfitabilityAction(
  previous: ProfitabilityActionState,
  formData: FormData,
): Promise<ProfitabilityActionState> {
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
    const input = parseProfitabilityForm(formData);
    await runProfitabilityCommand(principal, key, input);
    revalidatePath("/app");
    return {
      status: "success",
      message: messages[input.kind],
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PlatformError
          ? error.message
          : "Chưa ghi được thao tác. Dữ liệu chưa thay đổi; hãy kiểm tra và thử lại.",
      idempotencyKey: key,
    };
  }
}
