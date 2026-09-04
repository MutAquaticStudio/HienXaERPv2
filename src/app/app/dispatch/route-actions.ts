"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseRoutePlanForm } from "@/modules/route-optimization/commands";
import { runRoutePlanCommand } from "@/modules/route-optimization/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface RoutePlanActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const messages = {
  "route.plan.create": "Đã lưu đề xuất. Delivery chưa bị thay đổi; hãy kiểm tra cảnh báo trước khi duyệt.",
  "route.plan.approve": "Đã duyệt đề xuất lộ trình. Chuyến giao vẫn chưa được phân công.",
  "route.plan.apply": "Đã áp dụng bằng quy trình phân công P7; Delivery và nhật ký điều phối đã được cập nhật.",
} as const;

export async function runRoutePlanAction(
  previous: RoutePlanActionState,
  formData: FormData,
): Promise<RoutePlanActionState> {
  const submitted = formData.get("idempotencyKey");
  const idempotencyKey = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    // Server Actions are reachable by POST outside this page, so authorization is
    // re-established here before the server-only route command runs.
    const principal = await getCurrentPrincipal("office");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseRoutePlanForm(formData);
    await runRoutePlanCommand(principal, idempotencyKey, input);
    revalidatePath("/app/dispatch");
    revalidatePath("/work");
    return { status: "success", message: messages[input.kind], idempotencyKey: randomUUID() };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof PlatformError
        ? error.message
        : "Chưa ghi được thao tác. Delivery và phân công hiện tại chưa thay đổi; hãy kiểm tra rồi thử lại.",
      idempotencyKey,
    };
  }
}
