"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseCompensationForm } from "@/modules/compensation/commands";
import { runCompensationCommand } from "@/modules/compensation/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface CompensationActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

const successMessages = {
  "compensation.profile.create": "Đã tạo phiên bản hồ sơ thu nhập.",
  "compensation.plan.create": "Đã tạo phiên bản kế hoạch thu nhập.",
  "compensation.rule.create": "Đã thêm cách tính vào kế hoạch.",
  "earning.create_from_work":
    "Đã tính quyền lợi từ công việc đã xác minh; đang chờ duyệt.",
  "earning.bonus": "Đã ghi đề xuất thưởng; chưa phát sinh khoản chi.",
  "earning.approve": "Đã duyệt quyền lợi để đưa vào kỳ thu nhập.",
  "earning.adjust": "Đã ghi điều chỉnh và giữ nguyên lịch sử trước đó.",
  "earning.reverse": "Đã đảo quyền lợi; bản ghi gốc vẫn được lưu để đối soát.",
  "payroll.period.create": "Đã mở kỳ thu nhập.",
  "payroll.monthly.generate":
    "Đã sinh các khoản cố định theo kế hoạch có hiệu lực.",
  "payroll.close": "Đã chốt kỳ thu nhập; không thể sửa các dòng đã chốt.",
  "payroll.payment.link": "Đã liên kết khoản chi P8 với dòng thu nhập.",
} as const;

function compensationErrorMessage(error: unknown) {
  if (error instanceof PlatformError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("COMPENSATION_PLAN_DATES_OVERLAP"))
    return "Khoảng hiệu lực bị trùng với một kế hoạch hiện có. Dữ liệu chưa thay đổi.";
  if (message.includes("VERIFIED_WORK_REQUIRED"))
    return "Công việc phải được giám sát xác minh trước khi tính quyền lợi.";
  if (message.includes("COMPENSATION_RULE_NOT_RESOLVED"))
    return "Chưa tìm thấy cách tính có hiệu lực cho người lao động và loại công việc này.";
  if (message.includes("PENDING_EARNINGS_MUST_BE_RESOLVED"))
    return "Còn quyền lợi chờ duyệt trong kỳ. Hãy duyệt hoặc đảo trước khi chốt.";
  if (message.includes("PAYROLL_LINE_OVERPAID"))
    return "Số tiền liên kết vượt quyền lợi còn chưa thanh toán của dòng này.";
  return "Chưa lưu được thao tác. Dữ liệu cũ vẫn được giữ; hãy kiểm tra và thử lại.";
}

export async function runCompensationAction(
  previous: CompensationActionState,
  formData: FormData,
): Promise<CompensationActionState> {
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
    const input = parseCompensationForm(formData);
    await runCompensationCommand(principal, key, input);
    revalidatePath("/app/compensation");
    revalidatePath("/app/workforce");
    revalidatePath("/app/service");
    revalidatePath("/app/finance");
    revalidatePath("/work/earnings");
    return {
      status: "success",
      message: successMessages[input.kind],
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message: compensationErrorMessage(error),
      idempotencyKey: key,
    };
  }
}
