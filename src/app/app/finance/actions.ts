"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseFinanceForm } from "@/modules/finance/commands";
import { runFinanceCommand } from "@/modules/finance/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface FinanceActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const messages = {
  "finance.account.create": "Đã tạo tài khoản tiền.",
  "finance.payment.create": "Đã lập khoản thu chi ở trạng thái nháp.",
  "finance.payment.allocate": "Đã phân bổ khoản thu chi vào công nợ.",
  "finance.payment.post": "Đã ghi sổ khoản thu chi. Số dư và công nợ đã được cập nhật.",
  "finance.payment.reverse": "Đã hoàn tác bằng bút toán bù. Không có dữ liệu cũ bị sửa âm thầm.",
  "finance.advance.apply": "Đã cấn trừ tiền ứng trước vào công nợ.",
  "finance.expense.create": "Đã lập chi phí ở trạng thái nháp.",
  "finance.expense.post": "Đã ghi sổ chi phí.",
  "finance.expense.reverse": "Đã hoàn tác chi phí bằng bút toán bù.",
  "finance.adjustment.post": "Đã ghi bút toán điều chỉnh công nợ.",
  "finance.adjustment.reverse": "Đã hoàn tác bút toán điều chỉnh.",
  "finance.bank.import": "Đã ghi nhận giao dịch ngân hàng.",
  "finance.payment.reconcile": "Đã đối chiếu khoản thu chi với giao dịch ngân hàng.",
} as const;

export async function runFinanceAction(
  previous: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("office");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseFinanceForm(formData);
    await runFinanceCommand(principal, key, input);
    revalidatePath("/app/finance");
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
