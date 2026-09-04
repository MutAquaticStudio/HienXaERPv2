"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { parseChatForm } from "@/modules/chat/commands";
import {
  runCustomerOperationalChatCommand,
  runEmployeeOperationalChatCommand,
} from "@/modules/chat/service";
import { getCustomerPortalAccess } from "@/modules/customer-portal/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface ChatActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

function stateMessage(kind: string) {
  if (kind === "chat.conversation.ensure") return "Đã mở hội thoại theo đúng ngữ cảnh. Chỉ người tham gia được phép mới xem được nội dung.";
  if (kind === "chat.message.send") return "ĐÃ GỬI — tin nhắn đã được ghi nhận. Nội dung này không thay đổi báo giá, giao hàng hoặc thanh toán.";
  if (kind === "chat.conversation.mark_read") return "Đã đánh dấu đã đọc.";
  return "Đã đóng hội thoại. Lịch sử trao đổi được giữ lại và không thể gửi thêm tin nhắn.";
}

function errorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (error instanceof PlatformError) return error.message;
  if (message.includes("CHAT_CONVERSATION_CLOSED")) return "Hội thoại đã đóng nên không thể gửi thêm tin nhắn.";
  if (message.includes("CHAT_CONTEXT_ACCESS_DENIED") || message.includes("CHAT_PARTICIPANT_REQUIRED") || code === "42501") return "Bạn không được phép truy cập hội thoại hoặc ngữ cảnh này.";
  if (message.includes("CHAT_MESSAGE_BODY_INVALID")) return "Nội dung tin nhắn cần từ 1 đến 2.000 ký tự.";
  if (message.includes("CHAT_EVIDENCE_ACCESS_DENIED")) return "Tệp đính kèm không thuộc quyền sử dụng của bạn.";
  return "GỬI LỖI — tin nhắn chưa được ghi nhận; dữ liệu nghiệp vụ hiện có không thay đổi.";
}

function surface(formData: FormData) {
  const value = formData.get("surface");
  if (value === "office" || value === "worker" || value === "customer") return value;
  throw new PlatformError("Bề mặt hội thoại không hợp lệ.", "CHAT_SURFACE_INVALID", 400);
}

export async function runChatAction(
  previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const submittedKey = formData.get("idempotencyKey");
  const idempotencyKey = typeof submittedKey === "string" && submittedKey ? submittedKey : previous.idempotencyKey;
  try {
    const command = parseChatForm(formData);
    const targetSurface = surface(formData);
    if (targetSurface === "customer") {
      const access = await getCustomerPortalAccess();
      if (access.kind === "unauthenticated") throw new PlatformError("Bạn cần đăng nhập để nhắn tin.", "AUTHENTICATION_REQUIRED", 401);
      if (access.kind === "not-member") throw new PlatformError("Tài khoản này chưa được liên kết với hồ sơ khách hàng.", "CUSTOMER_MEMBERSHIP_REQUIRED", 403);
      await runCustomerOperationalChatCommand(access.principal, command);
    } else {
      const principal = await getCurrentPrincipal(targetSurface);
      if (!principal) throw new PlatformError("Bạn cần đăng nhập để nhắn tin.", "AUTHENTICATION_REQUIRED", 401);
      await runEmployeeOperationalChatCommand(principal, command);
    }
    revalidatePath("/work");
    revalidatePath("/work/service");
    revalidatePath("/customer");
    revalidatePath("/customer/orders");
    revalidatePath("/app/dispatch");
    revalidatePath("/app/service");
    return {
      status: "success",
      message: stateMessage(command.kind),
      idempotencyKey: command.kind === "chat.message.send" ? randomUUID() : idempotencyKey,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error), idempotencyKey };
  }
}
