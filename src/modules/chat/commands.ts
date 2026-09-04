import { PlatformError } from "@/modules/platform/errors";
import {
  CHAT_CONTEXT_TYPES,
  type ChatCommand,
  type ChatContextType,
} from "@/modules/chat/types";

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_CHAT_DATA", 400);
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}

function uuid(valueToCheck: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valueToCheck)) {
    invalid(`${label} không hợp lệ.`);
  }
  return valueToCheck;
}

function idempotencyKey(valueToCheck: string) {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(valueToCheck)) invalid("Mã chống gửi trùng không hợp lệ.");
  return valueToCheck;
}

export function parseChatForm(formData: FormData): ChatCommand {
  const kind = value(formData, "kind");
  if (kind === "chat.conversation.ensure") {
    const contextType = value(formData, "contextType") as ChatContextType;
    if (!CHAT_CONTEXT_TYPES.includes(contextType)) invalid("Ngữ cảnh hội thoại không hợp lệ.");
    return { kind, contextType, contextId: uuid(value(formData, "contextId"), "Ngữ cảnh hội thoại") };
  }
  if (kind === "chat.message.send") {
    const body = value(formData, "body");
    if (!body) invalid("Nội dung tin nhắn không được để trống.");
    if (body.length > 2000) invalid("Nội dung tin nhắn tối đa 2.000 ký tự.");
    const evidenceRaw = value(formData, "evidenceId");
    return {
      kind,
      conversationId: uuid(value(formData, "conversationId"), "Hội thoại"),
      body,
      evidenceId: evidenceRaw ? uuid(evidenceRaw, "Tệp đính kèm") : null,
      idempotencyKey: idempotencyKey(value(formData, "idempotencyKey")),
    };
  }
  if (kind === "chat.conversation.mark_read") {
    return { kind, conversationId: uuid(value(formData, "conversationId"), "Hội thoại") };
  }
  if (kind === "chat.conversation.close") {
    const reason = value(formData, "reason");
    if (reason.length < 10) invalid("Lý do đóng hội thoại cần ít nhất 10 ký tự.");
    if (reason.length > 500) invalid("Lý do đóng hội thoại quá dài.");
    return { kind, conversationId: uuid(value(formData, "conversationId"), "Hội thoại"), reason };
  }
  invalid("Thao tác hội thoại không được hỗ trợ.");
}
