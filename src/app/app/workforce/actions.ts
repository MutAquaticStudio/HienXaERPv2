"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { parseWorkForm } from "@/modules/workforce/commands";
import { runWorkCommand } from "@/modules/workforce/service";

export interface SupervisorWorkActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

export async function runSupervisorWorkAction(
  previous: SupervisorWorkActionState,
  formData: FormData,
): Promise<SupervisorWorkActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("office");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseWorkForm(formData);
    if (!["work.verify", "work.supervise", "work.sweep"].includes(input.kind)) {
      throw new PlatformError("Thao tác không thuộc hàng đợi giám sát.", "ACCESS_DENIED", 403);
    }
    await runWorkCommand(principal, key, input);
    revalidatePath("/app/workforce");
    revalidatePath("/work");
    revalidatePath("/work/pool");
    return {
      status: "success",
      message: input.kind === "work.verify"
        ? "Đã xác minh kết quả công việc."
        : input.kind === "work.sweep"
          ? "Đã rà soát lượt nhận và nhịp phản hồi quá hạn."
          : "Đã lưu quyết định giám sát.",
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    const message = error instanceof PlatformError
      ? error.message
      : error instanceof Error && error.message.includes("EXTERNAL_EFFECT_RECALL_FORBIDDEN")
        ? "Công việc đã có tác động thực tế; không thể trả lại bể một cách tự động. Hãy giữ, giao lại có kiểm soát hoặc hủy."
        : "Chưa lưu được. Quyết định cũ vẫn được giữ; hãy thử lại.";
    return { status: "error", message, idempotencyKey: key };
  }
}
