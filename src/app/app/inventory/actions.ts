"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseInventoryForm } from "@/modules/inventory/commands";
import { runInventoryCommand } from "@/modules/inventory/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface InventoryActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}
const messages = {
  "inventory.reserve": "Đã giữ tồn kho theo phần chia nguồn.",
  "reservation.release": "Đã giải phóng lượng hàng giữ.",
  "receipt.confirm": "Đã xác nhận nhập kho và ghi sổ chuyển động.",
  "issue.confirm": "Đã xác nhận xuất kho và ghi sổ chuyển động.",
  "stock-count.record": "Đã chụp số hệ thống và ghi nhận kiểm kê.",
  "stock-adjustment.approve":
    "Đã duyệt chênh lệch và tạo chuyển động điều chỉnh.",
  "reorder-policy.set": "Đã cập nhật ngưỡng tồn kho.",
} as const;

export async function runInventoryAction(
  previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
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
    const input = parseInventoryForm(formData);
    await runInventoryCommand(principal, key, input);
    revalidatePath("/app/inventory");
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
          : "Không thể hoàn tất thao tác kho. Hãy kiểm tra dữ liệu và thử lại.",
      idempotencyKey: key,
    };
  }
}
