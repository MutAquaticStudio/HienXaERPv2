"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { parseCustomerPortalForm } from "@/modules/customer-portal/commands";
import { getCustomerPortalAccess, runCustomerPortalCommand } from "@/modules/customer-portal/service";
import { PlatformError } from "@/modules/platform/errors";

export interface CustomerPortalActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

function successMessage(kind: string) {
  if (kind === "customer.quote.accept") {
    return "Đã đồng ý đúng phiên bản báo giá đang hiển thị. Hiền Xa sẽ tiếp tục xử lý đơn; chưa phát sinh đơn bán tự động.";
  }
  if (kind === "customer.quote.request") {
    return "Đã gửi yêu cầu cho bộ phận kinh doanh. Yêu cầu này không làm thay đổi báo giá đã gửi.";
  }
  if (kind === "customer.delivery.acknowledge") {
    return "Đã xác nhận đã nhận đủ. Bản ghi giao hàng gốc không bị chỉnh sửa.";
  }
  if (kind === "customer.delivery.issue") {
    return "Đã gửi phản hồi giao hàng để Hiền Xa kiểm tra. Số lượng và công nợ hiện tại không bị tự động thay đổi.";
  }
  return "Đã ghi nhận thông báo thanh toán để đối chiếu. Đây chưa phải là xác nhận đã thu tiền hoặc phân bổ công nợ.";
}

export async function runCustomerPortalAction(
  previous: CustomerPortalActionState,
  formData: FormData,
): Promise<CustomerPortalActionState> {
  const submitted = formData.get("idempotencyKey");
  const idempotencyKey = typeof submitted === "string" && submitted
    ? submitted
    : previous.idempotencyKey;
  try {
    const access = await getCustomerPortalAccess();
    if (access.kind === "unauthenticated") {
      throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    }
    if (access.kind === "not-member") {
      throw new PlatformError("Tài khoản này chưa được liên kết với hồ sơ khách hàng.", "CUSTOMER_MEMBERSHIP_REQUIRED", 403);
    }
    const command = parseCustomerPortalForm(formData);
    await runCustomerPortalCommand(access.principal, idempotencyKey, command);
    revalidatePath("/customer");
    revalidatePath("/customer/orders");
    revalidatePath("/customer/debt");
    revalidatePath("/customer/profile");
    return { status: "success", message: successMessage(command.kind), idempotencyKey: randomUUID() };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof PlatformError
        ? error.message
        : "Chưa gửi được. Dữ liệu nghiệp vụ hiện có vẫn giữ nguyên; hãy kiểm tra lại và thử lại.",
      idempotencyKey,
    };
  }
}
